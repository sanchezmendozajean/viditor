<script setup lang="ts">
import { ref } from 'vue'
import { useUiStore, type ImportChoice } from '@/stores/ui'
import Modal from '../components/Modal.vue'

const ui = useUiStore()
const mode = ref<ImportChoice['mode']>('reference')
const remember = ref(false)

const options: { value: ImportChoice['mode']; title: string; text: string }[] = [
  { value: 'reference', title: 'Dejar en su ubicación actual', text: 'El proyecto hará referencia al archivo original.' },
  { value: 'copy', title: 'Copiar a la carpeta del proyecto', text: 'Se copia a media/. El original no se toca.' },
  { value: 'move', title: 'Mover a la carpeta del proyecto', text: 'El archivo se traslada a media/.' }
]
function answer(ok: boolean): void {
  ui.importAsk?.resolve(ok ? { mode: mode.value, remember: remember.value } : null)
}
</script>

<template>
  <Modal :title="`Importar ${ui.importAsk?.count ?? 0} ${ui.importAsk?.count === 1 ? 'archivo' : 'archivos'}`" @close="answer(false)">
    <div class="body" data-testid="import-dialog">
      <p>¿Qué hacer con los archivos?</p>
      <label v-for="o in options" :key="o.value" class="opt">
        <input v-model="mode" type="radio" name="import-mode" :value="o.value" :data-testid="`import-${o.value}`" />
        <span><strong>{{ o.title }}</strong><br /><span class="dim">{{ o.text }}</span></span>
      </label>
      <label class="remember"><input v-model="remember" type="checkbox" /> Recordar mi elección para este proyecto</label>
      <footer>
        <button class="btn" @click="answer(false)">Cancelar</button>
        <button class="btn primary" data-testid="import-confirm" @click="answer(true)">Importar</button>
      </footer>
    </div>
  </Modal>
</template>

<style scoped>
.body { width: 440px; font-size: 12px; }
p { margin: 0 0 8px; }
.opt { display: flex; gap: 10px; padding: 8px 0; align-items: flex-start; cursor: pointer; }
.remember { display: flex; gap: 8px; align-items: center; margin-top: 8px; color: var(--text-dim); }
footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
</style>
