<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useTransitionsStore, DEFAULT_TRANSITION } from '@/stores/transitions'
import { useUiStore } from '@/stores/ui'
import Panel from '../components/Panel.vue'
import Splitter from '../components/Splitter.vue'
import CodeEditor, { type EditorMarker } from '../components/CodeEditor.vue'
import ScrubNumber from '../components/ScrubNumber.vue'
import TransitionsList from './TransitionsList.vue'
import TransitionPreview from './TransitionPreview.vue'
import ConsolePanel from './ConsolePanel.vue'
import ParamField from './ParamField.vue'
import type { ParamDef } from '../../../transition-runtime/runtime'

/**
 * Espacio de trabajo «Transiciones» (specs/07): lista a la izquierda, editor Monaco al centro, vista previa y
 * parámetros a la derecha y consola abajo. Ctrl+S guarda el archivo y lo recarga en caliente.
 */
const trs = useTransitionsStore()
const ui = useUiStore()

const size = reactive({ left: 250, right: 360, console: 170, params: 220 })
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

const ref_ = computed(() => trs.editing ?? (trs.files.some((f) => f.ref === DEFAULT_TRANSITION) ? DEFAULT_TRANSITION : (trs.files[0]?.ref ?? null)))
const file = computed(() => (ref_.value ? trs.fileOf(ref_.value) : undefined))
const meta = computed(() => (ref_.value ? trs.metaOf(ref_.value) : undefined))
const drafts = reactive<Record<string, string>>({})
const editor = ref<InstanceType<typeof CodeEditor> | null>(null)
const dirty = computed(() => Boolean(ref_.value && ref_.value in drafts))
const originLabel: Record<string, string> = { builtin: 'Integrada', user: 'Usuario', project: 'Proyecto' }

const text = computed(() => (ref_.value && ref_.value in drafts ? (drafts[ref_.value] as string) : (file.value?.source ?? '')))
const markers = computed<EditorMarker[]>(() => {
  const e = ref_.value ? trs.infos[ref_.value]?.error : undefined
  return e?.line ? [{ line: e.line, col: e.col, message: e.message }] : []
})

function onChange(value: string): void {
  const r = ref_.value
  if (!r || !file.value) return
  if (value === file.value.source) delete drafts[r]
  else drafts[r] = value
}

async function save(value?: string): Promise<void> {
  const r = ref_.value
  const f = file.value
  if (!r || !f) return
  if (f.readOnly) return ui.showInfo('Las transiciones integradas son de solo lectura: usa «Duplicar para editar».')
  const v = value ?? text.value
  if (!(await trs.save(r, v))) return
  delete drafts[r]
  // Recarga en caliente inmediata (el vigilante de archivos la repetiría sin cambios)
  await trs.sync(await window.viditor.transitions.list())
}

async function duplicate(): Promise<void> {
  if (ref_.value) await trs.duplicate(ref_.value)
}

// ───── Parámetros de la vista previa ─────
const params = reactive<Record<string, unknown>>({})
const previewDuration = ref(1)
watch(
  [ref_, meta],
  () => {
    for (const k of Object.keys(params)) delete params[k]
    for (const [k, d] of Object.entries(meta.value?.params ?? {})) params[k] = (d as ParamDef).default
    previewDuration.value = meta.value?.defaultDuration ?? 1
  },
  { immediate: true }
)
const paramEntries = computed(() => Object.entries(meta.value?.params ?? {}) as [string, ParamDef][])
const previewParams = computed(() => ({ ...params }))

function reveal(line: number): void {
  if (line > 0) editor.value?.revealLine(line)
}

// Ctrl+S dentro del espacio guarda la transición, no el proyecto (App.vue lo respeta)
defineExpose({ save })
</script>

<template>
  <div class="ws" data-testid="transitions-workspace">
    <div class="row top">
      <div class="pane" :style="{ width: size.left + 'px' }">
        <Panel title="Transiciones" help="transitions"><TransitionsList /></Panel>
      </div>
      <Splitter dir="row" @drag="size.left = clamp(size.left + $event, 180, 480)" />

      <div class="pane flex">
        <Panel :title="meta ? `Editor de código — ${meta.name}` : 'Editor de código'" help="transitions">
          <template #actions>
            <span v-if="file" class="badge" :class="file.origin">{{ originLabel[file.origin] }}</span>
            <span v-if="dirty" class="dirty" title="Cambios sin guardar" data-testid="editor-dirty">●</span>
            <button v-if="file?.readOnly" class="btn mini" data-testid="duplicate-edit" @click="duplicate">Duplicar para editar</button>
            <button class="btn mini" :disabled="!dirty || file?.readOnly" data-testid="editor-save" title="Guardar y recargar en caliente (Ctrl+S)" @click="save()">Guardar</button>
          </template>
          <div class="editor-box">
            <CodeEditor v-if="file" ref="editor" :model-key="file.ref" :value="text" :read-only="file.readOnly" :markers="markers" @change="onChange" @save="save($event)" />
            <p v-else class="dim empty">Selecciona una transición de la lista o crea una nueva.</p>
          </div>
        </Panel>
      </div>
      <Splitter dir="row" @drag="size.right = clamp(size.right - $event, 260, 640)" />

      <div class="pane col" :style="{ width: size.right + 'px' }">
        <Panel title="Vista previa" help="transitions">
          <div class="pv">
            <TransitionPreview v-if="ref_" :transition="ref_" :params="previewParams" :duration="previewDuration" autoplay />
          </div>
        </Panel>
        <Splitter dir="column" @drag="size.params = clamp(size.params - $event, 90, 500)" />
        <div class="params" :style="{ height: size.params + 'px' }">
          <Panel title="Parámetros">
            <div class="plist" data-testid="preview-params">
              <div class="field">
                <label>Duración</label>
                <ScrubNumber :model-value="previewDuration" :decimals="2" :step="0.02" :min="0.05" suffix=" s" @update:model-value="previewDuration = $event" />
              </div>
              <ParamField v-for="[k, def] in paramEntries" :key="k" :name="k" :def="def" :value="params[k]" @input="params[k] = $event" />
              <p v-if="paramEntries.length === 0" class="dim">Esta transición no define parámetros (<code>meta.params</code>).</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
    <Splitter dir="column" @drag="size.console = clamp(size.console - $event, 80, 400)" />
    <div class="row" :style="{ height: size.console + 'px' }">
      <div class="pane flex"><ConsolePanel :current="ref_" @reveal="reveal" /></div>
    </div>
  </div>
</template>

<style scoped>
.ws { flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 0 4px 4px; background: var(--bg-app); }
.row { display: flex; min-height: 0; flex: none; }
.row.top { flex: 1; }
.pane { display: flex; min-width: 0; min-height: 0; flex: none; }
.pane.flex { flex: 1; }
.pane.col { flex-direction: column; }
.params { display: flex; flex: none; min-height: 0; }
.editor-box { position: absolute; inset: 0; }
.pv { padding: 8px; }
.plist { padding: 8px 10px; }
.field { display: grid; grid-template-columns: 110px 1fr; gap: 8px; align-items: center; padding: 3px 0; }
.field label { color: var(--text-dim); }
.btn.mini { padding: 1px 8px; font-size: 10.5px; margin-right: 4px; }
.dirty { color: var(--warn); margin-right: 6px; }
.badge { font-size: 9px; padding: 0 6px; border-radius: 8px; background: #3a3a3a; color: var(--text-dim); margin-right: 6px; }
.badge.user { background: #2f4a63; color: #9ccaf5; }
.badge.project { background: #4d4a2c; color: #e3d58d; }
.empty { padding: 16px; }
</style>
