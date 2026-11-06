import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { app, BrowserWindow, Menu } from 'electron'
import { registerProtocolHandlers, registerSchemes } from './protocols'
import { setupSecurity } from './security'
import { registerIpc } from './ipc-handlers'
import { ProjectService } from './services/project-service'
import { createMainWindow } from './windows'
import { TransitionRegistry } from './services/transition-registry'
import { IPC } from '@shared/ipc'
import { ExportService } from './services/export-service'
import { PrefsService } from './services/prefs-service'

// userData = %APPDATA%/Viditor (Windows) · ~/.config/Viditor (Linux): ahí viven las transiciones del usuario
app.setName('Viditor')
registerSchemes()

const projects = new ProjectService()
const prefs = new PrefsService()
const registry = new TransitionRegistry(projects, prefs)
const exporter = new ExportService(projects)
let mainWindow: BrowserWindow | null = null

/** Primer argumento que sea un .vdproj existente (doble clic en el explorador / asociación de archivo) */
function projectFileFrom(argv: string[]): string | null {
  const f = argv.slice(1).find((a) => a.toLowerCase().endsWith('.vdproj') && !a.startsWith('--'))
  return f && existsSync(f) ? resolve(f) : null
}
let pendingFile: string | null = projectFileFrom(process.argv)

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    // La ventana principal es la primera creada (la de exportación es oculta y posterior)
    const win = mainWindow ?? BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
      const file = projectFileFrom(argv)
      if (file) win.webContents.send(IPC.appOpenFile, file)
    }
  })

  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    setupSecurity()
    registerProtocolHandlers(projects)
    prefs.load()
    registerIpc(projects, registry, exporter, prefs, {
      take: () => {
        const f = pendingFile
        pendingFile = null
        return f
      }
    })
    const win = createMainWindow()
    mainWindow = win
    // Cerrar la ventana principal cancela cualquier exportación en curso (su ventana oculta no debe mantener viva la app)
    win.on('closed', () => exporter.dispose())
    registry.onChange = (list) => {
      if (!win.isDestroyed()) win.webContents.send(IPC.transitionsChanged, list)
    }
    void registry.watch()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    exporter.dispose()
    void registry.dispose()
    app.quit()
  })
}
