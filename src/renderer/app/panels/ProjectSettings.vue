<script setup lang="ts">
import { ref, watch } from 'vue'
import { useProjectStore } from '@/stores/project'

/** Datos del proyecto siempre a mano (pestaña «Proyecto» del panel derecho). El nombre se puede cambiar. */
const project = useProjectStore()
const draft = ref(project.project?.name ?? '')
watch(() => project.project?.name, (n) => (draft.value = n ?? ''))

function commit(): void {
  const name = draft.value.trim()
  if (!project.project) return
  if (!name) {
    draft.value = project.project.name // el nombre no puede quedar vacío
    return
  }
  if (name !== project.project.name) project.mutate((p) => (p.name = name))
  draft.value = name
}
</script>

<template>
  <div v-if="project.project" class="info" data-testid="project-settings">
    <h3>Ajustes del proyecto</h3>
    <dl>
      <dt>Nombre</dt>
      <dd>
        <input
          v-model="draft"
          type="text"
          maxlength="120"
          data-testid="project-name"
          title="Nombre del proyecto (Enter para confirmar, Esc para cancelar)"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          @keydown.esc.prevent="draft = project.project.name"
          @blur="commit"
        />
      </dd>
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
</template>

<style scoped>
.info { padding: 5px; }
h3 { margin: 0 0 8px; font-size: 11px; font-weight: 600; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0; align-items: center; }
dt { color: var(--text-dim); }
dd { margin: 0; min-width: 0; }
input[type='text'], select { width: 100%; font-size: 11px; }
.sw { display: inline-block; width: 12px; height: 12px; border: 1px solid var(--border-subtle); vertical-align: -2px; }
</style>
