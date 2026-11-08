<script setup lang="ts">
import { ref } from 'vue'
import { useUiStore, type ImportChoice } from '@/stores/ui'
import Modal from '../components/Modal.vue'
import Icon from '../components/Icon.vue'
import type { IconName } from '../components/Icon.vue'

const ui = useUiStore()
const mode = ref<ImportChoice['mode']>('reference')
const remember = ref(false)

const options: { value: ImportChoice['mode']; icon: IconName; title: string; text: string }[] = [
  { value: 'reference', icon: 'link', title: 'Dejar en su ubicación actual', text: 'El proyecto hará referencia al archivo original.' },
  { value: 'copy', icon: 'copy', title: 'Copiar a la carpeta del proyecto', text: 'Se copia a media/. El original no se toca.' },
  { value: 'move', icon: 'folder-open', title: 'Mover a la carpeta del proyecto', text: 'El archivo se traslada a media/.' }
]
function answer(ok: boolean): void {
  ui.importAsk?.resolve(ok ? { mode: mode.value, remember: remember.value } : null)
}
function choose(m: ImportChoice['mode'], confirm = false): void {
  mode.value = m
  if (confirm) answer(true)
}
</script>

<template>
  <Modal :title="`Importar ${ui.importAsk?.count ?? 0} ${ui.importAsk?.count === 1 ? 'archivo' : 'archivos'}`" @close="answer(false)">
    <div class="body" data-testid="import-dialog">
      <p>¿Qué hacer con los archivos?</p>
      <div class="opts" role="radiogroup" aria-label="Qué hacer con los archivos">
        <button
          v-for="o in options"
          :key="o.value"
          type="button"
          class="opt"
          :class="{ on: mode === o.value }"
          role="radio"
          :aria-checked="mode === o.value"
          title="Doble clic para importar así"
          :data-testid="`import-${o.value}`"
          @click="choose(o.value)"
          @dblclick="choose(o.value, true)"
        >
          <span class="ico"><Icon :name="o.icon" :size="18" /></span>
          <span class="txt"><strong>{{ o.title }}</strong><span class="dim">{{ o.text }}</span></span>
        </button>
      </div>
      <footer>
        <label class="remember"><input v-model="remember" type="checkbox" /> Recordar mi elección para este proyecto</label>
        <button class="btn" @click="answer(false)">Cancelar</button>
        <button class="btn primary" data-testid="import-confirm" @click="answer(true)">Importar</button>
      </footer>
    </div>
  </Modal>
</template>

<style scoped>
.body { width: 460px; font-size: 12px; }
p { margin: 0 0 8px; }
.opts { display: flex; flex-direction: column; gap: 6px; }
.opt { display: flex; gap: 12px; align-items: center; width: 100%; text-align: left; padding: 8px 12px; background: var(--bg-panel-header); border: 1px solid var(--border-subtle); border-radius: 3px; cursor: pointer; color: var(--text); }
.opt:hover { background: var(--bg-hover); }
.opt.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, transparent); }
.ico { display: grid; place-items: center; width: 28px; flex: none; color: var(--text-dim); }
.on .ico { color: var(--accent); }
.txt { display: flex; flex-direction: column; gap: 2px; }
.remember { display: flex; gap: 8px; align-items: center; margin-right: auto; color: var(--text-dim); cursor: pointer; }
footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 14px; }
</style>
