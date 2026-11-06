<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import * as monaco from 'monaco-editor'
import { javascriptDefaults, ScriptTarget } from 'monaco-editor/language/typescript/monaco.contribution.js'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker'
// Los tipos de la API: la misma fuente que genera la documentación (specs/09)
import apiTypes from '../../../../specs/transiciones/viditor-transitions.d.ts?raw'
import { apiHelpPath } from '@shared/help-topics'

// Monaco se empaqueta con la app (workers incluidos): nada de CDN (specs/02 §Autocontenido)
;(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker: (_id, label) => (label === 'javascript' || label === 'typescript' ? new TsWorker() : new EditorWorker())
}

let configured = false
function configure(): void {
  if (configured) return
  configured = true
  javascriptDefaults.setCompilerOptions({
    target: ScriptTarget.ES2022,
    allowJs: true,
    checkJs: true,
    allowNonTsExtensions: true,
    lib: ['es2022'] // sin DOM: así no choca con los globales `screen` y `log` de la API
  })
  javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false })
  javascriptDefaults.setEagerModelSync(true)
  javascriptDefaults.addExtraLib(apiTypes, 'file:///viditor-transitions.d.ts')
  monaco.editor.defineTheme('viditor', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: { 'editor.background': '#161616', 'editor.lineHighlightBackground': '#1f1f1f', 'editorLineNumber.foreground': '#555555' }
  })
}

export interface EditorMarker {
  line: number
  col?: number
  message: string
}

const props = defineProps<{ modelKey: string; value: string; readOnly?: boolean; markers?: EditorMarker[] }>()
const emit = defineEmits<{ change: [value: string]; save: [value: string] }>()

const host = ref<HTMLDivElement | null>(null)
const editor = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null)
const models = new Map<string, monaco.editor.ITextModel>()
const viewStates = new Map<string, monaco.editor.ICodeEditorViewState | null>()

function modelFor(key: string, value: string): monaco.editor.ITextModel {
  let m = models.get(key)
  if (!m) {
    m = monaco.editor.createModel(value, 'javascript', monaco.Uri.parse(`file:///transitions/${encodeURIComponent(key)}.js`))
    models.set(key, m)
  }
  return m
}

/** Un solo modelo vivo a la vez: los archivos son scripts globales y dos modelos chocarían (`const meta`). */
function show(key: string, value: string): void {
  const ed = editor.value
  if (!ed) return
  const current = ed.getModel()
  if (current) {
    for (const [k, m] of models) if (m === current) viewStates.set(k, ed.saveViewState())
  }
  for (const [k, m] of [...models]) {
    if (k !== key) {
      m.dispose()
      models.delete(k)
    }
  }
  const m = modelFor(key, value)
  ed.setModel(m)
  const vs = viewStates.get(key)
  if (vs) ed.restoreViewState(vs)
  ed.updateOptions({ readOnly: props.readOnly ?? false })
}

onMounted(() => {
  configure()
  if (!host.value) return
  const ed = monaco.editor.create(host.value, {
    theme: 'viditor',
    automaticLayout: true,
    minimap: { enabled: false },
    fontFamily: "'JetBrains Mono', Consolas, monospace",
    fontSize: 12,
    tabSize: 2,
    scrollBeyondLastLine: false,
    renderWhitespace: 'none',
    fixedOverflowWidgets: true
  })
  editor.value = ed
  show(props.modelKey, props.value)
  ed.onDidChangeModelContent(() => emit('change', ed.getValue()))
  // Ctrl+S = guardar la transición (recarga en caliente), no el proyecto
  ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => emit('save', ed.getValue()))
  // F1 sobre un símbolo de la API abre su página en la documentación local
  ed.addAction({
    id: 'viditor.help',
    label: 'Ver en la documentación',
    keybindings: [monaco.KeyCode.F1],
    contextMenuGroupId: 'navigation',
    run: (e) => {
      const pos = e.getPosition()
      const word = pos ? e.getModel()?.getWordAtPosition(pos)?.word : undefined
      window.viditor.help.open(word ? apiHelpPath(word) : '/api/')
    }
  })
})

watch(
  () => props.modelKey,
  (k) => show(k, props.value)
)
// Cambios externos del archivo (otro editor, recarga en caliente). Lo que se escribe aquí vuelve del padre idéntico,
// así que solo se reemplaza el texto cuando de verdad es distinto.
watch(
  () => props.value,
  (v) => {
    const m = editor.value?.getModel()
    if (m && m.getValue() !== v) {
      const ed = editor.value as monaco.editor.IStandaloneCodeEditor
      const pos = ed.getPosition()
      m.setValue(v)
      if (pos) ed.setPosition(pos)
    }
  }
)
watch(
  () => props.readOnly,
  (r) => editor.value?.updateOptions({ readOnly: r ?? false })
)
watch(
  () => props.markers,
  (list) => {
    const m = editor.value?.getModel()
    if (!m) return
    monaco.editor.setModelMarkers(
      m,
      'viditor',
      (list ?? []).map((x) => ({
        severity: monaco.MarkerSeverity.Error,
        message: x.message,
        startLineNumber: x.line,
        startColumn: x.col ?? 1,
        endLineNumber: x.line,
        endColumn: m.getLineMaxColumn(Math.min(x.line, m.getLineCount()))
      }))
    )
  },
  { deep: true }
)

function revealLine(line: number): void {
  const ed = editor.value
  if (!ed) return
  ed.revealLineInCenter(line)
  ed.setPosition({ lineNumber: line, column: 1 })
  ed.focus()
}
defineExpose({ revealLine, getValue: () => editor.value?.getValue() ?? '' })

onBeforeUnmount(() => {
  editor.value?.dispose()
  for (const m of models.values()) m.dispose()
  models.clear()
})
</script>

<template>
  <div ref="host" class="code-editor" data-testid="code-editor" />
</template>

<style scoped>
.code-editor { position: absolute; inset: 0; }
</style>
