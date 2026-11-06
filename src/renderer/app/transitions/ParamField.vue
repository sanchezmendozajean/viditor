<script setup lang="ts">
import { EASING_NAMES } from '../../../transition-runtime/easing'
import type { ParamDef } from '../../../transition-runtime/runtime'
import ScrubNumber from '../components/ScrubNumber.vue'

/** Control de un parámetro de transición, generado según su tipo (number, int, boolean, color, enum, easing, angle, point). */
const props = defineProps<{ name: string; def: ParamDef; value: unknown }>()
const emit = defineEmits<{ input: [v: unknown] }>()

const hex6 = (c: unknown): string => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : '#000000')
const pt = (): [number, number] => (Array.isArray(props.value) ? (props.value as [number, number]) : (props.def.default as [number, number]))
</script>

<template>
  <div class="field" :data-testid="`pf-${name}`">
    <label :title="name">{{ def.label ?? name }}</label>
    <ScrubNumber v-if="def.type === 'number' || def.type === 'int'" :model-value="Number(value)" :decimals="def.type === 'int' ? 0 : 2" :step="def.type === 'int' ? 0.25 : (def.step ?? 0.05)" :min="def.min" :max="def.max" @update:model-value="emit('input', def.type === 'int' ? Math.round($event) : $event)" />
    <ScrubNumber v-else-if="def.type === 'angle'" :model-value="Number(value)" :decimals="0" suffix="°" @update:model-value="emit('input', $event)" />
    <input v-else-if="def.type === 'boolean'" type="checkbox" :checked="Boolean(value)" @change="emit('input', ($event.target as HTMLInputElement).checked)" />
    <input v-else-if="def.type === 'color'" type="color" :value="hex6(value)" @input="emit('input', ($event.target as HTMLInputElement).value)" />
    <select v-else-if="def.type === 'enum'" :value="String(value)" @change="emit('input', ($event.target as HTMLSelectElement).value)">
      <option v-for="o in def.options" :key="o" :value="o">{{ o }}</option>
    </select>
    <select v-else-if="def.type === 'easing'" :value="String(value)" @change="emit('input', ($event.target as HTMLSelectElement).value)">
      <option v-for="o in EASING_NAMES" :key="o" :value="o">{{ o }}</option>
    </select>
    <div v-else-if="def.type === 'point'" class="pair">
      <ScrubNumber :model-value="pt()[0]" :decimals="2" :step="0.01" :min="0" :max="1" @update:model-value="emit('input', [$event, pt()[1]])" />
      <ScrubNumber :model-value="pt()[1]" :decimals="2" :step="0.01" :min="0" :max="1" @update:model-value="emit('input', [pt()[0], $event])" />
    </div>
  </div>
</template>

<style scoped>
.field { display: grid; grid-template-columns: 110px 1fr; gap: 8px; align-items: center; padding: 3px 0; }
label { color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
select { width: 100%; font-size: 11px; }
.pair { display: flex; gap: 4px; }
</style>
