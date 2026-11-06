import { spawn } from 'node:child_process'
import { open, type FileHandle } from 'node:fs/promises'
import { clipGainWithTransitions, trackGain } from '@shared/render-model'
import type { AudioMode } from '@shared/transition-model'
import type { Clip, MediaItem, Project } from '@shared/project-schema'
import { clipEnd } from '@shared/timeline-ops'
import { resolveBinary } from './paths'

export const MIX_SAMPLE_RATE = 48000
/** Cada cuántas muestras se evalúa la ganancia (la curva se interpola entre puntos): 5 ms */
const GAIN_STEP = 240
const BLOCK = MIX_SAMPLE_RATE // 1 s por bloque

export interface MixInput {
  project: Project
  /** Segundos de la línea de tiempo */
  start: number
  end: number
  /** Modo de audio por defecto de cada referencia de transición (meta.audio) */
  modes: Record<string, AudioMode | undefined>
  resolvePath: (m: MediaItem) => string
  out: string
  onProgress: (fraction: number) => void
  signal: AbortSignal
}

/** Clips que aportan audio en el rango. */
function audibleClips(p: Project, start: number, end: number): { clip: Clip; media: MediaItem }[] {
  const out: { clip: Clip; media: MediaItem }[] = []
  for (const clip of p.clips) {
    if (!clip.enabled || clip.audio.muted) continue
    if (clipEnd(clip) <= start || clip.start >= end) continue
    const media = p.media.find((m) => m.id === clip.mediaId)
    if (!media || media.kind === 'image') continue
    if (media.kind === 'video' && !media.probe?.hasAudio) continue
    const track = p.tracks.find((t) => t.id === clip.trackId)
    if (!track || trackGain(p, track) === 0) continue
    out.push({ clip, media })
  }
  return out
}

/**
 * Mezcla el audio del proyecto a un archivo PCM f32le estéreo a 48 kHz. Aplica EXACTAMENTE las mismas ganancias que
 * la vista previa (`clipGainWithTransitions × pista × master`, funciones compartidas de `render-model`), así el audio
 * exportado coincide con lo que se escucha. Devuelve false si no hay nada audible (no se crea pista de audio).
 */
export async function mixAudio(input: MixInput): Promise<boolean> {
  const { project: p, start, end } = input
  const clips = audibleClips(p, start, end)
  if (clips.length === 0) return false
  const totalSamples = Math.max(1, Math.round((end - start) * MIX_SAMPLE_RATE))
  const ffmpeg = await resolveBinary('ffmpeg')
  const fh = await open(input.out, 'w+')
  try {
    // Preasigna la mezcla a ceros
    const zeros = Buffer.alloc(BLOCK * 8)
    for (let s = 0; s < totalSamples; s += BLOCK) {
      await fh.write(zeros, 0, Math.min(BLOCK, totalSamples - s) * 8, s * 8)
    }
    const modeOf = (ref: string): AudioMode | undefined => input.modes[ref]
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i] as { clip: Clip; media: MediaItem }
      await mixClip(ffmpeg, fh, input, c.clip, c.media, totalSamples, modeOf)
      input.onProgress((i + 1) / clips.length)
    }
  } finally {
    await fh.close()
  }
  return true
}

async function mixClip(
  ffmpeg: string,
  fh: FileHandle,
  input: MixInput,
  clip: Clip,
  media: MediaItem,
  totalSamples: number,
  modeOf: (ref: string) => AudioMode | undefined
): Promise<void> {
  const { project: p, start, end } = input
  const track = p.tracks.find((t) => t.id === clip.trackId)
  if (!track) return
  const speed = clip.speed || 1
  const t0 = Math.max(clip.start, start)
  const t1 = Math.min(clipEnd(clip), end)
  if (t1 <= t0) return
  const srcStart = clip.in + (t0 - clip.start) * speed
  const srcLen = (t1 - t0) * speed
  const args = ['-v', 'error', '-ss', srcStart.toFixed(6), '-t', srcLen.toFixed(6), '-i', input.resolvePath(media), '-vn', '-ac', '2', '-ar', String(MIX_SAMPLE_RATE)]
  if (speed !== 1) args.push('-af', `atempo=${speed}`)
  args.push('-f', 'f32le', 'pipe:1')
  const proc = spawn(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const onAbort = (): void => void proc.kill()
  input.signal.addEventListener('abort', onAbort)
  let err = ''
  proc.stderr?.on('data', (c: Buffer) => (err += c.toString()))
  const closed = new Promise<number | null>((res) => proc.on('close', (code) => res(code)))

  const firstSample = Math.round((t0 - start) * MIX_SAMPLE_RATE)
  const master = p.settings.masterVolume
  const tg = trackGain(p, track)
  const gainAt = (sampleIndex: number): number => clipGainWithTransitions(p, clip, start + sampleIndex / MIX_SAMPLE_RATE, modeOf) * tg * master

  let pos = 0 // muestras ya mezcladas de este clip
  let pending: Buffer = Buffer.alloc(0)
  const flush = async (buf: Buffer, final: boolean): Promise<Buffer> => {
    const frames = Math.floor(buf.length / 8)
    const usable = final ? frames : Math.min(frames, BLOCK)
    if (usable <= 0 || (!final && frames < BLOCK)) return buf
    const take = Math.min(usable, totalSamples - (firstSample + pos))
    if (take > 0) {
      const dst = Buffer.alloc(take * 8)
      const read = await fh.read(dst, 0, take * 8, (firstSample + pos) * 8)
      void read
      const f = new Float32Array(dst.buffer, dst.byteOffset, take * 2)
      const s = new Float32Array(buf.buffer, buf.byteOffset, usable * 2)
      // Ganancia interpolada linealmente entre puntos cada GAIN_STEP muestras
      let g0 = gainAt(firstSample + pos)
      for (let k = 0; k < take; k += GAIN_STEP) {
        const g1 = gainAt(firstSample + pos + k + GAIN_STEP)
        const n = Math.min(GAIN_STEP, take - k)
        for (let j = 0; j < n; j++) {
          const g = g0 + ((g1 - g0) * j) / GAIN_STEP
          const o = (k + j) * 2
          f[o] = (f[o] as number) + (s[o] as number) * g
          f[o + 1] = (f[o + 1] as number) + (s[o + 1] as number) * g
        }
        g0 = g1
      }
      await fh.write(dst, 0, take * 8, (firstSample + pos) * 8)
    }
    pos += usable
    return Buffer.from(buf.subarray(usable * 8))
  }

  try {
    for await (const chunk of proc.stdout as AsyncIterable<Buffer>) {
      pending = pending.length ? Buffer.concat([pending, chunk]) : Buffer.from(chunk)
      while (pending.length >= BLOCK * 8) pending = await flush(pending, false)
    }
    if (pending.length >= 8) await flush(pending, true)
    const code = await closed
    if (input.signal.aborted) return
    if (code !== 0 && code !== null) throw new Error(`No se pudo decodificar el audio de "${clip.name}": ${err.trim() || `FFmpeg terminó con código ${code}`}`)
  } finally {
    input.signal.removeEventListener('abort', onAbort)
  }
}
