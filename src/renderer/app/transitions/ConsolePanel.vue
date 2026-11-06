<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { transitionHost } from '@/engine/transition-host'
import { useTransitionsStore } from '@/stores/transitions'
import Panel from '../components/Panel.vue'

/** Consola del espacio Transiciones: salida de `log()`, errores con línea (clic = saltar) y ms por frame. */
const props = defineProps<{ current: string | null }>()
const emit = defineEmits<{ reveal: [line: number] }>()

const trs = useTransitionsStore()
const onlyCurrent = ref(true)
const box = ref<HTMLElement | null>(null)
const entries = computed(() => (onlyCurrent.value && props.current ? trs.console.filter((e) => e.ref === props.current) : trs.console))
const ms = computed(() => (props.current ? transitionHost.stats.get(props.current) : undefined))

watch(
  () => entries.value.length,
  async () => {
    await nextTick()
    if (box.value) box.value.scrollTop = box.value.scrollHeight
  }
)
const openHelp = (): void => window.viditor.help.open('debugging')
const time = (t: number): string => new Date(t).toLocaleTimeString('es', { hour12: false })
</script>

<template>
  <Panel title="Consola" help="debugging">
    <template #actions>
      <span v-if="ms !== undefined" class="mono dim ms" data-testid="render-ms" :class="{ slow: ms > 8 }" title="Tiempo medio de render() por frame (presupuesto: 8 ms)">{{ ms.toFixed(2) }} ms/frame</span>
      <label class="chk"><input v-model="onlyCurrent" type="checkbox" /> Solo esta</label>
      <button class="icon-btn txt" title="Limpiar" @click="trs.clearConsole()">Limpiar</button>
    </template>
    <div ref="box" class="console mono" data-testid="console">
      <div v-if="entries.length === 0" class="dim empty">Sin mensajes. Usa <code>log(...)</code> en tu transición.</div>
      <div v-for="e in entries" :key="e.id" class="line" :class="e.level" data-testid="console-line">
        <span class="t">{{ time(e.time) }}</span>
        <span class="r">{{ e.ref.split(':')[1] }}</span>
        <a v-if="e.line" class="ln" title="Saltar a la línea" @click="emit('reveal', e.line)">línea {{ e.line }}</a>
        <span class="msg">{{ e.text }}</span>
        <a v-if="e.level === 'error'" class="what" data-testid="console-help" @click="openHelp">¿Qué significa esto?</a>
      </div>
    </div>
  </Panel>
</template>

<style scoped>
.console { height: 100%; overflow: auto; background: var(--console-bg); padding: 6px 8px; font-size: 11px; user-select: text; }
.empty { padding: 4px 0; }
.line { display: flex; gap: 8px; padding: 1px 0; white-space: pre-wrap; word-break: break-word; color: var(--text-dim); }
.line.warn { color: var(--warn); }
.line.error { color: var(--danger); }
.t { color: #666; flex: none; }
.r { color: #8a8a8a; flex: none; }
.ln { color: var(--accent); cursor: pointer; flex: none; text-decoration: underline; }
.msg { flex: 1; }
.what { color: var(--accent); cursor: pointer; flex: none; font-family: var(--font-ui); }
.ms { font-size: 10px; margin-right: 8px; }
.ms.slow { color: var(--warn); }
.chk { display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--text-dim); margin-right: 6px; }
button.txt { width: auto; padding: 0 6px; font-size: 10px; }
</style>
