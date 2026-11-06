import { engine } from '@/engine/engine'
import { useProjectStore } from '@/stores/project'
import { useTimelineStore } from '@/stores/timeline'

/** Atajos de la línea de tiempo (specs/04). Devuelve true si la tecla fue consumida. */
export function handleTimelineKey(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null
  if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName) && (target as HTMLInputElement).type !== 'range') return false
  const project = useProjectStore()
  const tl = useTimelineStore()
  const p = project.project
  if (!p) return false
  const mod = e.ctrlKey || e.metaKey
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key

  if (mod) {
    switch (key) {
      case 'z':
        e.shiftKey ? tl.redo() : tl.undo()
        return true
      case 'y':
        tl.redo()
        return true
      case 'd':
        tl.applyDefaultTransition()
        return true
      case 'k':
        tl.splitAtPlayhead()
        return true
      case 'a':
        tl.selectAll()
        return true
      default:
        return false
    }
  }
  if (e.altKey) return false

  switch (key) {
    case ' ': engine.toggle(); return true
    case 'l': engine.shuttle(1); return true
    case 'j': engine.shuttle(-1); return true
    case 'k': engine.pause(); return true
    case 'v': tl.tool = 'select'; return true
    case 'c': tl.tool = 'razor'; return true
    case 'h': tl.tool = 'hand'; return true
    case 's': tl.snap = !tl.snap; return true
    case 'm': tl.addMarker(); return true
    case 'q': tl.trimToPlayhead('start'); return true
    case 'w': tl.trimToPlayhead('end'); return true
    case 'e': // Mayús+E
      if (e.shiftKey) {
        tl.toggleEnabled()
        return true
      }
      return false
    case 'Delete':
    case 'Backspace':
      if (tl.selectedTransition) tl.removeTransition(tl.selectedTransition)
      else tl.deleteSelection(e.shiftKey)
      return true
    case 'Home': tl.setPlayhead(0); return true
    case 'End': tl.setPlayhead(tl.duration); return true
    case 'ArrowLeft': engine.step(e.shiftKey ? -5 : -1); return true
    case 'ArrowRight': engine.step(e.shiftKey ? 5 : 1); return true
    case 'ArrowUp': tl.seekEdge(-1); return true
    case 'ArrowDown': tl.seekEdge(1); return true
    case '+':
    case '=': tl.setZoom(tl.zoom * 1.25); return true
    case '-': tl.setZoom(tl.zoom / 1.25); return true
    case '\\': tl.fit(tl.viewWidth - 170); return true
    case 'Escape':
      tl.select([])
      return true
    default:
      return false
  }
}
