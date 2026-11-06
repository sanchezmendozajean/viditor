<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { CODEC_INFO, EXPORT_PRESETS, HW_SUPPORT, exportFrames, type HwMode, type VideoCodec } from '@shared/export-model'
import { FPS_PRESETS, RESOLUTION_PRESETS } from '@shared/project-schema'
import { formatTimecode } from '@shared/timecode'
import { useExportStore } from '@/stores/export'
import { useProjectStore } from '@/stores/project'
import { useTimelineStore } from '@/stores/timeline'
import Panel from '../components/Panel.vue'

const ex = useExportStore()
const project = useProjectStore()
const tl = useTimelineStore()

onMounted(() => {
  void ex.loadCaps()
  if (!ex.outputPath) void ex.refreshOutput()
})

const codecs = Object.entries(CODEC_INFO) as [VideoCodec, (typeof CODEC_INFO)[VideoCodec]][]
const sizeKey = computed(() => (ex.width && ex.height ? `${ex.width}x${ex.height}` : 'project'))
const sizeOptions = computed(() => {
  const list: { key: string; label: string; w: number | null; h: number | null }[] = [{ key: 'project', label: 'Del proyecto', w: null, h: null }]
  for (const r of RESOLUTION_PRESETS) list.push({ key: `${r.width}x${r.height}`, label: r.label, w: r.width, h: r.height })
  if (sizeKey.value !== 'project' && !list.some((o) => o.key === sizeKey.value)) list.push({ key: sizeKey.value, label: `${ex.width} × ${ex.height}`, w: ex.width, h: ex.height })
  return list
})
const fpsKey = computed(() => (ex.fps ? `${ex.fps.num}/${ex.fps.den}` : 'project'))

function setSize(key: string): void {
  const o = sizeOptions.value.find((x) => x.key === key)
  ex.width = o?.w ?? null
  ex.height = o?.h ?? null
  ex.touch()
}
function setFps(key: string): void {
  const f = FPS_PRESETS.find((x) => `${x.num}/${x.den}` === key)
  ex.fps = f ? { num: f.num, den: f.den } : null
  ex.touch()
}

const hwOptions = computed<{ value: HwMode; label: string }[]>(() => {
  const avail = ex.caps?.hw[ex.codec] ?? []
  const names: Record<string, string> = { nvenc: 'NVENC (NVIDIA)', qsv: 'Quick Sync (Intel)', amf: 'AMF (AMD)', vaapi: 'VAAPI (Linux)' }
  const list: { value: HwMode; label: string }[] = [{ value: 'auto', label: avail.length ? `Auto (${names[avail[0] as string]})` : 'Auto (software)' }, { value: 'none', label: 'Desactivada' }]
  for (const k of HW_SUPPORT[ex.codec]) if (avail.includes(k)) list.push({ value: k, label: names[k] as string })
  return list
})
const noHwCodec = computed(() => HW_SUPPORT[ex.codec].length === 0)

const summary = computed(() => {
  const p = project.project
  if (!p) return ''
  const { count } = exportFrames(p, ex.options())
  const fps = ex.fps ?? p.settings.fps
  const secs = (count * fps.den) / fps.num
  return `${count} fotogramas · ${formatTimecode(secs, fps.num, fps.den)}`
})
const tc = (t: number | null): string => (t === null || !project.project ? '—' : formatTimecode(t, project.project.settings.fps.num, project.project.settings.fps.den))
const empty = computed(() => tl.duration <= 0)
const quality = computed({
  get: () => ex.quality,
  set: (v: number) => {
    ex.quality = v
    ex.touch()
  }
})
const qualityLabel = computed(() => (ex.quality < 34 ? 'Baja' : ex.quality < 67 ? 'Media' : ex.quality < 95 ? 'Alta' : 'Máxima'))
</script>

<template>
  <Panel title="Exportar" help="export">
    <form class="form" data-testid="export-form" @submit.prevent="ex.start()">
      <label>Preset</label>
      <select :value="ex.presetId" data-testid="export-preset" @change="ex.applyPreset(($event.target as HTMLSelectElement).value)">
        <option v-for="p in EXPORT_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
      </select>

      <label>Destino</label>
      <div class="row">
        <input v-model="ex.outputPath" type="text" spellcheck="false" data-testid="export-path" @input="ex.outputCustom = true" />
        <button type="button" class="btn" data-testid="export-browse" @click="ex.browse()">…</button>
      </div>

      <label>Rango</label>
      <div class="col">
        <label class="radio"><input v-model="ex.rangeMode" type="radio" value="all" /> Todo el proyecto</label>
        <label class="radio"><input v-model="ex.rangeMode" type="radio" value="range" data-testid="export-range" /> Entrada–Salida <span class="dim">({{ tc(ex.rangeIn ?? 0) }} – {{ tc(ex.rangeOut ?? tl.duration) }})</span></label>
        <span class="dim small">Marca con <kbd>I</kbd> y <kbd>O</kbd> en la línea de tiempo.</span>
      </div>

      <label>Formato</label>
      <select :value="ex.codec" data-testid="export-codec" @change="ex.setCodec(($event.target as HTMLSelectElement).value as VideoCodec)">
        <option v-for="[id, c] in codecs" :key="id" :value="id">{{ c.label }}</option>
      </select>

      <label>Audio</label>
      <span class="dim">{{ CODEC_INFO[ex.codec].audioLabel }}</span>

      <label>Resolución</label>
      <select :value="sizeKey" data-testid="export-size" @change="setSize(($event.target as HTMLSelectElement).value)">
        <option v-for="o in sizeOptions" :key="o.key" :value="o.key">{{ o.label }}</option>
      </select>

      <label>Fotogramas</label>
      <select :value="fpsKey" @change="setFps(($event.target as HTMLSelectElement).value)">
        <option value="project">Del proyecto</option>
        <option v-for="f in FPS_PRESETS" :key="`${f.num}/${f.den}`" :value="`${f.num}/${f.den}`">{{ f.label }} fps</option>
      </select>

      <template v-if="ex.codec !== 'prores'">
        <label>Calidad</label>
        <div class="col">
          <div v-if="!ex.useBitrate" class="row">
            <input v-model.number="quality" type="range" min="0" max="100" data-testid="export-quality" />
            <span class="dim q">{{ qualityLabel }}</span>
          </div>
          <div v-else class="row">
            <input v-model.number="ex.bitrateKbps" type="number" min="100" step="500" class="num" />
            <span class="dim">kbps</span>
          </div>
          <label class="radio small"><input v-model="ex.useBitrate" type="checkbox" /> Bitrate objetivo en lugar de calidad</label>
        </div>
      </template>

      <label>Aceleración</label>
      <select v-model="ex.hw" :disabled="noHwCodec" data-testid="export-hw">
        <option v-if="noHwCodec" value="none">No disponible para este formato</option>
        <option v-for="o in hwOptions" v-else :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>

      <label>Al terminar</label>
      <select v-model="ex.after" data-testid="export-after">
        <option value="folder">Abrir la carpeta</option>
        <option value="play">Reproducir</option>
        <option value="nothing">Nada</option>
      </select>

      <div class="foot">
        <span class="dim">{{ summary }}</span>
        <button type="submit" class="btn primary" :disabled="empty || Boolean(ex.running)" data-testid="export-start">Exportar</button>
      </div>
    </form>
  </Panel>
</template>

<style scoped>
.form { display: grid; grid-template-columns: 84px 1fr; gap: 10px 10px; align-items: start; padding: 12px; }
.form > label { color: var(--text-dim); padding-top: 4px; }
.row { display: flex; gap: 6px; align-items: center; }
.col { display: flex; flex-direction: column; gap: 4px; }
input[type='text'], select { width: 100%; min-width: 0; font-size: 11px; }
input[type='range'] { flex: 1; }
.num { width: 90px; }
.q { width: 44px; text-align: right; }
.radio { display: flex; align-items: center; gap: 6px; color: var(--text); padding-top: 0; }
.dim { color: var(--text-dim); }
.small { font-size: 10px; }
kbd { font-family: var(--mono); background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: 3px; padding: 0 4px; }
.foot { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
.primary { background: var(--accent); color: #fff; border-color: transparent; padding: 5px 18px; }
.primary:disabled { opacity: 0.45; cursor: default; }
</style>
