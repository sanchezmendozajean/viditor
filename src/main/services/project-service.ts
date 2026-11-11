import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { app } from 'electron'
import { FORMAT_VERSION, type Project } from '@shared/project-schema'
import { isGeneratedKind } from '@shared/generated'
import { parseProject } from '@shared/migrations'
import type { NewProjectRequest, OpenedProject, RecentProject } from '@shared/ipc'
import type { MediaItem } from '@shared/project-schema'
import { sanitizeFileName } from './paths'

const MAX_RECENTS = 12
const MAX_BACKUPS = 10

export class ProjectService {
  /** Ruta absoluta del .vdproj abierto, o null. */
  file: string | null = null

  /** Medios del proyecto abierto (id → ruta y proxy) para servirlos por viditor-media://. */
  readonly mediaIndex = new Map<string, { path: string; proxy?: string }>()

  syncMedia(list: Pick<MediaItem, 'id' | 'path' | 'proxy'>[]): void {
    this.mediaIndex.clear()
    for (const m of list) this.mediaIndex.set(m.id, { path: m.path, proxy: m.proxy })
  }

  addMedia(list: Pick<MediaItem, 'id' | 'path' | 'proxy'>[]): void {
    for (const m of list) this.mediaIndex.set(m.id, { path: m.path, proxy: m.proxy })
  }

  get dir(): string | null {
    return this.file ? dirname(this.file) : null
  }

  private recentsFile(): string {
    return join(app.getPath('userData'), 'recents.json')
  }

  async recents(): Promise<RecentProject[]> {
    try {
      const list = JSON.parse(await readFile(this.recentsFile(), 'utf8')) as RecentProject[]
      return list.filter((r) => typeof r.path === 'string' && existsSync(r.path))
    } catch {
      return []
    }
  }

  async removeRecent(path: string): Promise<RecentProject[]> {
    const list = (await this.recents()).filter((r) => r.path !== path)
    await this.writeRecents(list)
    return list
  }

  private async writeRecents(list: RecentProject[]): Promise<void> {
    await writeAtomic(this.recentsFile(), JSON.stringify(list, null, 2))
  }

  private async pushRecent(file: string, name: string): Promise<void> {
    const list = (await this.recents()).filter((r) => r.path !== file)
    list.unshift({ path: file, name, openedAt: Date.now() })
    await this.writeRecents(list.slice(0, MAX_RECENTS))
  }

  defaultParentDir(): string {
    return join(app.getPath('documents'), 'Viditor')
  }

  async create(req: NewProjectRequest): Promise<OpenedProject> {
    const name = req.name.trim() || 'Proyecto sin título'
    const folder = sanitizeFileName(name)
    const dir = resolve(req.parentDir, folder)
    if (existsSync(dir) && (await readdir(dir)).length > 0) {
      throw new Error(`La carpeta "${dir}" ya existe y no está vacía. Elige otro nombre o ubicación.`)
    }
    await mkdir(join(dir, 'media'), { recursive: true })
    await mkdir(join(dir, 'transitions'), { recursive: true })
    await mkdir(join(dir, 'renders'), { recursive: true })
    await mkdir(join(dir, '.viditor', 'cache'), { recursive: true })
    await mkdir(join(dir, '.viditor', 'backups'), { recursive: true })

    const project: Project = parseProject({
      formatVersion: FORMAT_VERSION,
      app: 'viditor',
      name,
      settings: req.settings,
      tracks: [
        { id: 't_v2', kind: 'video', name: 'V2', height: 64 },
        { id: 't_v1', kind: 'video', name: 'V1', height: 64 },
        { id: 't_a1', kind: 'audio', name: 'A1', height: 48 },
        { id: 't_a2', kind: 'audio', name: 'A2', height: 48 }
      ]
    })
    const file = join(dir, `${folder}.vdproj`)
    await writeAtomic(file, serialize(project))
    this.file = file
    this.syncMedia(project.media)
    await this.pushRecent(file, name)
    return { file, dir, project, missing: [] }
  }

  async open(file: string): Promise<OpenedProject> {
    const abs = resolve(file)
    const raw = JSON.parse(await readFile(abs, 'utf8')) as unknown
    const project = parseProject(raw)
    const dir = dirname(abs)
    await mkdir(join(dir, '.viditor', 'cache'), { recursive: true })
    await mkdir(join(dir, '.viditor', 'backups'), { recursive: true })
    const missing = project.media.filter((m) => !isGeneratedKind(m.kind) && !existsSync(this.resolveMediaPath(dir, m.path))).map((m) => m.id)
    this.file = abs
    this.syncMedia(project.media)
    await this.pushRecent(abs, project.name)
    return { file: abs, dir, project, missing }
  }

  resolveMediaPath(dir: string, mediaPath: string): string {
    return isAbsolute(mediaPath) ? mediaPath : resolve(dir, mediaPath)
  }

  async save(project: Project): Promise<number> {
    if (!this.file) throw new Error('No hay un proyecto abierto.')
    parseProject(project)
    await writeAtomic(this.file, serialize(project))
    return Date.now()
  }

  /** Autoguardado rotativo en .viditor/backups/ (últimos 10). */
  async autosave(project: Project): Promise<number> {
    if (!this.file || !this.dir) throw new Error('No hay un proyecto abierto.')
    parseProject(project)
    const backups = join(this.dir, '.viditor', 'backups')
    await mkdir(backups, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    await writeAtomic(join(backups, `${stamp}.vdproj`), serialize(project))
    const all = (await readdir(backups)).filter((f) => f.endsWith('.vdproj')).sort()
    for (const old of all.slice(0, Math.max(0, all.length - MAX_BACKUPS))) {
      await rm(join(backups, old), { force: true })
    }
    return Date.now()
  }

  close(): void {
    this.file = null
    this.mediaIndex.clear()
  }

  name(): string {
    return this.file ? basename(this.file, '.vdproj') : ''
  }
}

function serialize(project: Project): string {
  return JSON.stringify(project, null, 2) + '\n'
}

/** Escribe a `.tmp` y renombra, para no dejar nunca un archivo a medias. */
export async function writeAtomic(target: string, data: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true })
  const tmp = `${target}.${process.pid}.tmp`
  await writeFile(tmp, data, 'utf8')
  try {
    await rename(tmp, target)
  } catch (e) {
    await rm(tmp, { force: true })
    throw e
  }
}
