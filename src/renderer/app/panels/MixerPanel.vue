<script setup lang="ts">
import { computed } from 'vue'
import { gainToDb } from '@shared/render-model'
import { useProjectStore } from '@/stores/project'
import { useTimelineStore } from '@/stores/timeline'
import { useTimelinePlayback } from '@/stores/playback'
import Panel from '../components/Panel.vue'
import LevelMeter from '../components/LevelMeter.vue'

const project = useProjectStore()
const tl = useTimelineStore()
const pb = useTimelinePlayback()
const tracks = computed(() => project.project?.tracks ?? [])
const master = computed(() => project.project?.settings.masterVolume ?? 1)

const db = (g: number): string => {
  const d = gainToDb(g)
  return Number.isFinite(d) ? `${d.toFixed(1)} dB` : '−∞ dB'
}

let before = ''
function trackStart(): void {
  before = tl.snapshot()
}
function trackInput(id: string, e: Event): void {
  const v = Number((e.target as HTMLInputElement).value) / 100
  project.mutate((p) => {
    const t = p.tracks.find((x) => x.id === id)
    if (t) t.volume = v
  })
}
function onMaster(e: Event): void {
  project.mutate((p) => (p.settings.masterVolume = Number((e.target as HTMLInputElement).value) / 100))
}
</script>

<template>
  <Panel title="Mezclador de audio" help="audio">
    <div class="mixer" data-testid="mixer">
      <div v-for="t in tracks" :key="t.id" class="strip" :data-testid="`strip-${t.name}`">
        <div class="name" :title="t.name">{{ t.name }}</div>
        <div class="pan dim" title="Paneo (reservado)">◯</div>
        <div class="fader-row">
          <input
            class="fader"
            type="range"
            min="0"
            max="200"
            :value="Math.round(t.volume * 100)"
            :data-testid="`fader-${t.name}`"
            @pointerdown="trackStart"
            @input="trackInput(t.id, $event)"
            @change="tl.commit('Volumen de pista', before)"
          />
          <LevelMeter :peak="pb.meters?.tracks[t.id]?.peakL ?? -Infinity" :rms="pb.meters?.tracks[t.id]?.rmsL ?? -Infinity" :clip="pb.meters?.tracks[t.id]?.clip ?? false" />
        </div>
        <div class="btns">
          <button class="tbtn" :class="{ on: t.muted }" title="Silenciar" @click="tl.setTrack(t.id, 'muted', !t.muted, 'Silenciar pista')">M</button>
          <button class="tbtn" :class="{ on: t.solo, solo: t.solo }" title="Solo" @click="tl.setTrack(t.id, 'solo', !t.solo, 'Solo de pista')">S</button>
        </div>
        <div class="val mono">{{ db(t.volume) }}</div>
      </div>

      <div class="strip master">
        <div class="name">Master</div>
        <div class="pan dim">◯</div>
        <div class="fader-row">
          <input class="fader" type="range" min="0" max="200" :value="Math.round(master * 100)" data-testid="fader-master" @input="onMaster" />
          <LevelMeter :peak="pb.meters?.master.peakL ?? -Infinity" :rms="pb.meters?.master.rmsL ?? -Infinity" :clip="pb.meters?.master.clip ?? false" />
          <LevelMeter :peak="pb.meters?.master.peakR ?? -Infinity" :rms="pb.meters?.master.rmsR ?? -Infinity" :clip="pb.meters?.master.clip ?? false" />
        </div>
        <div class="btns" />
        <div class="val mono">{{ db(master) }}</div>
      </div>
    </div>
  </Panel>
</template>

<style scoped>
.mixer { display: flex; gap: 2px; padding: 8px; height: 100%; overflow-x: auto; }
.strip { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 78px; flex: none; padding: 6px 4px; background: var(--bg-panel-header); border: 1px solid var(--border); }
.strip.master { margin-left: auto; width: 96px; background: #2e2e2e; }
.name { font-weight: 600; }
.fader-row { flex: 1; min-height: 80px; display: flex; gap: 6px; align-items: stretch; }
.fader { writing-mode: vertical-lr; direction: rtl; width: 18px; accent-color: var(--accent); }
.btns { display: flex; gap: 3px; min-height: 20px; }
.tbtn { width: 22px; height: 18px; border: 1px solid var(--border-subtle); border-radius: 2px; background: none; color: var(--text-dim); cursor: pointer; font-size: 10px; font-weight: 600; padding: 0; }
.tbtn.on { background: #555; color: #fff; }
.tbtn.solo { background: var(--warn); color: #000; border-color: var(--warn); }
.val { font-size: 10px; color: var(--text-dim); }
</style>
