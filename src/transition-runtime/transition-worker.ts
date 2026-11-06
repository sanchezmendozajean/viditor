/// <reference lib="webworker" />
/**
 * Web Worker de una definición de transición (specs/05 §Sandbox). Aquí se evalúa el código del usuario:
 * se retiran del ámbito global la red, el almacenamiento, los workers y las fuentes de no determinismo,
 * y el CSP del propio archivo es `default-src 'none'`.
 */
import { TransitionError, TransitionInstance, readMeta } from './runtime'
import type { ErrorInfo, FromWorker, ToWorker } from './worker-protocol'

// Capturas antes de neutralizar el ámbito global
const post = self.postMessage.bind(self) as (m: FromWorker) => void
const now = performance.now.bind(performance)

const BLOCKED = [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'Worker', 'SharedWorker',
  'BroadcastChannel', 'navigator', 'localStorage', 'sessionStorage'
]
for (const name of BLOCKED) {
  try {
    Object.defineProperty(self, name, { value: undefined, configurable: false, writable: false })
  } catch {
    /* algunas propiedades no se pueden redefinir: el CSP las bloquea igualmente */
  }
}
try {
  Object.defineProperty(self, 'postMessage', { value: undefined, configurable: false, writable: false })
} catch {
  /* idem */
}
Math.random = () => {
  throw new TransitionError('Math.random está deshabilitado: usa ctx.random() para tener resultados deterministas.')
}
Object.defineProperty(self, 'Date', {
  value: function Date() {
    throw new TransitionError('Date está deshabilitado en las transiciones.')
  },
  configurable: false,
  writable: false
})

const instances = new Map<string, TransitionInstance>()

function errInfo(e: unknown): ErrorInfo {
  if (e instanceof TransitionError) return { message: e.message, line: e.line, col: e.col, phase: e.phase }
  return { message: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }
}

/** Limita el volumen de logs: 200 líneas por segundo en total. */
let logWindow = 0
let logCount = 0
function makeLog(key?: string): (...a: unknown[]) => void {
  return (...args) => {
    const t = now()
    if (t - logWindow > 1000) {
      logWindow = t
      logCount = 0
    }
    if (++logCount > 200) {
      if (logCount === 201) post({ t: 'log', key, text: '⚠ log(): se superó el límite de 200 líneas por segundo; se omiten las siguientes.' })
      return
    }
    post({
      t: 'log',
      key,
      text: args
        .map((a) => {
          if (typeof a === 'string') return a
          try {
            return JSON.stringify(a)
          } catch {
            return String(a)
          }
        })
        .join(' ')
    })
  }
}

self.addEventListener('message', (ev: MessageEvent<ToWorker>) => {
  const m = ev.data
  switch (m.t) {
    case 'load': {
      try {
        post({ t: 'loaded', id: m.id, meta: readMeta(m.source) })
      } catch (e) {
        post({ t: 'loaded', id: m.id, error: errInfo(e) })
      }
      break
    }
    case 'create': {
      const t0 = now()
      try {
        const inst = new TransitionInstance(m.source, m.config, { log: makeLog(m.key) })
        inst.init()
        instances.set(m.key, inst)
        post({ t: 'created', id: m.id, ms: now() - t0 })
      } catch (e) {
        post({ t: 'created', id: m.id, error: errInfo(e), ms: now() - t0 })
      }
      break
    }
    case 'render': {
      const inst = instances.get(m.key)
      if (!inst) {
        post({ t: 'rendered', id: m.id, error: { message: 'La instancia no existe (se recreó la transición).' }, ms: 0 })
        break
      }
      const t0 = now()
      try {
        const dl = inst.render(m.progress, m.frame, m.totalFrames)
        post({ t: 'rendered', id: m.id, dl, ms: now() - t0 })
      } catch (e) {
        post({ t: 'rendered', id: m.id, error: errInfo(e), ms: now() - t0 })
      }
      break
    }
    case 'dispose':
      instances.delete(m.key)
      break
  }
})

post({ t: 'ready' })
