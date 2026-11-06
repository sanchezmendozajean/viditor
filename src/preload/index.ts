import { contextBridge, ipcRenderer, webUtils } from 'electron'
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
  app: {
    onMenuAction: (cb) => subscribe<string>(IPC.appMenuAction, cb),
    openExternal: (url) => ipcRenderer.send(IPC.appOpenExternal, url)
  }
}

contextBridge.exposeInMainWorld('viditor', api)
