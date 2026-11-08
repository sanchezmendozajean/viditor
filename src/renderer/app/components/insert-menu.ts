import type { MenuEntry } from '@/stores/ui'
import { useTimelineStore } from '@/stores/timeline'

/** Opciones "Insertar…" compartidas por el menú contextual de Recursos y el modal de previsualización. */
export function insertMenuItems(mediaId: string, after?: () => void): MenuEntry[] {
  const tl = useTimelineStore()
  const go = (where: 'playhead' | 'selection' | 'end') => (): void => {
    tl.addMediaAt(mediaId, where)
    after?.()
  }
  return [
    { label: 'Insertar en la posición del cabezal', icon: 'down', action: go('playhead') },
    { label: 'Insertar al final del elemento seleccionado', icon: 'right', disabled: tl.selectedClips.length === 0, action: go('selection') },
    { label: 'Insertar al final del contenido', icon: 'skipFwd', action: go('end') }
  ]
}
