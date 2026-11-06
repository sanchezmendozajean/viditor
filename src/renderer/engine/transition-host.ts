import type { DisplayList } from '@shared/display-list'
import type { TransitionOp } from '@shared/render-model'
import TransitionWorker from '../../transition-runtime/transition-worker?worker'
import type { ErrorInfo, FromWorker, ToWorker } from '../../transition-runtime/worker-protocol'
import type { RuntimeConfig, TransitionMeta } from '../../transition-runtime/runtime'

export interface HostEvent {
  ref: string
  level: 'log' | 'warn' | 'error'
  text: string
  line?: number
}

export interface DefinitionInfo {
  ref: string
  meta?: TransitionMeta
  error?: ErrorInfo
  /** Motivo por el que se dejó de ejecutar (límites de tiempo); la transición se renderiza como corte seco */
  disabled?: string
}

interface Pending {
  resolve: (m: FromWorker) => void
  timer: ReturnType<typeof setTimeout>
}

interface Def {
  ref: string
  source: string
  version: number
  worker: Worker
  ready: Promise<void>
  pending: Map<number, Pending>
  instances: Map<string, Promise<boolean>>
  failed: Set<string>
  slowStreak: number
  info: DefinitionInfo
  avgMs: number
}

export const LIMITS = {
  preview: { init: 500, render: 50, hard: 2500 },
  export: { init: 2000, render: 2000, hard: 10000 }
}
const MAX_INSTANCES = 48
const CACHE_MAX = 700

let nextId = 1

/**
 * Gestiona un Web Worker por definición de transición (specs/05 §Sandbox): carga, instancias, display lists
 * con caché y límites de tiempo. Si una transición falla o se pasa de tiempo devuelve null y el compositor
 * dibuja un corte seco.
 */
export class TransitionHost {
  private defs = new Map<string, Def>()
  private cache = new Map<string, DisplayList>()
  mode: 'preview' | 'export' = 'preview'
  /** Notificaciones para la consola y el estado de las definiciones */
  onEvent: ((e: HostEvent) => void) | null = null
  onInfo: ((i: DefinitionInfo) => void) | null = null
  /** Duración media de render por referencia (ms) */
  stats = new Map<string, number>()

  private spawn(ref: string, source: string, version: number): Def {
    const worker = new TransitionWorker()
    let readyResolve: () => void = () => undefined
    const ready = new Promise<void>((r) => (readyResolve = r))
    const def: Def = {
      ref,
      source,
      version,
      worker,
      ready,
      pending: new Map(),
      instances: new Map(),
      failed: new Set(),
      slowStreak: 0,
      info: { ref },
      avgMs: 0
    }
    worker.onmessage = (ev: MessageEvent<FromWorker>) => {
      const m = ev.data
      if (m.t === 'ready') return readyResolve()
      if (m.t === 'log') return this.onEvent?.({ ref, level: 'log', text: m.text })
      const p = def.pending.get(m.id)
      if (p) {
        clearTimeout(p.timer)
        def.pending.delete(m.id)
        p.resolve(m)
      }
    }
    worker.onerror = (e) => this.onEvent?.({ ref, level: 'error', text: `Error del worker: ${e.message}` })
    return def
  }

  private send<T extends FromWorker>(def: Def, msg: ToWorker & { id: number }, hardMs: number): Promise<T | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        // Bucle infinito o código bloqueado: se termina el worker y la transición queda desactivada
        def.pending.delete(msg.id)
        this.kill(def, `Tiempo excedido (más de ${hardMs} ms): ¿hay un bucle infinito?`)
        resolve(null)
      }, hardMs)
      def.pending.set(msg.id, { resolve: (m) => resolve(m as T), timer })
      def.worker.postMessage(msg)
    })
  }

  private kill(def: Def, reason: string): void {
    def.worker.terminate()
    for (const p of def.pending.values()) {
      clearTimeout(p.timer)
      p.resolve({ t: 'rendered', id: -1, error: { message: reason }, ms: 0 })
    }
    def.pending.clear()
    def.info = { ...def.info, disabled: reason }
    this.onInfo?.(def.info)
    this.onEvent?.({ ref: def.ref, level: 'error', text: reason })
  }

  /** (Re)carga una definición: recrea su worker y descarta instancias y caché. Devuelve su estado. */
  async load(ref: string, source: string): Promise<DefinitionInfo> {
    this.unload(ref)
    const version = (this.defs.get(ref)?.version ?? 0) + 1
    const def = this.spawn(ref, source, version)
    this.defs.set(ref, def)
    await def.ready
    const id = nextId++
    const r = await this.send<Extract<FromWorker, { t: 'loaded' }>>(def, { t: 'load', id, source }, 5000)
    def.info = r?.t === 'loaded' ? { ref, meta: r.meta, error: r.error } : { ref, error: { message: 'El worker no respondió al cargar la transición.' } }
    if (def.info.error) this.onEvent?.({ ref, level: 'error', text: def.info.error.message, line: def.info.error.line })
    this.onInfo?.(def.info)
    return def.info
  }

  unload(ref: string): void {
    const d = this.defs.get(ref)
    if (!d) return
    d.worker.terminate()
    for (const p of d.pending.values()) clearTimeout(p.timer)
    this.defs.delete(ref)
    for (const k of [...this.cache.keys()]) if (k.startsWith(ref + '|')) this.cache.delete(k)
  }

  info(ref: string): DefinitionInfo | undefined {
    return this.defs.get(ref)?.info
  }

  private instanceKey(op: TransitionOp, env: Env, version: number): string {
    return `${op.ref}|${version}|${JSON.stringify([op.params, op.duration, op.seed, env.width, env.height, env.fps, Boolean(op.leave), Boolean(op.enter), op.transitionId])}`
  }

  /** Display list ya calculada (caché), sin esperar al worker. */
  peek(op: TransitionOp, env: Env): DisplayList | null {
    const def = this.defs.get(op.ref)
    if (!def) return null
    const key = this.instanceKey(op, env, def.version)
    const hit = this.cache.get(`${key}#${op.frame}`)
    if (hit) {
      this.cache.delete(`${key}#${op.frame}`)
      this.cache.set(`${key}#${op.frame}`, hit) // LRU
    }
    return hit ?? null
  }

  /** Calcula (o recupera de la caché) la display list de un frame. null = corte seco. */
  async displayList(op: TransitionOp, env: Env): Promise<DisplayList | null> {
    const def = this.defs.get(op.ref)
    if (!def || def.info.error || def.info.disabled) return null
    const key = this.instanceKey(op, env, def.version)
    const cached = this.peek(op, env)
    if (cached) return cached
    if (def.failed.has(key)) return null
    const lim = LIMITS[this.mode]

    let created = def.instances.get(key)
    if (!created) {
      created = this.createInstance(def, key, op, env, lim)
      def.instances.set(key, created)
      if (def.instances.size > MAX_INSTANCES) {
        const oldest = def.instances.keys().next().value as string
        def.instances.delete(oldest)
        def.worker.postMessage({ t: 'dispose', key: oldest } satisfies ToWorker)
      }
    }
    if (!(await created)) return null

    const id = nextId++
    const r = await this.send<Extract<FromWorker, { t: 'rendered' }>>(def, { t: 'render', id, key, progress: op.progress, frame: op.frame, totalFrames: op.totalFrames }, lim.hard)
    if (!r || r.error || !r.dl) {
      if (r?.error && r.id !== -1) {
        def.failed.add(key)
        this.onEvent?.({ ref: op.ref, level: 'error', text: r.error.message, line: r.error.line })
      }
      return null
    }
    // Estadística y límite blando de tiempo (solo en la vista previa)
    def.avgMs = def.avgMs === 0 ? r.ms : def.avgMs * 0.9 + r.ms * 0.1
    this.stats.set(op.ref, def.avgMs)
    if (this.mode === 'preview') {
      def.slowStreak = r.ms > lim.render ? def.slowStreak + 1 : 0
      if (def.slowStreak >= 3) {
        const reason = `render() superó ${lim.render} ms tres veces seguidas (${r.ms.toFixed(0)} ms): la transición se desactivó y se muestra un corte seco. Reduce el número de partes o figuras y recarga.`
        def.info = { ...def.info, disabled: reason }
        this.onInfo?.(def.info)
        this.onEvent?.({ ref: op.ref, level: 'warn', text: reason })
      }
    } else if (r.ms > lim.render) {
      throw new Error(`La transición "${op.ref}" tardó ${r.ms.toFixed(0)} ms en un frame (límite de exportación: ${lim.render} ms).`)
    }
    this.cache.set(`${key}#${op.frame}`, r.dl)
    if (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value as string)
    return r.dl
  }

  private async createInstance(def: Def, key: string, op: TransitionOp, env: Env, lim: { init: number; hard: number }): Promise<boolean> {
    const config: RuntimeConfig = {
      width: env.width,
      height: env.height,
      fps: env.fps,
      duration: op.duration,
      params: JSON.parse(JSON.stringify(op.params)) as Record<string, unknown>, // los proxies reactivos de Vue no se pueden enviar por postMessage
      seed: op.seed,
      hasLeave: Boolean(op.leave),
      hasEnter: Boolean(op.enter)
    }
    const id = nextId++
    const r = await this.send<Extract<FromWorker, { t: 'created' }>>(def, { t: 'create', id, key, source: def.source, config }, lim.hard)
    if (!r || r.error) {
      def.failed.add(key)
      if (r?.error) this.onEvent?.({ ref: op.ref, level: 'error', text: r.error.message, line: r.error.line })
      return false
    }
    if (r.ms > lim.init) {
      def.failed.add(key)
      this.onEvent?.({ ref: op.ref, level: 'warn', text: `init() tardó ${r.ms.toFixed(0)} ms (límite ${lim.init} ms).` })
      return false
    }
    return true
  }

  dispose(): void {
    for (const ref of [...this.defs.keys()]) this.unload(ref)
    this.cache.clear()
  }
}

export interface Env {
  width: number
  height: number
  fps: number
}

export const transitionHost = new TransitionHost()
