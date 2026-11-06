import { basename, dirname, join } from 'node:path'
import { sanitizeFileName } from './services/paths'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { ZodError } from 'zod'
import { IPC, type BackgroundTask, type ImportRequest, type IpcResult, type NewProjectRequest, type Waveform } from '@shared/ipc'
import { projectSchema, settingsSchema, type Project } from '@shared/project-schema'
import { ProjectFormatError } from '@shared/migrations'
import { ProjectService } from './services/project-service'
import { ensureProxies } from './services/proxy-service'
import type { TransitionRegistry } from './services/transition-registry'
import type { MediaItem } from '@shared/project-schema'
import { ImportService } from './services/import-service'
import { planRelink } from './services/relink'
import type { PrefsService } from './services/prefs-service'
import { computeWaveform, JobQueue, makeThumbnail } from './services/media-service'
import { openExternalFromUserClick } from './security'
import { openHelpWindow } from './windows'
import type { ExportService } from './services/export-service'
import { exportOptionsSchema } from '@shared/export-schema'

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof ZodError) return { ok: false, error: `Datos inválidos: ${e.issues[0]?.path.join('.')} ${e.issues[0]?.message}` }
  if (e instanceof ProjectFormatError) return { ok: false, error: e.message }
  if (e instanceof SyntaxError) return { ok: false, error: 'El archivo del proyecto está dañado (JSON inválido).' }
  const code = (e as NodeJS.ErrnoException).code
  if (code === 'ENOENT') return { ok: false, error: 'No se encontró el archivo o la carpeta.' }
  if (code === 'EACCES' || code === 'EPERM') return { ok: false, error: 'Sin permisos para acceder a esa ubicación.' }
  return { ok: false, error: e instanceof Error ? e.message : String(e) }
}

async function guard<T>(fn: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (e) {
    return fail(e)
  }
}

function windowOf(e: IpcMainInvokeEvent | Electron.IpcMainEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(e.sender)
}

export function registerIpc(projects: ProjectService, registry: TransitionRegistry, exporter: ExportService, prefs: PrefsService, pendingFile: { take(): string | null }): void {
  const imports = new ImportService()

  ipcMain.on(IPC.windowMinimize, (e) => windowOf(e)?.minimize())
  ipcMain.on(IPC.windowToggleMaximize, (e) => {
    const w = windowOf(e)
    if (w) w.isMaximized() ? w.unmaximize() : w.maximize()
  })
  ipcMain.on(IPC.windowClose, (e) => windowOf(e)?.close())

  ipcMain.handle(IPC.dialogDirectory, async (e, defaultPath?: string) => {
    const w = windowOf(e)
    const opts: Electron.OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: typeof defaultPath === 'string' ? defaultPath : undefined
    }
    const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts)
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
  ipcMain.handle(IPC.dialogProjectFile, async (e) => {
    const w = windowOf(e)
    const opts: Electron.OpenDialogOptions = {
      properties: ['openFile'],
      filters: [{ name: 'Proyecto de Viditor', extensions: ['vdproj'] }]
    }
    const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts)
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
  ipcMain.handle(IPC.dialogMediaFiles, async (e) => {
    const w = windowOf(e)
    const opts: Electron.OpenDialogOptions = {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Medios', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'png', 'jpg', 'jpeg', 'gif', 'webp'] }
      ]
    }
    const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts)
    return r.canceled ? [] : r.filePaths
  })

  ipcMain.handle(IPC.projectDefaultDir, () => projects.defaultParentDir())
  ipcMain.handle(IPC.projectRecents, () => projects.recents())
  ipcMain.handle(IPC.projectRemoveRecent, (_e, path: string) => projects.removeRecent(String(path)))
  const queue = (sender: Electron.WebContents): JobQueue =>
    new JobQueue(2, (task: BackgroundTask) => {
      if (!sender.isDestroyed()) sender.send(IPC.mediaTask, task)
    })
  let jobQueue: JobQueue | null = null
  const getQueue = (sender: Electron.WebContents): JobQueue => (jobQueue ??= queue(sender))

  /** Lanza la generación de proxies y avisa al renderer cuando cada uno queda listo. */
  const startProxies = (sender: Electron.WebContents, items: MediaItem[]): void => {
    const dir = projects.dir
    if (!dir) return
    ensureProxies(projects, dir, items, getQueue(sender), (mediaId, path) => {
      projects.addMedia([{ id: mediaId, path: items.find((m) => m.id === mediaId)?.path ?? '', proxy: path }])
      if (!sender.isDestroyed()) sender.send(IPC.mediaProxyReady, { mediaId, path })
    })
  }

  ipcMain.handle(IPC.projectCreate, (_e, req: NewProjectRequest) =>
    guard(async () => {
      const settings = settingsSchema.parse(req.settings)
      const created = await projects.create({ name: String(req.name), parentDir: String(req.parentDir), settings })
      void registry.watch()
      return created
    })
  )
  ipcMain.handle(IPC.projectOpen, (e, file: string) =>
    guard(async () => {
      const opened = await projects.open(String(file))
      void registry.watch()
      startProxies(e.sender, opened.project.media)
      return opened
    })
  )
  ipcMain.handle(IPC.projectSave, (_e, project: Project) =>
    guard(async () => {
      const p = projectSchema.parse(project)
      const savedAt = await projects.save(p)
      projects.syncMedia(p.media)
      return { savedAt }
    })
  )
  ipcMain.handle(IPC.projectAutosave, (_e, project: Project) =>
    guard(async () => ({ savedAt: await projects.autosave(projectSchema.parse(project)) }))
  )
  ipcMain.handle(IPC.projectClose, () => {
    projects.close()
    void registry.watch()
  })

  ipcMain.handle(IPC.mediaPlan, (_e, paths: string[]) =>
    guard(async () => {
      const dir = projects.dir
      if (!dir) throw new Error('No hay un proyecto abierto.')
      return imports.plan(dir, paths.map(String))
    })
  )

  ipcMain.handle(IPC.mediaImport, (e, req: ImportRequest) =>
    guard(async () => {
      const dir = projects.dir
      if (!dir) throw new Error('No hay un proyecto abierto.')
      if (!['reference', 'copy', 'move'].includes(req.mode)) throw new Error('Modo de importación inválido.')
      const q = getQueue(e.sender)
      const clean: ImportRequest = {
        paths: req.paths.map(String),
        mode: req.mode,
        existingPaths: (req.existingPaths ?? []).map(String)
      }
      const result = await imports.import(dir, clean, (item, abs) => {
        q.add(`thumb:${item.id}`, `Miniatura de ${item.path.split('/').pop()}`, async () => {
          const out = join(dir, '.viditor', 'cache', 'thumbs', `${item.id}.jpg`)
          await makeThumbnail(abs, item.kind, item.probe?.duration ?? 0, out)
        })
      })
      projects.addMedia(result.media)
      startProxies(e.sender, result.media)
      return result
    })
  )

  ipcMain.handle(IPC.mediaWaveform, (e, mediaId: string, path: string) =>
    guard(async () => {
      const dir = projects.dir
      if (!dir) throw new Error('No hay un proyecto abierto.')
      if (!/^m_[0-9A-Za-z]+$/.test(String(mediaId))) throw new Error('Identificador de medio inválido.')
      const cache = join(dir, '.viditor', 'cache', 'waveforms', `${mediaId}.json`)
      if (existsSync(cache)) return JSON.parse(await readFile(cache, 'utf8')) as Waveform
      const wave = await getQueue(e.sender).run(`wave:${mediaId}`, `Forma de onda de ${String(path).split('/').pop()}`, () =>
        computeWaveform(projects.resolveMediaPath(dir, String(path)))
      )
      await mkdir(join(cache, '..'), { recursive: true })
      await writeFile(cache, JSON.stringify(wave))
      return wave
    })
  )

  ipcMain.on(IPC.mediaReveal, (_e, path: string) => {
    const dir = projects.dir
    if (!dir) return
    const abs = projects.resolveMediaPath(dir, String(path))
    if (existsSync(abs)) shell.showItemInFolder(abs)
  })

  ipcMain.handle(IPC.prefsGet, () => prefs.get())
  ipcMain.handle(IPC.prefsSet, (e, partial: unknown) =>
    guard(async () => {
      const before = prefs.get().transitionsDir
      const next = await prefs.set(partial)
      if (next.transitionsDir !== before) {
        // La carpeta de transiciones del usuario cambió: se vigila la nueva y se refresca la lista
        await registry.watch()
        if (!e.sender.isDestroyed()) e.sender.send(IPC.transitionsChanged, await registry.list())
      }
      return next
    })
  )
  ipcMain.handle(IPC.appPendingFile, () => pendingFile.take())

  ipcMain.handle(IPC.mediaRelink, (e, target: { id: string; path: string }, missing: { id: string; path: string }[]) =>
    guard(async () => {
      const dir = projects.dir
      if (!dir) throw new Error('No hay un proyecto abierto.')
      const first = { id: String(target.id), path: String(target.path) }
      const w = windowOf(e)
      const opts: Electron.OpenDialogOptions = { title: `Localizar «${basename(first.path)}»`, properties: ['openFile'] }
      const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts)
      const chosen = r.canceled ? null : (r.filePaths[0] ?? null)
      if (!chosen) return null
      const list = (Array.isArray(missing) ? missing : []).map((m) => ({ id: String(m.id), path: String(m.path) }))
      const result = planRelink(dir, first, chosen, list, existsSync)
      // El índice de medios del protocolo viditor-media:// se actualiza ya, sin esperar a guardar
      projects.addMedia(result.map((m) => ({ id: m.id, path: m.path })))
      return result
    })
  )

  ipcMain.handle(IPC.transitionsList, () => registry.list())
  ipcMain.handle(IPC.transitionsSave, (_e, ref: string, source: string) =>
    guard(async () => {
      await registry.save(String(ref), String(source))
      return null
    })
  )
  ipcMain.handle(IPC.transitionsCreate, () => guard(() => registry.create()))
  ipcMain.handle(IPC.transitionsDuplicate, (_e, ref: string) => guard(() => registry.duplicate(String(ref))))
  ipcMain.handle(IPC.transitionsCopyToProject, (_e, ref: string) => guard(() => registry.copyToProject(String(ref))))
  ipcMain.on(IPC.transitionsOpenFolder, (_e, origin: string) => {
    if (origin === 'builtin' || origin === 'user' || origin === 'project') void registry.openFolder(origin)
  })

  // ───────── Exportación ─────────
  ipcMain.handle(IPC.exportCaps, () => exporter.capabilities())
  ipcMain.handle(IPC.exportDefaultOutput, (_e, name: string, ext: string) => exporter.defaultOutput(String(name), String(ext).replace(/[^a-z0-9]/gi, '')))
  ipcMain.handle(IPC.exportChooseOutput, async (e, defaultPath: string, ext: string) => {
    const w = windowOf(e)
    const extension = String(ext).replace(/[^a-z0-9]/gi, '')
    const opts: Electron.SaveDialogOptions = { defaultPath: String(defaultPath), filters: [{ name: extension.toUpperCase(), extensions: [extension] }] }
    const r = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts)
    return r.canceled ? null : (r.filePath ?? null)
  })
  ipcMain.handle(IPC.exportStart, (e, project: Project, options: unknown) =>
    guard(async () => {
      const jobId = await exporter.start(e.sender, projectSchema.parse(project), exportOptionsSchema.parse(options))
      return { jobId }
    })
  )
  ipcMain.handle(IPC.exportSaveFrame, (e, name: string, png: Uint8Array) =>
    guard(async () => {
      const dir = projects.dir
      if (!dir) throw new Error('No hay un proyecto abierto.')
      if (!(png instanceof Uint8Array) || png.byteLength < 8 || png.byteLength > 256 * 1024 * 1024) throw new Error('Imagen inválida.')
      const w = windowOf(e)
      const opts: Electron.SaveDialogOptions = {
        title: 'Exportar fotograma',
        defaultPath: join(dir, 'renders', `${sanitizeFileName(String(name))}.png`),
        filters: [{ name: 'PNG', extensions: ['png'] }]
      }
      const r = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts)
      if (r.canceled || !r.filePath) return null
      await mkdir(dirname(r.filePath), { recursive: true })
      await writeFile(r.filePath, png)
      return r.filePath
    })
  )
  ipcMain.on(IPC.exportCancel, (_e, jobId: string) => exporter.cancel(String(jobId)))
  ipcMain.on(IPC.exportReveal, (_e, path: string) => {
    if (existsSync(String(path))) shell.showItemInFolder(String(path))
  })
  ipcMain.on(IPC.exportOpen, (_e, path: string) => {
    if (existsSync(String(path))) void shell.openPath(String(path))
  })
  ipcMain.handle(IPC.exportJobData, (e, jobId: string) => exporter.data(e.sender, String(jobId)))
  ipcMain.handle(IPC.exportBegin, (e, jobId: string, modes: Record<string, 'crossfade' | 'cut' | 'none' | undefined>) =>
    guard(() => exporter.begin(e.sender, String(jobId), modes ?? {}))
  )
  ipcMain.handle(IPC.exportDecode, (e, req) => guard(() => exporter.decode(e.sender, req)))
  ipcMain.handle(IPC.exportPushFrame, (e, jobId: string, data: Uint8Array) =>
    guard(async () => {
      await exporter.pushFrame(e.sender, String(jobId), data)
      return null
    })
  )
  ipcMain.on(IPC.exportReport, (e, jobId: string, frame: number, thumb?: string) => {
    try {
      exporter.progress(e.sender, String(jobId), Number(frame), typeof thumb === 'string' ? thumb : undefined)
    } catch {
      /* trabajo ya terminado */
    }
  })
  ipcMain.handle(IPC.exportFinish, (e, jobId: string, timings?: Record<string, number>) =>
    guard(async () => {
      await exporter.finish(e.sender, String(jobId), timings)
      return null
    })
  )
  ipcMain.on(IPC.exportFail, (e, jobId: string, message: string) => {
    void exporter.failFromWindow(e.sender, String(jobId), String(message)).catch(() => undefined)
  })

  ipcMain.on(IPC.helpOpen, (_e, topic?: string) => openHelpWindow(typeof topic === 'string' ? topic : 'index'))
  ipcMain.on(IPC.appOpenExternal, (_e, url: string) => openExternalFromUserClick(String(url)))
}
