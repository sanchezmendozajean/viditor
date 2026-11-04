import { defineStore } from 'pinia'
import type { NewProjectRequest, OpenedProject, RecentProject } from '@shared/ipc'
import type { MediaItem, Project } from '@shared/project-schema'
import { useUiStore } from './ui'
import { useTimelineStore } from './timeline'

const AUTOSAVE_MS = 2 * 60 * 1000

let autosaveTimer: ReturnType<typeof setInterval> | null = null

export const useProjectStore = defineStore('project', {
  state: () => ({
    opened: null as Omit<OpenedProject, 'project'> | null,
    project: null as Project | null,
    dirty: false,
    savedAt: null as number | null,
    autosavedAt: null as number | null,
    missing: [] as string[],
    recents: [] as RecentProject[]
  }),
  getters: {
    isOpen: (s) => s.project !== null,
    projectName: (s) => s.project?.name ?? ''
  },
  actions: {
    async loadRecents(): Promise<void> {
      this.recents = await window.viditor.project.recents()
    },

    adopt(opened: OpenedProject): void {
      const { project, ...rest } = opened
      this.opened = rest
      this.project = project
      this.missing = opened.missing
      this.dirty = false
      this.savedAt = Date.now()
      this.autosavedAt = null
      useTimelineStore().reset()
      useUiStore().workspace = (['edit', 'transitions', 'audio', 'export'] as const).includes(project.view.workspace as 'edit')
        ? (project.view.workspace as 'edit')
        : 'edit'
      if (autosaveTimer) clearInterval(autosaveTimer)
      autosaveTimer = setInterval(() => void this.autosave(), AUTOSAVE_MS)
    },

    async create(req: NewProjectRequest): Promise<boolean> {
      const r = await window.viditor.project.create(req)
      if (!r.ok) {
        useUiStore().showError(r.error)
        return false
      }
      this.adopt(r.value)
      return true
    },

    async open(file: string): Promise<boolean> {
      const r = await window.viditor.project.open(file)
      if (!r.ok) {
        useUiStore().showError(r.error)
        await window.viditor.project.removeRecent(file).then((l) => (this.recents = l))
        return false
      }
      this.adopt(r.value)
      return true
    },

    async openWithDialog(): Promise<void> {
      const file = await window.viditor.dialogs.chooseProjectFile()
      if (file) await this.open(file)
    },

    /** Marca cambios; todo cambio al modelo pasa por aquí. */
    mutate(fn: (p: Project) => void): void {
      if (!this.project) return
      fn(this.project)
      this.dirty = true
    },

    async save(): Promise<boolean> {
      if (!this.project) return false
      const r = await window.viditor.project.save(JSON.parse(JSON.stringify(this.project)) as Project)
      if (!r.ok) {
        useUiStore().showError(`No se pudo guardar: ${r.error}`)
        return false
      }
      this.dirty = false
      this.savedAt = r.value.savedAt
      return true
    },

    async autosave(): Promise<void> {
      if (!this.project || !this.dirty) return
      const r = await window.viditor.project.autosave(JSON.parse(JSON.stringify(this.project)) as Project)
      if (r.ok) this.autosavedAt = r.value.savedAt
    },

    async close(): Promise<void> {
      if (this.dirty && !(await this.save())) return
      if (autosaveTimer) clearInterval(autosaveTimer)
      autosaveTimer = null
      await window.viditor.project.close()
      this.opened = null
      this.project = null
      this.dirty = false
      await this.loadRecents()
    },

    async importWithDialog(): Promise<void> {
      const files = await window.viditor.dialogs.chooseMediaFiles()
      if (files.length) await this.importPaths(files)
    },

    /** Flujo completo de importación: planificar → preguntar (si procede) → importar. */
    async importPaths(paths: string[]): Promise<MediaItem[]> {
      const ui = useUiStore()
      const project = this.project
      if (!project || paths.length === 0) return []
      const plan = await window.viditor.media.plan(paths)
      if (!plan.ok) {
        ui.showError(plan.error)
        return []
      }
      if (plan.value.count === 0) {
        ui.showInfo('No se encontraron archivos de video, audio o imagen compatibles.')
        return []
      }

      let mode: 'reference' | 'copy' | 'move' = 'reference'
      if (plan.value.outsideCount > 0) {
        const configured = project.settings.importMode
        if (configured === 'ask') {
          const choice = await ui.askImportChoice(plan.value.outsideCount)
          if (!choice) return []
          mode = choice.mode
          if (choice.remember) this.mutate((p) => (p.settings.importMode = choice.mode))
        } else {
          mode = configured
        }
      }

      const r = await window.viditor.media.import({ paths, mode, existingPaths: project.media.map((m) => m.path) })
      if (!r.ok) {
        ui.showError(r.error)
        return []
      }
      this.mutate((p) => {
        p.bins.push(...r.value.bins)
        p.media.push(...r.value.media)
      })
      // Guardar enseguida: con "mover" el archivo original ya no está en su sitio.
      await this.save()
      if (r.value.skipped.length > 0) ui.showInfo(`Omitidos ${r.value.skipped.length} archivo(s): ${r.value.skipped.slice(0, 2).join("; ")}`)
      return r.value.media
    }
  }
})
