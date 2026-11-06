import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app, shell } from 'electron'
import chokidar, { type FSWatcher } from 'chokidar'
import type { TransitionFile, TransitionOrigin } from '@shared/ipc'
import { resourcePath } from './paths'
import { writeAtomic, type ProjectService } from './project-service'

const ID_RE = /^[a-z0-9-]+$/
const MAX_BYTES = 1024 * 1024

export function transitionTemplate(id: string, name: string): string {
  return `// Transición "${name}" — escrita con la API de transiciones de Viditor (apiVersion 1).
// Guarda con Ctrl+S para ver el resultado al instante en la vista previa.

const meta = {
  apiVersion: 1,
  id: "${id}",                 // debe coincidir con el nombre del archivo (sin .js)
  name: "${name}",
  category: "Personalizadas",
  author: "",
  description: "",
  defaultDuration: 1.0,        // segundos
  audio: "crossfade",          // crossfade | cut | none
  params: {
    easing: { type: "easing", label: "Suavizado", default: "inOutCubic" }
  }
};

// Se llama una vez por transición colocada en la línea de tiempo (opcional).
// Aquí se preparan cosas que se reutilizan en cada frame, como las partes de splitGrid().
function init(leaveClip, enterClip, ctx) {
}

// Se llama en cada frame. Cada frame empieza desde cero: describe el estado en "progress".
function render(leaveClip, enterClip, progress, ctx) {
  const p = ease[ctx.params.easing](progress);

  // El clip saliente se desplaza hacia la izquierda y el entrante llega desde la derecha
  leaveClip.move(-p * screen.width, 0);
  enterClip.move((1 - p) * screen.width, 0);
}
`
}

/** Descubre los `.js` de las tres carpetas (integradas, usuario, proyecto) y avisa de los cambios en disco. */
export class TransitionRegistry {
  private watcher: FSWatcher | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  onChange: ((list: TransitionFile[]) => void) | null = null

  constructor(private readonly projects: ProjectService) {}

  dir(origin: TransitionOrigin): string | null {
    switch (origin) {
      case 'builtin':
        return resourcePath('transitions')
      case 'user':
        return join(app.getPath('userData'), 'transitions')
      case 'project':
        return this.projects.dir ? join(this.projects.dir, 'transitions') : null
    }
  }

  private async scan(origin: TransitionOrigin): Promise<TransitionFile[]> {
    const dir = this.dir(origin)
    if (!dir || !existsSync(dir)) return []
    const out: TransitionFile[] = []
    for (const f of (await readdir(dir)).sort()) {
      if (!f.endsWith('.js')) continue
      const id = f.slice(0, -3)
      if (!ID_RE.test(id)) continue
      const path = join(dir, f)
      try {
        const st = await stat(path)
        if (!st.isFile() || st.size > MAX_BYTES) continue
        out.push({ ref: `${origin}:${id}`, id, origin, path, source: await readFile(path, 'utf8'), readOnly: origin === 'builtin', mtime: st.mtimeMs })
      } catch {
        /* el archivo desapareció entre readdir y stat */
      }
    }
    return out
  }

  async list(): Promise<TransitionFile[]> {
    await mkdir(this.dir('user') as string, { recursive: true })
    return [...(await this.scan('project')), ...(await this.scan('user')), ...(await this.scan('builtin'))]
  }

  /** Ruta de un archivo a partir de su referencia `origin:id`, validada contra traversal. */
  private fileOf(ref: string): { origin: TransitionOrigin; id: string; path: string } {
    const m = /^(builtin|user|project):([a-z0-9-]+)$/.exec(ref)
    if (!m) throw new Error(`Referencia de transición no válida: ${ref}`)
    const origin = m[1] as TransitionOrigin
    const dir = this.dir(origin)
    if (!dir) throw new Error('No hay un proyecto abierto.')
    return { origin, id: m[2] as string, path: join(dir, `${m[2]}.js`) }
  }

  async save(ref: string, source: string): Promise<void> {
    const f = this.fileOf(ref)
    if (f.origin === 'builtin') throw new Error('Las transiciones integradas son de solo lectura: duplícala para editarla.')
    if (Buffer.byteLength(source) > MAX_BYTES) throw new Error('El archivo es demasiado grande (máximo 1 MB).')
    await writeAtomic(f.path, source)
  }

  /** Nueva transición del usuario a partir de la plantilla. */
  async create(): Promise<TransitionFile> {
    const dir = this.dir('user') as string
    await mkdir(dir, { recursive: true })
    let id = 'mi-transicion'
    let n = 1
    while (existsSync(join(dir, `${id}.js`))) id = `mi-transicion-${++n}`
    await writeAtomic(join(dir, `${id}.js`), transitionTemplate(id, n === 1 ? 'Mi transición' : `Mi transición ${n}`))
    return this.byRef(`user:${id}`)
  }

  /** Copia una transición (p. ej. una integrada) a la carpeta del usuario con un id nuevo. */
  async duplicate(ref: string): Promise<TransitionFile> {
    const src = this.fileOf(ref)
    const dir = this.dir('user') as string
    await mkdir(dir, { recursive: true })
    let id = `${src.id}-copia`
    for (let i = 2; existsSync(join(dir, `${id}.js`)); i++) id = `${src.id}-copia-${i}`
    let text = await readFile(src.path, 'utf8')
    // El id del meta debe coincidir con el nombre del archivo; el nombre visible indica que es una copia
    text = text.replace(/(\bid\s*:\s*["'])[a-z0-9-]+(["'])/, `$1${id}$2`).replace(/(\bname\s*:\s*["'])([^"']*)(["'])/, '$1$2 (copia)$3')
    await writeAtomic(join(dir, `${id}.js`), text)
    return this.byRef(`user:${id}`)
  }

  /** Copia al proyecto para que sea portable. */
  async copyToProject(ref: string): Promise<TransitionFile> {
    const src = this.fileOf(ref)
    const dir = this.dir('project')
    if (!dir) throw new Error('No hay un proyecto abierto.')
    await mkdir(dir, { recursive: true })
    const target = join(dir, `${src.id}.js`)
    if (src.path !== target) await copyFile(src.path, target)
    return this.byRef(`project:${src.id}`)
  }

  private async byRef(ref: string): Promise<TransitionFile> {
    const found = (await this.list()).find((t) => t.ref === ref)
    if (!found) throw new Error('No se pudo leer la transición creada.')
    return found
  }

  async openFolder(origin: TransitionOrigin): Promise<void> {
    const dir = this.dir(origin)
    if (!dir) return
    await mkdir(dir, { recursive: true })
    await shell.openPath(dir)
  }

  /** (Re)inicia la vigilancia; se llama al abrir o cerrar un proyecto para vigilar su carpeta. */
  async watch(): Promise<void> {
    await this.watcher?.close()
    const dirs = (['builtin', 'user', 'project'] as const).map((o) => this.dir(o)).filter((d): d is string => Boolean(d))
    for (const d of dirs) if (d !== this.dir('builtin')) await mkdir(d, { recursive: true }).catch(() => undefined)
    const w = chokidar.watch(dirs, { ignoreInitial: true, depth: 0, awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 30 } })
    const fire = (): void => {
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => void this.list().then((l) => this.onChange?.(l)), 120)
    }
    w.on('add', fire).on('change', fire).on('unlink', fire)
    this.watcher = w
  }

  async dispose(): Promise<void> {
    await this.watcher?.close()
    this.watcher = null
  }
}
