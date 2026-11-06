import { app, session, shell, type BrowserWindow, type Session } from 'electron'

/** CSP de producción de la app (specs/02 §Autocontenido). */
export const APP_CSP =
  "default-src 'self' viditor-media: viditor-docs:; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob: viditor-media:; media-src 'self' blob: viditor-media:; font-src 'self'; " +
  "connect-src 'self'; worker-src 'self' blob:; frame-src 'none'"

/**
 * Worker de transiciones: ejecuta código del usuario con `new Function` (necesita 'unsafe-eval') pero no puede
 * tocar la red: default-src 'none' bloquea fetch, XHR, WebSocket, imágenes, etc.
 */
export const TRANSITION_WORKER_CSP = "default-src 'none'; script-src 'self' 'unsafe-eval'"

/** La documentación de VitePress incluye un script inline mínimo (tema oscuro/claro). */
export const DOCS_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; media-src 'self'; font-src 'self'; connect-src 'self'; frame-src 'none'"

/** Peticiones de red canceladas; el test e2e "sin red" falla si hay alguna. */
export const blockedRequests: string[] = []
;(globalThis as { __viditorBlockedRequests?: string[] }).__viditorBlockedRequests = blockedRequests

const devOrigin = (): string | null => {
  if (app.isPackaged) return null
  const url = process.env['ELECTRON_RENDERER_URL']
  return url ? new URL(url).origin : null
}

function isDevTraffic(url: URL): boolean {
  const origin = devOrigin()
  if (!origin) return false
  const o = new URL(origin)
  return url.hostname === o.hostname && url.port === o.port
}

export function lockDownSession(ses: Session): void {
  ses.webRequest.onBeforeRequest((details, callback) => {
    let url: URL | null = null
    try {
      url = new URL(details.url)
    } catch {
      /* URL inválida: se deja pasar, no es red */
    }
    const isNet = url && /^(https?|wss?|ftp):$/.test(url.protocol)
    if (url && isNet && !isDevTraffic(url)) {
      blockedRequests.push(details.url)
      if (!app.isPackaged) console.warn('[red bloqueada]', details.url)
      callback({ cancel: true })
      return
    }
    callback({})
  })

  ses.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders }
    let csp: string | null = null
    if (details.url.startsWith('viditor-docs:')) csp = DOCS_CSP
    else if (/^viditor-app:\/\/app\/assets\/transition-worker[^/]*\.js/.test(details.url)) csp = TRANSITION_WORKER_CSP
    else if (!devOrigin()) csp = APP_CSP
    if (csp) {
      for (const k of Object.keys(headers)) if (k.toLowerCase() === 'content-security-policy') delete headers[k]
      headers['Content-Security-Policy'] = [csp]
    }
    callback({ responseHeaders: headers })
  })

  ses.setPermissionRequestHandler((_wc, _permission, cb) => cb(false))
}

/** Deniega navegación y ventanas nuevas; los enlaces externos se abren solo desde un clic del usuario vía IPC. */
export function hardenWindow(win: BrowserWindow, allowedProtocolPrefix: string): void {
  const wc = win.webContents
  wc.on('will-navigate', (event, url) => {
    const dev = devOrigin()
    if (url.startsWith(allowedProtocolPrefix) || (dev && url.startsWith(dev))) return
    event.preventDefault()
  })
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
}

export function openExternalFromUserClick(url: string): void {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
}

export function setupSecurity(): void {
  lockDownSession(session.defaultSession)
}
