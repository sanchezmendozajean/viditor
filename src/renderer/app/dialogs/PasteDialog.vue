<script setup lang="ts">
import { computed, ref } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useTimelineStore } from '@/stores/timeline'
import Modal from '../components/Modal.vue'
import Icon from '../components/Icon.vue'
import type { IconName } from '../components/Icon.vue'

type Where = 'playhead' | 'selection' | 'end'

const ui = useUiStore()
const tl = useTimelineStore()
const where = ref<Where>('playhead')
const count = computed(() => tl.clipboard.length)

const options = computed<{ value: Where; icon: IconName; title: string; text: string; disabled?: boolean }[]>(() => [
  { value: 'playhead', icon: 'down', title: 'En la posición del cabezal', text: 'El clip empieza donde está el cabezal.' },
  {
    value: 'selection',
    icon: 'right',
    title: 'Al final del elemento seleccionado',
    text: tl.selectedClips.length ? 'Justo después del clip seleccionado.' : 'Requiere un clip seleccionado.',
    disabled: tl.selectedClips.length === 0
  },
  { value: 'end', icon: 'skipFwd', title: 'Al final del contenido', text: 'Después del último clip de la secuencia.' }
])

function answer(ok: boolean): void {
  ui.pasteAsk?.resolve(ok ? where.value : null)
}
function choose(o: { value: Where; disabled?: boolean }, confirm = false): void {
  if (o.disabled) return
  where.value = o.value
  if (confirm) answer(true)
}
</script>

<template>
  <Modal :title="count === 1 ? 'Pegar clip' : `Pegar ${count} clips`" @close="answer(false)">
    <div class="body" data-testid="paste-dialog">
      <p>Se pegará con todas sus propiedades (transformación, audio, fundidos y fotogramas clave). ¿Dónde?</p>
      <div class="opts" role="radiogroup" aria-label="Dónde pegar">
        <button
          v-for="o in options"
          :key="o.value"
          type="button"
          class="opt"
          :class="{ on: where === o.value }"
          role="radio"
          :aria-checked="where === o.value"
          :disabled="o.disabled"
          title="Doble clic para pegar aquí"
          :data-testid="`paste-${o.value}`"
          @click="choose(o)"
          @dblclick="choose(o, true)"
        >
          <span class="ico"><Icon :name="o.icon" :size="18" /></span>
          <span class="txt"><strong>{{ o.title }}</strong><span class="dim">{{ o.text }}</span></span>
        </button>
      </div>
      <footer>
        <button class="btn" @click="answer(false)">Cancelar</button>
        <button class="btn primary" data-testid="paste-confirm" @click="answer(true)">Pegar</button>
      </footer>
    </div>
  </Modal>
</template>

<style scoped>
.body { width: 460px; font-size: 12px; }
p { margin: 0 0 10px; }
.opts { display: flex; flex-direction: column; gap: 6px; }
.opt { display: flex; gap: 12px; align-items: center; width: 100%; text-align: left; padding: 8px 12px; background: var(--bg-panel-header); border: 1px solid var(--border-subtle); border-radius: 3px; cursor: pointer; color: var(--text); }
.opt:hover:not(:disabled) { background: var(--bg-hover); }
.opt:disabled { opacity: 0.5; cursor: default; }
.opt.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, transparent); }
.ico { display: grid; place-items: center; width: 28px; flex: none; color: var(--text-dim); }
.on .ico { color: var(--accent); }
.txt { display: flex; flex-direction: column; gap: 2px; }
footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
</style>
