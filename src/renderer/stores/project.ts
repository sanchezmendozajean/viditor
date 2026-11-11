import { defineStore } from 'pinia'
import type { NewProjectRequest, OpenedProject, RecentProject } from '@shared/ipc'
import type { MediaItem, Project } from '@shared/project-schema'
import { isGeneratedKind } from '@shared/generated'
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

    /** Revincula un medio cuyo archivo falta (y los demás faltantes que estén en la misma carpeta). */
    async relink(mediaId: string): Promise<void> {
      const ui = useUiStore()
      const p = this.project
      const target = p?.media.find((m) => m.id === mediaId)
      if (!p || !target) return
      const missing = p.media.filter((m) => this.missing.includes(m.id)).map((m) => ({ id: m.id, path: m.path }))
      const r = await window.viditor.media.relink({ id: target.id, path: target.path }, missing)
      if (!r.ok) return ui.showError(r.error)
      if (!r.value) return
      const found = r.value
      this.mutate((proj) => {
        for (const f of found) {
          const m = proj.media.find((x) => x.id === f.id)
          if (m) Object.assign(m, { path: f.path, storage: f.storage })
        }
      })
      this.missing = this.missing.filter((id) => !found.some((f) => f.id === id))
      ui.bumpThumbs(found.map((f) => f.id))
      await this.save()
      ui.showInfo(found.length === 1 ? 'Medio revinculado.' : `${found.length} medios revinculados.`)
    },

    /**
     * Renombra el archivo del recurso en disco (conservando la extensión) y actualiza su ruta en el proyecto.
     * Si el proyecto estaba guardado, se vuelve a guardar al instante y no aparece como modificado.
     */
    async renameMedia(mediaId: string, newName: string): Promise<void> {
      const ui = useUiStore()
      const m = this.project?.media.find((x) => x.id === mediaId)
      if (!m) return
      if (isGeneratedKind(m.kind)) {
        // Texto/forma: no hay archivo; solo cambia el nombre visible
        const name = newName.trim()
        if (name && name !== m.name) this.mutate((p) => void (p.media.find((x) => x.id === mediaId)!.name = name))
        return
      }
      const oldFile = m.path.split('/').pop() ?? m.path
      const oldStem = oldFile.includes('.') ? oldFile.slice(0, oldFile.lastIndexOf('.')) : oldFile
      if (!newName.trim() || newName.trim() === oldStem || newName.trim() === oldFile) return
      const r = await window.viditor.media.renameFile(m.id, m.path, newName)
      if (!r.ok) return ui.showError(`No se pudo renombrar: ${r.error}`)
      const wasDirty = this.dirty
      const newFile = r.value.path.split('/').pop() ?? r.value.path
      this.mutate((p) => {
        const target = p.media.find((x) => x.id === mediaId)
        if (!target) return
        target.path = r.value.path
        // Los clips que aún llevan el nombre anterior siguen al recurso
        for (const c of p.clips) if (c.mediaId === mediaId && c.name === oldFile) c.name = newFile
      })
      if (!wasDirty) {
        this.dirty = false // el cambio no cuenta como modificación: se guarda enseguida
        if (!(await this.save())) this.dirty = true
      }
    },

    /**
     * Quita un recurso del proyecto junto con sus clips. Con `deleteFile` borra además el archivo del disco
     * (solo recursos dentro de la carpeta del proyecto). No es deshacible, así que se limpia el historial.
     */
    async removeMedia(mediaId: string, deleteFile: boolean): Promise<void> {
      const ui = useUiStore()
      const media = this.project?.media.find((m) => m.id === mediaId)
      if (!this.project || !media) return
      if (deleteFile && !isGeneratedKind(media.kind)) {
        const r = await window.viditor.media.deleteFile(media.id, media.path)
        if (!r.ok) return ui.showError(`No se pudo eliminar el archivo: ${r.error}`)
      }
      this.mutate((p) => {
        const gone = new Set(p.clips.filter((c) => c.mediaId === mediaId).map((c) => c.id))
        p.clips = p.clips.filter((c) => !gone.has(c.id))
        p.transitions = p.transitions.filter((t) => !(t.leaveClipId && gone.has(t.leaveClipId)) && !(t.enterClipId && gone.has(t.enterClipId)))
        p.media = p.media.filter((m) => m.id !== mediaId)
      })
      this.missing = this.missing.filter((id) => id !== mediaId)
      useTimelineStore().reset()
      await this.save()
      ui.showInfo(isGeneratedKind(media.kind) ? 'Recurso eliminado.' : deleteFile ? 'Recurso eliminado del disco.' : 'Referencia quitada.')
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
