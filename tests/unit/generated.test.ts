import { describe, expect, it } from 'vitest'
import { parseProject } from '../../src/shared/migrations'
import type { MediaItem, Project } from '../../src/shared/project-schema'
import { contentSize, generatorSize, isGeneratedKind } from '../../src/shared/generated'
import { buildFrame, clipGeometry } from '../../src/shared/render-model'
import * as ops from '../../src/shared/timeline-ops'

function project(): Project {
  return parseProject({
    formatVersion: 1,
    app: 'viditor',
    name: 't',
    settings: { width: 1920, height: 1080, fps: { num: 30, den: 1 } },
    media: [
      { id: 't1', kind: 'text', name: 'Texto' },
      { id: 's1', kind: 'shape', name: 'Rectángulo' }
    ],
    tracks: [
      { id: 'v1', kind: 'video', name: 'V1' },
      { id: 'a1', kind: 'audio', name: 'A1' }
    ]
  })
}
const media = (p: Project, id: string): MediaItem => p.media.find((m) => m.id === id) as MediaItem

describe('texto y formas (recursos generados)', () => {
  it('un recurso generado no necesita archivo y se identifica por su tipo', () => {
    const p = project()
    expect(p.media.map((m) => m.path)).toEqual(['', ''])
    expect(p.media.every((m) => isGeneratedKind(m.kind))).toBe(true)
  })

  it('makeClip crea un clip de 1 s con sus propiedades por defecto y sin ajuste al cuadro', () => {
    const p = project()
    const c = ops.makeClip(p, media(p, 't1'), 'v1', 2, 'c1')
    expect(ops.clipDuration(c)).toBeCloseTo(1)
    expect(c.generator?.type).toBe('text')
    expect(c.transform.fit).toBe('none')
    expect(c.name).toBe('Texto')
    const r = ops.makeClip(p, media(p, 's1'), 'v1', 0, 'c2')
    expect(r.generator?.type).toBe('rectangle')
  })

  it('solo caben en pistas de video y no tienen límite de duración', () => {
    const p = project()
    const [v, a] = p.tracks
    expect(ops.mediaFitsTrack(media(p, 't1'), v!)).toBe(true)
    expect(ops.mediaFitsTrack(media(p, 't1'), a!)).toBe(false)
    expect(ops.mediaLimit(media(p, 's1'))).toBe(Infinity)
  })

  it('la caja es exactamente el contenido; contorno y sombra se dibujan hacia fuera', () => {
    const p = project()
    const c = ops.makeClip(p, media(p, 's1'), 'v1', 0, 'c1')
    p.clips.push(c)
    const g = clipGeometry(p.settings, c, media(p, 's1'))
    const [w, h] = contentSize(c.generator!)
    expect([g.bw, g.bh]).toEqual([w, h])
    // Sin efectos no hay margen: lo dibujado coincide con la caja
    expect(generatorSize(c.generator!)).toEqual([w, h])
    const plain = (buildFrame(p, 0.5).ops[0] as { matrix: number[] }).matrix
    expect([plain[0], plain[3]]).toEqual([w, h])
    // Con contorno y sombra el lienzo crece y se amplía el cuadro dibujado, no la caja de selección
    c.generator!.stroke.enabled = true
    c.generator!.shadow.enabled = true
    const grown = generatorSize(c.generator!)
    expect(grown[0]).toBeGreaterThan(w)
    expect(clipGeometry(p.settings, c, media(p, 's1')).bw).toBe(w)
    const m = (buildFrame(p, 0.5).ops[0] as { matrix: number[] }).matrix
    expect(m[0]).toBeCloseTo(grown[0])
    expect(m[3]).toBeCloseTo(grown[1])
  })

  it('el frame incluye una capa con el generador y sobrevive a guardar y abrir', () => {
    const p = project()
    p.clips.push(ops.makeClip(p, media(p, 't1'), 'v1', 0, 'c1'))
    const frame = buildFrame(p, 0.5)
    expect(frame.ops).toHaveLength(1)
    expect((frame.ops[0] as { generator?: { type: string } }).generator?.type).toBe('text')
    const again = parseProject(JSON.parse(JSON.stringify(p)))
    expect(again.clips[0]?.generator).toEqual(p.clips[0]?.generator)
  })

  it('dividir un clip de texto conserva el contenido en ambas partes', () => {
    const p = project()
    p.clips.push(ops.makeClip(p, media(p, 't1'), 'v1', 0, 'c1'))
    let n = 0
    const right = ops.splitClip(p, 'c1', 0.5, (x) => `${x}${++n}`)
    const clips = p.clips
    expect(right).not.toBeNull()
    expect(clips).toHaveLength(2)
    expect(clips[0]?.generator).toEqual(clips[1]?.generator)
  })
})
