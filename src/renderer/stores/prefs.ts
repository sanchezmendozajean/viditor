import { defineStore } from 'pinia'
import { DEFAULT_PREFS, type Prefs } from '@shared/prefs-schema'
import { useUiStore } from './ui'

export const useAppPrefs = defineStore('prefs', {
  state: () => ({ ...DEFAULT_PREFS, loaded: false }),
  actions: {
    async load(): Promise<void> {
      const p = await window.viditor.prefs.get()
      this.apply(p)
      this.loaded = true
      window.viditor.prefs.applyScale(p.uiScale)
    },
    /** Asigna (no fusiona): `$patch` conservaría las claves de `shortcuts` que ya no existen. */
    apply(p: Prefs): void {
      this.uiScale = p.uiScale
      this.shortcuts = p.shortcuts
      this.transitionsDir = p.transitionsDir
      this.smartGuides = p.smartGuides
    },
    async update(partial: Partial<Prefs>): Promise<boolean> {
      // Los valores del store son proxies reactivos: no se pueden clonar por IPC, se envía una copia plana
      const r = await window.viditor.prefs.set(JSON.parse(JSON.stringify(partial)) as Partial<Prefs>).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }))
      if (!r.ok) {
        useUiStore().showError(r.error)
        return false
      }
      this.apply(r.value)
      if (partial.uiScale !== undefined) window.viditor.prefs.applyScale(r.value.uiScale)
      return true
    },
    /** Asigna los atajos de un comando (lista vacía = sin atajo). */
    setShortcut(id: string, keys: string[]): Promise<boolean> {
      return this.update({ shortcuts: { ...this.shortcuts, [id]: keys } })
    },
    /** Vuelve al atajo de fábrica de un comando. */
    resetShortcut(id: string): Promise<boolean> {
      const rest = { ...this.shortcuts }
      delete rest[id]
      return this.update({ shortcuts: rest })
    }
  }
})
