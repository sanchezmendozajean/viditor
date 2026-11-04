import type { ImportMode, MediaBin, MediaItem, Project, ProjectSettings } from './project-schema'

export interface RecentProject {
  path: string
  name: string
  openedAt: number
}

export interface NewProjectRequest {
  name: string
  parentDir: string
  settings: ProjectSettings
}

export interface OpenedProject {
  /** Ruta absoluta del .vdproj */
  file: string
  /** Carpeta del proyecto */
  dir: string
  project: Project
  /** IDs de medios cuyo archivo no existe */
  missing: string[]
}

export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: string }

export interface ImportRequest {
  paths: string[]
  mode: Exclude<ImportMode, 'ask'>
  /** Rutas (como en el .vdproj) de los medios ya importados, para no duplicar. */
  existingPaths: string[]
}

export interface ImportPlan {
  /** Cantidad de archivos soportados tras expandir carpetas */
  count: number
  /** Archivos fuera de la carpeta del proyecto (los únicos que requieren elegir dejar/copiar/mover) */
  outsideCount: number
}

export interface ImportResult {
  media: MediaItem[]
  bins: MediaBin[]
  skipped: string[]
}

export interface BackgroundTask {
  id: string
  label: string
  progress: number | null
  done: boolean
  error?: string
}

/** Contrato del puente `window.viditor` expuesto por el preload. */
export interface ViditorApi {
  platform: string
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    onMaximizedChange(cb: (maximized: boolean) => void): () => void
  }
  dialogs: {
    chooseDirectory(defaultPath?: string): Promise<string | null>
    chooseProjectFile(): Promise<string | null>
    chooseMediaFiles(): Promise<string[]>
  }
  project: {
    defaultParentDir(): Promise<string>
    recents(): Promise<RecentProject[]>
    removeRecent(path: string): Promise<RecentProject[]>
    create(req: NewProjectRequest): Promise<IpcResult<OpenedProject>>
    open(file: string): Promise<IpcResult<OpenedProject>>
    save(project: Project): Promise<IpcResult<{ savedAt: number }>>
    autosave(project: Project): Promise<IpcResult<{ savedAt: number }>>
    close(): Promise<void>
  }
  media: {
    plan(paths: string[]): Promise<IpcResult<ImportPlan>>
    import(req: ImportRequest): Promise<IpcResult<ImportResult>>
    /** URL (protocolo viditor-media://) de la miniatura de un medio. */
    thumbnailUrl(mediaId: string): string
    /** Ruta absoluta de un File soltado (drag & drop). */
    pathForFile(file: File): string
    onTask(cb: (task: BackgroundTask) => void): () => void
  }
  help: {
    open(topic?: string): void
  }
  app: {
    onMenuAction(cb: (action: string) => void): () => void
    openExternal(url: string): void
  }
}

export const IPC = {
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowMaximizedChanged: 'window:maximized-changed',
  dialogDirectory: 'dialog:directory',
  dialogProjectFile: 'dialog:project-file',
  dialogMediaFiles: 'dialog:media-files',
  projectDefaultDir: 'project:default-dir',
  projectRecents: 'project:recents',
  projectRemoveRecent: 'project:remove-recent',
  projectCreate: 'project:create',
  projectOpen: 'project:open',
  projectSave: 'project:save',
  projectAutosave: 'project:autosave',
  projectClose: 'project:close',
  mediaPlan: 'media:plan',
  mediaImport: 'media:import',
  mediaTask: 'media:task',
  helpOpen: 'help:open',
  appMenuAction: 'app:menu-action',
  appOpenExternal: 'app:open-external'
} as const
