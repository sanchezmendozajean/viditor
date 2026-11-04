<script setup lang="ts">
import { computed } from 'vue'
import { useProjectStore } from '@/stores/project'
import Panel from '../components/Panel.vue'

const project = useProjectStore()
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
      <div class="tc"><span class="mono accent">00:00:00:00</span><span class="mono dim">00:00:00:00</span></div>
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
