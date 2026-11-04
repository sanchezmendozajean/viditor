import { join } from 'node:path'
import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { ZodError } from 'zod'
import { IPC, type BackgroundTask, type ImportRequest, type IpcResult, type NewProjectRequest } from '@shared/ipc'
import { projectSchema, settingsSchema, type Project } from '@shared/project-schema'
import { ProjectFormatError } from '@shared/migrations'
import { ProjectService } from './services/project-service'
import { ImportService } from './services/import-service'
import { JobQueue, makeThumbnail } from './services/media-service'
import { openExternalFromUserClick } from './security'
import { openHelpWindow } from './windows'

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

export function registerIpc(projects: ProjectService): void {
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
  ipcMain.handle(IPC.projectCreate, (_e, req: NewProjectRequest) =>
    guard(async () => {
      const settings = settingsSchema.parse(req.settings)
      return projects.create({ name: String(req.name), parentDir: String(req.parentDir), settings })
    })
  )
  ipcMain.handle(IPC.projectOpen, (_e, file: string) => guard(() => projects.open(String(file))))
  ipcMain.handle(IPC.projectSave, (_e, project: Project) =>
    guard(async () => ({ savedAt: await projects.save(projectSchema.parse(project)) }))
  )
  ipcMain.handle(IPC.projectAutosave, (_e, project: Project) =>
    guard(async () => ({ savedAt: await projects.autosave(projectSchema.parse(project)) }))
  )
  ipcMain.handle(IPC.projectClose, () => projects.close())

  const queue = (sender: Electron.WebContents): JobQueue =>
    new JobQueue(2, (task: BackgroundTask) => {
      if (!sender.isDestroyed()) sender.send(IPC.mediaTask, task)
    })
  let jobQueue: JobQueue | null = null

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
      jobQueue ??= queue(e.sender)
      const q = jobQueue
      const clean: ImportRequest = {
        paths: req.paths.map(String),
        mode: req.mode,
        existingPaths: (req.existingPaths ?? []).map(String)
      }
      return imports.import(dir, clean, (item, abs) => {
        q.add(`thumb:${item.id}`, `Miniatura de ${item.path.split('/').pop()}`, async () => {
          const out = join(dir, '.viditor', 'cache', 'thumbs', `${item.id}.jpg`)
          await makeThumbnail(abs, item.kind, item.probe?.duration ?? 0, out)
        })
      })
    })
  )

  ipcMain.on(IPC.helpOpen, (_e, topic?: string) => openHelpWindow(typeof topic === 'string' ? topic : 'index'))
  ipcMain.on(IPC.appOpenExternal, (_e, url: string) => openExternalFromUserClick(String(url)))
}
