<script setup lang="ts">
import { computed } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useTimelineStore } from '@/stores/timeline'
import { formatTimecode } from '@shared/timecode'
import Panel from '../components/Panel.vue'

const project = useProjectStore()
const tl = useTimelineStore()
const fmt = (t: number): string => {
  const f = project.project?.settings.fps ?? { num: 30, den: 1 }
  return formatTimecode(t, f.num, f.den)
}
const ratio = computed(() => {
  const s = project.project?.settings
  return s ? s.width / s.height : 16 / 9
})
</script>

<template>
  <Panel title="Monitor del programa">
    <div class="monitor">
      <div class="stage">
        <div
          class="frame"
          :style="{ '--ratio': ratio, background: project.project?.settings.background }"
          data-testid="monitor-frame"
        />
      </div>
      <div class="tc"><span class="mono accent" data-testid="monitor-tc">{{ fmt(tl.playhead) }}</span><span class="mono dim">{{ fmt(tl.duration) }}</span></div>
    </div>
  </Panel>
</template>

<style scoped>
.monitor { height: 100%; background: var(--monitor-bg); display: flex; flex-direction: column; }
.stage { flex: 1; min-height: 0; container-type: size; display: grid; place-items: center; }
/* El cuadro conserva el aspecto del proyecto y cabe en el espacio disponible. */
.frame { width: min(94cqw, calc(94cqh * var(--ratio))); aspect-ratio: var(--ratio); outline: 1px solid var(--border-subtle); }
.tc { display: flex; justify-content: space-between; padding: 6px 12px; flex: none; }
.accent { color: var(--accent); }
</style>
