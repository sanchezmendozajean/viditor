<script setup lang="ts">
import { useProjectStore } from '@/stores/project'
import Panel from '../components/Panel.vue'

const project = useProjectStore()
</script>

<template>
  <Panel title="Inspector" help="project">
    <div v-if="project.project" class="insp" data-testid="inspector">
      <h3>Ajustes del proyecto</h3>
      <dl>
        <dt>Nombre</dt><dd>{{ project.project.name }}</dd>
        <dt>Resolución</dt><dd class="mono">{{ project.project.settings.width }} × {{ project.project.settings.height }}</dd>
        <dt>Fotogramas</dt><dd class="mono">{{ +(project.project.settings.fps.num / project.project.settings.fps.den).toFixed(3) }} fps</dd>
        <dt>Audio</dt><dd class="mono">{{ project.project.settings.sampleRate }} Hz</dd>
        <dt>Fondo</dt><dd><span class="sw" :style="{ background: project.project.settings.background }" /> {{ project.project.settings.background }}</dd>
        <dt>Importación</dt>
        <dd>
          <select
            :value="project.project.settings.importMode"
            @change="project.mutate((p) => (p.settings.importMode = ($event.target as HTMLSelectElement).value as typeof p.settings.importMode))"
          >
            <option value="ask">Preguntar siempre</option>
            <option value="reference">Dejar en su ubicación</option>
            <option value="copy">Copiar al proyecto</option>
            <option value="move">Mover al proyecto</option>
          </select>
        </dd>
      </dl>
    </div>
  </Panel>
</template>

<style scoped>
.insp { padding: 10px 12px; }
h3 { margin: 0 0 8px; font-size: 11px; font-weight: 600; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0; align-items: center; }
dt { color: var(--text-dim); }
dd { margin: 0; }
select { width: 100%; font-size: 11px; }
.sw { display: inline-block; width: 12px; height: 12px; border: 1px solid var(--border-subtle); vertical-align: -2px; }
</style>
