<script setup lang="ts">
import { computed, ref } from 'vue'
import { COMMANDS, COMMAND_BY_ID, conflictsFor, effectiveKeys } from '@shared/commands-meta'
import { comboFromEvent, formatCombo } from '@shared/keys'
import { useAppPrefs } from '@/stores/prefs'
import { useUiStore } from '@/stores/ui'
import Modal from '../components/Modal.vue'

const ui = useUiStore()
const prefs = useAppPrefs()
const tab = ref<'general' | 'shortcuts'>('general')
const filter = ref('')
/** Comando cuyo atajo se está grabando */
const recording = ref<string | null>(null)
const notice = ref('')

const scale = computed({
  get: () => prefs.uiScale,
  set: (v: number) => void prefs.update({ uiScale: v })
})

async function chooseDir(): Promise<void> {
  const dir = await window.viditor.dialogs.chooseDirectory(prefs.transitionsDir ?? undefined)
  if (dir) await prefs.update({ transitionsDir: dir })
}

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const rows = computed(() => {
  const q = fold(filter.value)
  return COMMANDS.filter((c) => !q || fold(`${c.category} ${c.label}`).includes(q)).map((c) => ({
    meta: c,
    keys: effectiveKeys(c, prefs.shortcuts),
    custom: c.id in prefs.shortcuts
  }))
})

function startRecording(id: string): void {
  recording.value = id
  notice.value = 'Pulsa la combinación nueva (Esc para cancelar, Retroceso para dejarlo sin atajo).'
}
/** Captura de la combinación: este manejador detiene la propagación, así el atajo no se ejecuta mientras se graba. */
async function onRecordKey(e: KeyboardEvent): Promise<void> {
  const id = recording.value
  if (!id) return
  e.preventDefault()
  e.stopPropagation()
  if (e.key === 'Escape') {
    recording.value = null
    notice.value = ''
    return
  }
  if (e.key === 'Backspace' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    recording.value = null
    notice.value = ''
    await prefs.setShortcut(id, [])
    return
  }
  const combo = comboFromEvent(e)
  if (!combo) return // solo un modificador: se sigue esperando
  const clash = conflictsFor(combo, id, prefs.shortcuts)
  // La combinación pasa a ser de este comando; a los que la tenían se les quita (sin dejar atajos duplicados)
  const next = { ...prefs.shortcuts, [id]: [combo] }
  for (const c of clash) next[c.id] = effectiveKeys(c, prefs.shortcuts).filter((k) => k !== combo)
  recording.value = null
  notice.value = clash.length ? `«${formatCombo(combo)}» se quitó de: ${clash.map((c) => c.label).join(', ')}.` : ''
  await prefs.update({ shortcuts: next })
}
</script>

<template>
  <Modal title="Preferencias" @close="ui.prefsOpen = false">
    <div class="body" data-testid="preferences">
      <nav class="tabs">
        <button :class="{ on: tab === 'general' }" data-testid="prefs-tab-general" @click="tab = 'general'">General</button>
        <button :class="{ on: tab === 'shortcuts' }" data-testid="prefs-tab-shortcuts" @click="tab = 'shortcuts'">Atajos de teclado</button>
      </nav>

      <div v-if="tab === 'general'" class="general">
        <label>Escala de la interfaz</label>
        <div class="row">
          <input v-model.number="scale" type="range" min="90" max="150" step="5" data-testid="prefs-scale" />
          <span class="mono">{{ prefs.uiScale }} %</span>
        </div>

        <label>Carpeta de transiciones</label>
        <div class="col">
          <div class="row">
            <input type="text" readonly :value="prefs.transitionsDir ?? 'Predeterminada (carpeta de datos de Viditor)'" data-testid="prefs-transitions-dir" />
            <button class="btn" @click="chooseDir">Cambiar…</button>
            <button class="btn" :disabled="!prefs.transitionsDir" @click="prefs.update({ transitionsDir: null })">Restablecer</button>
          </div>
          <span class="dim">Aquí se buscan las transiciones propias (las de «Usuario»). Los cambios se aplican al instante.</span>
        </div>
      </div>

      <div v-else class="shortcuts">
        <input v-model="filter" type="text" placeholder="Buscar comando" class="filter" data-testid="prefs-filter" />
        <p v-if="notice" class="dim notice" data-testid="prefs-notice">{{ notice }}</p>
        <div class="rows">
          <div v-for="r in rows" :key="r.meta.id" class="row-k" :data-id="r.meta.id" data-testid="prefs-command">
            <span class="cat dim">{{ r.meta.category }}</span>
            <span>{{ r.meta.label }}</span>
            <button
              class="keybtn mono"
              :class="{ rec: recording === r.meta.id }"
              data-testid="prefs-key"
              @click="startRecording(r.meta.id)"
              @keydown="onRecordKey"
              @blur="recording === r.meta.id && ((recording = null), (notice = ''))"
            >
              {{ recording === r.meta.id ? 'Pulsa una tecla…' : r.keys.map(formatCombo).join('  ·  ') || '—' }}
            </button>
            <button class="icon-btn" :disabled="!r.custom" title="Restablecer atajo" @click="prefs.resetShortcut(r.meta.id)">↺</button>
          </div>
        </div>
        <div class="foot">
          <button class="btn" :disabled="Object.keys(prefs.shortcuts).length === 0" data-testid="prefs-reset-all" @click="prefs.update({ shortcuts: {} })">Restablecer todos</button>
        </div>
      </div>

      <footer><button class="btn primary" data-testid="prefs-close" @click="ui.prefsOpen = false">Cerrar</button></footer>
    </div>
  </Modal>
</template>

<style scoped>
.body { width: 640px; max-width: 86vw; font-size: 12px; }
.tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin-bottom: 12px; }
.tabs button { background: none; border: 0; padding: 6px 12px; cursor: pointer; color: var(--text-dim); border-bottom: 2px solid transparent; }
.tabs button.on { color: var(--text); border-bottom-color: var(--accent); }
.general { display: grid; grid-template-columns: 150px 1fr; gap: 12px; align-items: start; min-height: 150px; }
.general > label { padding-top: 4px; color: var(--text-dim); }
.row { display: flex; gap: 8px; align-items: center; }
.col { display: flex; flex-direction: column; gap: 4px; }
.row input[type='range'] { flex: 1; }
.row input[type='text'] { flex: 1; min-width: 0; }
.filter { width: 100%; box-sizing: border-box; margin-bottom: 6px; }
.notice { margin: 0 0 6px; }
.rows { max-height: 340px; overflow: auto; border: 1px solid var(--border); border-radius: var(--radius); }
.row-k { display: grid; grid-template-columns: 110px 1fr 190px 24px; gap: 8px; align-items: center; padding: 3px 8px; border-bottom: 1px solid var(--border); }
.row-k:last-child { border-bottom: 0; }
.cat { font-size: 10px; }
.keybtn { background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: var(--radius); padding: 2px 6px; text-align: left; cursor: pointer; font-size: 10.5px; color: var(--text); }
.keybtn.rec { border-color: var(--accent); color: var(--accent); }
.foot { display: flex; justify-content: flex-start; margin-top: 8px; }
footer { display: flex; justify-content: flex-end; margin-top: 14px; }
.dim { color: var(--text-dim); }
</style>
