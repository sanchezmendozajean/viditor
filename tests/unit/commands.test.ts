import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { COMMANDS, buildKeymap, conflictsFor, effectiveKeys } from '../../src/shared/commands-meta'
import { comboFromEvent, formatCombo, normalizeCombo } from '../../src/shared/keys'
import { prefsSchema } from '../../src/shared/prefs-schema'
import { shortcutsMarkdown } from '../../src/shared/shortcuts-doc'

const ev = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods
})

describe('combinaciones de teclas', () => {
  it('construye la forma canónica desde el evento', () => {
    expect(comboFromEvent(ev('k', { ctrlKey: true }))).toBe('Ctrl+K')
    expect(comboFromEvent(ev('Z', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+Z')
    expect(comboFromEvent(ev(' '))).toBe('Space')
    expect(comboFromEvent(ev('ArrowLeft', { shiftKey: true }))).toBe('Shift+ArrowLeft')
    expect(comboFromEvent(ev('k', { metaKey: true }))).toBe('Ctrl+K')
    // Los símbolos ignoran Mayús (ya va en el carácter): «+» es la misma tecla con o sin Mayús
    expect(comboFromEvent(ev('+', { shiftKey: true }))).toBe('+')
    expect(comboFromEvent(ev('Shift', { shiftKey: true }))).toBeNull()
    expect(comboFromEvent(ev('Control', { ctrlKey: true }))).toBeNull()
  })

  it('normaliza combinaciones escritas a mano', () => {
    expect(normalizeCombo('ctrl+shift+z')).toBe('Ctrl+Shift+Z')
    expect(normalizeCombo('Mayús+e')).toBe('Shift+E')
    expect(normalizeCombo('Ctrl++')).toBe('Ctrl++')
    expect(normalizeCombo('Ctrl+')).toBeNull()
    expect(normalizeCombo('')).toBeNull()
  })

  it('formatea en español', () => {
    expect(formatCombo('Ctrl+Shift+Z')).toBe('Ctrl+Mayús+Z')
    expect(formatCombo('Delete')).toBe('Supr')
    expect(formatCombo('ArrowLeft')).toBe('←')
    expect(formatCombo('Space')).toBe('Espacio')
  })
})

describe('catálogo de comandos', () => {
  it('los ids son únicos', () => {
    expect(new Set(COMMANDS.map((c) => c.id)).size).toBe(COMMANDS.length)
  })

  it('los atajos por defecto no se repiten entre comandos y están en forma canónica', () => {
    const seen = new Map<string, string>()
    for (const c of COMMANDS) {
      for (const k of c.keys ?? []) {
        expect(normalizeCombo(k), `${c.id}: ${k}`).toBe(k)
        expect(seen.has(k), `«${k}» repetido en ${c.id} y ${seen.get(k)}`).toBe(false)
        seen.set(k, c.id)
      }
    }
  })

  it('mantiene los atajos de la guía original (specs/04)', () => {
    const map = buildKeymap({})
    expect(map.get('Space')).toBe('play.toggle')
    expect(map.get('Ctrl+K')).toBe('clip.split')
    expect(map.get('Ctrl+Y')).toBe('edit.redo')
    expect(map.get('Shift+Delete')).toBe('edit.deleteRipple')
    expect(map.get('=')).toBe('zoom.in')
    expect(map.get('Ctrl+Shift+E')).toBe('export.frame')
    expect(map.get('Ctrl+Shift+P')).toBe('app.palette')
  })

  it('las personalizaciones sustituyen a las de fábrica y permiten quitar el atajo', () => {
    const map = buildKeymap({ 'clip.split': ['Ctrl+B'], 'marker.add': [] })
    expect(map.get('Ctrl+B')).toBe('clip.split')
    expect(map.has('Ctrl+K')).toBe(false)
    expect([...map.values()]).not.toContain('marker.add')
    const split = COMMANDS.find((c) => c.id === 'clip.split')!
    expect(effectiveKeys(split, { 'clip.split': ['Ctrl+B'] })).toEqual(['Ctrl+B'])
  })

  it('detecta los conflictos al reasignar', () => {
    expect(conflictsFor('Ctrl+K', 'marker.add', {}).map((c) => c.id)).toEqual(['clip.split'])
    expect(conflictsFor('Ctrl+K', 'clip.split', {})).toEqual([])
  })

  it('docs/guia/atajos.md está generado desde el catálogo (UPDATE_DOCS=1 lo regenera)', () => {
    const file = new URL('../../docs/guia/atajos.md', import.meta.url)
    const expected = shortcutsMarkdown()
    if (process.env.UPDATE_DOCS === '1') writeFileSync(file, expected, 'utf8')
    expect(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).toBe(expected)
  })
})

describe('preferencias', () => {
  it('aplica valores por defecto y rechaza escalas fuera de rango', () => {
    expect(prefsSchema.parse({})).toEqual({ uiScale: 100, shortcuts: {}, transitionsDir: null })
    expect(prefsSchema.safeParse({ uiScale: 200 }).success).toBe(false)
    expect(prefsSchema.safeParse({ uiScale: 89 }).success).toBe(false)
    expect(prefsSchema.safeParse({ shortcuts: { 'clip.split': ['a', 'b', 'c', 'd', 'e'] } }).success).toBe(false)
  })
})
