import { app, BrowserWindow, Menu } from 'electron'
import { registerProtocolHandlers, registerSchemes } from './protocols'
import { setupSecurity } from './security'
import { registerIpc } from './ipc-handlers'
import { ProjectService } from './services/project-service'
import { createMainWindow } from './windows'

registerSchemes()

const projects = new ProjectService()

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
    registerIpc(projects)
    createMainWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('window-all-closed', () => app.quit())
}
