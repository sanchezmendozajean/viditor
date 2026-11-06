import { readdirSync, readFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TransitionInstance } from '../../src/transition-runtime/runtime'
import type { LayerItem } from '../../src/shared/display-list'

const DIR = join(__dirname, '../../resources/transitions')
const files = readdirSync(DIR).filter((f) => f.endsWith('.js'))
const EXPECTED = ['crossfade', 'dip-to-black', 'dip-to-white', 'slide-horizontal', 'push', 'wipe', 'iris-circle', 'grid-shrink', 'blinds', 'zoom-in', 'spin', 'pixel-dissolve']

describe('transiciones integradas (v1)', () => {
  it('están las 12 de la especificación', () => {
    expect(files.map((f) => basename(f, '.js')).sort()).toEqual([...EXPECTED].sort())
  })

  for (const file of files) {
    it(`${file}: meta válido, id = nombre de archivo, render determinista en todo el rango`, () => {
      const src = readFileSync(join(DIR, file), 'utf8')
      const t = new TransitionInstance(src, { width: 1920, height: 1080, fps: 30, duration: 1 })
      t.init()
      expect(t.meta.id).toBe(basename(file, '.js'))
      expect(t.meta.name).toBeTruthy()
      expect(t.meta.category).toBeTruthy()
      for (let i = 0; i <= 20; i++) {
        const p = i / 20
        const dl = t.render(p, i, 21)
        expect(dl.items.length).toBeGreaterThan(0)
        for (const it of dl.items) {
          const m = it.matrix
          expect(m.every((v) => Number.isFinite(v))).toBe(true)
          expect(it.opacity).toBeGreaterThanOrEqual(0)
          expect(it.opacity).toBeLessThanOrEqual(1)
        }
        expect(t.render(p, i, 21)).toEqual(dl) // mismo frame ⇒ mismo resultado
      }
    })
  }

  it('el entrante termina visible y el saliente desaparece al final (sin saltos)', () => {
    for (const file of files) {
      const t = new TransitionInstance(readFileSync(join(DIR, file), 'utf8'), { width: 1920, height: 1080, fps: 30, duration: 1 })
      t.init()
      const last = t.render(1).items.filter((i): i is LayerItem => i.kind === 'layer')
      const enter = last.filter((i) => i.source === 'enter')
      const leave = last.filter((i) => i.source === 'leave')
      expect(enter.length, file).toBeGreaterThan(0)
      const hidden = (i: LayerItem): boolean => i.opacity < 0.01 || Math.abs(i.matrix[0]) < 0.01 || Math.abs(i.matrix[3]) < 0.01 || Math.abs(i.matrix[4]) >= 1900 || Math.abs(i.matrix[5]) >= 1070 // o fuera de pantalla
      // Con progress = 1 el saliente es invisible (o no se dibuja), salvo cuando el entrante lo cubre con una máscara
      // O el entrante, opaco y en su sitio, se dibuja encima del saliente (o lo cubre con una máscara)
      const lastLeave = Math.max(-1, ...leave.map((i) => last.indexOf(i)))
      const masked = enter.some((i) => i.mask !== undefined || (i.opacity > 0.99 && Math.abs(i.matrix[0] - 1) < 1e-6 && Math.abs(i.matrix[4]) < 1e-6 && last.indexOf(i) > lastLeave))
      expect(leave.every(hidden) || masked, `${file}: el saliente sigue visible al final`).toBe(true)
    }
  })

  it('la transición entre dos clips con un solo extremo no falla', () => {
    for (const file of files) {
      for (const flags of [{ hasLeave: false }, { hasEnter: false }]) {
        const t = new TransitionInstance(readFileSync(join(DIR, file), 'utf8'), { width: 640, height: 360, fps: 30, duration: 1, ...flags })
        t.init()
        expect(() => t.render(0.5)).not.toThrow()
      }
    }
  })
})
