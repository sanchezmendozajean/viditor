import { useTimelineStore } from '@/stores/timeline'
import { useUiStore } from '@/stores/ui'

/** Pregunta dónde pegar y pega los clips copiados. */
export async function pasteWithDialog(): Promise<void> {
  const tl = useTimelineStore()
  if (!tl.clipboard.length) return
  const where = await useUiStore().askPaste()
  if (where) tl.pasteClips(where)
}
