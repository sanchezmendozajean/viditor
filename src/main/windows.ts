import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import { HELP_TOPICS, type HelpTopic } from '@shared/help-topics'
import { hardenWindow } from './security'

let helpWindow: BrowserWindow | null = null
const closeAllowed = new WeakSet<BrowserWindow>()

/** Permite que la ventana se cierre en el próximo `close` (el usuario ya resolvió los cambios sin guardar). */
export function allowClose(win: BrowserWindow): void {
  closeAllowed.add(win)
}

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
      webSecurity: true,
      // Sin corrector ortográfico de Chromium: rutas, nombres de archivo y comandos no son texto para corregir.
      spellcheck: false,
      // La reproducción de audio/vídeo no debe exigir un gesto del usuario (el motor arranca desde atajos de teclado).
      autoplayPolicy: 'no-user-gesture-required'
    }
  })
  hardenWindow(win, 'viditor-app://')
  win.once('ready-to-show', () => win.show())
  const sendMax = (): void => {
    if (!win.isDestroyed()) win.webContents.send(IPC.windowMaximizedChanged, win.isMaximized())
  }
  // Cerrar: el renderer decide (cambios sin guardar). Solo se cierra de verdad tras `allowClose`.
  win.on('close', (e) => {
    if (closeAllowed.has(win) || win.webContents.isDestroyed()) return
    e.preventDefault()
    win.webContents.send(IPC.windowCloseRequested)
  })
  win.on('maximize', sendMax)
  win.on('unmaximize', sendMax)

  // Inspector de elementos (solo en desarrollo): F12 o Ctrl+Shift+I
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type !== 'keyDown') return
      if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) win.webContents.toggleDevTools()
    })
  }

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(devUrl)
  else void win.loadURL('viditor-app://app/index.html')
  return win
}

export function openHelpWindow(topic: string = 'index'): void {
  // Un tema conocido, o una ruta de la documentación (p. ej. la referencia de un símbolo desde Monaco con F1)
  const safe = /^\/[A-Za-z0-9_\-./#]*$/.test(topic) && !topic.includes('..')
  const path = topic in HELP_TOPICS ? HELP_TOPICS[topic as HelpTopic] : safe ? topic : HELP_TOPICS.index
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
