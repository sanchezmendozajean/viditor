import { defineStore } from 'pinia'
import type { TransitionFile, TransitionOrigin } from '@shared/ipc'
import type { TransitionMeta } from '../../transition-runtime/runtime'
import { transitionHost, type DefinitionInfo, type HostEvent } from '@/engine/transition-host'
import { engine } from '@/engine/engine'
import { useUiStore } from './ui'

export interface ConsoleEntry {
  id: number
  ref: string
  level: 'log' | 'warn' | 'error'
  text: string
  line?: number
  time: number
}

export const DEFAULT_TRANSITION = 'builtin:crossfade'

let consoleId = 1
let started = false

export const useTransitionsStore = defineStore('transitions', {
  state: () => ({
    files: [] as TransitionFile[],
    infos: {} as Record<string, DefinitionInfo>,
    console: [] as ConsoleEntry[],
    /** Último error de ejecución (init/render) de cada transición; se borra al recargarla */
    runtimeErrors: {} as Record<string, string>,
    /** Transición abierta en el editor */
    editing: null as string | null,
    /** Se incrementa cuando cambia el código de alguna transición (recarga en caliente) */
    version: 0,
    defaultRef: DEFAULT_TRANSITION
  }),

  getters: {
    fileOf(): (ref: string) => TransitionFile | undefined {
      return (ref) => this.files.find((f) => f.ref === ref)
    },
    metaOf(): (ref: string) => TransitionMeta | undefined {
      return (ref) => this.infos[ref]?.meta
    },
    errorOf(): (ref: string) => string | undefined {
      return (ref) => this.infos[ref]?.error?.message ?? this.infos[ref]?.disabled ?? this.runtimeErrors[ref]
    },
    nameOf(): (ref: string) => string {
      return (ref) => this.infos[ref]?.meta?.name ?? ref.split(':')[1] ?? ref
    },
    /** Modo de audio por defecto de una transición (meta.audio) */
    modeOf(): (ref: string) => 'crossfade' | 'cut' | 'none' | undefined {
      return (ref) => this.infos[ref]?.meta?.audio
    },
    exists(): (ref: string) => boolean {
      return (ref) => this.files.some((f) => f.ref === ref)
    },
    categories(): { name: string; items: TransitionFile[] }[] {
      const order = ['Fundidos', 'Deslizar', 'Barridos', 'Formas', 'Geométricas', 'Personalizadas']
      const groups = new Map<string, TransitionFile[]>()
      for (const f of this.files) {
        const cat = this.infos[f.ref]?.meta?.category ?? 'Personalizadas'
        groups.set(cat, [...(groups.get(cat) ?? []), f])
      }
      return [...groups.entries()]
        .sort(([a], [b]) => (order.indexOf(a) + 100) % 100 - ((order.indexOf(b) + 100) % 100) || a.localeCompare(b))
        .map(([name, items]) => ({ name, items }))
    }
  },

  actions: {
    log(e: HostEvent): void {
      if (e.level === 'error') this.runtimeErrors[e.ref] = e.text
      this.console.push({ id: consoleId++, time: Date.now(), ...e })
      if (this.console.length > 500) this.console.splice(0, this.console.length - 500)
    },
    clearConsole(): void {
      this.console = []
    },

    /** Arranca la vigilancia de archivos y carga las definiciones. Idempotente. */
    async start(): Promise<void> {
      if (started) return
      started = true
      transitionHost.onEvent = (e) => this.log(e)
      transitionHost.onInfo = (i) => {
        this.infos[i.ref] = i
      }
      window.viditor.transitions.onChanged((list) => void this.sync(list))
      await this.sync(await window.viditor.transitions.list())
    },

    /** Recarga en caliente: reevalúa solo los archivos nuevos o cambiados. */
    async sync(list: TransitionFile[]): Promise<void> {
      const old = new Map(this.files.map((f) => [f.ref, f]))
      const gone = [...old.keys()].filter((r) => !list.some((f) => f.ref === r))
      for (const ref of gone) {
        transitionHost.unload(ref)
        delete this.infos[ref]
      }
      this.files = list
      const changed = list.filter((f) => old.get(f.ref)?.source !== f.source)
      await Promise.all(
        changed.map(async (f) => {
          delete this.runtimeErrors[f.ref]
          const info = await transitionHost.load(f.ref, f.source)
          this.infos[f.ref] = info
          const meta = info.meta
          if (meta && meta.id !== f.id) {
            const msg = `meta.id ("${meta.id}") debe coincidir con el nombre del archivo ("${f.id}").`
            this.infos[f.ref] = { ...info, error: { message: msg, phase: 'load' } }
            this.log({ ref: f.ref, level: 'error', text: msg })
          } else if (old.has(f.ref) && !info.error) {
            this.log({ ref: f.ref, level: 'log', text: 'Recargada.' })
          }
        })
      )
      if (changed.length || gone.length) {
        this.version++
        engine.requestRender()
      }
    },

    async save(ref: string, source: string): Promise<boolean> {
      const r = await window.viditor.transitions.save(ref, source)
      if (!r.ok) {
        useUiStore().showError(r.error)
        return false
      }
      return true
    },
    async create(): Promise<string | null> {
      const r = await window.viditor.transitions.create()
      if (!r.ok) {
        useUiStore().showError(r.error)
        return null
      }
      await this.sync(await window.viditor.transitions.list())
      this.editing = r.value.ref
      return r.value.ref
    },
    async duplicate(ref: string): Promise<string | null> {
      const r = await window.viditor.transitions.duplicate(ref)
      if (!r.ok) {
        useUiStore().showError(r.error)
        return null
      }
      await this.sync(await window.viditor.transitions.list())
      this.editing = r.value.ref
      return r.value.ref
    },
    async copyToProject(ref: string): Promise<void> {
      const r = await window.viditor.transitions.copyToProject(ref)
      if (!r.ok) return useUiStore().showError(r.error)
      await this.sync(await window.viditor.transitions.list())
      useUiStore().showInfo(`Copiada al proyecto como ${r.value.ref}.`)
    },
    openFolder(origin: TransitionOrigin): void {
      window.viditor.transitions.openFolder(origin)
    }
  }
})
