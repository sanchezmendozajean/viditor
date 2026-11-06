import { z } from 'zod'

const fps = z.object({ num: z.number().int().positive(), den: z.number().int().positive() })

/** Validación en el límite IPC de las opciones de exportación (el renderer no es de confianza). */
export const exportOptionsSchema = z.object({
  outputPath: z.string().min(1),
  presetId: z.string(),
  codec: z.enum(['h264', 'h265', 'vp9', 'prores']),
  width: z.number().int().min(16).max(16384).nullable(),
  height: z.number().int().min(16).max(16384).nullable(),
  fps: fps.nullable(),
  range: z.object({ start: z.number().min(0), end: z.number().min(0) }).nullable(),
  quality: z.number().min(0).max(100),
  bitrateKbps: z.number().int().min(100).max(1_000_000).nullable(),
  hw: z.enum(['auto', 'none', 'nvenc', 'qsv', 'amf', 'vaapi']),
  after: z.enum(['folder', 'play', 'nothing'])
})
