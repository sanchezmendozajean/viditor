import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import ts from 'typescript'

const FILE = join(__dirname, '../../specs/transiciones/viditor-transitions.d.ts')
const sf = ts.createSourceFile(FILE, readFileSync(FILE, 'utf8'), ts.ScriptTarget.ES2022, true)

interface Missing {
  name: string
  problem: string
}

function check(node: ts.Node, name: string, out: Missing[]): void {
  const docs = (node as ts.Node & { jsDoc?: ts.JSDoc[] }).jsDoc ?? []
  const doc = docs.at(-1)
  if (!doc) return void out.push({ name, problem: 'sin JSDoc' })
  const text = ts.getTextOfJSDocComment(doc.comment) ?? ''
  if (text.trim().length < 5) out.push({ name, problem: 'sin descripción' })
  if (/(the|and|returns?|with|of|is|are|to|this)/i.test(text)) out.push({ name, problem: 'la descripción parece estar en inglés' })
  const tags = doc.tags ?? []
  if (!tags.some((t) => t.tagName.text === 'example')) out.push({ name, problem: 'sin @example' })
  // Métodos: cada parámetro necesita su @param
  if (ts.isMethodSignature(node) || ts.isFunctionDeclaration(node)) {
    for (const p of node.parameters) {
      const pname = (p.name as ts.Identifier).text
      if (!tags.some((t) => ts.isJSDocParameterTag(t) && t.name.getText() === pname)) out.push({ name, problem: `falta @param ${pname}` })
    }
  }
}

function collect(): { members: string[]; missing: Missing[] } {
  const missing: Missing[] = []
  const members: string[] = []
  for (const st of sf.statements) {
    if (ts.isInterfaceDeclaration(st)) {
      check(st, st.name.text, missing)
      members.push(st.name.text)
      for (const m of st.members) {
        const label = `${st.name.text}.${(m.name as ts.Identifier | undefined)?.text ?? '?'}`
        members.push(label)
        check(m, label, missing)
      }
    } else if (ts.isTypeAliasDeclaration(st)) {
      members.push(st.name.text)
      check(st, st.name.text, missing)
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        members.push((d.name as ts.Identifier).text)
        check(st, (d.name as ts.Identifier).text, missing)
      }
    } else if (ts.isFunctionDeclaration(st) && st.name) {
      members.push(st.name.text)
      check(st, st.name.text, missing)
    }
  }
  return { members, missing }
}

describe('referencia de la API de transiciones (viditor-transitions.d.ts)', () => {
  const { members, missing } = collect()

  it('cubre la API completa (interfaces, métodos, propiedades y globales)', () => {
    for (const expected of ['Layer.splitGrid', 'ClipPart.cx', 'Draw.star', 'MathUtils.stagger', 'TransitionContext.random', 'Transformable.alpha', 'Filterable.mask', 'TransitionMeta.audio', 'screen', 'draw', 'ease', 'math', 'color', 'log']) {
      expect(members, expected).toContain(expected)
    }
    expect(members.length).toBeGreaterThan(100)
  })

  it('todo miembro exportado tiene JSDoc en español con descripción, @param y al menos un @example', () => {
    expect(missing, missing.map((m) => `${m.name}: ${m.problem}`).join('\n')).toEqual([])
  })
})
