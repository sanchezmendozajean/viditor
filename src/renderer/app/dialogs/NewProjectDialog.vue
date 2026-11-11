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
  <Modal
    title="Nuevo proyecto"
    subtitle="Configura la secuencia inicial"
    icon="folder-plus"
    hint="Enter crear"
    :width="480"
    @close="ui.newProjectOpen = false"
  >
    <form id="np-form" class="form" data-testid="new-project-dialog" @submit.prevent="submit">
      <div class="grp">
        <div class="grp-label">General</div>
        <label>Nombre<input v-model="form.name" type="text" data-testid="np-name" required /></label>
        <label>
          Ubicación
          <span class="row">
            <input v-model="form.parentDir" type="text" class="grow" data-testid="np-dir" required />
            <button type="button" class="btn" @click="browse">Examinar…</button>
          </span>
        </label>
      </div>
      <div class="grp">
        <div class="grp-label">Secuencia</div>
        <div class="cols3">
          <label>
            Resolución
            <select v-model="form.preset" @change="onPreset">
              <option v-for="(p, i) in RESOLUTION_PRESETS" :key="p.label" :value="String(i)">{{ p.label }}</option>
              <option value="custom">Personalizada</option>
            </select>
          </label>
          <label>
            Fotogramas por segundo
            <select v-model="form.fps">
              <option v-for="f in FPS_PRESETS" :key="f.label" :value="`${f.num}/${f.den}`">{{ f.label }}</option>
            </select>
          </label>
          <label>Frecuencia de audio
            <select v-model.number="form.sampleRate"><option :value="48000">48 000 Hz</option><option :value="44100">44 100 Hz</option></select>
          </label>
        </div>
        <div v-if="custom" class="row">
          <input v-model.number="form.width" type="number" min="16" max="16384" /> ×
          <input v-model.number="form.height" type="number" min="16" max="16384" />
        </div>
        <div class="cols">
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
        </div>
      </div>
    </form>
    <template #footer>
      <button type="button" class="btn" @click="ui.newProjectOpen = false">Cancelar</button>
      <button type="submit" form="np-form" class="btn primary" data-testid="np-create" :disabled="busy">Crear proyecto</button>
    </template>
  </Modal>
</template>

<style scoped>
.form { display: grid; gap: 12px; }
.grp { display: grid; gap: 10px; }
.grp-label { display: flex; align-items: center; gap: 8px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-dim); font-weight: 600; }
.grp-label::after { content: ''; flex: 1; height: 1px; background: var(--border-subtle); }
label { display: flex; flex-direction: column; gap: 4px; color: var(--text-dim); min-width: 0; font-size: 12px; }
label > :where(input, select) { color: var(--text); height: 28px; padding: 0 9px; }
label > input[type='color'] { padding: 0; width: 56px; }
label > :where(input, select):focus, .row > input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent); }
.row { display: flex; gap: 6px; align-items: center; }
.row > input, .row > .btn { height: 28px; }
.grow { flex: 1; min-width: 0; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.cols3 { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1.1fr) minmax(0, 1fr); gap: 10px; }
.cols3 label { white-space: nowrap; }
</style>
