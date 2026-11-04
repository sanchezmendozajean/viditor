import { z } from 'zod'

export const FORMAT_VERSION = 1

const fps = z.object({ num: z.number().int().positive(), den: z.number().int().positive() })
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const importModeSchema = z.enum(['ask', 'reference', 'copy', 'move'])
export type ImportMode = z.infer<typeof importModeSchema>

export const settingsSchema = z.object({
  width: z.number().int().min(16).max(16384),
  height: z.number().int().min(16).max(16384),
  fps,
  sampleRate: z.number().int().positive().default(48000),
  background: color.default('#000000'),
  importMode: importModeSchema.default('ask'),
  masterVolume: z.number().min(0).default(1)
})

export const probeSchema = z.object({
  duration: z.number().min(0),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  fps: fps.optional(),
  hasAudio: z.boolean().default(false),
  videoCodec: z.string().optional(),
  audioCodec: z.string().optional(),
  rotation: z.number().default(0)
})

export const mediaSchema = z.object({
  id: z.string(),
  path: z.string(),
  storage: z.enum(['project', 'external']),
  kind: z.enum(['video', 'audio', 'image']),
  binId: z.string().nullable().default(null),
  probe: probeSchema.optional(),
  proxy: z.string().optional()
})

export const binSchema = z.object({ id: z.string(), name: z.string(), parentId: z.string().nullable().default(null) })

export const trackSchema = z.object({
  id: z.string(),
  kind: z.enum(['video', 'audio']),
  name: z.string(),
  color: color.optional(),
  hidden: z.boolean().default(false),
  locked: z.boolean().default(false),
  height: z.number().default(64),
  volume: z.number().min(0).default(1),
  muted: z.boolean().default(false),
  solo: z.boolean().default(false)
})

// Clips, transiciones y marcadores se modelan completos desde la fase 1
// para no romper el formato; su edición llega en fases posteriores.
export const clipSchema = z.object({
  id: z.string(),
  mediaId: z.string(),
  trackId: z.string(),
  start: z.number().min(0),
  in: z.number().min(0),
  out: z.number().min(0),
  speed: z.number().default(1),
  name: z.string(),
  color: color.nullable().default(null),
  enabled: z.boolean().default(true),
  transform: z
    .object({
      fit: z.enum(['fit', 'fill', 'stretch', 'none']).default('fit'),
      x: z.number().default(0),
      y: z.number().default(0),
      scaleX: z.number().default(1),
      scaleY: z.number().default(1),
      lockAspect: z.boolean().default(true),
      rotation: z.number().default(0),
      flipH: z.boolean().default(false),
      flipV: z.boolean().default(false),
      anchorX: z.number().default(0.5),
      anchorY: z.number().default(0.5),
      opacity: z.number().min(0).max(1).default(1),
      crop: z
        .object({ left: z.number(), top: z.number(), right: z.number(), bottom: z.number() })
        .default({ left: 0, top: 0, right: 0, bottom: 0 })
    })
    .default({
      fit: 'fit', x: 0, y: 0, scaleX: 1, scaleY: 1, lockAspect: true, rotation: 0,
      flipH: false, flipV: false, anchorX: 0.5, anchorY: 0.5, opacity: 1,
      crop: { left: 0, top: 0, right: 0, bottom: 0 }
    }),
  audio: z
    .object({
      volume: z.number().default(1),
      muted: z.boolean().default(false),
      fadeIn: z.number().default(0),
      fadeOut: z.number().default(0)
    })
    .default({ volume: 1, muted: false, fadeIn: 0, fadeOut: 0 }),
  keyframes: z.record(z.string(), z.unknown()).default({})
})

export const transitionSchema = z.object({
  id: z.string(),
  trackId: z.string(),
  leaveClipId: z.string(),
  enterClipId: z.string(),
  transitionRef: z.string().regex(/^(builtin|user|project):.+/),
  duration: z.number().positive(),
  params: z.record(z.string(), z.unknown()).default({}),
  audio: z.enum(['crossfade', 'cut', 'none']).optional()
})

export const markerSchema = z.object({ time: z.number().min(0), label: z.string(), color: color.optional() })

export const projectSchema = z.object({
  formatVersion: z.number().int().min(1),
  app: z.literal('viditor'),
  name: z.string().min(1),
  settings: settingsSchema,
  bins: z.array(binSchema).default([]),
  media: z.array(mediaSchema).default([]),
  tracks: z.array(trackSchema).default([]),
  clips: z.array(clipSchema).default([]),
  transitions: z.array(transitionSchema).default([]),
  markers: z.array(markerSchema).default([]),
  view: z
    .object({
      zoom: z.number().default(80),
      scroll: z.number().default(0),
      playhead: z.number().default(0),
      workspace: z.string().default('edit')
    })
    .default({ zoom: 80, scroll: 0, playhead: 0, workspace: 'edit' })
})

export type Project = z.infer<typeof projectSchema>
export type ProjectSettings = z.infer<typeof settingsSchema>
export type MediaItem = z.infer<typeof mediaSchema>
export type MediaBin = z.infer<typeof binSchema>
export type Probe = z.infer<typeof probeSchema>

export const RESOLUTION_PRESETS = [
  { label: '1920 × 1080 (Full HD)', width: 1920, height: 1080 },
  { label: '3840 × 2160 (4K)', width: 3840, height: 2160 },
  { label: '2560 × 1440', width: 2560, height: 1440 },
  { label: '1280 × 720', width: 1280, height: 720 },
  { label: '1080 × 1920 (vertical)', width: 1080, height: 1920 },
  { label: '1080 × 1080 (cuadrado)', width: 1080, height: 1080 }
] as const

export const FPS_PRESETS = [
  { label: '23,976', num: 24000, den: 1001 },
  { label: '24', num: 24, den: 1 },
  { label: '25', num: 25, den: 1 },
  { label: '29,97', num: 30000, den: 1001 },
  { label: '30', num: 30, den: 1 },
  { label: '50', num: 50, den: 1 },
  { label: '59,94', num: 60000, den: 1001 },
  { label: '60', num: 60, den: 1 }
] as const

export type Clip = z.infer<typeof clipSchema>
export type Track = z.infer<typeof trackSchema>
export type Transition = z.infer<typeof transitionSchema>
export type Marker = z.infer<typeof markerSchema>
