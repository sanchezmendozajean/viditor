// Genera resources/licenses/ con los avisos de licencia de fuentes, iconos, FFmpeg y dependencias de producción.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const out = join(root, 'resources', 'licenses')
mkdirSync(out, { recursive: true })

const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})].filter((n) =>
  /^(vue|pinia|zod|ulid|chokidar|lucide-static|@fontsource\/.+|ffmpeg-static|ffprobe-static|electron)$/.test(n)
)

const entries = []
for (const name of names) {
  const dir = join(root, 'node_modules', name)
  if (!existsSync(join(dir, 'package.json'))) continue
  const p = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const file = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license'].map((f) => join(dir, f)).find(existsSync)
  entries.push({ name, version: p.version, license: p.license ?? 'desconocida', text: file ? readFileSync(file, 'utf8') : '' })
}

const md = [
  '# Avisos de licencia de terceros',
  '',
  'Viditor incluye FFmpeg/FFprobe (binarios estáticos, GPL/LGPL según compilación), fuentes Source Sans 3 y JetBrains Mono (SIL OFL 1.1) e iconos Lucide (ISC).',
  '',
  ...entries.flatMap((e) => [`## ${e.name} ${e.version} — ${e.license}`, '', '```', e.text.trim() || '(sin archivo de licencia incluido)', '```', ''])
].join('\n')
writeFileSync(join(out, 'THIRD-PARTY-NOTICES.md'), md)
writeFileSync(join(out, 'licenses.json'), JSON.stringify(entries.map(({ text, ...rest }) => rest), null, 2))
console.log(`Licencias generadas para ${entries.length} paquetes en resources/licenses/`)
