import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { promisify } from 'node:util'
import type { MediaItem, Probe } from '@shared/project-schema'
import type { BackgroundTask } from '@shared/ipc'
import { resolveBinary } from './paths'

const run = promisify(execFile)

const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v', '.mts', '.m2ts', '.wmv', '.flv', '.mpg', '.mpeg'])
const AUDIO_EXT = new Set(['.mp3', '.wav', '.aac', '.m4a', '.flac', '.ogg', '.opus', '.wma'])
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
  side_data_list?: { rotation?: number }[]
  tags?: { rotate?: string }
}

function parseRate(rate?: string): { num: number; den: number } | undefined {
  if (!rate) return undefined
  const [n, d] = rate.split('/').map(Number)
  if (!n || !d) return undefined
  return { num: n, den: d }
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
    rotation: Number.isFinite(rotation) ? rotation : 0
  }
}

export async function makeThumbnail(file: string, kind: MediaItem['kind'], duration: number, out: string): Promise<boolean> {
  if (kind === 'audio') return false
  const ffmpeg = await resolveBinary('ffmpeg')
  await mkdir(join(out, '..'), { recursive: true })
  const seek = kind === 'video' ? Math.min(1, Math.max(0, duration / 2)) : 0
  const args = ['-v', 'error', '-y', '-ss', seek.toFixed(2), '-i', file, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '4', out]
  await run(ffmpeg, args, { windowsHide: true })
  return true
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
