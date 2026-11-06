import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import { ulid } from 'ulid'
import { History } from '@shared/history'
import type { Clip, Keyframe, Project, Track } from '@shared/project-schema'
import {
  KEY_PROPS,
  clearKeys,
  editAnimated,
  keyAt,
  keyTimes,
  removeKey,
  sourceTimeAt,
  timelineTimeOf,
  upsertKey,
  valueAtSource,
  type KeyProp
} from '@shared/keyframes'
import * as ops from '@shared/timeline-ops'
import { clipEnd, clone } from '@shared/timeline-ops'
import { transitionRange } from '@shared/transition-model'
import { useProjectStore } from './project'
import { useTransitionsStore } from './transitions'
import { useUiStore } from './ui'

export type Tool = 'select' | 'razor' | 'hand'

const newId: ops.IdGen = (prefix) => prefix + ulid()

type Slice = Pick<Project, 'tracks' | 'clips' | 'transitions' | 'markers'>

export const MIN_ZOOM = 4
export const MAX_ZOOM = 1200

export const useTimelineStore = defineStore('timeline', {
  state: () => ({
    selection: [] as string[],
    selectedTrackId: null as string | null,
    /** Transición seleccionada (se edita en el Inspector) */
    selectedTransition: null as string | null,
    tool: 'select' as Tool,
    snap: true,
    /** Se incrementa en cada cambio del historial para que `canUndo/canRedo` sean reactivos. */
    revision: 0,
    history: markRaw(new History<string>()),
    /** Tiempo de la guía de imán visible durante un arrastre. */
    snapGuide: null as number | null,
    /** Ancho visible del área de pistas (para ajustar el zoom). */
    viewWidth: 800
  }),

  getters: {
    project(): Project | null {
      return useProjectStore().project
    },
    canUndo(): boolean {
      void this.revision
      return this.history.canUndo
    },
    canRedo(): boolean {
      void this.revision
      return this.history.canRedo
    },
    undoLabel(): string | null {
      void this.revision
      return this.history.undoLabel
    },
    redoLabel(): string | null {
      void this.revision
      return this.history.redoLabel
    },
    playhead(): number {
      return this.project?.view.playhead ?? 0
    },
    zoom(): number {
      return this.project?.view.zoom ?? 80
    },
    duration(): number {
      return this.project ? ops.sequenceDuration(this.project) : 0
    },
    selectedClips(): Clip[] {
      const p = this.project
      return p ? p.clips.filter((c) => this.selection.includes(c.id)) : []
    }
  },

  actions: {
    reset(): void {
      this.history.clear()
      this.revision++
      this.selection = []
      this.selectedTrackId = null
      this.tool = 'select'
    },

    snapshot(): string {
      const p = this.project
      if (!p) return ''
      const s: Slice = { tracks: p.tracks, clips: p.clips, transitions: p.transitions, markers: p.markers }
      return JSON.stringify(s)
    },

    restore(json: string): void {
      const store = useProjectStore()
      if (!json) return
      const s = JSON.parse(json) as Slice
      store.mutate((p) => {
        p.tracks = s.tracks
        p.clips = s.clips
        p.transitions = s.transitions
        p.markers = s.markers
      })
      const ids = new Set(s.clips.map((c) => c.id))
      this.selection = this.selection.filter((id) => ids.has(id))
      if (this.selectedTransition && !s.transitions.some((t) => t.id === this.selectedTransition)) this.selectedTransition = null
    },

    /** Ejecuta un cambio como un solo comando deshacible. */
    run<T>(label: string, fn: (p: Project) => T): T | undefined {
      const store = useProjectStore()
      if (!store.project) return undefined
      const before = this.snapshot()
      let result: T | undefined
      store.mutate((p) => {
        result = fn(p)
        ops.normalizeTransitions(p)
      })
      if (this.selectedTransition && !store.project.transitions.some((t) => t.id === this.selectedTransition)) this.selectedTransition = null
      this.commit(label, before)
      return result
    },

    /** Registra en el historial un gesto continuo (arrastre) que ya mutó el proyecto. */
    commit(label: string, before: string): void {
      const after = this.snapshot()
      if (before !== after) {
        this.history.push({ label, before, after })
        this.revision++
      }
    },

    undo(): void {
      const s = this.history.undo()
      if (s !== null) this.restore(s)
      this.revision++
    },
    redo(): void {
      const s = this.history.redo()
      if (s !== null) this.restore(s)
      this.revision++
    },

    // ───── Edición de propiedades de los clips seleccionados (Inspector, monitor) ─────

    /** Aplica un cambio discreto a los clips seleccionables como un solo comando. */
    editSelected(label: string, fn: (clip: Clip, p: Project) => void): void {
      const ids = this.editableSelection()
      if (ids.length === 0) return
      const t = this.playhead
      this.run(label, (p) => {
        for (const c of p.clips) if (ids.includes(c.id)) editAnimated(c, t, (cc) => fn(cc, p))
      })
    },
    /** Cambio en vivo durante un arrastre: no entra al historial hasta `commit`. */
    liveSelected(fn: (clip: Clip, p: Project) => void): void {
      const ids = this.editableSelection()
      const t = this.playhead
      useProjectStore().mutate((p) => {
        for (const c of p.clips) if (ids.includes(c.id)) editAnimated(c, t, (cc) => fn(cc, p))
      })
    },

    // ───── Fotogramas clave ─────

    /** Crea o quita, en el cabezal, el fotograma de las propiedades dadas de los clips seleccionados. */
    toggleKey(props: KeyProp[]): void {
      const t = this.playhead
      const ids = this.editableSelection()
      this.run('Fotograma clave', (p) => {
        for (const c of p.clips) {
          if (!ids.includes(c.id) || t < c.start || t >= clipEnd(c)) continue
          const s = sourceTimeAt(c, t)
          const on = props.every((pr) => keyAt(c, pr, s))
          for (const pr of props) {
            if (on) removeKey(c, pr, s)
            else upsertKey(c, pr, s, valueAtSource(c, pr, s))
          }
        }
      })
    },
    /** Vuelve a la transformación inicial (sin animación) de los clips seleccionados. */
    resetTransform(): void {
      this.editSelected('Restablecer transformación', (c) => {
        clearKeys(c, KEY_PROPS, 0)
        Object.assign(c.transform, { fit: 'fit', x: 0, y: 0, scaleX: 1, scaleY: 1, lockAspect: true, rotation: 0, flipH: false, flipV: false, anchorX: 0.5, anchorY: 0.5, opacity: 1, crop: { left: 0, top: 0, right: 0, bottom: 0 } })
      })
    },
    /** Quita la animación de las propiedades dadas (conservan el valor del cabezal). */
    clearAnimation(props: KeyProp[]): void {
      const t = this.playhead
      const ids = this.editableSelection()
      this.run('Quitar animación', (p) => {
        for (const c of p.clips) if (ids.includes(c.id)) clearKeys(c, props, sourceTimeAt(c, t))
      })
    },
    /** Interpolación del tramo que empieza en el fotograma del cabezal. */
    setKeyEase(props: KeyProp[], ease: Keyframe['ease']): void {
      const t = this.playhead
      const ids = this.editableSelection()
      this.run('Cambiar interpolación', (p) => {
        for (const c of p.clips) {
          if (!ids.includes(c.id)) continue
          const s = sourceTimeAt(c, t)
          for (const pr of props) {
            const k = keyAt(c, pr, s)
            if (k) k.ease = ease
          }
        }
      })
    },
    /** Salta al fotograma clave anterior / siguiente del primer clip seleccionado. */
    seekKey(dir: -1 | 1, props: readonly KeyProp[] = KEY_PROPS): void {
      const p = this.project
      const c = this.selectedClips[0]
      if (!p || !c) return
      const margin = p.settings.fps.den / p.settings.fps.num / 2
      const times = keyTimes(c, props).map((s) => timelineTimeOf(c, s))
      const here = this.playhead
      const target = dir > 0 ? times.find((x) => x > here + margin) : [...times].reverse().find((x) => x < here - margin)
      if (target !== undefined) this.setPlayhead(target)
    },

    // ───── Cabezal, zoom, selección ─────

    setPlayhead(t: number): void {
      const p = this.project
      if (!p) return
      p.view.playhead = Math.max(0, ops.quantize(p, t))
    },
    /** Cabezal sin cuantizar (durante la reproducción). */
    setPlayheadRaw(t: number): void {
      const p = this.project
      if (p) p.view.playhead = Math.max(0, t)
    },
    setZoom(z: number): void {
      const p = this.project
      if (p) p.view.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
    },
    fit(viewWidthPx: number): void {
      const d = Math.max(this.duration, 5)
      this.setZoom((viewWidthPx - 40) / d)
    },
    select(ids: string[], additive = false): void {
      this.selection = additive ? [...new Set([...this.selection, ...ids])] : ids
      if (ids.length) this.selectedTransition = null
    },
    selectTransition(id: string | null): void {
      this.selectedTransition = id
      if (id) this.selection = []
    },
    toggleSelect(id: string): void {
      this.selection = this.selection.includes(id) ? this.selection.filter((x) => x !== id) : [...this.selection, id]
    },
    selectAll(): void {
      this.selection = (this.project?.clips ?? []).map((c) => c.id)
    },

    isLocked(trackId: string): boolean {
      return Boolean(this.project?.tracks.find((t) => t.id === trackId)?.locked)
    },
    editableSelection(): string[] {
      return this.selection.filter((id) => {
        const c = this.project?.clips.find((x) => x.id === id)
        return c ? !this.isLocked(c.trackId) : false
      })
    },

    // ───── Clips ─────

    /** Pista de destino por defecto: la de video más baja (V1) o la primera de audio. */
    defaultTrackFor(kind: 'video' | 'audio'): Track | undefined {
      const list = (this.project?.tracks ?? []).filter((t) => t.kind === kind && !t.locked)
      return kind === 'video' ? list.at(-1) : list[0]
    },

    /** Añade un medio. Sin `start` lo agrega al final de la pista de destino. Devuelve el id del clip. */
    addMedia(mediaId: string, opts: { trackId?: string; start?: number; mode?: ops.PlaceMode } = {}): string | null {
      const p = this.project
      const m = p?.media.find((x) => x.id === mediaId)
      if (!p || !m) return null
      const track = opts.trackId
        ? p.tracks.find((t) => t.id === opts.trackId)
        : this.defaultTrackFor(m.kind === 'audio' ? 'audio' : 'video')
      if (!track || track.locked || !ops.mediaFitsTrack(m, track)) return null
      const end = ops.trackClips(p, track.id).reduce((a, c) => Math.max(a, ops.clipEnd(c)), 0)
      const start = opts.start ?? end
      const id = this.run('Agregar clip', (proj) => {
        const clip = ops.makeClip(proj, m, track.id, ops.quantize(proj, Math.max(0, start)), newId('c_'))
        ops.placeClips(proj, [clip], opts.mode ?? 'overwrite', newId)
        return clip.id
      })
      if (id) {
        this.selection = [id]
        this.selectedTrackId = track.id
      }
      return id ?? null
    },

    moveClips(moves: ops.Move[], mode: ops.PlaceMode = 'overwrite'): void {
      this.run('Mover clips', (p) => ops.moveClips(p, moves, mode, newId))
    },

    /** Alt+arrastrar: copia los clips en las nuevas posiciones. */
    duplicateClips(moves: ops.Move[], mode: ops.PlaceMode = 'overwrite'): void {
      const created = this.run('Duplicar clips', (p) => {
        const copies: Clip[] = []
        for (const m of moves) {
          const src = p.clips.find((c) => c.id === m.id)
          if (!src) continue
          const copy: Clip = clone(src)
          copy.id = newId('c_')
          copy.start = Math.max(0, m.start)
          copy.trackId = m.trackId
          copies.push(copy)
        }
        ops.placeClips(p, copies, mode, newId)
        return copies.map((c) => c.id)
      })
      if (created) this.selection = created
    },

    splitAt(clipId: string, t: number): void {
      const right = this.run('Dividir clip', (p) => ops.splitClip(p, clipId, ops.quantize(p, t), newId))
      if (right) this.selection = [right]
    },

    /** Ctrl+K: divide los clips seleccionados (o todos los de pistas desbloqueadas) bajo el cabezal. */
    splitAtPlayhead(): void {
      const t = this.playhead
      this.run('Dividir en el cabezal', (p) => {
        const pool = this.selection.length ? this.editableSelection() : p.clips.filter((c) => !this.isLocked(c.trackId)).map((c) => c.id)
        for (const id of pool) {
          const c = p.clips.find((x) => x.id === id)
          if (c && t > c.start && t < ops.clipEnd(c)) ops.splitClip(p, id, t, newId)
        }
      })
    },

    deleteSelection(ripple: boolean): void {
      const ids = this.editableSelection()
      if (ids.length === 0) return
      this.run(ripple ? 'Eliminar y cerrar hueco' : 'Eliminar clips', (p) => ops.deleteClips(p, ids, ripple))
      this.selection = []
    },
    deleteClip(id: string, ripple: boolean): void {
      this.run(ripple ? 'Eliminar y cerrar hueco' : 'Eliminar clip', (p) => ops.deleteClips(p, [id], ripple))
      this.selection = this.selection.filter((x) => x !== id)
    },

    removeGap(trackId: string, t: number): void {
      this.run('Eliminar hueco', (p) => ops.removeGap(p, trackId, t))
    },

    toggleEnabled(): void {
      const ids = this.editableSelection()
      if (ids.length === 0) return
      const anyEnabled = this.selectedClips.some((c) => ids.includes(c.id) && c.enabled)
      this.run(anyEnabled ? 'Deshabilitar clips' : 'Habilitar clips', (p) => ops.setEnabled(p, ids, !anyEnabled))
    },

    trimToPlayhead(edge: 'start' | 'end'): void {
      const t = this.playhead
      this.run(edge === 'start' ? 'Recortar inicio al cabezal' : 'Recortar final al cabezal', (p) => {
        const ids = this.selection.length
          ? this.editableSelection()
          : p.clips.filter((c) => !this.isLocked(c.trackId) && t > c.start && t < ops.clipEnd(c)).map((c) => c.id)
        ops.trimToPlayhead(p, ids, edge, t)
      })
    },

    /** Crea un clip de audio vinculado en la primera pista libre y silencia el audio del clip de video. */
    separateAudio(clipId: string): void {
      const p = this.project
      const src = p?.clips.find((c) => c.id === clipId)
      const m = p?.media.find((x) => x.id === src?.mediaId)
      if (!p || !src || !m?.probe?.hasAudio || src.audio.muted) return
      this.run('Separar audio', (proj) => {
        const s = proj.clips.find((c) => c.id === clipId)
        if (!s) return
        const track = ops.firstFreeAudioTrack(proj, s.start, ops.clipEnd(s), newId)
        const audio: Clip = clone(s)
        audio.id = newId('c_')
        audio.trackId = track.id
        s.audio.muted = true
        proj.clips.push(audio)
      })
    },

    // ───── Pistas ─────

    addTrack(kind: Track['kind'], refTrackId: string | null = null, where: 'above' | 'below' = 'above'): void {
      this.run(kind === 'video' ? 'Agregar pista de video' : 'Agregar pista de audio', (p) => {
        ops.addTrack(p, kind, refTrackId, where, newId)
      })
    },
    deleteTrack(trackId: string): void {
      this.run('Eliminar pista', (p) => ops.deleteTrack(p, trackId))
      this.selection = this.selection.filter((id) => this.project?.clips.some((c) => c.id === id))
    },
    duplicateTrack(trackId: string): void {
      this.run('Duplicar pista', (p) => ops.duplicateTrack(p, trackId, newId))
    },
    moveTrack(trackId: string, index: number): void {
      this.run('Reordenar pista', (p) => ops.moveTrack(p, trackId, index))
    },
    setTrack<K extends 'name' | 'hidden' | 'locked' | 'muted' | 'solo' | 'volume' | 'height' | 'color'>(
      trackId: string,
      key: K,
      value: Track[K],
      label = 'Cambiar pista'
    ): void {
      this.run(label, (p) => {
        const t = p.tracks.find((x) => x.id === trackId)
        if (t) t[key] = value
      })
    },

    // ───── Transiciones ─────

    /** Duración por defecto de una transición (meta.defaultDuration) */
    defaultDurationOf(ref: string): number {
      return useTransitionsStore().metaOf(ref)?.defaultDuration ?? 1
    },

    /** Aplica una transición entre dos clips contiguos, o solo a un extremo (fundido desde/hacia nada). */
    applyTransition(leaveId: string | null, enterId: string | null, ref?: string): string | null {
      const p = this.project
      const ui = useUiStore()
      const tr = useTransitionsStore()
      const clip = p?.clips.find((c) => c.id === (leaveId ?? enterId))
      if (!p || !clip) return null
      if (this.isLocked(clip.trackId)) return null
      const useRef = ref ?? tr.defaultRef
      const result = this.run('Agregar transición', (proj) =>
        ops.applyTransition(
          proj,
          { trackId: clip.trackId, leaveId, enterId, ref: useRef, duration: this.defaultDurationOf(useRef) },
          newId
        )
      )
      if (!result || !result.ok) {
        ui.showError(result && !result.ok ? result.error : 'No se pudo agregar la transición.')
        return null
      }
      if (result.clamped) ui.showInfo(`La duración se limitó a ${result.duration.toFixed(2)} s: los clips son más cortos que la transición.`)
      this.selectTransition(result.id)
      return result.id
    },

    /** Unión (o extremo) sobre la que actúa Ctrl+D: según la selección y, si no hay, el cabezal. */
    junctionTarget(): { leaveId: string | null; enterId: string | null } | null {
      const p = this.project
      if (!p) return null
      const sel = this.selectedClips.filter((c) => !this.isLocked(c.trackId))
      const next = (c: Clip): Clip | undefined => ops.trackClips(p, c.trackId).find((x) => x.start >= ops.clipEnd(c) - 1e-3 && x.id !== c.id)
      const prev = (c: Clip): Clip | undefined => [...ops.trackClips(p, c.trackId)].reverse().find((x) => ops.clipEnd(x) <= c.start + 1e-3 && x.id !== c.id)
      const adjacent = (a: Clip, b: Clip): boolean => Math.abs(b.start - ops.clipEnd(a)) < ops.frameDuration(p) / 2
      if (sel.length === 2 && sel[0]!.trackId === sel[1]!.trackId) {
        const [a, b] = sel.sort((x, y) => x.start - y.start) as [Clip, Clip]
        if (adjacent(a, b)) return { leaveId: a.id, enterId: b.id }
      }
      let clip: Clip | undefined = sel[0]
      if (!clip) {
        const t = this.playhead
        const pool = p.clips.filter((c) => !this.isLocked(c.trackId) && p.tracks.find((x) => x.id === c.trackId)?.kind === 'video')
        clip = pool.find((c) => t >= c.start && t < ops.clipEnd(c)) ?? pool.sort((a, b) => Math.abs(a.start - t) - Math.abs(b.start - t))[0]
      }
      if (!clip) return null
      const t = this.playhead
      const nearEnd = Math.abs(ops.clipEnd(clip) - t) <= Math.abs(t - clip.start)
      if (nearEnd) {
        const n = next(clip)
        return n && adjacent(clip, n) ? { leaveId: clip.id, enterId: n.id } : { leaveId: clip.id, enterId: null }
      }
      const pr = prev(clip)
      return pr && adjacent(pr, clip) ? { leaveId: pr.id, enterId: clip.id } : { leaveId: null, enterId: clip.id }
    },

    /** Ctrl+D: transición por defecto en la unión elegida. */
    applyDefaultTransition(): void {
      const j = this.junctionTarget()
      if (!j) return useUiStore().showInfo('Selecciona dos clips contiguos (o un clip) para agregar una transición.')
      this.applyTransition(j.leaveId, j.enterId)
    },

    removeTransition(id: string): void {
      this.run('Eliminar transición', (p) => ops.removeTransition(p, id))
    },
    /** Cambio discreto de duración (campo numérico). Devuelve la duración aplicada. */
    setTransitionDuration(id: string, d: number): void {
      this.run('Cambiar duración de la transición', (p) => ops.setTransitionDuration(p, id, d))
    },
    /** Durante un arrastre: no entra al historial hasta `commit`. */
    liveTransitionDuration(id: string, d: number): number | null {
      let applied: number | null = null
      useProjectStore().mutate((p) => {
        applied = ops.setTransitionDuration(p, id, d)
      })
      return applied
    },
    editTransition(id: string, label: string, fn: (t: import('@shared/project-schema').Transition) => void): void {
      this.run(label, (p) => {
        const t = p.transitions.find((x) => x.id === id)
        if (t) fn(t)
      })
    },
    liveTransition(id: string, fn: (t: import('@shared/project-schema').Transition) => void): void {
      useProjectStore().mutate((p) => {
        const t = p.transitions.find((x) => x.id === id)
        if (t) fn(t)
      })
    },
    /** Cambia la transición aplicada manteniendo su duración y audio si es posible. */
    replaceTransition(id: string, ref: string): void {
      this.run('Cambiar transición', (p) => {
        const t = p.transitions.find((x) => x.id === id)
        if (!t) return
        t.transitionRef = ref
        t.params = {}
      })
    },
    /** Rango de la transición en la línea de tiempo (para dibujar su bloque). */
    rangeOf(id: string): { start: number; end: number } | null {
      const p = this.project
      const t = p?.transitions.find((x) => x.id === id)
      return p && t ? transitionRange(p, t) : null
    },

    // ───── Marcadores y navegación ─────

    addMarker(): void {
      const t = this.playhead
      this.run('Agregar marcador', (p) => {
        if (!p.markers.some((m) => Math.abs(m.time - t) < 1e-6)) p.markers.push({ time: t, label: '', color: '#E8B33A' })
      })
    },

    renameMarker(time: number, label: string): void {
      this.run('Renombrar marcador', (p) => {
        const m = p.markers.find((x) => Math.abs(x.time - time) < 1e-6)
        if (m) m.label = label.trim()
      })
    },
    setMarkerColor(time: number, color: string): void {
      this.run('Color del marcador', (p) => {
        const m = p.markers.find((x) => Math.abs(x.time - time) < 1e-6)
        if (m) m.color = color
      })
    },
    deleteMarker(time: number): void {
      this.run('Eliminar marcador', (p) => {
        p.markers = p.markers.filter((x) => Math.abs(x.time - time) >= 1e-6)
      })
    },
    /** Salta al marcador anterior / siguiente al cabezal. */
    seekMarker(dir: -1 | 1): void {
      const p = this.project
      if (!p) return
      const margin = p.settings.fps.den / p.settings.fps.num / 2
      const times = p.markers.map((m) => m.time).sort((a, b) => a - b)
      const here = this.playhead
      const target = dir > 0 ? times.find((x) => x > here + margin) : [...times].reverse().find((x) => x < here - margin)
      if (target !== undefined) this.setPlayhead(target)
    },

    /** ↑ / ↓: salta al borde de clip anterior / siguiente. */
    seekEdge(dir: -1 | 1): void {
      const p = this.project
      if (!p) return
      const eps = 1e-6
      const pts = new Set<number>([0])
      for (const c of p.clips) {
        pts.add(c.start)
        pts.add(ops.clipEnd(c))
      }
      const sorted = [...pts].sort((a, b) => a - b)
      const t = this.playhead
      const target = dir < 0 ? [...sorted].reverse().find((x) => x < t - eps) : sorted.find((x) => x > t + eps)
      if (target !== undefined) this.setPlayhead(target)
    }
  }
})
