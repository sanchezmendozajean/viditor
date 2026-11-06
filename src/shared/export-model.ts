/**
 * Modelo de exportación (specs/06): opciones, presets y construcción de los argumentos de FFmpeg.
 * Todo es puro y se prueba con tests unitarios; el main y el renderer comparten estas definiciones.
 */
import type { Project } from './project-schema'
import { sequenceDuration } from './timeline-ops'

export type VideoCodec = 'h264' | 'h265' | 'vp9' | 'prores'
export type HwKind = 'nvenc' | 'qsv' | 'amf' | 'vaapi'
export type HwMode = 'auto' | 'none' | HwKind
export type Container = 'mp4' | 'webm' | 'mov'
export type AudioCodec = 'aac' | 'opus' | 'pcm'

export interface ExportOptions {
  /** Ruta absoluta del archivo final */
  outputPath: string
  presetId: string
  codec: VideoCodec
  /** Resolución de salida; null = la del proyecto */
  width: number | null
  height: number | null
  /** Fotogramas por segundo; null = los del proyecto */
  fps: { num: number; den: number } | null
  /** Rango en segundos de la línea de tiempo; null = todo el proyecto */
  range: { start: number; end: number } | null
  /** 0 (Baja) … 100 (Máxima): se traduce a CRF según el códec */
  quality: number
  /** Si no es null se codifica a este bitrate (kbps) en lugar de por calidad constante */
  bitrateKbps: number | null
  hw: HwMode
  after: 'folder' | 'play' | 'nothing'
}

export interface ExportPreset {
  id: string
  label: string
  codec: VideoCodec
  width: number | null
  height: number | null
  quality: number
  /** Los presets con una resolución fija la imponen; «custom» deja elegir */
  note?: string
}

export const EXPORT_PRESETS: ExportPreset[] = [
  { id: 'youtube-1080', label: 'YouTube 1080p', codec: 'h264', width: 1920, height: 1080, quality: 75 },
  { id: 'youtube-4k', label: 'YouTube 4K', codec: 'h264', width: 3840, height: 2160, quality: 75 },
  { id: 'instagram-vertical', label: 'Instagram vertical 1080×1920', codec: 'h264', width: 1080, height: 1920, quality: 70 },
  { id: 'whatsapp-720', label: 'WhatsApp 720p', codec: 'h264', width: 1280, height: 720, quality: 45 },
  { id: 'prores', label: 'Alta calidad (ProRes)', codec: 'prores', width: null, height: null, quality: 100 },
  { id: 'custom', label: 'Personalizado', codec: 'h264', width: null, height: null, quality: 70 }
]

export const CODEC_INFO: Record<VideoCodec, { label: string; container: Container; ext: string; audio: AudioCodec; audioLabel: string }> = {
  h264: { label: 'MP4 · H.264', container: 'mp4', ext: 'mp4', audio: 'aac', audioLabel: 'AAC 192 kbps' },
  h265: { label: 'MP4 · H.265 (HEVC)', container: 'mp4', ext: 'mp4', audio: 'aac', audioLabel: 'AAC 192 kbps' },
  vp9: { label: 'WebM · VP9', container: 'webm', ext: 'webm', audio: 'opus', audioLabel: 'Opus 160 kbps' },
  prores: { label: 'MOV · ProRes 422', container: 'mov', ext: 'mov', audio: 'pcm', audioLabel: 'PCM 16 bits' }
}

/** Nombre del códec de FFmpeg para un códec y un modo de hardware (null = software). */
export function encoderName(codec: VideoCodec, hw: HwKind | null): string {
  if (codec === 'prores') return 'prores_ks'
  if (codec === 'vp9') return 'libvpx-vp9'
  if (codec === 'h264') return hw ? `h264_${hw}` : 'libx264'
  return hw ? `hevc_${hw}` : 'libx265'
}

/** Aceleraciones por hardware que existen para cada códec. */
export const HW_SUPPORT: Record<VideoCodec, HwKind[]> = {
  h264: ['nvenc', 'qsv', 'amf', 'vaapi'],
  h265: ['nvenc', 'qsv', 'amf', 'vaapi'],
  vp9: [],
  prores: []
}

export interface ExportCapabilities {
  /** Aceleraciones que funcionan en este equipo (probadas con una codificación corta) */
  hw: Partial<Record<VideoCodec, HwKind[]>>
  platform: string
}

/** Calidad 0–100 → CRF/QP del códec (más alto = peor). */
export function qualityToCrf(codec: VideoCodec, quality: number): number {
  const q = Math.max(0, Math.min(100, quality)) / 100
  if (codec === 'vp9') return Math.round(46 - 28 * q)
  return Math.round(36 - 22 * q)
}

/** Resolución real de salida (par para los códecs YUV 4:2:0). */
export function outputSize(project: Pick<Project, 'settings'>, o: Pick<ExportOptions, 'width' | 'height'>): { width: number; height: number } {
  const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2)
  return { width: even(o.width ?? project.settings.width), height: even(o.height ?? project.settings.height) }
}

export function outputFps(project: Pick<Project, 'settings'>, o: Pick<ExportOptions, 'fps'>): { num: number; den: number } {
  return o.fps ?? project.settings.fps
}

/**
 * Proyecto tal como se renderiza: con los fps elegidos y, si el aspecto de salida difiere del del proyecto, con la
 * resolución de salida (los ajustes «ajustar/rellenar» recalculan la geometría). Si solo cambia la escala, el
 * proyecto no se toca y el compositor escala el lienzo: es exactamente lo que ya hace la vista previa a ½ y ¼.
 */
export function exportProject(project: Project, o: ExportOptions): { project: Project; canvas: { width: number; height: number } } {
  const size = outputSize(project, o)
  const sameAspect = Math.abs(size.width / size.height - project.settings.width / project.settings.height) < 0.005
  const settings = { ...project.settings, fps: outputFps(project, o) }
  if (!sameAspect) {
    settings.width = size.width
    settings.height = size.height
  }
  return { project: { ...project, settings }, canvas: size }
}

/** Rango efectivo en segundos, ajustado a la duración del proyecto. */
export function exportRange(project: Project, o: Pick<ExportOptions, 'range'>): { start: number; end: number } {
  const dur = sequenceDuration(project)
  if (!o.range) return { start: 0, end: dur }
  const start = Math.max(0, Math.min(o.range.start, dur))
  const end = Math.max(start, Math.min(o.range.end, dur))
  return { start, end }
}

/** Número de fotogramas del rango y primer fotograma (en la rejilla de fps de salida). */
export function exportFrames(project: Project, o: ExportOptions): { first: number; count: number } {
  const { start, end } = exportRange(project, o)
  const { num, den } = outputFps(project, o)
  const first = Math.round((start * num) / den)
  const last = Math.round((end * num) / den)
  return { first, count: Math.max(0, last - first) }
}

export interface EncoderArgsInput {
  codec: VideoCodec
  hw: HwKind | null
  width: number
  height: number
  fps: { num: number; den: number }
  quality: number
  bitrateKbps: number | null
  /** Ruta del audio mezclado (f32le estéreo) o null si no hay audio */
  audioPath: string | null
  sampleRate: number
  outputPath: string
  /** Dispositivo VAAPI (Linux) */
  vaapiDevice?: string
}

/**
 * Argumentos completos del FFmpeg codificador: vídeo RGBA crudo por stdin (con las filas de WebGL, de abajo a
 * arriba, de ahí el `vflip`), audio ya mezclado como archivo, salida con color BT.709.
 */
export function buildEncoderArgs(i: EncoderArgsInput): string[] {
  const info = CODEC_INFO[i.codec]
  const enc = encoderName(i.codec, i.hw)
  const crf = qualityToCrf(i.codec, i.quality)
  const args: string[] = ['-hide_banner', '-y', '-v', 'warning']
  if (i.hw === 'vaapi') args.push('-vaapi_device', i.vaapiDevice ?? '/dev/dri/renderD128')
  args.push('-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${i.width}x${i.height}`, '-framerate', `${i.fps.num}/${i.fps.den}`, '-i', 'pipe:0')
  if (i.audioPath) args.push('-f', 'f32le', '-ar', String(i.sampleRate), '-ac', '2', '-i', i.audioPath)
  args.push('-map', '0:v')
  if (i.audioPath) args.push('-map', '1:a')

  // RGB → YUV con la matriz BT.709 y rango limitado; luego el formato que pide cada codificador
  const pix = i.codec === 'prores' ? 'yuv422p10le' : i.hw === 'qsv' ? 'nv12' : 'yuv420p'
  const chain = ['vflip', 'scale=out_color_matrix=bt709:out_range=tv:flags=bicubic', `format=${pix}`]
  if (i.hw === 'vaapi') chain.splice(2, 1, 'format=nv12', 'hwupload')
  args.push('-vf', chain.join(','))
  args.push('-c:v', enc)

  const useBitrate = i.bitrateKbps !== null && i.codec !== 'prores'
  switch (i.codec) {
    case 'prores':
      args.push('-profile:v', '2', '-vendor', 'apl0')
      break
    case 'vp9':
      args.push(...(useBitrate ? ['-b:v', `${i.bitrateKbps}k`] : ['-crf', String(crf), '-b:v', '0']), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2')
      break
    default:
      if (useBitrate) args.push('-b:v', `${i.bitrateKbps}k`)
      else if (!i.hw) {
        // Calidad máxima → preset más lento; el resto prioriza velocidad (el CRF mantiene la calidad objetivo)
        const slow = i.quality >= 90
        args.push('-crf', String(crf), '-preset', i.codec === 'h265' ? (slow ? 'medium' : 'fast') : slow ? 'medium' : 'veryfast')
      }
      else if (i.hw === 'nvenc') args.push('-rc', 'vbr', '-cq', String(crf), '-b:v', '0', '-preset', 'p5')
      else if (i.hw === 'qsv') args.push('-global_quality', String(crf))
      else if (i.hw === 'amf') args.push('-rc', 'cqp', '-qp_i', String(crf), '-qp_p', String(crf), '-qp_b', String(crf))
      else args.push('-qp', String(crf))
      if (i.codec === 'h265' && i.hw === null) args.push('-tag:v', 'hvc1', '-x265-params', 'log-level=error')
      if (i.codec === 'h265' && i.hw !== null) args.push('-tag:v', 'hvc1')
  }
  args.push('-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv')

  if (i.audioPath) {
    if (info.audio === 'aac') args.push('-c:a', 'aac', '-b:a', '192k')
    else if (info.audio === 'opus') args.push('-c:a', 'libopus', '-b:a', '160k')
    else args.push('-c:a', 'pcm_s16le')
  }
  if (info.container === 'mp4') args.push('-movflags', '+faststart', '-f', 'mp4')
  else if (info.container === 'mov') args.push('-f', 'mov')
  else args.push('-f', 'webm')
  args.push(i.outputPath)
  return args
}

// ───────── Estado y mensajes ─────────

export type ExportPhase = 'audio' | 'video' | 'done' | 'error' | 'cancelled'

export interface ExportProgress {
  jobId: string
  phase: ExportPhase
  frame: number
  total: number
  /** fotogramas por segundo de render */
  fps: number
  /** segundos restantes estimados */
  etaSeconds: number | null
  /** JPEG en data URL del último frame (miniatura) */
  thumb?: string
  message?: string
  outputPath?: string
  encoder?: string
  elapsedSeconds?: number
}

/** Datos que la ventana de exportación recibe del main al arrancar. */
export interface ExportJobData {
  jobId: string
  project: Project
  options: ExportOptions
  /** Carpeta del proyecto */
  dir: string
}

export interface DecodeRequest {
  jobId: string
  clipId: string
  mediaId: string
  /** Tiempo en el medio (s) */
  sourceTime: number
  /** Número de frame de exportación (para descartar decodificadores sin uso) */
  frame: number
}

export interface DecodedFrame {
  width: number
  height: number
  /** RGBA con las filas de arriba abajo */
  data: Uint8Array
  /** Las imágenes fijas llevan canal alfa */
  still: boolean
}

export function defaultOutputName(projectName: string, codec: VideoCodec): string {
  return `${projectName}.${CODEC_INFO[codec].ext}`
}
