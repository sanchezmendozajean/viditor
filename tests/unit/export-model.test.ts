import { describe, expect, it } from 'vitest'
import { parseProject } from '../../src/shared/migrations'
import type { Project } from '../../src/shared/project-schema'
import { makeClip } from '../../src/shared/timeline-ops'
import {
  buildEncoderArgs,
  EXPORT_PRESETS,
  exportFrames,
  exportProject,
  outputSize,
  qualityToCrf,
  stdinFormat,
  type ExportOptions
} from '../../src/shared/export-model'
import { exportOptionsSchema } from '../../src/shared/export-schema'

function project(): Project {
  const p = parseProject({
    formatVersion: 1,
    app: 'viditor',
    name: 'Demo',
    settings: { width: 1920, height: 1080, fps: { num: 30, den: 1 } },
    media: [{ id: 'm1', path: 'a.mp4', storage: 'project', kind: 'video', probe: { duration: 10, width: 1920, height: 1080, hasAudio: true } }],
    tracks: [{ id: 'v1', kind: 'video', name: 'V1' }]
  })
  p.clips.push(makeClip(p, p.media[0]!, 'v1', 0, 'c1'))
  return p
}

const opts = (over: Partial<ExportOptions> = {}): ExportOptions => ({
  outputPath: 'out.mp4',
  presetId: 'custom',
  codec: 'h264',
  width: null,
  height: null,
  fps: null,
  range: null,
  quality: 75,
  bitrateKbps: null,
  hw: 'none',
  after: 'nothing',
  ...over
})

describe('modelo de exportación (specs/06)', () => {
  it('todos los presets y las opciones por defecto pasan la validación IPC', () => {
    for (const p of EXPORT_PRESETS) {
      expect(exportOptionsSchema.safeParse(opts({ presetId: p.id, codec: p.codec, width: p.width, height: p.height })).success).toBe(true)
    }
    expect(exportOptionsSchema.safeParse(opts({ quality: 200 })).success).toBe(false)
    expect(exportOptionsSchema.safeParse(opts({ codec: 'gif' as never })).success).toBe(false)
  })

  it('mapea la calidad a CRF: más calidad = CRF más bajo', () => {
    expect(qualityToCrf('h264', 0)).toBeGreaterThan(qualityToCrf('h264', 100))
    expect(qualityToCrf('h264', 75)).toBeGreaterThanOrEqual(14)
    expect(qualityToCrf('vp9', 100)).toBeLessThan(qualityToCrf('vp9', 0))
  })

  it('calcula fotogramas y rango sobre la rejilla de fps de salida', () => {
    const p = project()
    const total = exportFrames(p, opts())
    expect(total.first).toBe(0)
    expect(total.count).toBe(Math.round(p.clips[0]!.out * 30 - p.clips[0]!.in * 30))
    expect(exportFrames(p, opts({ range: { start: 1, end: 2 } }))).toEqual({ first: 30, count: 30 })
    expect(exportFrames(p, opts({ range: { start: 1, end: 2 }, fps: { num: 60, den: 1 } }))).toEqual({ first: 60, count: 60 })
    // Un rango fuera de la secuencia se recorta
    expect(exportFrames(p, opts({ range: { start: 5, end: 500 } })).count).toBeGreaterThan(0)
    expect(exportFrames(p, opts({ range: { start: 500, end: 600 } })).count).toBe(0)
  })

  it('el tamaño de salida es par y por defecto el del proyecto', () => {
    const p = project()
    expect(outputSize(p, { width: null, height: null })).toEqual({ width: 1920, height: 1080 })
    expect(outputSize(p, { width: 1281, height: 721 })).toEqual({ width: 1282, height: 722 })
  })

  it('mismo aspecto: el proyecto no cambia (solo se escala el lienzo); otro aspecto: se reencuadra', () => {
    const p = project()
    const same = exportProject(p, opts({ width: 1280, height: 720 }))
    expect(same.project.settings.width).toBe(1920)
    expect(same.canvas).toEqual({ width: 1280, height: 720 })
    const vertical = exportProject(p, opts({ width: 1080, height: 1920 }))
    expect(vertical.project.settings.width).toBe(1080)
    expect(vertical.project.settings.height).toBe(1920)
    expect(exportProject(p, opts({ fps: { num: 24, den: 1 } })).project.settings.fps).toEqual({ num: 24, den: 1 })
  })

  it('construye el codificador H.264: rawvideo RGBA por stdin, vflip, BT.709 y AAC', () => {
    const args = buildEncoderArgs({ codec: 'h264', hw: null, width: 1920, height: 1080, fps: { num: 30000, den: 1001 }, quality: 75, bitrateKbps: null, audioPath: 'mix.f32', sampleRate: 48000, outputPath: 'o.mp4' })
    const joined = args.join(' ')
    expect(joined).toContain('-f rawvideo -pix_fmt rgba -s 1920x1080 -framerate 30000/1001 -i pipe:0')
    expect(joined).toContain('-f f32le -ar 48000 -ac 2 -i mix.f32')
    expect(joined).toContain('vflip')
    expect(joined).toContain('out_color_matrix=bt709')
    expect(joined).toContain('-c:v libx264')
    expect(joined).toContain('-c:a aac -b:a 192k')
    expect(joined).toContain('-movflags +faststart')
    expect(args.at(-1)).toBe('o.mp4')
  })

  it('sin audio no añade la entrada ni el mapeo de audio', () => {
    const args = buildEncoderArgs({ codec: 'h264', hw: null, width: 640, height: 360, fps: { num: 25, den: 1 }, quality: 50, bitrateKbps: null, audioPath: null, sampleRate: 48000, outputPath: 'o.mp4' })
    expect(args).not.toContain('f32le')
    expect(args).not.toContain('1:a')
  })

  it('cada códec usa su codificador, contenedor y audio', () => {
    const base = { hw: null, width: 640, height: 360, fps: { num: 25, den: 1 }, quality: 50, bitrateKbps: null, audioPath: 'm', sampleRate: 48000, outputPath: 'o' } as const
    const prores = buildEncoderArgs({ ...base, codec: 'prores' }).join(' ')
    expect(prores).toContain('-c:v prores_ks')
    expect(prores).toContain('yuv422p10le')
    expect(prores).toContain('pcm_s16le')
    expect(prores).toContain('-f mov')
    const vp9 = buildEncoderArgs({ ...base, codec: 'vp9' }).join(' ')
    expect(vp9).toContain('libvpx-vp9')
    expect(vp9).toContain('libopus')
    expect(vp9).toContain('-f webm')
    const hevc = buildEncoderArgs({ ...base, codec: 'h265' }).join(' ')
    expect(hevc).toContain('libx265')
    expect(hevc).toContain('hvc1')
  })

  it('hardware: NVENC, QSV, AMF y VAAPI usan sus parámetros de calidad', () => {
    const base = { codec: 'h264', width: 640, height: 360, fps: { num: 25, den: 1 }, quality: 50, bitrateKbps: null, audioPath: null, sampleRate: 48000, outputPath: 'o' } as const
    expect(buildEncoderArgs({ ...base, hw: 'nvenc' }).join(' ')).toMatch(/-c:v h264_nvenc .*-cq \d+/)
    expect(buildEncoderArgs({ ...base, hw: 'qsv' }).join(' ')).toMatch(/h264_qsv .*-global_quality \d+/)
    expect(buildEncoderArgs({ ...base, hw: 'amf' }).join(' ')).toMatch(/h264_amf .*-qp_i \d+/)
    const vaapi = buildEncoderArgs({ ...base, hw: 'vaapi' }).join(' ')
    expect(vaapi).toContain('-vaapi_device')
    expect(vaapi).toContain('hwupload')
  })

  it('entrada yuv420p: sin filtros de conversión ni volteo', () => {
    const base = { hw: null, width: 640, height: 360, fps: { num: 25, den: 1 }, quality: 50, bitrateKbps: null, audioPath: null, sampleRate: 48000, outputPath: 'o' } as const
    const j = buildEncoderArgs({ ...base, codec: 'h264', input: 'yuv420p' }).join(' ')
    expect(j).toContain('-f rawvideo -pix_fmt yuv420p -s 640x360')
    expect(j).not.toContain('-vf')
    expect(j).toContain('-color_range tv')
    expect(buildEncoderArgs({ ...base, codec: 'h264' }).join(' ')).toContain('-pix_fmt rgba')
  })

  it('la conversión en la GPU solo se usa donde el codificador toma yuv420p tal cual', () => {
    expect(stdinFormat('h264', null)).toBe('yuv420p')
    expect(stdinFormat('h265', 'nvenc')).toBe('yuv420p')
    expect(stdinFormat('vp9', null)).toBe('yuv420p')
    expect(stdinFormat('prores', null)).toBe('rgba')
    expect(stdinFormat('h264', 'qsv')).toBe('rgba')
    expect(stdinFormat('h264', 'vaapi')).toBe('rgba')
  })

  it('el bitrate objetivo sustituye a la calidad constante (salvo ProRes)', () => {
    const base = { hw: null, width: 640, height: 360, fps: { num: 25, den: 1 }, quality: 50, audioPath: null, sampleRate: 48000, outputPath: 'o' } as const
    const h = buildEncoderArgs({ ...base, codec: 'h264', bitrateKbps: 5000 }).join(' ')
    expect(h).toContain('-b:v 5000k')
    expect(h).not.toContain('-crf')
    expect(buildEncoderArgs({ ...base, codec: 'prores', bitrateKbps: 5000 }).join(' ')).not.toContain('5000k')
  })
})
