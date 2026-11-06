import { describe, expect, it } from 'vitest'
import { parseProject } from '../../src/shared/migrations'
import type { Clip, Project } from '../../src/shared/project-schema'
import { makeClip } from '../../src/shared/timeline-ops'
import * as rm from '../../src/shared/render-model'

function project(): Project {
  return parseProject({
    formatVersion: 1,
    app: 'viditor',
    name: 't',
    settings: { width: 1920, height: 1080, fps: { num: 30, den: 1 } },
    media: [
      { id: 'm1', path: 'a.mp4', storage: 'project', kind: 'video', probe: { duration: 10, width: 1920, height: 1080, hasAudio: true } },
      { id: 'm2', path: 'b.mp4', storage: 'project', kind: 'video', probe: { duration: 10, width: 1080, height: 1920, hasAudio: true } },
      { id: 'm3', path: 'c.mp3', storage: 'project', kind: 'audio', probe: { duration: 30, hasAudio: true } }
    ],
    tracks: [
      { id: 'v2', kind: 'video', name: 'V2' },
      { id: 'v1', kind: 'video', name: 'V1' },
      { id: 'a1', kind: 'audio', name: 'A1' }
    ]
  })
}
const clip = (p: Project, mediaId: string, track: string, start: number, id: string): Clip => {
  const c = makeClip(p, p.media.find((m) => m.id === mediaId)!, track, start, id)
  p.clips.push(c)
  return c
}
const near = (a: number[], b: number[], d = 1e-6): void => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, -Math.log10(d)))

describe('geometría y matriz', () => {
  it('un clip 16:9 en un proyecto 16:9 ocupa todo el cuadro', () => {
    const p = project()
    const c = clip(p, 'm1', 'v1', 0, 'c')
    const g = rm.clipGeometry(p.settings, c, p.media[0])
    expect([g.bw, g.bh]).toEqual([1920, 1080])
    near(rm.clipMatrix(p.settings, c, g), [1920, 0, 0, 1080, 0, 0])
  })

  it('un clip vertical se ajusta (fit) con barras laterales, y se rellena (fill) recortando', () => {
    const p = project()
    const c = clip(p, 'm2', 'v1', 0, 'c')
    let g = rm.clipGeometry(p.settings, c, p.media[1])
    expect(g.bh).toBeCloseTo(1080)
    expect(g.bw).toBeCloseTo(607.5)
    c.transform.fit = 'fill'
    g = rm.clipGeometry(p.settings, c, p.media[1])
    expect(g.bw).toBeCloseTo(1920)
    c.transform.fit = 'stretch'
    g = rm.clipGeometry(p.settings, c, p.media[1])
    expect([g.bw, g.bh]).toEqual([1920, 1080])
  })

  it('escala, posición y rotación sobre el centro', () => {
    const p = project()
    const c = clip(p, 'm1', 'v1', 0, 'c')
    Object.assign(c.transform, { scaleX: 0.5, scaleY: 0.5, x: 100, y: -50, rotation: 90 })
    const g = rm.clipGeometry(p.settings, c, p.media[0])
    const m = rm.clipMatrix(p.settings, c, g)
    const [cx, cy] = rm.worldCenter(m)
    expect(cx).toBeCloseTo(960 + 100)
    expect(cy).toBeCloseTo(540 - 50)
    // Con 90° el eje u apunta hacia abajo: esquina (1,0) está a +bw/2 (en y) del centro... y la (0,0) a -bw/2
    const [x0, y0] = rm.applyMatrix(m, 0, 0)
    expect(x0).toBeCloseTo(cx + 270) // (-bw/2, -bh/2) rotado 90°
    expect(y0).toBeCloseTo(cy - 480)
  })

  it('rotar sobre un anclaje distinto mueve el centro pero deja fijo el anclaje', () => {
    const p = project()
    const c = clip(p, 'm1', 'v1', 0, 'c')
    Object.assign(c.transform, { anchorX: 0, anchorY: 0, rotation: 90 })
    const g = rm.clipGeometry(p.settings, c, p.media[0])
    const m = rm.clipMatrix(p.settings, c, g)
    // El anclaje (0,0) sigue en el punto donde estaba sin rotar: esquina superior izquierda del cuadro
    near(rm.applyMatrix(m, 0, 0), [0, 0])
  })

  it('solvePosition mantiene el centro al cambiar tamaño, ángulo y anclaje', () => {
    const p = project()
    const c = clip(p, 'm1', 'v1', 0, 'c')
    Object.assign(c.transform, { x: 40, y: 25, rotation: 33, anchorX: 0.2, anchorY: 0.8, scaleX: 0.6, scaleY: 0.6 })
    const g = rm.clipGeometry(p.settings, c, p.media[0])
    const center = rm.worldCenter(rm.clipMatrix(p.settings, c, g))
    // Cambia el tamaño y recalcula la posición para conservar el centro
    c.transform.scaleX = c.transform.scaleY = 1
    const g2 = rm.clipGeometry(p.settings, c, p.media[0])
    const pos = rm.solvePosition(p.settings, center, g2, c.transform.rotation, { x: 0.2, y: 0.8 })
    c.transform.x = pos.x
    c.transform.y = pos.y
    near(rm.worldCenter(rm.clipMatrix(p.settings, c, g2)), center, 1e-4)
  })

  it('crop y volteo se reflejan en las coordenadas de textura', () => {
    const p = project()
    const c = clip(p, 'm1', 'v1', 0, 'c')
    c.transform.crop = { left: 192, top: 108, right: 0, bottom: 0 }
    c.transform.flipH = true
    const f = { ops: rm.drawOps(rm.buildFrame(p, 1)) }
    near(f.ops[0]!.uv, [1, 0.1, 0.1, 1])
  })
})

describe('buildFrame', () => {
  it('compone de la pista de más abajo a la de más arriba y respeta ocultas/deshabilitadas', () => {
    const p = project()
    clip(p, 'm1', 'v1', 0, 'low')
    clip(p, 'm1', 'v2', 2, 'high')
    expect(rm.drawOps(rm.buildFrame(p, 3)).map((o) => o.clipId)).toEqual(['low', 'high'])
    p.tracks[0]!.hidden = true
    expect(rm.drawOps(rm.buildFrame(p, 3)).map((o) => o.clipId)).toEqual(['low'])
    p.clips.find((c) => c.id === 'low')!.enabled = false
    expect(rm.drawOps(rm.buildFrame(p, 3))).toEqual([])
  })

  it('calcula el tiempo fuente y no incluye audio ni clips fuera de rango', () => {
    const p = project()
    const c = clip(p, 'm1', 'v1', 5, 'c')
    c.in = 2
    c.out = 6
    clip(p, 'm3', 'a1', 0, 'aud')
    expect(rm.drawOps(rm.buildFrame(p, 4.9))).toEqual([])
    expect(rm.drawOps(rm.buildFrame(p, 6))[0]!.sourceTime).toBeCloseTo(3)
    expect(rm.drawOps(rm.buildFrame(p, 9))).toEqual([]) // fin exclusivo
    expect(rm.drawOps(rm.buildFrame(p, 6))).toHaveLength(1)
  })

  it('opacidad pasa tal cual', () => {
    const p = project()
    const c = clip(p, 'm1', 'v1', 0, 'c')
    c.transform.opacity = 0.4
    expect(rm.drawOps(rm.buildFrame(p, 1))[0]!.opacity).toBe(0.4)
  })
})

describe('audio', () => {
  it('los tres niveles se combinan de forma multiplicativa', () => {
    const p = project()
    const c = clip(p, 'm1', 'v1', 0, 'c')
    c.audio.volume = 0.5
    p.tracks.find((t) => t.id === 'v1')!.volume = 0.5
    p.settings.masterVolume = 0.8
    expect(rm.finalGain(p, c, p.tracks.find((t) => t.id === 'v1')!, 1)).toBeCloseTo(0.2)
  })

  it('fundidos de entrada y salida', () => {
    const p = project()
    const c = clip(p, 'm1', 'v1', 0, 'c') // 10 s
    c.audio.fadeIn = 2
    c.audio.fadeOut = 4
    expect(rm.clipGainAt(c, 0)).toBe(0)
    expect(rm.clipGainAt(c, 1)).toBeCloseTo(0.5)
    expect(rm.clipGainAt(c, 5)).toBe(1)
    expect(rm.clipGainAt(c, 8)).toBeCloseTo(0.5)
    expect(rm.clipGainAt(c, 10)).toBe(0)
  })

  it('silencio y solo de pista', () => {
    const p = project()
    const [v2, v1] = [p.tracks[0]!, p.tracks[1]!]
    v1.muted = true
    expect(rm.trackGain(p, v1)).toBe(0)
    v1.muted = false
    v2.solo = true
    expect(rm.trackGain(p, v1)).toBe(0)
    expect(rm.trackGain(p, v2)).toBe(1)
  })

  it('conversión dB', () => {
    expect(rm.dbToGain(0)).toBe(1)
    expect(rm.dbToGain(-6)).toBeCloseTo(0.5012, 3)
    expect(rm.gainToDb(2)).toBeCloseTo(6.02, 2)
    expect(rm.gainToDb(0)).toBe(-Infinity)
  })
})
