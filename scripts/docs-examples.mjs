// Genera docs/ejemplos/<id>.md (una página por transición integrada) y docs/ejemplos/index.md.
// El código no se duplica: cada página lo incluye con la directiva <<< de VitePress desde resources/transitions/,
// así el ejemplo documentado es exactamente el que trae la aplicación.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'resources', 'transitions')
const out = join(root, 'docs', 'ejemplos')
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

const ORDER = ['Fundidos', 'Deslizar', 'Barridos', 'Formas', 'Geométricas']
const items = []
for (const file of readdirSync(src).filter((f) => f.endsWith('.js')).sort()) {
  const id = file.slice(0, -3)
  const code = readFileSync(join(src, file), 'utf8')
  // meta es una constante literal que no usa la API: se evalúa sin globales
  const meta = new Function(`${code}\n;return meta;`)()
  items.push({ id, meta })
  const params = Object.entries(meta.params ?? {})
  const table = params.length
    ? `## Parámetros\n\n| Parámetro | Tipo | Valor por defecto |\n|-----------|------|-------------------|\n${params
        .map(([k, d]) => `| ${d.label ?? k} (\`${k}\`) | \`${d.type}\` | \`${JSON.stringify(d.default)}\` |`)
        .join('\n')}\n\n`
    : ''
  writeFileSync(
    join(out, `${id}.md`),
    `# ${meta.name}

${meta.description ?? ''}

- **Categoría:** ${meta.category ?? 'Personalizadas'}
- **Duración por defecto:** ${meta.defaultDuration ?? 1} s
- **Audio:** ${meta.audio ?? 'crossfade'}
- **Referencia:** \`builtin:${id}\`

${table}## Código

<<< @/../resources/transitions/${file}

::: tip Úsala como punto de partida
En la aplicación: clic derecho sobre la transición › **Duplicar para editar**. Se copia a tu carpeta y se abre en el editor.
:::
`
  )
}

items.sort((a, b) => ORDER.indexOf(a.meta.category) - ORDER.indexOf(b.meta.category) || a.meta.name.localeCompare(b.meta.name))
writeFileSync(
  join(out, 'index.md'),
  `# Ejemplos

Una página por cada transición integrada, con su código completo. Todas están escritas con la API pública, sin código nativo especial: sirven de documentación viva.

${items.map((i) => `- [${i.meta.name}](./${i.id}) — ${i.meta.category ?? 'Personalizadas'}`).join('\n')}
`
)
writeFileSync(join(out, 'sidebar.json'), JSON.stringify(items.map((i) => ({ text: i.meta.name, link: `/ejemplos/${i.id}` })), null, 2))
console.log(`Generadas ${items.length} páginas en docs/ejemplos/`)
