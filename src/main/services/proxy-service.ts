import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { MediaItem } from '@shared/project-schema'
import { JobQueue, makeProxy, needsProxy } from './media-service'
import type { ProjectService } from './project-service'

export const proxyRel = (mediaId: string): string => `.viditor/cache/proxies/${mediaId}.mp4`

/**
 * Genera (en cola) los proxies H.264 de los medios que Chromium no reproduce bien y avisa al renderer
 * cuando cada uno está listo. Si el proxy ya existe en disco solo se notifica.
 */
export function ensureProxies(
  projects: ProjectService,
  dir: string,
  items: Pick<MediaItem, 'id' | 'kind' | 'path' | 'probe'>[],
  queue: JobQueue,
  notify: (mediaId: string, relPath: string) => void
): void {
  for (const m of items) {
    if (!needsProxy(m)) continue
    const rel = proxyRel(m.id)
    const out = join(dir, rel)
    if (existsSync(out)) {
      notify(m.id, rel)
      continue
    }
    const src = projects.resolveMediaPath(dir, m.path)
    if (!existsSync(src)) continue
    const name = m.path.split('/').pop() ?? m.path
    queue
      .run(`proxy:${m.id}`, `Generando proxy de ${name}`, (progress) => makeProxy(src, out, m.probe?.duration ?? 0, progress))
      .then(() => notify(m.id, rel))
      .catch(() => undefined)
  }
}
