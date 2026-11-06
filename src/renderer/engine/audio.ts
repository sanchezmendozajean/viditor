import { clipGainAt, gainToDb, trackGain } from '@shared/render-model'
import type { Clip, Project, Track } from '@shared/project-schema'
import type { SourceEntry } from './sources'

export interface Meter {
  /** Pico y RMS en dBFS (−Infinity = silencio) */
  peakL: number
  peakR: number
  rmsL: number
  rmsR: number
  /** Hubo recorte (≥ 0 dBFS) recientemente */
  clip: boolean
}

export interface MeterSnapshot {
  master: Meter
  tracks: Record<string, Meter>
}

interface ClipNode {
  source: MediaElementAudioSourceNode
  gain: GainNode
  trackId: string | null
}
interface TrackNode {
  gain: GainNode
  analyser: AnalyserNode
}

const FFT = 1024

/**
 * Grafo Web Audio (specs/06): `MediaElementSource → Gain(clip × fundidos) → Gain(pista) → Gain(master) → Analyser → destino`.
 * Los medidores leen AnalyserNode por pista y estéreo en el master.
 */
export class AudioGraph {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private splitter!: ChannelSplitterNode
  private analyserL!: AnalyserNode
  private analyserR!: AnalyserNode
  private clips = new Map<string, ClipNode>()
  private tracks = new Map<string, TrackNode>()
  private buf = new Float32Array(FFT)
  private clipHold = new Map<string, number>()

  get ready(): boolean {
    return this.ctx !== null
  }

  /** Crea el contexto bajo demanda (primer uso: reproducir o conectar un elemento). */
  private ensure(): AudioContext {
    if (this.ctx) return this.ctx
    const ctx = new AudioContext({ latencyHint: 'interactive' })
    this.ctx = ctx
    this.master = ctx.createGain()
    // Estéreo explícito: las fuentes mono se duplican a L y R (y los medidores marcan ambos canales).
    this.master.channelCount = 2
    this.master.channelCountMode = 'explicit'
    this.master.channelInterpretation = 'speakers'
    this.splitter = ctx.createChannelSplitter(2)
    this.analyserL = this.mk(ctx)
    this.analyserR = this.mk(ctx)
    this.master.connect(ctx.destination)
    this.master.connect(this.splitter)
    this.splitter.connect(this.analyserL, 0)
    this.splitter.connect(this.analyserR, 1)
    return ctx
  }

  private mk(ctx: AudioContext): AnalyserNode {
    const a = ctx.createAnalyser()
    a.fftSize = FFT
    a.smoothingTimeConstant = 0
    return a
  }

  async resume(): Promise<void> {
    const ctx = this.ensure()
    if (ctx.state !== 'running') await ctx.resume().catch(() => undefined)
  }

  private trackNode(trackId: string): TrackNode {
    let n = this.tracks.get(trackId)
    if (!n) {
      const ctx = this.ensure()
      const gain = ctx.createGain()
      const analyser = this.mk(ctx)
      gain.connect(this.master)
      gain.connect(analyser)
      n = { gain, analyser }
      this.tracks.set(trackId, n)
    }
    return n
  }

  /** Conecta el audio de un elemento al grafo (una sola vez por elemento). */
  attach(entry: SourceEntry): void {
    if (!(entry.el instanceof HTMLVideoElement) || this.clips.has(entry.clipId)) return
    const ctx = this.ensure()
    const source = ctx.createMediaElementSource(entry.el)
    const gain = ctx.createGain()
    gain.gain.value = 0
    source.connect(gain)
    this.clips.set(entry.clipId, { source, gain, trackId: null })
  }

  /** Un elemento descartado deja su nodo; el MediaElementSource no se puede reutilizar. */
  detach(entry: SourceEntry): void {
    const n = this.clips.get(entry.clipId)
    if (!n) return
    n.gain.disconnect()
    n.source.disconnect()
    this.clips.delete(entry.clipId)
  }

  /** Actualiza todas las ganancias para el instante `t`. */
  update(p: Project, t: number, activeClips: Map<string, { clip: Clip; track: Track }>): void {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    this.master.gain.setTargetAtTime(p.settings.masterVolume, now, 0.01)
    for (const track of p.tracks) this.trackNode(track.id).gain.gain.setTargetAtTime(trackGain(p, track), now, 0.01)
    for (const [clipId, node] of this.clips) {
      const a = activeClips.get(clipId)
      if (!a) {
        node.gain.gain.setTargetAtTime(0, now, 0.01)
        continue
      }
      if (node.trackId !== a.track.id) {
        node.gain.disconnect()
        node.gain.connect(this.trackNode(a.track.id).gain)
        node.trackId = a.track.id
      }
      node.gain.gain.setTargetAtTime(clipGainAt(a.clip, t), now, 0.01)
    }
  }

  private measure(an: AnalyserNode): { peak: number; rms: number } {
    an.getFloatTimeDomainData(this.buf)
    let peak = 0
    let sum = 0
    for (let i = 0; i < this.buf.length; i++) {
      const v = this.buf[i] ?? 0
      const a = Math.abs(v)
      if (a > peak) peak = a
      sum += v * v
    }
    return { peak: gainToDb(peak), rms: gainToDb(Math.sqrt(sum / this.buf.length)) }
  }

  private holdClip(key: string, peakDb: number): boolean {
    const now = performance.now()
    if (peakDb >= 0) this.clipHold.set(key, now)
    return now - (this.clipHold.get(key) ?? -1e9) < 1500
  }

  meters(): MeterSnapshot | null {
    if (!this.ctx) return null
    const l = this.measure(this.analyserL)
    const r = this.measure(this.analyserR)
    const out: MeterSnapshot = {
      master: { peakL: l.peak, peakR: r.peak, rmsL: l.rms, rmsR: r.rms, clip: this.holdClip('master', Math.max(l.peak, r.peak)) },
      tracks: {}
    }
    for (const [id, n] of this.tracks) {
      const m = this.measure(n.analyser)
      out.tracks[id] = { peakL: m.peak, peakR: m.peak, rmsL: m.rms, rmsR: m.rms, clip: this.holdClip(id, m.peak) }
    }
    return out
  }
}
