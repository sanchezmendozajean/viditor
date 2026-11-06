import { app, BrowserWindow, Menu } from 'electron'
import { registerProtocolHandlers, registerSchemes } from './protocols'
import { setupSecurity } from './security'
import { registerIpc } from './ipc-handlers'
import { ProjectService } from './services/project-service'
import { createMainWindow } from './windows'
import { TransitionRegistry } from './services/transition-registry'
import { IPC } from '@shared/ipc'

// userData = %APPDATA%/Viditor (Windows) · ~/.config/Viditor (Linux): ahí viven las transiciones del usuario
app.setName('Viditor')
registerSchemes()

const projects = new ProjectService()
const registry = new TransitionRegistry(projects)

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
    registerIpc(projects, registry)
    const win = createMainWindow()
    registry.onChange = (list) => {
      if (!win.isDestroyed()) win.webContents.send(IPC.transitionsChanged, list)
    }
    void registry.watch()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    void registry.dispose()
    app.quit()
  })
}
