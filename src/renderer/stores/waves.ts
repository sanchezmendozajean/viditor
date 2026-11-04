import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import type { MediaItem } from '@shared/project-schema'
import type { Waveform } from '@shared/ipc'

type Entry = { state: 'loading' } | { state: 'none' } | { state: 'ready'; wave: Waveform }

/** Caché de formas de onda por medio. Los picos se marcan como raw: son arrays grandes e inmutables. */
export const useWaveStore = defineStore('waves', {
  state: () => ({ entries: {} as Record<string, Entry> }),
  actions: {
    get(mediaId: string): Waveform | null {
      const e = this.entries[mediaId]
      return e?.state === 'ready' ? e.wave : null
    },
    async ensure(m: MediaItem): Promise<void> {
      if (this.entries[m.id] || m.kind === 'image' || (m.kind === 'video' && !m.probe?.hasAudio)) return
      this.entries[m.id] = { state: 'loading' }
      const r = await window.viditor.media.waveform(m.id, m.path)
      this.entries[m.id] = r.ok ? { state: 'ready', wave: markRaw(r.value) } : { state: 'none' }
    }
  }
})
