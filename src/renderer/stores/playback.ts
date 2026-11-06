import { defineStore } from 'pinia'
import type { MeterSnapshot } from '@/engine/audio'

export type Quality = 'full' | 'half' | 'quarter'
export const QUALITY_SCALE: Record<Quality, number> = { full: 1, half: 0.5, quarter: 0.25 }

export const useTimelinePlayback = defineStore('playback', {
  state: () => ({
    playing: false,
    /** Velocidad: 1, 2, 4 hacia delante; −1, −2, −4 hacia atrás (J/K/L) */
    rate: 1,
    loop: false,
    quality: 'full' as Quality,
    meters: null as MeterSnapshot | null
  })
})
