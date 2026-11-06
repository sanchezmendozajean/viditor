<script setup lang="ts">
import { computed } from 'vue'
import { useTimelinePlayback } from '@/stores/playback'
import Panel from '../components/Panel.vue'
import LevelMeter from '../components/LevelMeter.vue'

const pb = useTimelinePlayback()
const m = computed(() => pb.meters?.master)
const scale = [0, -6, -12, -24, -36, -48, -60]
const fmt = (db: number | undefined): string => (db === undefined || !Number.isFinite(db) ? '−∞' : db.toFixed(1))
</script>

<template>
  <Panel title="Medidores" help="audio">
    <div class="meters" data-testid="meters">
      <div class="scale">
        <span v-for="s in scale" :key="s" :style="{ bottom: ((s + 60) / 66) * 100 + '%' }" class="dim mono">{{ s }}</span>
      </div>
      <LevelMeter :peak="m?.peakL ?? -Infinity" :rms="m?.rmsL ?? -Infinity" :clip="m?.clip ?? false" />
      <LevelMeter :peak="m?.peakR ?? -Infinity" :rms="m?.rmsR ?? -Infinity" :clip="m?.clip ?? false" />
    </div>
    <div class="lbl mono dim">L {{ fmt(m?.peakL) }} · R {{ fmt(m?.peakR) }}</div>
  </Panel>
</template>

<style scoped>
.meters { position: absolute; top: 8px; bottom: 22px; left: 8px; right: 8px; display: flex; gap: 4px; justify-content: center; }
.scale { position: relative; width: 22px; }
.scale span { position: absolute; right: 2px; transform: translateY(50%); font-size: 8px; }
.lbl { position: absolute; bottom: 4px; left: 0; right: 0; text-align: center; font-size: 9px; }
</style>
