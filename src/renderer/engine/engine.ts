import { activeClipsAt, buildFrame, type Frame } from '@shared/render-model'
import type { Clip, Project, Track } from '@shared/project-schema'
import { clipEnd, frameDuration } from '@shared/timeline-ops'
import { useProjectStore } from '@/stores/project'
import { useTimelineStore } from '@/stores/timeline'
import { QUALITY_SCALE, useTimelinePlayback, type Quality } from '@/stores/playback'
import { AudioGraph } from './audio'
import { Compositor } from './compositor'
import { isReady, seekTo, SourceProvider, type SourceEntry } from './sources'

const PREWARM_S = 1.5

/**
 * Motor de vista previa: reloj de reproducción (FrameScheduler), fuentes, compositor y audio.
 * Pausado: cada frame se busca con precisión (scrubbing). Reproduciendo: los elementos de vídeo
 * corren solos y el motor corrige su deriva contra el reloj.
 */
export class Engine {
  private compositor: Compositor | null = null
  private sources = new SourceProvider()
  private audio = new AudioGraph()
  private raf = 0
  private pendingRender = false
  private token = 0
  private t0 = 0
  private clock0 = 0
  private busy = false
  private meterTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.sources.onCreate = (e) => {
      this.audio.attach(e)
      const redraw = (): void => this.requestRender()
      e.el.addEventListener(e.el instanceof HTMLImageElement ? 'load' : 'loadeddata', redraw)
    }
    this.sources.onDispose = (e) => this.audio.detach(e)
  }

  private get project(): Project | null {
    return useProjectStore().project
  }

  // ───────── Vida del monitor ─────────

  attach(canvas: HTMLCanvasElement): void {
    this.compositor = new Compositor(canvas)
    this.applySize()
    if (!this.meterTimer) this.meterTimer = setInterval(() => this.pollMeters(), 40)
    this.requestRender()
  }

  detach(): void {
    this.compositor = null
  }

  /** Libera todo al cerrar el proyecto. */
  reset(): void {
    this.pause()
    this.sources.disposeAll()
    this.compositor = null
    if (this.meterTimer) clearInterval(this.meterTimer)
    this.meterTimer = null
  }

  applySize(full = false): void {
    const p = this.project
    if (!p || !this.compositor) return
    const q = full ? 1 : QUALITY_SCALE[useTimelinePlayback().quality]
    this.compositor.resize(p.settings.width * q, p.settings.height * q)
  }

  setQuality(q: Quality): void {
    useTimelinePlayback().quality = q
    this.applySize()
    this.requestRender()
  }

  private pollMeters(): void {
    const m = this.audio.meters()
    if (m) useTimelinePlayback().meters = m
  }

  // ───────── Dibujo ─────────

  /** Pide un redibujado (con precisión de frame) si no se está reproduciendo. */
  requestRender(): void {
    if (useTimelinePlayback().playing || this.pendingRender) return
    this.pendingRender = true
    requestAnimationFrame(() => {
      this.pendingRender = false
      void this.renderPaused()
    })
  }

  private entryFor(clip: Clip): SourceEntry | null {
    const m = this.project?.media.find((x) => x.id === clip.mediaId)
    return m ? this.sources.acquire(clip.id, m) : null
  }

  private draw(frame: Frame): void {
    const comp = this.compositor
    if (!comp) return
    comp.draw(frame, (op) => {
      const e = this.sources.all.find((x) => x.clipId === op.clipId)
      return e && isReady(e.el) ? e.el : null
    })
    comp.prune(new Set(frame.ops.map((o) => o.clipId)))
  }

  /** Frame exacto en `t` (pausa, scrubbing, marcha atrás). La última petición gana. */
  private async renderAt(t: number): Promise<void> {
    const p = this.project
    if (!p) return
    const my = ++this.token
    this.sources.retain(new Set(p.clips.map((c) => c.id)))
    const frame = buildFrame(p, t)
    const clipById = new Map(p.clips.map((c) => [c.id, c]))
    const waits: Promise<void>[] = []
    for (const op of frame.ops) {
      const clip = clipById.get(op.clipId)
      const e = clip ? this.entryFor(clip) : null
      if (e && e.el instanceof HTMLVideoElement) waits.push(seekTo(e.el, op.sourceTime))
    }
    await Promise.all(waits)
    if (my !== this.token) return
    this.draw(frame)
  }

  private async renderPaused(): Promise<void> {
    const p = this.project
    if (!p) return
    this.sources.pauseAll()
    this.applySize(true) // al pausar se renderiza a calidad completa
    await this.renderAt(useTimelineStore().playhead)
  }

  // ───────── Reproducción ─────────

  async play(rate = 1): Promise<void> {
    const p = this.project
    const pb = useTimelinePlayback()
    const tl = useTimelineStore()
    if (!p) return
    await this.audio.resume()
    if (rate > 0 && tl.playhead >= tl.duration - 1e-6) tl.setPlayheadRaw(0)
    if (rate < 0 && tl.playhead <= 0) tl.setPlayheadRaw(tl.duration)
    pb.rate = rate
    this.t0 = tl.playhead
    this.clock0 = performance.now()
    this.sources.pauseAll()
    this.applySize()
    if (!pb.playing) {
      pb.playing = true
      this.raf = requestAnimationFrame(this.tick)
    }
  }

  pause(): void {
    const pb = useTimelinePlayback()
    const tl = useTimelineStore()
    if (!pb.playing) return
    pb.playing = false
    cancelAnimationFrame(this.raf)
    this.sources.pauseAll()
    if (this.project) tl.setPlayhead(tl.playhead)
    this.requestRender()
  }

  toggle(): void {
    if (useTimelinePlayback().playing) this.pause()
    else void this.play(1)
  }

  /** L / J: acelera hacia delante / atrás (×1, ×2, ×4). K pausa. */
  shuttle(dir: 1 | -1): void {
    const pb = useTimelinePlayback()
    const cur = pb.playing ? pb.rate : 0
    let next: number
    if (cur === 0 || Math.sign(cur) !== dir) next = dir
    else next = Math.min(4, Math.abs(cur) * 2) * dir
    void this.play(next)
  }

  private tick = (): void => {
    const pb = useTimelinePlayback()
    const tl = useTimelineStore()
    const p = this.project
    if (!pb.playing || !p) return
    const now = performance.now()
    let t = this.t0 + ((now - this.clock0) / 1000) * pb.rate
    const dur = tl.duration
    if (pb.rate > 0 && t >= dur) {
      if (pb.loop && dur > 0) {
        t = 0
        this.t0 = 0
        this.clock0 = now
        this.sources.pauseAll()
      } else {
        tl.setPlayheadRaw(dur)
        this.pause()
        return
      }
    } else if (pb.rate < 0 && t <= 0) {
      tl.setPlayheadRaw(0)
      this.pause()
      return
    }
    tl.setPlayheadRaw(t)

    const frame = buildFrame(p, t)
    const active = activeClipsAt(p, t)
    const activeMap = new Map<string, { clip: Clip; track: Track }>()
    for (const a of active) activeMap.set(a.clip.id, a)
    this.sources.retain(new Set(p.clips.map((c) => c.id)))

    if (pb.rate > 0) {
      for (const { clip } of active) this.syncPlaying(clip, t, pb.rate)
      this.prewarm(p, t)
    } else if (!this.busy) {
      // Marcha atrás: los elementos no pueden reproducir al revés; se busca frame a frame sin audio.
      this.busy = true
      void this.renderAt(t).finally(() => (this.busy = false))
    }
    this.audio.update(p, t, pb.rate > 0 ? activeMap : new Map())
    if (pb.rate > 0) this.draw(frame)
    this.raf = requestAnimationFrame(this.tick)
  }

  /** Mantiene un clip activo reproduciéndose y alineado con el reloj. */
  private syncPlaying(clip: Clip, t: number, rate: number): void {
    const e = this.entryFor(clip)
    if (!e || !(e.el instanceof HTMLVideoElement)) return
    const el = e.el
    const desired = clip.in + (t - clip.start) * clip.speed
    if (el.paused) {
      if (e.starting) return
      e.starting = true
      void seekTo(el, desired, 300)
        .then(() => {
          el.playbackRate = rate
          return el.play()
        })
        .catch(() => undefined)
        .finally(() => (e.starting = false))
      return
    }
    if (el.playbackRate !== rate) el.playbackRate = rate
    if (Math.abs(el.currentTime - desired) > 0.25) el.currentTime = desired
  }

  /** Deja listos los clips que empiezan pronto para que el corte sea limpio. */
  private prewarm(p: Project, t: number): void {
    for (const c of p.clips) {
      if (!c.enabled || c.start <= t || c.start > t + PREWARM_S) continue
      if (clipEnd(c) <= t) continue
      const e = this.entryFor(c)
      if (e && !e.primed && e.el instanceof HTMLVideoElement) {
        e.primed = true
        void seekTo(e.el, c.in, 500)
      }
    }
  }

  // ───────── Utilidades ─────────

  /** Un frame atrás / adelante estando en pausa. */
  step(frames: number): void {
    const p = this.project
    if (!p) return
    this.pause()
    const tl = useTimelineStore()
    tl.setPlayhead(tl.playhead + frames * frameDuration(p))
  }
}

export const engine = new Engine()
