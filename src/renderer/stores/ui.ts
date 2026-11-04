import { defineStore } from 'pinia'
import type { BackgroundTask } from '@shared/ipc'
import type { ImportMode } from '@shared/project-schema'

export type WorkspaceId = 'edit' | 'transitions' | 'audio' | 'export'

export const WORKSPACES: { id: WorkspaceId; label: string }[] = [
  { id: 'edit', label: 'Edición' },
  { id: 'transitions', label: 'Transiciones' },
  { id: 'audio', label: 'Audio' },
  { id: 'export', label: 'Exportar' }
]

export interface MenuEntry {
  label: string
  shortcut?: string
  disabled?: boolean
  separator?: boolean
  action?: () => void
}

export interface ImportChoice {
  mode: Exclude<ImportMode, 'ask'>
  remember: boolean
}

export const useUiStore = defineStore('ui', {
  state: () => ({
    workspace: 'edit' as WorkspaceId,
    newProjectOpen: false,
    importAsk: null as { count: number; resolve: (c: ImportChoice | null) => void } | null,
    tasks: [] as BackgroundTask[],
    /** Se incrementa cuando termina una miniatura para refrescar las <img>. */
    thumbVersion: {} as Record<string, number>,
    toast: null as { text: string; kind: 'error' | 'info' } | null,
    maximized: false,
    /** Medio arrastrado desde el panel Proyecto hacia la línea de tiempo. */
    dragMediaId: null as string | null,
    contextMenu: null as { x: number; y: number; items: MenuEntry[] } | null
  }),
  actions: {
    openMenu(e: MouseEvent, items: MenuEntry[]): void {
      e.preventDefault()
      this.contextMenu = { x: e.clientX, y: e.clientY, items }
    },
    showError(text: string): void {
      this.toast = { text, kind: 'error' }
    },
    showInfo(text: string): void {
      this.toast = { text, kind: 'info' }
    },
    askImportChoice(count: number): Promise<ImportChoice | null> {
      return new Promise((resolve) => {
        this.importAsk = {
          count,
          resolve: (c) => {
            this.importAsk = null
            resolve(c)
          }
        }
      })
    },
    onTask(task: BackgroundTask): void {
      const i = this.tasks.findIndex((t) => t.id === task.id)
      if (i >= 0) this.tasks[i] = task
      else this.tasks.push(task)
      if (task.id.startsWith('thumb:') && task.done && !task.error) {
        const mediaId = task.id.slice('thumb:'.length)
        this.thumbVersion[mediaId] = (this.thumbVersion[mediaId] ?? 0) + 1
      }
      if (task.done) setTimeout(() => (this.tasks = this.tasks.filter((t) => t.id !== task.id)), 2500)
    }
  }
})
