import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ExportProgress } from '../shared/export-model'
import { IPC, type BackgroundTask, type TransitionFile, type ViditorApi } from '../shared/ipc'

function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, value: T): void => cb(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: ViditorApi = {
  platform: process.platform,
  window: {
    minimize: () => ipcRenderer.send(IPC.windowMinimize),
    toggleMaximize: () => ipcRenderer.send(IPC.windowToggleMaximize),
    close: () => ipcRenderer.send(IPC.windowClose),
    onMaximizedChange: (cb) => subscribe<boolean>(IPC.windowMaximizedChanged, cb)
  },
  dialogs: {
    chooseDirectory: (defaultPath) => ipcRenderer.invoke(IPC.dialogDirectory, defaultPath),
    chooseProjectFile: () => ipcRenderer.invoke(IPC.dialogProjectFile),
    chooseMediaFiles: () => ipcRenderer.invoke(IPC.dialogMediaFiles)
  },
  project: {
    defaultParentDir: () => ipcRenderer.invoke(IPC.projectDefaultDir),
    recents: () => ipcRenderer.invoke(IPC.projectRecents),
    removeRecent: (path) => ipcRenderer.invoke(IPC.projectRemoveRecent, path),
    create: (req) => ipcRenderer.invoke(IPC.projectCreate, req),
    open: (file) => ipcRenderer.invoke(IPC.projectOpen, file),
    save: (project) => ipcRenderer.invoke(IPC.projectSave, project),
    autosave: (project) => ipcRenderer.invoke(IPC.projectAutosave, project),
    close: () => ipcRenderer.invoke(IPC.projectClose)
  },
  media: {
    plan: (paths) => ipcRenderer.invoke(IPC.mediaPlan, paths),
    import: (req) => ipcRenderer.invoke(IPC.mediaImport, req),
    thumbnailUrl: (mediaId) => `viditor-media://thumb/${encodeURIComponent(mediaId)}.jpg`,
    pathForFile: (file) => webUtils.getPathForFile(file),
    waveform: (mediaId, path) => ipcRenderer.invoke(IPC.mediaWaveform, mediaId, path),
    reveal: (path) => ipcRenderer.send(IPC.mediaReveal, path),
    onTask: (cb) => subscribe<BackgroundTask>(IPC.mediaTask, cb),
    onProxyReady: (cb) => subscribe<{ mediaId: string; path: string }>(IPC.mediaProxyReady, cb),
    sourceUrl: (mediaId, proxy) => `viditor-media://${proxy ? 'proxy' : 'file'}/${encodeURIComponent(mediaId)}`
  },
  transitions: {
    list: () => ipcRenderer.invoke(IPC.transitionsList),
    save: (ref, source) => ipcRenderer.invoke(IPC.transitionsSave, ref, source),
    create: () => ipcRenderer.invoke(IPC.transitionsCreate),
    duplicate: (ref) => ipcRenderer.invoke(IPC.transitionsDuplicate, ref),
    copyToProject: (ref) => ipcRenderer.invoke(IPC.transitionsCopyToProject, ref),
    openFolder: (origin) => ipcRenderer.send(IPC.transitionsOpenFolder, origin),
    onChanged: (cb) => subscribe<TransitionFile[]>(IPC.transitionsChanged, cb)
  },
  help: { open: (topic) => ipcRenderer.send(IPC.helpOpen, topic) },
  export: {
    capabilities: () => ipcRenderer.invoke(IPC.exportCaps),
    defaultOutput: (name, ext) => ipcRenderer.invoke(IPC.exportDefaultOutput, name, ext),
    chooseOutput: (defaultPath, ext) => ipcRenderer.invoke(IPC.exportChooseOutput, defaultPath, ext),
    start: (project, options) => ipcRenderer.invoke(IPC.exportStart, project, options),
    cancel: (jobId) => ipcRenderer.send(IPC.exportCancel, jobId),
    onProgress: (cb) => subscribe<ExportProgress>(IPC.exportProgress, cb),
    reveal: (path) => ipcRenderer.send(IPC.exportReveal, path),
    open: (path) => ipcRenderer.send(IPC.exportOpen, path)
  },
  exportRunner: {
    data: (jobId) => ipcRenderer.invoke(IPC.exportJobData, jobId),
    begin: (jobId, modes) => ipcRenderer.invoke(IPC.exportBegin, jobId, modes),
    decode: (req) => ipcRenderer.invoke(IPC.exportDecode, req),
    pushFrame: (jobId, data) => ipcRenderer.invoke(IPC.exportPushFrame, jobId, data),
    progress: (jobId, frame, thumb) => ipcRenderer.send(IPC.exportReport, jobId, frame, thumb),
    finish: (jobId, timings) => ipcRenderer.invoke(IPC.exportFinish, jobId, timings),
    fail: (jobId, message) => ipcRenderer.send(IPC.exportFail, jobId, message)
  },
  app: {
    onMenuAction: (cb) => subscribe<string>(IPC.appMenuAction, cb),
    openExternal: (url) => ipcRenderer.send(IPC.appOpenExternal, url)
  }
}

contextBridge.exposeInMainWorld('viditor', api)
