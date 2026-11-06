import { describe, expect, it } from 'vitest'
import { parseProject } from '../../src/shared/migrations'
import type { Clip, Project } from '../../src/shared/project-schema'
import * as ops from '../../src/shared/timeline-ops'
import * as rm from '../../src/shared/render-model'
import * as tm from '../../src/shared/transition-model'

let n = 0
const newId: ops.IdGen = (p) => `${p}${++n}`

function project(): Project {
  return parseProject({
    formatVersion: 1,
    app: 'viditor',
    name: 't',
    settings: { width: 1920, height: 1080, fps: { num: 30, den: 1 } },
    media: [{ id: 'm1', path: 'a.mp4', storage: 'project', kind: 'video', probe: { duration: 10, width: 1920, height: 1080, hasAudio: true } }],
    tracks: [{ id: 'v1', kind: 'video', name: 'V1' }, { id: 'a1', kind: 'audio', name: 'A1' }]
  })
}
/** Tres clips de 10 s contiguos: a [0,10], b [10,20], c [20,30] */
function three(): { p: Project; a: Clip; b: Clip; c: Clip } {
  const p = project()
  const mk = (id: string, start: number): Clip => {
    const c = ops.makeClip(p, p.media[0]!, 'v1', start, id)
    p.clips.push(c)
    return c
  }
  return { p, a: mk('a', 0), b: mk('b', 10), c: mk('c', 20) }
}
const starts = (p: Project): number[] => ops.trackClips(p, 'v1').map((c) => +c.start.toFixed(3))
const apply = (p: Project, leave: string | null, enter: string | null, d = 1): ops.ApplyResult =>
  ops.applyTransition(p, { trackId: 'v1', leaveId: leave, enterId: enter, ref: 'builtin:crossfade', duration: d }, newId)

describe('aplicar y quitar transiciones (solapamiento)', () => {
  it('B y todo lo posterior se desplazan d a la izquierda; la duración total baja d', () => {
    const { p } = three()
    const r = apply(p, 'a', 'b', 1)
    expect(r).toMatchObject({ ok: true, duration: 1, clamped: false })
    expect(starts(p)).toEqual([0, 9, 19])
    expect(ops.sequenceDuration(p)).toBe(29)
    expect(tm.transitionRange(p, p.transitions[0]!)).toEqual({ start: 9, end: 10 })
  })

  it('quitarla devuelve B y lo posterior a su sitio', () => {
    const { p } = three()
    const r = apply(p, 'a', 'b', 1) as { id: string }
    ops.removeTransition(p, r.id)
    expect(starts(p)).toEqual([0, 10, 20])
    expect(p.transitions).toHaveLength(0)
  })

  it('cambiar la duración mueve B y lo posterior; se limita por los clips', () => {
    const { p } = three()
    const r = apply(p, 'a', 'b', 1) as { id: string }
    expect(ops.setTransitionDuration(p, r.id, 2)).toBe(2)
    expect(starts(p)).toEqual([0, 8, 18])
    expect(ops.setTransitionDuration(p, r.id, 50)).toBeLessThan(10)
    expect(ops.setTransitionDuration(p, r.id, 0.5)).toBeCloseTo(0.5)
  })

  it('la duración pedida se limita a la del clip más corto y avisa', () => {
    const { p, a, b } = three()
    a.out = 0.5
    b.start = 0.5 // sigue contiguo
    const r = apply(p, 'a', 'b', 5)
    expect(r).toMatchObject({ ok: true, clamped: true })
    expect((r as { duration: number }).duration).toBeLessThan(0.5)
  })

  it('exige clips contiguos y rechaza una unión que ya tiene transición', () => {
    const { p, c } = three()
    c.start = 25 // hueco
    expect(apply(p, 'b', 'c').ok).toBe(false)
    expect(apply(p, 'a', 'b').ok).toBe(true)
    expect(apply(p, 'a', 'b')).toMatchObject({ ok: false })
  })

  it('fundido desde/hacia nada: un solo extremo, sin desplazar nada', () => {
    const { p } = three()
    expect(apply(p, null, 'a', 1).ok).toBe(true)
    expect(apply(p, 'c', null, 2).ok).toBe(true)
    expect(starts(p)).toEqual([0, 10, 20])
    const [tin, tout] = p.transitions
    expect(tm.transitionRange(p, tin!)).toEqual({ start: 0, end: 1 })
    expect(tm.transitionRange(p, tout!)).toEqual({ start: 28, end: 30 })
  })

  it('uniones libres', () => {
    const { p } = three()
    expect(ops.junctions(p, 'v1').map((j) => [j.leaveId, j.enterId])).toEqual([['a', 'b'], ['b', 'c']])
    apply(p, 'a', 'b')
    expect(ops.junctions(p, 'v1').map((j) => [j.leaveId, j.enterId])).toEqual([['b', 'c']])
  })
})

describe('ediciones con transiciones', () => {
  it('no se puede recortar el borde que forma parte de la transición, pero sí el contrario', () => {
    const { p } = three()
    apply(p, 'a', 'b', 1)
    expect(ops.trimClip(p, 'a', 'end', 5)).toBeNull()
    expect(ops.trimClip(p, 'b', 'start', 12)).toBeNull()
    expect(ops.trimClip(p, 'a', 'start', 2)).toBe(2)
    // B no puede quedar más corto que su solape
    expect(ops.trimClip(p, 'b', 'end', 9.2)).toBeGreaterThan(9)
  })

  it('no se divide dentro del solape, pero sí fuera (la transición sigue a su clip)', () => {
    const { p } = three()
    apply(p, 'a', 'b', 1) // solape [9, 10]
    expect(ops.splitClip(p, 'a', 9.5, newId)).toBeNull()
    const right = ops.splitClip(p, 'a', 4, newId)!
    expect(p.transitions[0]!.leaveClipId).toBe(right) // el fragmento derecho conserva la transición
    expect(ops.splitClip(p, 'b', 15, newId)).not.toBeNull()
    expect(p.transitions[0]!.enterClipId).toBe('b')
  })

  it('eliminar un clip con ripple descuenta el solape y quita sus transiciones', () => {
    const { p } = three()
    apply(p, 'a', 'b', 1) // a [0,10], b [9,19], c [19,29]
    ops.deleteClips(p, ['b'], true)
    expect(p.transitions).toHaveLength(0)
    expect(starts(p)).toEqual([0, 10]) // c pasa de 19 a 10: cierra los 9 s exclusivos de b
  })

  it('mover un clip de la transición la elimina; normalizar descarta las incoherentes', () => {
    const { p } = three()
    apply(p, 'a', 'b', 1)
    ops.moveClips(p, [{ id: 'b', start: 40, trackId: 'v1' }], 'overwrite', newId)
    expect(p.transitions).toHaveLength(0)

    const q = three().p
    apply(q, 'a', 'b', 1)
    q.clips.find((c) => c.id === 'b')!.start = 30 // ya no se solapa con a
    ops.normalizeTransitions(q)
    expect(q.transitions).toHaveLength(0)
  })
})

describe('buildFrame con transiciones y audio', () => {
  it('dentro del solape una sola TransitionOp sustituye a las dos capas, con progreso cuantizado al frame', () => {
    const { p } = three()
    apply(p, 'a', 'b', 1) // [9, 10]
    const before = rm.buildFrame(p, 8.9)
    expect(before.ops.map((o) => o.kind)).toEqual(['video'])
    const mid = rm.buildFrame(p, 9.5)
    expect(mid.ops).toHaveLength(1)
    const op = mid.ops[0] as rm.TransitionOp
    expect(op.kind).toBe('transition')
    expect(op.leave!.clipId).toBe('a')
    expect(op.enter!.clipId).toBe('b')
    expect(op.totalFrames).toBe(30)
    expect(op.frame).toBe(15)
    expect(op.progress).toBeCloseTo(15 / 29)
    // El primer frame es progress 0 y el último 1
    expect((rm.buildFrame(p, 9) .ops[0] as rm.TransitionOp).progress).toBe(0)
    expect((rm.buildFrame(p, 10 - 1 / 30).ops[0] as rm.TransitionOp).progress).toBe(1)
    // Pasado el solape vuelve a ser un clip normal
    expect(rm.buildFrame(p, 10.5).ops.map((o) => o.kind)).toEqual(['video'])
  })

  it('el mismo frame da el mismo resultado hacia delante y hacia atrás', () => {
    const { p } = three()
    apply(p, 'a', 'b', 1)
    const fwd = [9.2, 9.5, 9.8].map((t) => JSON.stringify(rm.buildFrame(p, t)))
    const back = [9.8, 9.5, 9.2].map((t) => JSON.stringify(rm.buildFrame(p, t))).reverse()
    expect(fwd).toEqual(back)
  })

  it('transición desde nada: solo capa entrante, hasLeave implícito', () => {
    const { p } = three()
    apply(p, null, 'a', 1)
    const op = rm.buildFrame(p, 0.5).ops[0] as rm.TransitionOp
    expect(op.leave).toBeNull()
    expect(op.enter!.clipId).toBe('a')
  })

  it('audio: crossfade de potencia constante, corte en el punto medio y ninguno', () => {
    const { p } = three()
    const r = apply(p, 'a', 'b', 2) as { id: string } // [8, 10]
    const modeOf = (): 'crossfade' => 'crossfade'
    const g = (id: string, t: number): number => tm.transitionAudioFactor(p, id, t, modeOf)
    expect(g('a', 7)).toBe(1)
    expect(g('a', 8)).toBeCloseTo(1)
    expect(g('b', 8)).toBeCloseTo(0)
    expect(g('a', 9)).toBeCloseTo(Math.SQRT1_2)
    expect(g('b', 9)).toBeCloseTo(Math.SQRT1_2)
    expect(g('a', 9) ** 2 + g('b', 9) ** 2).toBeCloseTo(1) // potencia constante
    p.transitions.find((t) => t.id === r.id)!.audio = 'cut'
    expect([g('a', 8.5), g('b', 8.5), g('a', 9.5), g('b', 9.5)]).toEqual([1, 0, 0, 1])
    p.transitions.find((t) => t.id === r.id)!.audio = 'none'
    expect([g('a', 9), g('b', 9)]).toEqual([1, 1])
  })

  it('el modo de audio de la transición sobrescribe al de meta.audio', () => {
    const { p } = three()
    apply(p, 'a', 'b', 2)
    expect(tm.transitionAudioFactor(p, 'a', 9.5, () => 'none')).toBe(1)
    p.transitions[0]!.audio = 'cut'
    expect(tm.transitionAudioFactor(p, 'a', 9.5, () => 'none')).toBe(0)
  })
})
