import type { MediaItem } from '@shared/project-schema'

export interface SourceEntry {
  clipId: string
  mediaId: string
  kind: 'video' | 'audio' | 'image'
  /** <video> también para audio: así el mismo elemento da imagen y sonido */
  el: HTMLVideoElement | HTMLImageElement
  url: string
  lastUsed: number
  /** Ya se posicionó en el punto de entrada (precarga) */
  primed: boolean
  /** Hay un arranque de reproducción en curso (seek + play) */
  starting?: boolean
  /** Lo que tardó la última búsqueda (s): sirve para buscar por delante del reloj */
  seekLatency?: number
}

/**
 * Pool de elementos multimedia, uno por clip activo (specs/02 §Fuentes de frames).
 * Usa el proxy H.264 cuando existe; los originales nunca se modifican.
 */
export class SourceProvider {
  private entries = new Map<string, SourceEntry>()
  /** Se llama al crear un elemento de audio/vídeo (para conectarlo al grafo de audio). */
  onCreate: ((e: SourceEntry) => void) | null = null
  onDispose: ((e: SourceEntry) => void) | null = null

  constructor(private readonly maxEntries = 10) {}

  get all(): SourceEntry[] {
    return [...this.entries.values()]
  }

  has(clipId: string): boolean {
    return this.entries.has(clipId)
  }

  urlFor(m: MediaItem): string {
    return window.viditor.media.sourceUrl(m.id, Boolean(m.proxy))
  }

  acquire(clipId: string, m: MediaItem): SourceEntry {
    const url = this.urlFor(m)
    const existing = this.entries.get(clipId)
    if (existing && existing.url === url) {
      existing.lastUsed = performance.now()
      return existing
    }
    if (existing) this.dispose(clipId) // cambió el medio o apareció su proxy
    let el: HTMLVideoElement | HTMLImageElement
    if (m.kind === 'image') {
      el = new Image()
      el.crossOrigin = 'anonymous'
      el.src = url
    } else {
      const v = document.createElement('video')
      v.crossOrigin = 'anonymous'
      v.preload = 'auto'
      v.playsInline = true
      v.src = url
      el = v
    }
    const entry: SourceEntry = { clipId, mediaId: m.id, kind: m.kind, el, url, lastUsed: performance.now(), primed: false }
    this.entries.set(clipId, entry)
    this.onCreate?.(entry)
    this.evict(clipId)
    return entry
  }

  /** Mantiene el pool acotado descartando los menos usados recientemente. */
  private evict(keep: string): void {
    if (this.entries.size <= this.maxEntries) return
    const old = [...this.entries.values()].filter((e) => e.clipId !== keep).sort((a, b) => a.lastUsed - b.lastUsed)
    for (const e of old.slice(0, this.entries.size - this.maxEntries)) this.dispose(e.clipId)
  }

  dispose(clipId: string): void {
    const e = this.entries.get(clipId)
    if (!e) return
    this.onDispose?.(e)
    if (e.el instanceof HTMLVideoElement) {
      e.el.pause()
      e.el.removeAttribute('src')
      e.el.load()
    }
    this.entries.delete(clipId)
  }

  /** Descarta los elementos de clips que ya no existen. */
  retain(existingClipIds: Set<string>): void {
    for (const id of [...this.entries.keys()]) if (!existingClipIds.has(id)) this.dispose(id)
  }

  pauseAll(): void {
    for (const e of this.entries.values()) if (e.el instanceof HTMLVideoElement && !e.el.paused) e.el.pause()
  }

  disposeAll(): void {
    for (const id of [...this.entries.keys()]) this.dispose(id)
  }
}

/** Posiciona un vídeo y espera a que el frame esté disponible (o vence el tiempo). */
export function seekTo(el: HTMLVideoElement, time: number, timeoutMs = 600): Promise<void> {
  const dur = Number.isFinite(el.duration) ? el.duration : Infinity
  const target = Math.max(0, Math.min(time, dur - 0.001))
  if (el.readyState >= 2 && !el.seeking && Math.abs(el.currentTime - target) < 0.0005) return Promise.resolve()
  return new Promise((resolve) => {
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      el.removeEventListener('seeked', finish)
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(finish, timeoutMs)
    el.addEventListener('seeked', finish)
    el.currentTime = target
  })
}

/** ¿El elemento ya tiene un frame dibujable? */
export function isReady(el: HTMLVideoElement | HTMLImageElement): boolean {
  return el instanceof HTMLImageElement ? el.complete && el.naturalWidth > 0 : el.readyState >= 2
}
