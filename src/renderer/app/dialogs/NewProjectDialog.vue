<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { FPS_PRESETS, RESOLUTION_PRESETS, type ImportMode } from '@shared/project-schema'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'
import Modal from '../components/Modal.vue'

const project = useProjectStore()
const ui = useUiStore()

const form = reactive({
  name: 'Proyecto sin título',
  parentDir: '',
  preset: '0',
  width: 1920,
  height: 1080,
  fps: '30/1',
  sampleRate: 48000,
  background: '#000000',
  importMode: 'ask' as ImportMode
})
const busy = ref(false)
const custom = computed(() => form.preset === 'custom')

onMounted(async () => {
  form.parentDir = await window.viditor.project.defaultParentDir()
})

function onPreset(): void {
  const p = RESOLUTION_PRESETS[Number(form.preset)]
  if (p) {
    form.width = p.width
    form.height = p.height
  }
}
async function browse(): Promise<void> {
  const dir = await window.viditor.dialogs.chooseDirectory(form.parentDir)
  if (dir) form.parentDir = dir
}
async function submit(): Promise<void> {
  const [num, den] = form.fps.split('/').map(Number)
  busy.value = true
  const ok = await project.create({
    name: form.name,
    parentDir: form.parentDir,
    settings: {
      width: form.width,
      height: form.height,
      fps: { num: num ?? 30, den: den ?? 1 },
      sampleRate: form.sampleRate,
      background: form.background,
      importMode: form.importMode,
      masterVolume: 1
    }
  })
  busy.value = false
  if (ok) ui.newProjectOpen = false
}
</script>

<template>
  <Modal title="Nuevo proyecto" @close="ui.newProjectOpen = false">
    <form class="form" data-testid="new-project-dialog" @submit.prevent="submit">
      <label>Nombre<input v-model="form.name" type="text" data-testid="np-name" required /></label>
      <label>
        Ubicación
        <span class="row">
          <input v-model="form.parentDir" type="text" class="grow" data-testid="np-dir" required />
          <button type="button" class="btn" @click="browse">Examinar…</button>
        </span>
      </label>
      <label>
        Resolución
        <select v-model="form.preset" @change="onPreset">
          <option v-for="(p, i) in RESOLUTION_PRESETS" :key="p.label" :value="String(i)">{{ p.label }}</option>
          <option value="custom">Personalizada</option>
        </select>
      </label>
      <div v-if="custom" class="row">
        <input v-model.number="form.width" type="number" min="16" max="16384" /> ×
        <input v-model.number="form.height" type="number" min="16" max="16384" />
      </div>
      <label>
        Fotogramas por segundo
        <select v-model="form.fps">
          <option v-for="f in FPS_PRESETS" :key="f.label" :value="`${f.num}/${f.den}`">{{ f.label }}</option>
        </select>
      </label>
      <label>Frecuencia de audio
        <select v-model.number="form.sampleRate"><option :value="48000">48 000 Hz</option><option :value="44100">44 100 Hz</option></select>
      </label>
      <label>Color de fondo<input v-model="form.background" type="color" /></label>
      <label>
        Al importar medios
        <select v-model="form.importMode">
          <option value="ask">Preguntar siempre</option>
          <option value="reference">Dejar en su ubicación</option>
          <option value="copy">Copiar al proyecto</option>
          <option value="move">Mover al proyecto</option>
        </select>
      </label>
      <footer>
        <button type="button" class="btn" @click="ui.newProjectOpen = false">Cancelar</button>
        <button type="submit" class="btn primary" data-testid="np-create" :disabled="busy">Crear</button>
      </footer>
    </form>
  </Modal>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 10px; width: 460px; font-size: 12px; }
label { display: flex; flex-direction: column; gap: 4px; color: var(--text-dim); }
label > :where(input, select) { color: var(--text); }
.row { display: flex; gap: 6px; align-items: center; }
.grow { flex: 1; min-width: 0; }
footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
</style>
