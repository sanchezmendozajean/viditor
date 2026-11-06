import { describe, expect, it } from 'vitest'
import { join, resolve } from 'node:path'
import { planRelink, storedPath } from '../../src/main/services/relink'

const project = resolve('/work/Proyecto')

describe('revincular medios', () => {
  it('guarda ruta relativa con / dentro del proyecto y absoluta fuera', () => {
    expect(storedPath(project, join(project, 'media', 'a.mp4'))).toEqual({ path: 'media/a.mp4', storage: 'project' })
    const outside = storedPath(project, resolve('/otra/carpeta/b.mp4'))
    expect(outside.storage).toBe('external')
    expect(outside.path).not.toContain('\\')
  })

  it('revincula también los demás faltantes que estén en la misma carpeta', () => {
    const folder = resolve('/discoNuevo/videos')
    const have = new Set([join(folder, 'b.mp4'), join(folder, 'c.mov')])
    const out = planRelink(
      project,
      { id: 'a', path: '/viejo/a.mp4' },
      join(folder, 'a.mp4'),
      [
        { id: 'a', path: '/viejo/a.mp4' },
        { id: 'b', path: '/viejo/sub/b.mp4' },
        { id: 'c', path: '/viejo/c.mov' },
        { id: 'd', path: '/viejo/d.mp4' }
      ],
      (p) => have.has(p)
    )
    // «a» es el elegido; «d» no está en la carpeta nueva
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c'])
    expect(out.every((m) => m.storage === 'external')).toBe(true)
  })
})
