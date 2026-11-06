// Genera la referencia de la API (docs/api/) con TypeDoc a partir de viditor-transitions.d.ts.
// El .d.ts es un archivo de globales (sin export) para que Monaco lo vea como ámbito global; TypeDoc necesita un módulo,
// así que se trabaja sobre una copia con `export` delante de cada declaración de nivel superior.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'specs', 'transiciones', 'viditor-transitions.d.ts')
const tmp = join(root, 'node_modules', '.cache', 'viditor-api')
const out = join(root, 'docs', 'api')

mkdirSync(tmp, { recursive: true })
const text = readFileSync(src, 'utf8').replace(/^(declare|interface|type)\b/gm, 'export $1')
writeFileSync(join(tmp, 'api.d.ts'), text)
writeFileSync(
  join(tmp, 'tsconfig.json'),
  JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, skipLibCheck: true, lib: ['ES2022'] }, include: ['api.d.ts'] })
)
rmSync(out, { recursive: true, force: true })
const typedoc = join(root, 'node_modules', 'typedoc', 'bin', 'typedoc')
execFileSync(
  process.execPath,
  [
    typedoc,
    '--entryPoints', join(tmp, 'api.d.ts').replaceAll(String.fromCharCode(92), '/'),
    '--tsconfig', join(tmp, 'tsconfig.json'),
    '--out', out,
    '--plugin', 'typedoc-plugin-markdown',
    '--entryFileName', 'index',
    '--readme', 'none',
    '--hideBreadcrumbs', 'true',
    '--hidePageHeader', 'true',
    '--disableSources', 'true',
    '--excludeNotDocumented', 'false',
    '--name', 'Referencia de la API de transiciones'
  ],
  { stdio: 'inherit' }
)
console.log('Referencia generada en docs/api/')
