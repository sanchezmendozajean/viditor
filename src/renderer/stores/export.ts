import { defineStore } from 'pinia'
import {
  CODEC_INFO,
  EXPORT_PRESETS,
  type ExportCapabilities,
  type ExportOptions,
  type ExportProgress,
  type HwMode,
  type VideoCodec
} from '@shared/export-model'
import { engine } from '@/engine/engine'
import { formatTimecode } from '@shared/timecode'
import { useProjectStore } from './project'
import { useTimelineStore } from './timeline'
import { useUiStore } from './ui'

export interface ExportJobView extends ExportProgress {
  name: string
  startedAt: number
}

let listening = false

export const useExportStore = defineStore('export', {
  state: () => ({
    presetId: 'youtube-1080',
    codec: 'h264' as VideoCodec,
    width: 1920 as number | null,
    height: 1080 as number | null,
    fps: null as { num: number; den: number } | null,
    quality: 75,
    useBitrate: false,
    bitrateKbps: 8000,
    hw: 'auto' as HwMode,
    after: 'folder' as ExportOptions['after'],
    rangeMode: 'all' as 'all' | 'range',
    rangeIn: null as number | null,
    rangeOut: null as number | null,
    outputPath: '',
    /** El usuario eligió la ruta a mano: no se vuelve a calcular la ruta por defecto */
    outputCustom: false,
    caps: null as ExportCapabilities | null,
    jobs: [] as ExportJobView[]
  }),

  getters: {
    running(): ExportJobView | undefined {
      return this.jobs.find((j) => j.phase === 'audio' || j.phase === 'video')
    },
    ext(): string {
      return CODEC_INFO[this.codec].ext
    }
  },

  actions: {
    /** Exportar fotograma (Ctrl+Mayús+E): PNG del cabezal a la resolución del proyecto. */
    async exportFrame(): Promise<void> {
      const ui = useUiStore()
      const project = useProjectStore()
      const p = project.project
      if (!p) return
      const blob = await engine.snapshotPng()
      if (!blob) return ui.showError('Abre el monitor (espacio Editar o Exportar) para exportar el fotograma.')
      const tc = formatTimecode(useTimelineStore().playhead, p.settings.fps.num, p.settings.fps.den).replace(/:/g, '-')
      const r = await window.viditor.export.saveFrame(`${p.name} ${tc}`, new Uint8Array(await blob.arrayBuffer()))
      if (!r.ok) return ui.showError(r.error)
      if (r.value) {
        ui.showInfo('Fotograma guardado.')
        window.viditor.export.reveal(r.value)
      }
    },

    /** Suscripción única a los avisos de progreso del main. */
    listen(): void {
      if (listening) return
      listening = true
      window.viditor.export.onProgress((p) => this.onProgress(p))
    },

    async loadCaps(): Promise<void> {
      if (!this.caps) this.caps = await window.viditor.export.capabilities()
    },

    onProgress(p: ExportProgress): void {
      const i = this.jobs.findIndex((j) => j.jobId === p.jobId)
      if (i < 0) return
      const prev = this.jobs[i] as ExportJobView
      // La miniatura se conserva entre avisos que no la traen
      this.jobs[i] = { ...prev, ...p, thumb: p.thumb ?? prev.thumb, name: prev.name, startedAt: prev.startedAt }
      if (p.phase === 'done') useUiStore().showInfo('Exportación terminada.')
    },

    applyPreset(id: string): void {
      const preset = EXPORT_PRESETS.find((p) => p.id === id)
      if (!preset) return
      this.presetId = id
      if (id === 'custom') return
      this.codec = preset.codec
      this.width = preset.width
      this.height = preset.height
      this.quality = preset.quality
      this.useBitrate = false
      void this.refreshOutput()
    },

    /** Cualquier ajuste manual convierte el preset en «Personalizado». */
    touch(): void {
      this.presetId = 'custom'
    },

    setCodec(c: VideoCodec): void {
      this.codec = c
      this.touch()
      if (HW_UNSUPPORTED.has(c)) this.hw = 'none'
      else if (this.hw === 'none') this.hw = 'auto'
      void this.refreshOutput()
    },

    async refreshOutput(): Promise<void> {
      if (this.outputCustom) {
        // Mantiene la carpeta y el nombre elegidos, solo cambia la extensión al cambiar de códec
        this.outputPath = this.outputPath.replace(/\.[A-Za-z0-9]+$/, `.${this.ext}`)
        return
      }
      const project = useProjectStore().project
      if (!project) return
      this.outputPath = await window.viditor.export.defaultOutput(project.name, this.ext)
    },

    async browse(): Promise<void> {
      const p = await window.viditor.export.chooseOutput(this.outputPath, this.ext)
      if (p) {
        this.outputPath = p.replace(/\.[A-Za-z0-9]+$/, '') + `.${this.ext}`
        this.outputCustom = true
      }
    },

    setIn(t: number): void {
      this.rangeIn = t
      if (this.rangeOut !== null && this.rangeOut <= t) this.rangeOut = null
      this.rangeMode = 'range'
    },
    setOut(t: number): void {
      this.rangeOut = t
      if (this.rangeIn !== null && this.rangeIn >= t) this.rangeIn = null
      this.rangeMode = 'range'
    },

    options(): ExportOptions {
      const tl = useTimelineStore()
      const range =
        this.rangeMode === 'range' ? { start: this.rangeIn ?? 0, end: this.rangeOut ?? tl.duration } : null
      return {
        outputPath: this.outputPath,
        presetId: this.presetId,
        codec: this.codec,
        width: this.width,
        height: this.height,
        fps: this.fps,
        range,
        quality: this.quality,
        bitrateKbps: this.useBitrate && this.codec !== 'prores' ? this.bitrateKbps : null,
        hw: this.hw,
        after: this.after
      }
    },

    async start(): Promise<void> {
      const project = useProjectStore().project
      const ui = useUiStore()
      if (!project || this.running) return
      // Los cambios pendientes se guardan antes de empezar; si no se puede guardar, no se exporta
      const proj = useProjectStore()
      if (proj.dirty && !(await proj.save())) return
      if (!this.outputPath) await this.refreshOutput()
      const options = this.options()
      const snapshot = JSON.parse(JSON.stringify(project)) as typeof project
      const r = await window.viditor.export.start(snapshot, options)
      if (!r.ok) return ui.showError(r.error)
      this.jobs.unshift({
        jobId: r.value.jobId,
        name: options.outputPath.split(/[\\/]/).pop() ?? options.outputPath,
        startedAt: Date.now(),
        phase: 'audio',
        frame: 0,
        total: 0,
        fps: 0,
        etaSeconds: null,
        outputPath: options.outputPath
      })
      // La siguiente ruta por defecto no debe pisar este archivo
      if (!this.outputCustom) void this.refreshOutput()
    },

    cancel(jobId: string): void {
      window.viditor.export.cancel(jobId)
    },

    clearFinished(): void {
      this.jobs = this.jobs.filter((j) => j.phase === 'audio' || j.phase === 'video')
    }
  }
})

const HW_UNSUPPORTED = new Set<VideoCodec>(['vp9', 'prores'])
