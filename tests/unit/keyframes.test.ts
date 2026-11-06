import { describe, expect, it } from 'vitest'
import { parseProject } from '../../src/shared/migrations'
import type { Clip, Project } from '../../src/shared/project-schema'
import { makeClip } from '../../src/shared/timeline-ops'
import {
  clearKeys,
  editAnimated,
  evalKeys,
  isAnimated,
  keyTimes,
  removeKey,
  resolveClip,
  sourceTimeAt,
  timelineTimeOf,
  upsertKey,
  valueAt
} from '../../src/shared/keyframes'
import { buildFrame, clipGainAt, drawOps } from '../../src/shared/render-model'

function setup(): { p: Project; c: Clip } {
  const p = parseProject({
    formatVersion: 1,
    app: 'viditor',
    name: 'Demo',
    settings: { width: 1920, height: 1080, fps: { num: 30, den: 1 } },
    media: [{ id: 'm1', path: 'a.mp4', storage: 'project', kind: 'video', probe: { duration: 10, width: 1920, height: 1080, hasAudio: true } }],
    tracks: [{ id: 'v1', kind: 'video', name: 'V1' }]
  })
  const c = makeClip(p, p.media[0]!, 'v1', 2, 'c1')
  p.clips.push(c)
  return { p, c }
}

describe('fotogramas clave (specs/04)', () => {
  it('interpola linealmente, mantiene los extremos y respeta hold/smooth', () => {
    const keys = [
      { t: 0, v: 0, ease: 'linear' as const },
      { t: 2, v: 100, ease: 'hold' as const },
      { t: 4, v: 200, ease: 'smooth' as const },
      { t: 6, v: 300, ease: 'linear' as const }
    ]
    expect(evalKeys(keys, -1)).toBe(0)
    expect(evalKeys(keys, 1)).toBe(50)
    expect(evalKeys(keys, 3)).toBe(100) // hold
    expect(evalKeys(keys, 5)).toBe(250) // smoothstep(0.5) = 0.5
    expect(evalKeys(keys, 4.5)).toBeLessThan(225) // smooth arranca lento
    expect(evalKeys(keys, 99)).toBe(300)
  })

  it('los fotogramas se guardan en tiempo de fuente: recortar la cabeza no desplaza la animación', () => {
    const { c } = setup()
    upsertKey(c, 'opacity', 1, 0)
    upsertKey(c, 'opacity', 3, 1)
    expect(valueAt(c, 'opacity', c.start + 2)).toBeCloseTo(0.5) // in=0: fuente 2 s, mitad del tramo 1→3
    // Recortar 1 s del inicio: el contenido de la fuente 1 s pasa a estar en el nuevo inicio
    c.in = 1
    c.start += 1
    expect(valueAt(c, 'opacity', c.start)).toBeCloseTo(0)
    expect(valueAt(c, 'opacity', c.start + 2)).toBeCloseTo(1)
    expect(timelineTimeOf(c, 3)).toBeCloseTo(c.start + 2)
    expect(sourceTimeAt(c, c.start - 5)).toBe(c.in) // acotado al clip
  })

  it('upsert reemplaza el fotograma del mismo instante y mantiene el orden', () => {
    const { c } = setup()
    upsertKey(c, 'x', 2, 20)
    upsertKey(c, 'x', 1, 10)
    upsertKey(c, 'x', 2, 25)
    expect(c.keyframes.x).toEqual([
      { t: 1, v: 10, ease: 'linear' },
      { t: 2, v: 25, ease: 'linear' }
    ])
  })

  it('quitar el último fotograma deja la propiedad estática con su valor', () => {
    const { c } = setup()
    upsertKey(c, 'x', 1, 40)
    removeKey(c, 'x', 1)
    expect(isAnimated(c, 'x')).toBe(false)
    expect(c.transform.x).toBe(40)
    upsertKey(c, 'y', 1, 5)
    upsertKey(c, 'y', 2, 9)
    clearKeys(c, ['y'], 2)
    expect(c.transform.y).toBe(9)
    expect(c.keyframes.y).toBeUndefined()
  })

  it('editAnimated guarda como fotograma lo que cambia en una propiedad animada y el resto como estático', () => {
    const { c } = setup()
    upsertKey(c, 'x', 0, 0)
    upsertKey(c, 'x', 4, 400)
    editAnimated(c, c.start + 2, (cc) => {
      cc.transform.x = 123
      cc.transform.y = 7
    })
    expect(c.keyframes.x?.some((k) => k.t === 2 && k.v === 123)).toBe(true)
    expect(c.transform.y).toBe(7)
    expect(isAnimated(c, 'y')).toBe(false)
    // Sin cambio no se crea fotograma nuevo
    const n = c.keyframes.x!.length
    editAnimated(c, c.start + 1, () => undefined)
    expect(c.keyframes.x!.length).toBe(n)
  })

  it('el frame de vídeo usa los valores animados (misma función para vista previa y exportación)', () => {
    const { p, c } = setup()
    upsertKey(c, 'opacity', 0, 0)
    upsertKey(c, 'opacity', 4, 1)
    upsertKey(c, 'x', 0, 0)
    upsertKey(c, 'x', 4, 400)
    const at = (t: number) => drawOps(buildFrame(p, t))[0]!
    expect(at(c.start).opacity).toBeCloseTo(0)
    expect(at(c.start + 2).opacity).toBeCloseTo(0.5)
    const m0 = at(c.start).matrix
    const m2 = at(c.start + 2).matrix
    expect(m2[4] - m0[4]).toBeCloseTo(200)
    // El clip original no se modifica
    expect(c.transform.opacity).toBe(1)
    expect(resolveClip(c, c.start + 2).transform.opacity).toBeCloseTo(0.5)
  })

  it('el volumen animado entra en la ganancia del clip', () => {
    const { c } = setup()
    upsertKey(c, 'volume', 0, 1)
    upsertKey(c, 'volume', 4, 0)
    expect(clipGainAt(c, c.start)).toBeCloseTo(1)
    expect(clipGainAt(c, c.start + 2)).toBeCloseTo(0.5)
    expect(clipGainAt(c, c.start + 3)).toBeCloseTo(0.25)
  })

  it('keyTimes devuelve los instantes únicos y ordenados', () => {
    const { c } = setup()
    upsertKey(c, 'x', 3, 1)
    upsertKey(c, 'y', 3, 1)
    upsertKey(c, 'y', 1, 1)
    expect(keyTimes(c)).toEqual([1, 3])
    expect(keyTimes(c, ['x'])).toEqual([3])
  })

  it('un proyecto con keyframes sobrevive al esquema y las animaciones inválidas se rechazan', () => {
    const { p, c } = setup()
    upsertKey(c, 'rotation', 1, 45)
    const again = parseProject(JSON.parse(JSON.stringify(p)))
    expect(again.clips[0]!.keyframes.rotation).toEqual([{ t: 1, v: 45, ease: 'linear' }])
    const bad = JSON.parse(JSON.stringify(p))
    bad.clips[0].keyframes.rotation = [{ t: -1, v: 2 }]
    expect(() => parseProject(bad)).toThrow()
  })
})
