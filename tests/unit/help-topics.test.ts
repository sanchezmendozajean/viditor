import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { apiHelpPages, apiHelpPath, HELP_TOPICS } from '../../src/shared/help-topics'

const DOCS = join(__dirname, '../../docs')
/** Una ruta de la documentación existe si hay un .md (o index.md) que la sirva. */
const pageExists = (path: string): boolean => {
  const clean = path.split('#')[0] as string
  if (clean.endsWith('/')) return existsSync(join(DOCS, clean, 'index.md'))
  return existsSync(join(DOCS, `${clean}.md`))
}

describe('mapa de ayuda contextual (specs/09)', () => {
  it('cada tema apunta a una página que existe en la fuente de la documentación', () => {
    for (const [topic, path] of Object.entries(HELP_TOPICS)) expect(pageExists(path), `${topic} → ${path}`).toBe(true)
  })

  it('los símbolos de la API se resuelven a su página de referencia con ancla', () => {
    expect(apiHelpPath('splitGrid')).toBe('/api/interfaces/Layer#splitgrid')
    expect(apiHelpPath('alpha')).toBe('/api/interfaces/Transformable#alpha')
    expect(apiHelpPath('mask')).toBe('/api/interfaces/Filterable#mask')
    expect(apiHelpPath('stagger')).toBe('/api/interfaces/MathUtils#stagger')
    expect(apiHelpPath('inOutCubic')).toBe('/api/type-aliases/EasingName')
    expect(apiHelpPath('screen')).toBe('/api/variables/screen')
    expect(apiHelpPath('log')).toBe('/api/functions/log')
    expect(apiHelpPath('algoDesconocido')).toBe('/api/')
  })

  // La referencia la genera TypeDoc (npm run docs:api); si aún no se generó, esta comprobación se omite
  const generated = existsSync(join(DOCS, 'api', 'interfaces', 'Layer.md'))
  it.skipIf(!generated)('las páginas de la referencia a las que apunta F1 existen en la documentación generada', () => {
    for (const page of apiHelpPages()) expect(pageExists(page), page).toBe(true)
  })
})
