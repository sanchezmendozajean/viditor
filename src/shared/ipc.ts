import type { DecodedFrame, DecodeRequest, ExportCapabilities, ExportJobData, ExportOptions, ExportProgress } from './export-model'
import type { AudioMode } from './transition-model'
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

export interface Waveform {
  perSecond: number
  peaks: number[]
}

export type TransitionOrigin = 'builtin' | 'user' | 'project'

/** Un archivo .js de transición descubierto por el registro (el código lo evalúa el worker del renderer). */
export interface TransitionFile {
  /** builtin:id · user:id · project:id */
  ref: string
  /** Nombre del archivo sin .js; debe coincidir con meta.id */
  id: string
  origin: TransitionOrigin
  path: string
  source: string
  readOnly: boolean
  mtime: number
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
    /** Picos de forma de onda (caché en .viditor/cache/waveforms). */
    waveform(mediaId: string, path: string): Promise<IpcResult<Waveform>>
    /** Muestra el archivo del medio en el explorador del sistema. */
    reveal(path: string): void
    onTask(cb: (task: BackgroundTask) => void): () => void
    /** Un proxy H.264 terminó de generarse (ruta relativa al proyecto). */
    onProxyReady(cb: (e: { mediaId: string; path: string }) => void): () => void
    /** URL de reproducción de un medio: original o su proxy. */
    sourceUrl(mediaId: string, proxy: boolean): string
  }
  transitions: {
    list(): Promise<TransitionFile[]>
    save(ref: string, source: string): Promise<IpcResult<null>>
    /** Nueva transición del usuario desde la plantilla */
    create(): Promise<IpcResult<TransitionFile>>
    /** Copia una transición (p. ej. integrada) a la carpeta del usuario para poder editarla */
    duplicate(ref: string): Promise<IpcResult<TransitionFile>>
    copyToProject(ref: string): Promise<IpcResult<TransitionFile>>
    openFolder(origin: TransitionOrigin): void
    /** Cambios en disco (recarga en caliente) */
    onChanged(cb: (list: TransitionFile[]) => void): () => void
  }
  help: {
    open(topic?: string): void
  }
  export: {
    capabilities(): Promise<ExportCapabilities>
    defaultOutput(name: string, ext: string): Promise<string>
    chooseOutput(defaultPath: string, ext: string): Promise<string | null>
    start(project: Project, options: ExportOptions): Promise<IpcResult<{ jobId: string }>>
    cancel(jobId: string): void
    onProgress(cb: (p: ExportProgress) => void): () => void
    /** Muestra el archivo en el explorador */
    reveal(path: string): void
    /** Abre el archivo con el reproductor del sistema */
    open(path: string): void
  }
  /** Solo lo usa la ventana oculta de exportación */
  exportRunner: {
    data(jobId: string): Promise<ExportJobData>
    begin(jobId: string, modes: Record<string, AudioMode | undefined>): Promise<IpcResult<{ encoder: string }>>
    decode(req: DecodeRequest): Promise<IpcResult<DecodedFrame>>
    pushFrame(jobId: string, data: Uint8Array): Promise<IpcResult<null>>
    progress(jobId: string, frame: number, thumb?: string): void
    finish(jobId: string, timings?: Record<string, number>): Promise<IpcResult<null>>
    fail(jobId: string, message: string): void
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
  mediaWaveform: 'media:waveform',
  mediaProxyReady: 'media:proxy-ready',
  mediaReveal: 'media:reveal',
  transitionsList: 'transitions:list',
  transitionsSave: 'transitions:save',
  transitionsCreate: 'transitions:create',
  transitionsDuplicate: 'transitions:duplicate',
  transitionsCopyToProject: 'transitions:copy-to-project',
  transitionsOpenFolder: 'transitions:open-folder',
  transitionsChanged: 'transitions:changed',
  helpOpen: 'help:open',
  exportCaps: 'export:caps',
  exportDefaultOutput: 'export:default-output',
  exportChooseOutput: 'export:choose-output',
  exportStart: 'export:start',
  exportCancel: 'export:cancel',
  exportProgress: 'export:progress',
  exportReveal: 'export:reveal',
  exportOpen: 'export:open',
  exportJobData: 'export:job-data',
  exportBegin: 'export:begin',
  exportDecode: 'export:decode',
  exportPushFrame: 'export:push-frame',
  exportReport: 'export:report',
  exportFinish: 'export:finish',
  exportFail: 'export:fail',
  appMenuAction: 'app:menu-action',
  appOpenExternal: 'app:open-external'
} as const
