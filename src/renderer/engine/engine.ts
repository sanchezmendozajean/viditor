import { activeClipsAt, buildFrame, type DrawOp, type Frame, type TransitionOp } from '@shared/render-model'
import type { Clip, Project, Track } from '@shared/project-schema'
import { clipEnd, frameDuration } from '@shared/timeline-ops'
import { useProjectStore } from '@/stores/project'
import { useTimelineStore } from '@/stores/timeline'
import { QUALITY_SCALE, useTimelinePlayback, type Quality } from '@/stores/playback'
import { AudioGraph } from './audio'
import { Compositor } from './compositor'
import { rasterize, setFontLoadedHandler } from './layer-raster'
import { isReady, seekTo, SourceProvider, type SourceEntry } from './sources'
import { transitionHost, type Env } from './transition-host'
import { useTransitionsStore } from '@/stores/transitions'

/** Todas las capas de clip de un frame, incluidas las dos de cada transición. */
function clipLayers(frame: Frame): DrawOp[] {
  const out: DrawOp[] = []
  for (const op of frame.ops) {
    if (op.kind === 'transition') {
      if (op.leave) out.push(op.leave)
      if (op.enter) out.push(op.enter)
    } else out.push(op)
  }
  return out
}

const PREWARM_S = 1.5
/** Espera máxima de una búsqueda al pausar/arrastrar: con fotogramas clave muy separados puede tardar más de un segundo. */
const PAUSED_SEEK_MS = 8000

/**
 * Motor de vista previa: reloj de reproducción (FrameScheduler), fuentes, compositor y audio.
 * Pausado: cada frame se busca con precisión (scrubbing). Reproduciendo: los elementos de vídeo
 * corren solos y el motor corrige su deriva contra el reloj.
 */
export class Engine {
  private compositor: Compositor | null = null
  private canvas: HTMLCanvasElement | null = null
  private sources = new SourceProvider()
  private audio = new AudioGraph()
  private raf = 0
  private pendingRender = false
  private token = 0
  private t0 = 0
  private clock0 = 0
  private busy = false
  private meterTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.sources.onCreate = (e) => {
      this.audio.attach(e)
      const redraw = (): void => this.requestRender()
      e.el.addEventListener(e.el instanceof HTMLImageElement ? 'load' : 'loadeddata', redraw)
      // Una búsqueda lenta (GOP largo) puede terminar después de dibujar: al acabar se redibuja el cuadro pausado.
      if (e.el instanceof HTMLVideoElement) {
        let last = 0
        e.el.addEventListener('seeked', () => {
          const now = performance.now()
          if (now - last < 120) return // evita bucles: cada redibujado puede pedir una búsqueda
          last = now
          redraw()
        })
      }
    }
    this.sources.onDispose = (e) => this.audio.detach(e)
    setFontLoadedHandler(() => this.requestRender())
  }

  private get project(): Project | null {
    return useProjectStore().project
  }

  // ───────── Vida del monitor ─────────

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas
    this.compositor = new Compositor(canvas)
    this.applySize()
    if (!this.meterTimer) this.meterTimer = setInterval(() => this.pollMeters(), 40)
    this.requestRender()
  }

  detach(): void {
    this.compositor = null
    this.canvas = null
  }

  /** Libera todo al cerrar el proyecto. */
  reset(): void {
    this.pause()
    this.sources.disposeAll()
    this.compositor = null
    if (this.meterTimer) clearInterval(this.meterTimer)
    this.meterTimer = null
  }

  applySize(full = false): void {
    const p = this.project
    if (!p || !this.compositor) return
    const q = full ? 1 : QUALITY_SCALE[useTimelinePlayback().quality]
    this.compositor.resize(p.settings.width * q, p.settings.height * q)
  }

  setQuality(q: Quality): void {
    useTimelinePlayback().quality = q
    this.applySize()
    this.requestRender()
  }

  private pollMeters(): void {
    const m = this.audio.meters()
    if (m) useTimelinePlayback().meters = m
  }

  // ───────── Dibujo ─────────

  /** Pide un redibujado (con precisión de frame) si no se está reproduciendo. */
  requestRender(): void {
    if (useTimelinePlayback().playing || this.pendingRender) return
    this.pendingRender = true
    requestAnimationFrame(() => {
      this.pendingRender = false
      void this.renderPaused()
    })
  }

  private entryFor(clip: Clip): SourceEntry | null {
    if (clip.generator) return null // texto/forma: se dibuja en un canvas, no hay elemento multimedia
    const m = this.project?.media.find((x) => x.id === clip.mediaId)
    return m ? this.sources.acquire(clip.id, m) : null
  }

  private draw(frame: Frame): void {
    const comp = this.compositor
    if (!comp) return
    const env = this.env()
    comp.draw(
      frame,
      (op) => {
        if (op.generator) return rasterize(op.generator)
        const e = this.sources.all.find((x) => x.clipId === op.clipId)
        return e && isReady(e.el) ? e.el : null
      },
      (op) => (env ? transitionHost.peek(op, env) : null)
    )
    comp.prune(new Set(clipLayers(frame).map((o) => o.clipId)))
  }

  /** ¿Todos los videos/imágenes visibles tienen ya un fotograma dibujable? (un elemento con error cuenta como listo) */
  private layersReady(frame: Frame): boolean {
    for (const op of clipLayers(frame)) {
      const e = this.sources.all.find((x) => x.clipId === op.clipId)
      if (e && !isReady(e.el) && !(e.el instanceof HTMLVideoElement && e.el.error)) return false
    }
    return true
  }

  /** Frame exacto en `t` (pausa, scrubbing, marcha atrás). La última petición gana. */
  private async renderAt(t: number): Promise<void> {
    const p = this.project
    if (!p) return
    const my = ++this.token
    this.sources.retain(new Set(p.clips.map((c) => c.id)))
    const frame = buildFrame(p, t)
    const clipById = new Map(p.clips.map((c) => [c.id, c]))
    const waits: Promise<void>[] = []
    for (const op of clipLayers(frame)) {
      const clip = clipById.get(op.clipId)
      const e = clip ? this.entryFor(clip) : null
      if (e && e.el instanceof HTMLVideoElement) waits.push(seekTo(e.el, op.sourceTime, PAUSED_SEEK_MS))
    }
    await Promise.all(waits)
    // Las display lists de las transiciones las calcula el worker (con caché): se esperan antes de dibujar
    const env = this.env()
    if (env) await Promise.all(frame.ops.filter((o): o is TransitionOp => o.kind === 'transition').map((o) => transitionHost.displayList(o, env)))
    if (my !== this.token) return
    this.draw(frame)
  }

  private async renderPaused(): Promise<void> {
    const p = this.project
    if (!p) return
    this.sources.pauseAll()
    this.applySize(true) // al pausar se renderiza a calidad completa
    await this.renderAt(useTimelineStore().playhead)
  }

  /**
   * PNG del frame del cabezal con el mismo compositor, a la resolución del proyecto y calidad completa.
   * La captura se hace en la misma tarea que el dibujo (el lienzo WebGL no conserva su búfer).
   */
  async snapshotPng(): Promise<Blob | null> {
    if (!this.project || !this.compositor || !this.canvas) return null
    this.pause()
    this.applySize(true)
    await this.renderAt(useTimelineStore().playhead)
    const canvas = this.canvas
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
  }

  // ───────── Reproducción ─────────

  async play(rate = 1): Promise<void> {
    const p = this.project
    const pb = useTimelinePlayback()
    const tl = useTimelineStore()
    if (!p) return
    await this.audio.resume()
    if (rate > 0 && tl.playhead >= tl.duration - 1e-6) tl.setPlayheadRaw(0)
    if (rate < 0 && tl.playhead <= 0) tl.setPlayheadRaw(tl.duration)
    pb.rate = rate
    this.t0 = tl.playhead
    this.clock0 = performance.now()
    this.sources.pauseAll()
    this.applySize()
    if (!pb.playing) {
      pb.playing = true
      this.raf = requestAnimationFrame(this.tick)
    }
  }

  pause(): void {
    const pb = useTimelinePlayback()
    const tl = useTimelineStore()
    if (!pb.playing) return
    pb.playing = false
    cancelAnimationFrame(this.raf)
    this.sources.pauseAll()
    if (this.project) tl.setPlayhead(tl.playhead)
    this.requestRender()
  }

  /**
   * Mueve el cabezal a `t`. Si se está reproduciendo, la reproducción continúa desde ese punto
   * (se reancla el reloj y se re-sincronizan los medios); si está en pausa, solo se renderiza el frame.
   */
  seek(t: number): void {
    const tl = useTimelineStore()
    tl.setPlayhead(t)
    if (!useTimelinePlayback().playing) return
    this.t0 = tl.playhead
    this.clock0 = performance.now()
    this.sources.pauseAll()
  }

  toggle(): void {
    if (useTimelinePlayback().playing) this.pause()
    else void this.play(1)
  }

  /** L / J: acelera hacia delante / atrás (×1, ×2, ×4). K pausa. */
  shuttle(dir: 1 | -1): void {
    const pb = useTimelinePlayback()
    const cur = pb.playing ? pb.rate : 0
    let next: number
    if (cur === 0 || Math.sign(cur) !== dir) next = dir
    else next = Math.min(4, Math.abs(cur) * 2) * dir
    void this.play(next)
  }

  private tick = (): void => {
    const pb = useTimelinePlayback()
    const tl = useTimelineStore()
    const p = this.project
    if (!pb.playing || !p) return
    const now = performance.now()
    let t = this.t0 + ((now - this.clock0) / 1000) * pb.rate
    const dur = tl.duration
    if (pb.rate > 0 && t >= dur) {
      if (pb.loop && dur > 0) {
        t = 0
        this.t0 = 0
        this.clock0 = now
        this.sources.pauseAll()
      } else {
        tl.setPlayheadRaw(dur)
        this.pause()
        return
      }
    } else if (pb.rate < 0 && t <= 0) {
      tl.setPlayheadRaw(0)
      this.pause()
      return
    }
    tl.setPlayheadRaw(t)

    const frame = buildFrame(p, t)
    const active = activeClipsAt(p, t)
    const activeMap = new Map<string, { clip: Clip; track: Track }>()
    for (const a of active) activeMap.set(a.clip.id, a)
    this.sources.retain(new Set(p.clips.map((c) => c.id)))

    if (pb.rate > 0) {
      for (const { clip } of active) this.syncPlaying(clip, t, pb.rate)
      this.prewarm(p, t)
    } else if (!this.busy) {
      // Marcha atrás: los elementos no pueden reproducir al revés; se busca frame a frame sin audio.
      this.busy = true
      void this.renderAt(t).finally(() => (this.busy = false))
    }
    this.audio.update(p, t, pb.rate > 0 ? activeMap : new Map(), useTransitionsStore().modeOf)
    if (pb.rate > 0) {
      this.prefetchTransitions(p, t, frame)
      // Si algún video activo aún está buscando (no tiene fotograma), se conserva el último cuadro en vez de dibujar en blanco.
      if (this.layersReady(frame)) this.draw(frame)
    }
    this.raf = requestAnimationFrame(this.tick)
  }

  /**
   * Mantiene un clip activo reproduciéndose y alineado con el reloj. Buscar puede tardar (GOP largo): se aprende cuánto
   * y se busca ese tiempo por delante, y nunca se reinicia una búsqueda en curso (si no, no terminaría jamás).
   */
  private syncPlaying(clip: Clip, t: number, rate: number): void {
    const e = this.entryFor(clip)
    if (!e || !(e.el instanceof HTMLVideoElement)) return
    const el = e.el
    const desired = clip.in + (t - clip.start) * clip.speed
    const seekAhead = (): void => {
      const started = performance.now()
      el.addEventListener(
        'seeked',
        () => {
          e.seekLatency = Math.min(4, (performance.now() - started) / 1000)
        },
        { once: true }
      )
      el.currentTime = Math.max(0, desired + (e.seekLatency ?? 0.2) * rate * clip.speed)
    }
    if (el.paused) {
      if (e.starting) return
      e.starting = true
      el.playbackRate = rate
      seekAhead()
      el.play()
        .catch(() => undefined)
        .finally(() => (e.starting = false))
      return
    }
    if (el.playbackRate !== rate) el.playbackRate = rate
    if (el.seeking) return
    // Con búsquedas lentas se tolera más desfase: reiniciar la búsqueda a cada instante dejaría el video siempre en blanco.
    if (Math.abs(el.currentTime - desired) > Math.max(0.25, (e.seekLatency ?? 0) * 1.5)) seekAhead()
  }

  /** Deja listos los clips que empiezan pronto para que el corte sea limpio. */
  private prewarm(p: Project, t: number): void {
    for (const c of p.clips) {
      if (!c.enabled || c.start <= t || c.start > t + PREWARM_S) continue
      if (clipEnd(c) <= t) continue
      const e = this.entryFor(c)
      if (e && !e.primed && e.el instanceof HTMLVideoElement) {
        e.primed = true
        void seekTo(e.el, c.in, 500)
      }
    }
  }

  // ───────── Transiciones ─────────

  private env(): Env | null {
    const p = this.project
    return p ? { width: p.settings.width, height: p.settings.height, fps: p.settings.fps.num / p.settings.fps.den } : null
  }

  /**
   * Durante la reproducción las display lists se piden con antelación (los 4 frames siguientes) y las
   * que faltan en el frame actual se solicitan ya: el worker responde antes del siguiente dibujo.
   */
  private prefetchTransitions(p: Project, t: number, frame: Frame): void {
    const env = this.env()
    if (!env || p.transitions.length === 0) return
    for (const op of frame.ops) if (op.kind === 'transition' && !transitionHost.peek(op, env)) void transitionHost.displayList(op, env)
    const fd = 1 / env.fps
    for (let k = 1; k <= 4; k++) {
      for (const op of buildFrame(p, t + k * fd).ops) {
        if (op.kind === 'transition' && !transitionHost.peek(op, env)) void transitionHost.displayList(op, env)
      }
    }
  }

  // ───────── Utilidades ─────────

  /** Un frame atrás / adelante estando en pausa. */
  step(frames: number): void {
    const p = this.project
    if (!p) return
    this.pause()
    const tl = useTimelineStore()
    tl.setPlayhead(tl.playhead + frames * frameDuration(p))
  }
}

export const engine = new Engine()
