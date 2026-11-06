import { existsSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'
import { resourcePath } from './services/paths'
import type { ProjectService } from './services/project-service'

/** Debe llamarse antes de `app.whenReady()`. */
export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'viditor-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: false } },
    { scheme: 'viditor-docs', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: false } }
  ])
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4'
}

function fileResponse(file: string, request?: Request, cors = false): Promise<Response> {
  // Se reenvían las cabeceras (Range) para que <video> pueda buscar dentro del archivo.
  const init = request ? { headers: request.headers } : undefined
  return net.fetch(pathToFileURL(file).toString(), init).then((res) => {
    const type = MIME[extname(file).toLowerCase()]
    const headers = new Headers(res.headers)
    if (type) headers.set('content-type', type)
    // CORS: sin él, WebGL no puede subir el vídeo como textura (origen cruzado).
    if (cors) headers.set('access-control-allow-origin', '*')
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
  })
}

function notFound(): Response {
  return new Response('No encontrado', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

/** Devuelve la ruta solo si queda dentro de `root` (anti path traversal). */
function safeJoin(root: string, rel: string): string | null {
  const target = normalize(join(root, rel))
  const base = normalize(root)
  return target === base || target.startsWith(base + sep) ? target : null
}

export function registerProtocolHandlers(projects: ProjectService): void {
  // viditor-media://thumb/<mediaId>.jpg → .viditor/cache/thumbs/<mediaId>.jpg del proyecto abierto
  protocol.handle('viditor-media', (request) => {
    const url = new URL(request.url)
    const dir = projects.dir
    if (!dir) return notFound()
    if (url.hostname === 'file' || url.hostname === 'proxy') {
      const id = decodeURIComponent(url.pathname.replace(/^\//, ''))
      const entry = projects.mediaIndex.get(id)
      if (!entry) return notFound()
      const rel = url.hostname === 'proxy' ? (entry.proxy ?? `.viditor/cache/proxies/${id}.mp4`) : entry.path
      const file = projects.resolveMediaPath(dir, rel)
      return existsSync(file) ? fileResponse(file, request, true) : notFound()
    }
    if (url.hostname === 'thumb') {
      const id = decodeURIComponent(url.pathname.replace(/^\//, '')).replace(/\.jpg$/, '')
      if (!/^m_[0-9A-Za-z]+$/.test(id)) return notFound()
      const file = join(dir, '.viditor', 'cache', 'thumbs', `${id}.jpg`)
      return existsSync(file) ? fileResponse(file, undefined, true) : notFound()
    }
    return notFound()
  })

  // viditor-docs://docs/<ruta> → resources/docs/<ruta> (VitePress, cleanUrls)
  protocol.handle('viditor-docs', (request) => {
    const root = resourcePath('docs')
    const url = new URL(request.url)
    let rel = decodeURIComponent(url.pathname)
    if (rel.endsWith('/')) rel += 'index.html'
    let file = safeJoin(root, rel)
    if (!file) return notFound()
    if (!extname(file)) file += '.html'
    if (existsSync(file) && statSync(file).isFile()) return fileResponse(file)
    const fallback = safeJoin(root, '404.html')
    return fallback && existsSync(fallback) ? fileResponse(fallback) : notFound()
  })
}
