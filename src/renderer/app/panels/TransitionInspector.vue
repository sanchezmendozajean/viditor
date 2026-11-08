<script setup lang="ts">
import { computed } from 'vue'
import type { Transition } from '@shared/project-schema'
import { maxTransitionDuration } from '@shared/transition-model'
import { frameDuration } from '@shared/timeline-ops'
import { EASING_NAMES } from '../../../transition-runtime/easing'
import type { ParamDef } from '../../../transition-runtime/runtime'
import { useProjectStore } from '@/stores/project'
import { useTimelineStore } from '@/stores/timeline'
import { useTransitionsStore } from '@/stores/transitions'
import { useUiStore } from '@/stores/ui'
import ScrubNumber from '../components/ScrubNumber.vue'

const project = useProjectStore()
const tl = useTimelineStore()
const trs = useTransitionsStore()
const ui = useUiStore()

const tr = computed<Transition | undefined>(() => project.project?.transitions.find((t) => t.id === tl.selectedTransition))
const meta = computed(() => (tr.value ? trs.metaOf(tr.value.transitionRef) : undefined))
const file = computed(() => (tr.value ? trs.fileOf(tr.value.transitionRef) : undefined))
const error = computed(() => (tr.value ? trs.errorOf(tr.value.transitionRef) : undefined))
const maxDur = computed(() => (project.project && tr.value ? maxTransitionDuration(project.project, tr.value.leaveClipId, tr.value.enterClipId, tr.value.id) : 1))
const minDur = computed(() => (project.project ? frameDuration(project.project) : 1 / 30))
const originLabel: Record<string, string> = { builtin: 'Integrada', user: 'Usuario', project: 'Proyecto' }
const paramEntries = computed(() => Object.entries(meta.value?.params ?? {}) as [string, ParamDef][])
const value = (key: string, def: ParamDef): unknown => (tr.value && key in tr.value.params ? tr.value.params[key] : def.default)
const point = (key: string, def: ParamDef): [number, number] => value(key, def) as [number, number]

let before = ''
const start = (): void => {
  before = tl.snapshot()
}
const end = (label: string): void => tl.commit(label, before)
const setParam = (key: string, v: unknown): void => tl.liveTransition(tr.value!.id, (t) => (t.params = { ...t.params, [key]: v }))
const setParamNow = (key: string, v: unknown): void => tl.editTransition(tr.value!.id, 'Cambiar parámetro de la transición', (t) => (t.params = { ...t.params, [key]: v }))

/** <input type="color"> solo acepta #rrggbb */
const hex6 = (c: unknown): string => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : '#000000')

function editCode(): void {
  if (!tr.value) return
  trs.editing = tr.value.transitionRef
  ui.workspace = 'transitions'
}
</script>

<template>
  <div v-if="tr" class="insp" data-testid="inspector-transition">
    <h3>
      {{ trs.nameOf(tr.transitionRef) }}
      <span v-if="file" class="badge" :class="file.origin">{{ originLabel[file.origin] }}</span>
      <span v-if="error || !file" class="warn" :title="error ?? 'Falta el archivo de la transición'">⚠</span>
    </h3>
    <p v-if="!file" class="err">No se encuentra <code>{{ tr.transitionRef }}</code>. Se renderiza como corte seco.</p>
    <p v-else-if="error" class="err">{{ error }}</p>

    <div class="grid">
      <label>Duración</label>
      <ScrubNumber
        :model-value="tr.duration"
        :decimals="2"
        :step="0.02"
        :min="minDur"
        :max="Math.max(minDur, maxDur)"
        suffix=" s"
        data-testid="tr-duration"
        @start="start"
        @update:model-value="tl.liveTransitionDuration(tr.id, $event)"
        @end="end('Cambiar duración de la transición')"
      />

      <label>Audio</label>
      <select :value="tr.audio ?? ''" data-testid="tr-audio" @change="tl.editTransition(tr.id, 'Audio de la transición', (t) => (t.audio = (($event.target as HTMLSelectElement).value || undefined) as Transition['audio']))">
        <option value="">Predeterminado ({{ meta?.audio ?? 'crossfade' }})</option>
        <option value="crossfade">Fundido cruzado</option>
        <option value="cut">Corte en el punto medio</option>
        <option value="none">Ninguno</option>
      </select>

      <template v-for="[key, def] in paramEntries" :key="key">
        <label :title="key">{{ def.label ?? key }}</label>
        <ScrubNumber v-if="def.type === 'number' || def.type === 'int'" :model-value="Number(value(key, def))" :decimals="def.type === 'int' ? 0 : 2" :step="def.type === 'int' ? 0.25 : (def.step ?? 0.05)" :min="def.min" :max="def.max" :data-testid="`param-${key}`" @start="start" @update:model-value="setParam(key, def.type === 'int' ? Math.round($event) : $event)" @end="end('Cambiar parámetro de la transición')" />
        <ScrubNumber v-else-if="def.type === 'angle'" :model-value="Number(value(key, def))" :decimals="0" suffix="°" :data-testid="`param-${key}`" @start="start" @update:model-value="setParam(key, $event)" @end="end('Cambiar parámetro de la transición')" />
        <input v-else-if="def.type === 'boolean'" type="checkbox" :checked="Boolean(value(key, def))" :data-testid="`param-${key}`" @change="setParamNow(key, ($event.target as HTMLInputElement).checked)" />
        <input v-else-if="def.type === 'color'" type="color" :value="hex6(value(key, def))" :data-testid="`param-${key}`" @change="setParamNow(key, ($event.target as HTMLInputElement).value)" />
        <select v-else-if="def.type === 'enum'" :value="String(value(key, def))" :data-testid="`param-${key}`" @change="setParamNow(key, ($event.target as HTMLSelectElement).value)">
          <option v-for="o in def.options" :key="o" :value="o">{{ o }}</option>
        </select>
        <select v-else-if="def.type === 'easing'" :value="String(value(key, def))" :data-testid="`param-${key}`" @change="setParamNow(key, ($event.target as HTMLSelectElement).value)">
          <option v-for="o in EASING_NAMES" :key="o" :value="o">{{ o }}</option>
        </select>
        <div v-else-if="def.type === 'point'" class="pair">
          <ScrubNumber :model-value="point(key, def)[0]" :decimals="2" :step="0.01" :min="0" :max="1" @start="start" @update:model-value="setParam(key, [$event, point(key, def)[1]])" @end="end('Cambiar parámetro de la transición')" />
          <ScrubNumber :model-value="point(key, def)[1]" :decimals="2" :step="0.01" :min="0" :max="1" @start="start" @update:model-value="setParam(key, [point(key, def)[0], $event])" @end="end('Cambiar parámetro de la transición')" />
        </div>
      </template>

      <label>Semilla</label>
      <ScrubNumber :model-value="tr.seed" :decimals="0" :step="0.25" :min="0" data-testid="tr-seed" @start="start" @update:model-value="tl.liveTransition(tr.id, (t) => (t.seed = Math.round($event)))" @end="end('Cambiar semilla')" />
    </div>

    <div class="actions">
      <button class="btn" :disabled="!file" data-testid="tr-edit-code" @click="editCode">Editar código</button>
      <button class="btn" data-testid="tr-remove" @click="tl.removeTransition(tr.id)">Eliminar</button>
    </div>
  </div>
</template>

<style scoped>
.insp { padding: 5px; }
h3 { margin: 0 0 8px; font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.badge { font-weight: 400; font-size: 9px; padding: 1px 5px; border-radius: 8px; background: #3a3a3a; color: var(--text-dim); }
.badge.user { background: #2f4a63; color: #9ccaf5; }
.badge.project { background: #4d4a2c; color: #e3d58d; }
.warn { color: var(--warn); }
.err { color: var(--danger); margin: 0 0 8px; user-select: text; }
.grid { display: grid; grid-template-columns: 84px 1fr; gap: 6px 8px; align-items: center; }
label { color: var(--text-dim); }
select { width: 100%; font-size: 11px; }
.pair { display: flex; gap: 4px; }
.actions { display: flex; gap: 6px; margin-top: 14px; }
</style>
