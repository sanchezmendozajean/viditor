import { app, BrowserWindow, Menu } from 'electron'
import { registerProtocolHandlers, registerSchemes } from './protocols'
import { setupSecurity } from './security'
import { registerIpc } from './ipc-handlers'
import { ProjectService } from './services/project-service'
import { createMainWindow } from './windows'
import { TransitionRegistry } from './services/transition-registry'
import { IPC } from '@shared/ipc'
import { ExportService } from './services/export-service'

// userData = %APPDATA%/Viditor (Windows) · ~/.config/Viditor (Linux): ahí viven las transiciones del usuario
app.setName('Viditor')
registerSchemes()

const projects = new ProjectService()
const registry = new TransitionRegistry(projects)
const exporter = new ExportService(projects)

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    setupSecurity()
    registerProtocolHandlers(projects)
    registerIpc(projects, registry, exporter)
    const win = createMainWindow()
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
