import { COMMANDS, COMMAND_BY_ID, buildKeymap, effectiveKeys, type CommandMeta } from '@shared/commands-meta'
import { comboFromEvent, formatCombo } from '@shared/keys'
import { engine } from '@/engine/engine'
import { useExportStore } from '@/stores/export'
import { useProjectStore } from '@/stores/project'
import { useAppPrefs } from '@/stores/prefs'
import { useTimelineStore } from '@/stores/timeline'
import { useUiStore, type WorkspaceId } from '@/stores/ui'
import { pasteWithDialog } from './paste'

interface Runner {
  run: () => void
  enabled?: () => boolean
}

function setWorkspace(id: WorkspaceId): void {
  const ui = useUiStore()
  ui.workspace = id
  useProjectStore().mutate((p) => (p.view.workspace = id))
}

/** Implementación de cada comando de `COMMANDS` (los stores se resuelven al ejecutar, con Pinia ya activo). */
function runners(): Record<string, Runner> {
  const project = useProjectStore()
  const tl = useTimelineStore()
  const ui = useUiStore()
  const hasClip = (): boolean => tl.selectedClips.length > 0
  const MOVE = ['x', 'y', 'scaleX', 'scaleY', 'rotation'] as const
  return {
    'file.new': { run: () => (ui.newProjectOpen = true) },
    'file.open': { run: () => void project.openWithDialog() },
    'file.save': { run: () => void project.save() },
    'file.import': { run: () => void project.importWithDialog() },
    'file.openFolder': { run: () => window.viditor.project.openFolder() },
    'file.close': { run: () => void project.close() },
    'export.frame': { run: () => void useExportStore().exportFrame() },
    'view.export': { run: () => setWorkspace('export') },

    'edit.undo': { run: () => tl.undo(), enabled: () => tl.canUndo },
    'edit.redo': { run: () => tl.redo(), enabled: () => tl.canRedo },
    'edit.copy': { run: () => void tl.copySelection(), enabled: hasClip },
    'edit.paste': { run: () => void pasteWithDialog(), enabled: () => tl.clipboard.length > 0 },
    'edit.selectAll': { run: () => tl.selectAll() },
    'edit.selectNone': { run: () => tl.select([]) },
    'edit.delete': { run: () => (tl.selectedTransition ? tl.removeTransition(tl.selectedTransition) : tl.deleteSelection(false)) },
    'edit.deleteRipple': { run: () => tl.deleteSelection(true) },

    'play.toggle': { run: () => engine.toggle() },
    'play.forward': { run: () => engine.shuttle(1) },
    'play.backward': { run: () => engine.shuttle(-1) },
    'play.pause': { run: () => engine.pause() },
    'seek.frameBack': { run: () => engine.step(-1) },
    'seek.frameForward': { run: () => engine.step(1) },
    'seek.frames5Back': { run: () => engine.step(-5) },
    'seek.frames5Forward': { run: () => engine.step(5) },
    'seek.edgePrev': { run: () => tl.seekEdge(-1) },
    'seek.edgeNext': { run: () => tl.seekEdge(1) },
    'seek.start': { run: () => tl.setPlayhead(0) },
    'seek.end': { run: () => tl.setPlayhead(tl.duration) },
    'marker.prev': { run: () => tl.seekMarker(-1) },
    'marker.next': { run: () => tl.seekMarker(1) },

    'clip.split': { run: () => tl.splitAtPlayhead() },
    'clip.trimStart': { run: () => tl.trimToPlayhead('start') },
    'clip.trimEnd': { run: () => tl.trimToPlayhead('end') },
    'clip.toggleEnabled': { run: () => tl.toggleEnabled(), enabled: hasClip },
    'clip.resetTransform': { run: () => tl.resetTransform(), enabled: hasClip },
    'transition.default': { run: () => tl.applyDefaultTransition() },
    'tool.select': { run: () => (tl.tool = 'select') },
    'tool.razor': { run: () => (tl.tool = 'razor') },
    'tool.hand': { run: () => (tl.tool = 'hand') },
    'timeline.snap': { run: () => (tl.snap = !tl.snap) },
    'view.guides': { run: () => void useAppPrefs().update({ smartGuides: !useAppPrefs().smartGuides }) },
    'marker.add': { run: () => tl.addMarker() },
    'range.in': { run: () => useExportStore().setIn(tl.playhead) },
    'range.out': { run: () => useExportStore().setOut(tl.playhead) },
    'track.addVideo': { run: () => tl.addTrack('video', null, 'above') },
    'track.addAudio': { run: () => tl.addTrack('audio', null, 'below') },
    'zoom.in': { run: () => tl.setZoom(tl.zoom * 1.25) },
    'zoom.out': { run: () => tl.setZoom(tl.zoom / 1.25) },
    'zoom.fit': { run: () => tl.fit(tl.viewWidth - 170) },

    'key.toggleTransform': { run: () => tl.toggleKey([...MOVE]), enabled: hasClip },
    'key.toggleOpacity': { run: () => tl.toggleKey(['opacity']), enabled: hasClip },
    'key.toggleVolume': { run: () => tl.toggleKey(['volume']), enabled: hasClip },
    'key.prev': { run: () => tl.seekKey(-1), enabled: hasClip },
    'key.next': { run: () => tl.seekKey(1), enabled: hasClip },

    'view.edit': { run: () => setWorkspace('edit') },
    'view.transitions': { run: () => setWorkspace('transitions') },
    'view.audio': { run: () => setWorkspace('audio') },
    'app.palette': { run: () => (ui.paletteOpen = !ui.paletteOpen) },
    'app.preferences': { run: () => (ui.prefsOpen = true) },

    'help.docs': { run: () => window.viditor.help.open('index') },
    'help.shortcuts': { run: () => window.viditor.help.open('shortcuts') }
  }
}

export function isAvailable(meta: CommandMeta): boolean {
  if (!meta.anywhere && !useProjectStore().isOpen) return false
  return runners()[meta.id]?.enabled?.() ?? true
}

export function executeCommand(id: string): boolean {
  const meta = COMMAND_BY_ID.get(id)
  const runner = runners()[id]
  if (!meta || !runner || !isAvailable(meta)) return false
  runner.run()
  return true
}

/** Atajo principal formateado para menús y paleta (vacío si no tiene). */
export function shortcutLabel(id: string): string {
  const meta = COMMAND_BY_ID.get(id)
  const first = meta ? effectiveKeys(meta, useAppPrefs().shortcuts)[0] : undefined
  return first ? formatCombo(first) : ''
}

export interface PaletteEntry {
  meta: CommandMeta
  shortcut: string
  available: boolean
}

export function paletteEntries(): PaletteEntry[] {
  return COMMANDS.map((meta) => ({ meta, shortcut: shortcutLabel(meta.id), available: isAvailable(meta) }))
}

/** Despachador global de teclado. Devuelve true si la tecla se consumió como comando. */
export function handleKey(e: KeyboardEvent): boolean {
  const combo = comboFromEvent(e)
  if (!combo) return false
  const id = buildKeymap(useAppPrefs().shortcuts).get(combo)
  if (!id) return false
  const meta = COMMAND_BY_ID.get(id)
  if (!meta) return false
  // Con un diálogo abierto solo funcionan la paleta, las preferencias y la ayuda
  const ui = useUiStore()
  if ((ui.paletteOpen || ui.prefsOpen || ui.newProjectOpen || ui.importAsk) && !['app.palette', 'app.preferences', 'help.docs'].includes(id)) return false
  const t = e.target as HTMLElement | null
  const editing = Boolean(t) && ((/^(INPUT|SELECT|TEXTAREA)$/.test(t!.tagName) && (t as HTMLInputElement).type !== 'range') || t!.isContentEditable)
  if (editing && !meta.global) return false
  executeCommand(id)
  return true
}
