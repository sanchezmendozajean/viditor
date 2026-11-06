<script setup lang="ts">
import { computed } from 'vue'

/** Medidor vertical en dBFS: barra RMS (suave) y marca de pico. Rojo = recorte. */
const props = defineProps<{ peak: number; rms: number; clip: boolean }>()
const MIN = -60
const MAX = 6
const pct = (db: number): number => (Number.isFinite(db) ? Math.max(0, Math.min(100, ((db - MIN) / (MAX - MIN)) * 100)) : 0)
const peakPct = computed(() => pct(props.peak))
const rmsPct = computed(() => pct(props.rms))
</script>

<template>
  <div class="meter" :class="{ clip }" data-testid="level-meter">
    <div class="rms" :style="{ height: rmsPct + '%' }" />
    <div class="peak" :style="{ bottom: peakPct + '%' }" />
    <div class="zero" />
  </div>
</template>

<style scoped>
.meter { position: relative; width: 8px; height: 100%; background: #111; border: 1px solid var(--border); overflow: hidden; }
.rms { position: absolute; left: 0; right: 0; bottom: 0; background: linear-gradient(to top, var(--ok) 0 70%, var(--warn) 85%, var(--danger)); transition: height 60ms linear; }
.peak { position: absolute; left: 0; right: 0; height: 2px; background: #fff; opacity: 0.85; }
.zero { position: absolute; left: 0; right: 0; bottom: calc(60 / 66 * 100%); height: 1px; background: rgba(255, 255, 255, 0.35); }
.clip { outline: 1px solid var(--danger); }
.clip::after { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--danger); }
</style>
