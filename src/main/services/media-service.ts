import { execFile, spawn } from 'node:child_process'
import { mkdir, rename } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { promisify } from 'node:util'
import type { MediaItem, Probe } from '@shared/project-schema'
import type { BackgroundTask } from '@shared/ipc'
import { resolveBinary } from './paths'

const run = promisify(execFile)

const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v', '.mts', '.m2ts', '.wmv', '.flv', '.mpg', '.mpeg'])
const AUDIO_EXT = new Set(['.mp3', '.wav', '.aac', '.m4a', '.flac', '.ogg', '.opus', '.wma'])
/** Separación de fotogramas clave (s) a partir de la cual se genera proxy para poder buscar con fluidez. */
export const MAX_KEY_GAP = 8
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp', '.tif', '.tiff'])

export function mediaKindOf(file: string): MediaItem['kind'] | null {
  const ext = extname(file).toLowerCase()
  if (VIDEO_EXT.has(ext)) return 'video'
  if (AUDIO_EXT.has(ext)) return 'audio'
  if (IMAGE_EXT.has(ext)) return 'image'
  return null
}

interface FfprobeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  avg_frame_rate?: string
  r_frame_rate?: string
  duration?: string
  pix_fmt?: string
  side_data_list?: { rotation?: number }[]
  tags?: { rotate?: string }
}

function parseRate(rate?: string): { num: number; den: number } | undefined {
  if (!rate) return undefined
  const [n, d] = rate.split('/').map(Number)
  if (!n || !d) return undefined
  return { num: n, den: d }
}

/** Separación máxima (s) entre fotogramas clave en los primeros 3 minutos del video (0 si no se pudo medir). */
export async function maxKeyGap(file: string): Promise<number> {
  try {
    const ffprobe = await resolveBinary('ffprobe')
    const { stdout } = await run(
      ffprobe,
      ['-v', 'error', '-select_streams', 'v:0', '-read_intervals', '%+180', '-show_entries', 'packet=pts_time,flags', '-of', 'csv=p=0', file],
      { maxBuffer: 64 * 1024 * 1024, windowsHide: true }
    )
    const keys = stdout.split('\n').filter((l) => l.includes(',K')).map((l) => Number(l.split(',')[0])).filter(Number.isFinite)
    if (keys.length === 0) return 0
    // El último tramo hasta el fin de la ventana también cuenta: sin más claves, el hueco llega a los 180 s
    const last = keys[keys.length - 1] as number
    let gap = Math.max(0, 180 - last)
    for (let i = 1; i < keys.length; i++) gap = Math.max(gap, (keys[i] as number) - (keys[i - 1] as number))
    return gap
  } catch {
    return 0
  }
}

export async function probeFile(file: string, kind: MediaItem['kind']): Promise<Probe> {
  const ffprobe = await resolveBinary('ffprobe')
  const { stdout } = await run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], {
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true
  })
  const info = JSON.parse(stdout) as { streams?: FfprobeStream[]; format?: { duration?: string } }
  const streams = info.streams ?? []
  const v = streams.find((s) => s.codec_type === 'video')
  const a = streams.find((s) => s.codec_type === 'audio')
  const rotation = Number(v?.side_data_list?.find((s) => s.rotation !== undefined)?.rotation ?? v?.tags?.rotate ?? 0)
  const duration = kind === 'image' ? 5 : Number(info.format?.duration ?? v?.duration ?? a?.duration ?? 0)
  return {
    duration: Number.isFinite(duration) ? duration : 0,
    width: v?.width,
    height: v?.height,
    fps: kind === 'video' ? parseRate(v?.avg_frame_rate) ?? parseRate(v?.r_frame_rate) : undefined,
    hasAudio: Boolean(a),
    videoCodec: v?.codec_name,
    audioCodec: a?.codec_name,
    rotation: Number.isFinite(rotation) ? rotation : 0,
    pixFmt: v?.pix_fmt,
    keyGap: kind === 'video' && v ? await maxKeyGap(file) : undefined
  }
}

export async function makeThumbnail(file: string, kind: MediaItem['kind'], duration: number, out: string): Promise<boolean> {
  if (kind === 'audio') return false
  const ffmpeg = await resolveBinary('ffmpeg')
  await mkdir(join(out, '..'), { recursive: true })
  const seek = kind === 'video' ? Math.min(1, Math.max(0, duration / 2)) : 0
  const args = ['-v', 'error', '-y', '-ss', seek.toFixed(2), '-i', file, '-frames:v', '1', '-vf', 'scale=320:-2', ...(out.endsWith('.png') ? [] : ['-q:v', '4']), out]
  await run(ffmpeg, args, { windowsHide: true })
  return true
}

export interface Waveform {
  perSecond: number
  /** Picos 0–255 (valor absoluto máximo por ventana) */
  peaks: number[]
}

const WAVE_RATE = 8000
export const WAVE_PER_SECOND = 50

/** Picos de audio mono a 50 por segundo, leídos en streaming (sin cargar todo el PCM en memoria). */
export async function computeWaveform(file: string): Promise<Waveform> {
  const ffmpeg = await resolveBinary('ffmpeg')
  const win = WAVE_RATE / WAVE_PER_SECOND
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(WAVE_RATE), '-f', 's16le', 'pipe:1'], {
      windowsHide: true
    })
    const peaks: number[] = []
    let cur = 0
    let count = 0
    let carry: Buffer | null = null
    let err = ''
    p.stderr.on('data', (d: Buffer) => (err += d.toString()))
    p.stdout.on('data', (chunk: Buffer) => {
      const buf = carry ? Buffer.concat([carry, chunk]) : chunk
      const usable = buf.length - (buf.length % 2)
      for (let i = 0; i < usable; i += 2) {
        const v = Math.abs(buf.readInt16LE(i))
        if (v > cur) cur = v
        if (++count === win) {
          peaks.push(Math.min(255, Math.round((cur / 32768) * 255)))
          cur = 0
          count = 0
        }
      }
      carry = usable < buf.length ? buf.subarray(usable) : null
    })
    p.on('error', reject)
    p.on('close', (code) => {
      if (count > 0) peaks.push(Math.min(255, Math.round((cur / 32768) * 255)))
      if (code === 0) resolve({ perSecond: WAVE_PER_SECOND, peaks })
      else reject(new Error(err.trim() || `ffmpeg terminó con código ${code}`))
    })
  })
}

/** Cola de trabajos con concurrencia limitada (miniaturas, y más adelante waveforms/proxies). */
export class JobQueue {
  private running = 0
  private pending: (() => Promise<void>)[] = []

  constructor(
    private readonly concurrency: number,
    private readonly emit: (task: BackgroundTask) => void
  ) {}

  add(id: string, label: string, job: () => Promise<void>): void {
    this.emit({ id, label, progress: null, done: false })
    this.pending.push(async () => {
      try {
        await job()
        this.emit({ id, label, progress: 1, done: true })
      } catch (e) {
        this.emit({ id, label, progress: null, done: true, error: e instanceof Error ? e.message : String(e) })
      }
    })
    this.pump()
  }

  /** Encola un trabajo y devuelve su resultado (las miniaturas usan add, que no lo necesita). */
  run<T>(id: string, label: string, job: (progress: (p: number) => void) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.emit({ id, label, progress: null, done: false })
      this.pending.push(async () => {
        try {
          const v = await job((p) => this.emit({ id, label, progress: Math.max(0, Math.min(1, p)), done: false }))
          this.emit({ id, label, progress: 1, done: true })
          resolve(v)
        } catch (e) {
          this.emit({ id, label, progress: null, done: true, error: e instanceof Error ? e.message : String(e) })
          reject(e)
        }
      })
      this.pump()
    })
  }

  private pump(): void {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const next = this.pending.shift()
      if (!next) break
      this.running++
      void next().finally(() => {
        this.running--
        this.pump()
      })
    }
  }
}

// ───────── Proxies ─────────

const WEB_CONTAINERS = new Set(['.mp4', '.m4v', '.mov', '.webm'])
const WEB_VIDEO = new Set(['h264', 'vp8', 'vp9', 'av1'])
const WEB_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_s24le', 'pcm_f32le'])

/**
 * ¿Chromium no puede reproducir este vídeo de forma fiable? (códecs como ProRes, H.265 o AVI antiguos,
 * y H.264 de 10 bits o 4:2:2/4:4:4). En ese caso se genera un proxy H.264 para la vista previa.
 */
export function needsProxy(m: Pick<MediaItem, 'kind' | 'path' | 'probe'>): boolean {
  if (m.kind !== 'video') return false
  const p = m.probe
  if (p && !p.videoCodec) return false // sin pista de video (p. ej. audio en .mkv): no hay nada que transcodificar a video
  if (!WEB_CONTAINERS.has(extname(m.path).toLowerCase())) return true
  if (p?.videoCodec && !WEB_VIDEO.has(p.videoCodec)) return true
  if (p?.audioCodec && !WEB_AUDIO.has(p.audioCodec)) return true
  if (p?.pixFmt && /(10|12|16)(le|be)|422|444/.test(p.pixFmt)) return true
  if ((p?.keyGap ?? 0) > MAX_KEY_GAP) return true // fotogramas clave muy separados: buscar es lento
  return false
}

/** Transcodifica a H.264/AAC (máx. 1080p) con progreso. El original nunca se toca. */
export async function makeProxy(src: string, out: string, duration: number, onProgress: (p: number) => void): Promise<void> {
  const ffmpeg = await resolveBinary('ffmpeg')
  await mkdir(join(out, '..'), { recursive: true })
  const tmp = out + '.partial.mp4'
  const args = [
    '-v', 'error', '-y', '-i', src, '-map', '0:v:0', '-map', '0:a:0?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-vf', "scale='min(1920,iw)':-2", '-g', '15', '-keyint_min', '15', '-sc_threshold', '0', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart',
    '-progress', 'pipe:1', '-nostats', tmp
  ]
  await new Promise<void>((resolve, reject) => {
    const p = spawn(ffmpeg, args, { windowsHide: true })
    let err = ''
    p.stderr.on('data', (d: Buffer) => (err += d.toString()))
    p.stdout.on('data', (d: Buffer) => {
      const m = /out_time_us=(d+)/.exec(d.toString())
      if (m && duration > 0) onProgress(Number(m[1]) / 1e6 / duration)
    })
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `ffmpeg terminó con código ${code}`))))
  })
  await rename(tmp, out)
}
