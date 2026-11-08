import { describe, expect, it } from 'vitest'
import { parseProject } from '../../src/shared/migrations'
import type { Project } from '../../src/shared/project-schema'
import * as ops from '../../src/shared/timeline-ops'
import * as rm from '../../src/shared/render-model'

function setup(): Project {
  const p = parseProject({
    formatVersion: 1,
    app: 'viditor',
    name: 't',
    settings: { width: 1920, height: 1080, fps: { num: 30, den: 1 } },
    media: [{ id: 'm1', path: 'a.png', storage: 'project', kind: 'image' }],
    tracks: [{ id: 'v1', kind: 'video', name: 'V1' }]
  })
  const m = p.media[0]!
  p.clips.push(ops.makeClip(p, m, 'v1', 0, 'a')) // 0–5
  p.clips.push(ops.makeClip(p, m, 'v1', 8, 'b')) // 8–13
  return p
}

describe('Línea de tiempo del clip', () => {
  it('el ingreso no puede ser menor al final del clip anterior ni pisar al siguiente', () => {
    const p = setup()
    expect(ops.setClipStart(p, 'a', 20)).toBe(3) // 8 - 5
    expect(ops.setClipStart(p, 'b', 2)).toBe(8) // 'a' termina en 8
  })
  it('salida y duración recortan el final', () => {
    const p = setup()
    expect(ops.setClipEnd(p, 'a', 3)).toBeCloseTo(3)
    expect(ops.clipDuration(p.clips[0]!)).toBeCloseTo(3)
    expect(ops.setClipDuration(p, 'a', 2)).toBeCloseTo(2)
    expect(ops.setClipEnd(p, 'a', 100)).toBeCloseTo(8) // limitado por el siguiente clip
  })
  it('desvanecimiento: por defecto no actúa y es independiente de la opacidad', () => {
    const p = setup()
    const c = p.clips[0]!
    expect(c.fade).toEqual({ in: 0, out: 0 })
    expect(rm.clipFadeAt(c, 0)).toBe(1)
    ops.setClipFade(p, 'a', 'in', 2)
    ops.setClipFade(p, 'a', 'out', 1)
    expect(rm.clipFadeAt(c, 0)).toBe(0)
    expect(rm.clipFadeAt(c, 1)).toBeCloseTo(0.5)
    expect(rm.clipFadeAt(c, 3)).toBe(1)
    expect(rm.clipFadeAt(c, 4.5)).toBeCloseTo(0.5)
    c.transform.opacity = 0.5
    const op = rm.buildFrame(p, 1).ops[0] as rm.DrawOp
    expect(op.opacity).toBeCloseTo(0.25)
  })
})
