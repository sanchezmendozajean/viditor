import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import { HELP_TOPICS, type HelpTopic } from '@shared/help-topics'
import { hardenWindow } from './security'

let helpWindow: BrowserWindow | null = null

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: '#1B1B1B',
    title: 'Viditor',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })
  hardenWindow(win, 'file://')
  win.once('ready-to-show', () => win.show())
  const sendMax = (): void => {
    if (!win.isDestroyed()) win.webContents.send(IPC.windowMaximizedChanged, win.isMaximized())
  }
  win.on('maximize', sendMax)
  win.on('unmaximize', sendMax)

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  return win
}

export function openHelpWindow(topic: string = 'index'): void {
  const path = topic in HELP_TOPICS ? HELP_TOPICS[topic as HelpTopic] : HELP_TOPICS.index
  const url = `viditor-docs://docs${path}`
  if (helpWindow && !helpWindow.isDestroyed()) {
    void helpWindow.loadURL(url)
    helpWindow.focus()
    return
  }
  helpWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    title: 'Ayuda de Viditor',
    backgroundColor: '#1B1B1B',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  helpWindow.setMenu(null)
  hardenWindow(helpWindow, 'viditor-docs://')
  helpWindow.on('closed', () => (helpWindow = null))
  void helpWindow.loadURL(url)
}
