import { describe, expect, it } from 'vitest'
import { parseProject } from '../../src/shared/migrations'
import type { Clip, MediaItem, Project } from '../../src/shared/project-schema'
import { History } from '../../src/shared/history'
import * as ops from '../../src/shared/timeline-ops'

let n = 0
const newId: ops.IdGen = (p) => `${p}${++n}`

function project(): Project {
  return parseProject({
    formatVersion: 1,
    app: 'viditor',
    name: 't',
    settings: { width: 1920, height: 1080, fps: { num: 30, den: 1 } },
    media: [
      { id: 'm1', path: 'media/a.mp4', storage: 'project', kind: 'video', probe: { duration: 10, hasAudio: true } },
      { id: 'm2', path: 'media/b.mp3', storage: 'project', kind: 'audio', probe: { duration: 30, hasAudio: true } },
      { id: 'm3', path: 'media/c.png', storage: 'project', kind: 'image' }
    ],
    tracks: [
      { id: 'v2', kind: 'video', name: 'V2' },
      { id: 'v1', kind: 'video', name: 'V1' },
      { id: 'a1', kind: 'audio', name: 'A1' }
    ]
  })
}
const media = (p: Project, id: string): MediaItem => p.media.find((m) => m.id === id) as MediaItem
function add(p: Project, id: string, start: number, mediaId = 'm1', track = 'v1'): Clip {
  const c = ops.makeClip(p, media(p, mediaId), track, start, id)
  ops.placeClips(p, [c], 'overwrite', newId)
  return c
}
const spans = (p: Project, track = 'v1'): [string, number, number][] =>
  ops.trackClips(p, track).map((c) => [c.id, +c.start.toFixed(3), +ops.clipEnd(c).toFixed(3)])

describe('colocar clips', () => {
  it('makeClip usa la duración del medio; las imágenes duran 5 s', () => {
    const p = project()
    expect(ops.clipDuration(ops.makeClip(p, media(p, 'm1'), 'v1', 0, 'x'))).toBe(10)
    expect(ops.clipDuration(ops.makeClip(p, media(p, 'm3'), 'v1', 0, 'x'))).toBe(5)
  })

  it('sobrescribir recorta el clip anterior y elimina los cubiertos', () => {
    const p = project()
    add(p, 'a', 0)
    add(p, 'b', 5)
    expect(spans(p)).toEqual([['a', 0, 5], ['b', 5, 15]])
    add(p, 'c', 2, 'm1') // cubre 2..12: recorta a por la derecha y b por la izquierda
    expect(spans(p)).toEqual([['a', 0, 2], ['c', 2, 12], ['b', 12, 15]])
    expect(ops.trackClips(p, 'v1')[2]?.in).toBe(7)
  })

  it('sobrescribir dentro de un clip lo divide en dos', () => {
    const p = project()
    add(p, 'a', 0)
    add(p, 'img', 3, 'm3')
    expect(spans(p).map((s) => [s[1], s[2]])).toEqual([[0, 3], [3, 8], [8, 10]])
    expect(ops.trackClips(p, 'v1')[2]?.in).toBe(8)
  })

  it('insertar desplaza lo posterior', () => {
    const p = project()
    add(p, 'a', 0)
    const c = ops.makeClip(p, media(p, 'm3'), 'v1', 4, 'ins')
    ops.placeClips(p, [c], 'insert', newId)
    expect(spans(p).map((s) => [s[1], s[2]])).toEqual([[0, 4], [4, 9], [9, 15]])
  })
})

describe('mover, dividir, recortar', () => {
  it('mover entre pistas y sobrescribir destino', () => {
    const p = project()
    add(p, 'a', 0)
    add(p, 'b', 0, 'm1', 'v2')
    ops.moveClips(p, [{ id: 'b', start: 5, trackId: 'v1' }], 'overwrite', newId)
    expect(spans(p, 'v2')).toEqual([])
    expect(spans(p).map((s) => [s[1], s[2]])).toEqual([[0, 5], [5, 15]])
  })

  it('mover un grupo no se pisa a sí mismo', () => {
    const p = project()
    add(p, 'a', 0, 'm3')
    add(p, 'b', 5, 'm3')
    ops.moveClips(p, [{ id: 'a', start: 1, trackId: 'v1' }, { id: 'b', start: 6, trackId: 'v1' }], 'overwrite', newId)
    expect(spans(p)).toEqual([['a', 1, 6], ['b', 6, 11]])
  })

  it('dividir genera dos clips contiguos con in/out consistentes', () => {
    const p = project()
    add(p, 'a', 0)
    const right = ops.splitClip(p, 'a', 4, newId)
    expect(right).not.toBeNull()
    const [l, r] = ops.trackClips(p, 'v1') as [Clip, Clip]
    expect([l.in, l.out, r.in, r.out]).toEqual([0, 4, 4, 10])
    expect(ops.clipEnd(l)).toBe(r.start)
    expect(ops.splitClip(p, 'a', 0, newId)).toBeNull()
  })

  it('recortar respeta vecinos y duración del medio', () => {
    const p = project()
    add(p, 'a', 0)
    add(p, 'b', 12)
    expect(ops.trimClip(p, 'a', 'end', 99)).toBe(10) // limitado por la duración del medio
    ops.trimClip(p, 'a', 'end', 6)
    expect(ops.clipEnd(ops.trackClips(p, 'v1')[0] as Clip)).toBe(6)
    expect(ops.trimClip(p, 'b', 'start', 0)).toBe(12) // sin material a la izquierda (in = 0)
    const b = p.clips.find((c) => c.id === 'b') as Clip
    b.in = 8 // simula un clip recortado por la izquierda
    b.out = 10
    expect(ops.trimClip(p, 'b', 'start', 0)).toBe(6) // limitado por el final de a
    expect(ops.trimClip(p, 'b', 'end', 6)).toBeCloseTo(6 + 1 / 30) // mínimo un frame
  })

  it('las imágenes se pueden extender sin límite', () => {
    const p = project()
    add(p, 'i', 0, 'm3')
    expect(ops.trimClip(p, 'i', 'end', 60)).toBe(60)
  })
})

describe('eliminar', () => {
  it('con y sin ripple', () => {
    const p = project()
    add(p, 'a', 0)
    add(p, 'b', 10)
    add(p, 'c', 20)
    const q = structuredClone(p)
    ops.deleteClips(p, ['b'], false)
    expect(spans(p)).toEqual([['a', 0, 10], ['c', 20, 30]])
    ops.deleteClips(q, ['b'], true)
    expect(spans(q)).toEqual([['a', 0, 10], ['c', 10, 20]])
  })

  it('eliminar hueco cierra el espacio', () => {
    const p = project()
    add(p, 'a', 0)
    add(p, 'b', 15)
    expect(ops.gapAt(p, 'v1', 12)).toEqual({ start: 10, end: 15 })
    expect(ops.removeGap(p, 'v1', 12)).toBe(true)
    expect(spans(p)).toEqual([['a', 0, 10], ['b', 10, 20]])
    expect(ops.removeGap(p, 'v1', 5)).toBe(false)
  })

  it('Q / W recortan hasta el cabezal con ripple', () => {
    const p = project()
    add(p, 'a', 0)
    add(p, 'b', 10)
    ops.trimToPlayhead(p, ['a'], 'end', 6)
    expect(spans(p)).toEqual([['a', 0, 6], ['b', 6, 16]])
    ops.trimToPlayhead(p, ['a'], 'start', 2)
    expect(spans(p)).toEqual([['a', 0, 4], ['b', 4, 14]])
    expect((ops.trackClips(p, 'v1')[0] as Clip).in).toBe(2)
  })
})

describe('imán', () => {
  it('engancha al punto más cercano dentro del umbral', () => {
    const p = project()
    add(p, 'a', 0)
    const pts = ops.snapPoints(p, new Set(), 3)
    expect(ops.snapTime(9.95, pts, 0.1)).toEqual({ time: 10, snapped: true })
    expect(ops.snapTime(5, pts, 0.1)).toEqual({ time: 5, snapped: false })
    expect(ops.snapTime(3.05, pts, 0.1).time).toBe(3)
  })
})

describe('pistas', () => {
  it('agregar pista mantiene video arriba y audio abajo y nombra con el siguiente número', () => {
    const p = project()
    const t = ops.addTrack(p, 'video', 'v2', 'above', newId)
    expect(t.name).toBe('V3')
    expect(p.tracks.map((x) => x.id)).toEqual([t.id, 'v2', 'v1', 'a1'])
    const a = ops.addTrack(p, 'audio', null, 'above', newId)
    expect(p.tracks.at(-1)?.id).toBe(a.id)
    expect(p.tracks.filter((x) => x.kind === 'video')).toHaveLength(3)
  })

  it('reordenar solo dentro del mismo tipo', () => {
    const p = project()
    ops.moveTrack(p, 'v1', 0)
    expect(p.tracks.map((x) => x.id)).toEqual(['v1', 'v2', 'a1'])
    ops.moveTrack(p, 'a1', 0)
    expect(p.tracks.map((x) => x.id)).toEqual(['v1', 'v2', 'a1'])
  })

  it('eliminar pista elimina sus clips; duplicar copia clips con ids nuevos', () => {
    const p = project()
    add(p, 'a', 0)
    const copy = ops.duplicateTrack(p, 'v1', newId)
    expect(p.clips.filter((c) => c.trackId === copy?.id)).toHaveLength(1)
    ops.deleteTrack(p, 'v1')
    expect(p.clips.every((c) => c.trackId !== 'v1')).toBe(true)
    expect(p.tracks.some((t) => t.id === 'v1')).toBe(false)
  })

  it('compatibilidad medio/pista', () => {
    const p = project()
    expect(ops.mediaFitsTrack(media(p, 'm1'), p.tracks[0] as never)).toBe(true)
    expect(ops.mediaFitsTrack(media(p, 'm2'), p.tracks[0] as never)).toBe(false)
    expect(ops.mediaFitsTrack(media(p, 'm2'), p.tracks[2] as never)).toBe(true)
  })
})

describe('historial', () => {
  it('50 deshacer/rehacer consistentes', () => {
    const p = project()
    const h = new History<string>()
    const states: string[] = [JSON.stringify(p)]
    for (let i = 0; i < 50; i++) {
      const before = JSON.stringify(p)
      add(p, `c${i}`, i * 3, 'm3')
      if (i % 5 === 4) ops.deleteClips(p, [`c${i - 1}`], i % 2 === 0)
      h.push({ label: `op${i}`, before, after: JSON.stringify(p) })
      states.push(JSON.stringify(p))
    }
    for (let i = 49; i >= 0; i--) expect(h.undo()).toBe(states[i])
    expect(h.canUndo).toBe(false)
    for (let i = 1; i <= 50; i++) expect(h.redo()).toBe(states[i])
    expect(h.canRedo).toBe(false)
  })

  it('una acción nueva descarta el rehacer', () => {
    const h = new History<number>()
    h.push({ label: 'a', before: 0, after: 1 })
    h.undo()
    h.push({ label: 'b', before: 0, after: 2 })
    expect(h.canRedo).toBe(false)
  })
})
