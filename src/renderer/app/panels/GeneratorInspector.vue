<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { Clip, Generator, Project, TextGenerator } from '@shared/project-schema'
import { clipGeometry, keepAnchorOnResize } from '@shared/render-model'
import { FONT_CHOICES, cssFont, generatorTitle } from '@shared/generated'
import { useTimelineStore } from '@/stores/timeline'
import { fitTextBox } from '@/engine/layer-raster'
import ScrubNumber from '../components/ScrubNumber.vue'
import Icon from '../components/Icon.vue'

/** Propiedades de un clip de texto o forma (posición, escala, rotación, opacidad y tiempos están en las secciones generales). */
const tl = useTimelineStore()
const open = reactive({ content: true, stroke: true, shadow: true })

const clip = computed<Clip | undefined>(() => tl.selectedClips[0])
const g = computed<Generator | undefined>(() => clip.value?.generator)
const text = computed<TextGenerator | undefined>(() => (g.value?.type === 'text' ? g.value : undefined))
const rect = computed(() => (g.value?.type === 'rectangle' ? g.value : undefined))

// Gestos: un arrastre o una sesión de escritura = un solo comando en el historial
let before = ''
function begin(): void {
  if (!before) before = tl.snapshot()
}
function finish(label: string): void {
  if (!before) return
  tl.commit(label, before)
  before = ''
}
/** Aplica el cambio dejando fijo el punto de anclaje si el lienzo cambia de tamaño (ancho/alto, fuente, contorno…). */
function keepingAnchor(c: Clip, p: Project, fn: () => void): void {
  const size = (): { bw: number; bh: number } => {
    const g = clipGeometry(p.settings, c, p.media.find((m) => m.id === c.mediaId))
    return { bw: g.bw, bh: g.bh }
  }
  const from = size()
  fn()
  keepAnchorOnResize(c.transform, from, size())
}
/** Si el texto tiene la caja ajustada, se recalcula tras cada cambio (texto, fuente, tamaño…). */
function refit(gen: Generator): void {
  if (gen.type === 'text' && gen.autoFit) Object.assign(gen, fitTextBox(gen))
}
function live(fn: (g: Generator, c: Clip) => void): void {
  begin()
  tl.liveSelected((c, p) => {
    if (c.generator) keepingAnchor(c, p, () => { fn(c.generator as Generator, c); refit(c.generator as Generator) })
  })
}
function liveText(fn: (g: TextGenerator, c: Clip) => void): void {
  live((gen, c) => {
    if (gen.type === 'text') fn(gen, c)
  })
}
function edit(label: string, fn: (g: Generator, c: Clip) => void): void {
  tl.editSelected(label, (c, p) => {
    if (c.generator) keepingAnchor(c, p, () => { fn(c.generator as Generator, c); refit(c.generator as Generator) })
  })
}
function editText(label: string, fn: (g: TextGenerator, c: Clip) => void): void {
  edit(label, (gen, c) => {
    if (gen.type === 'text') fn(gen, c)
  })
}

/** El nombre del clip sigue al texto mientras no se haya renombrado a mano. */
function setText(gen: TextGenerator, c: Clip, v: string): void {
  const auto = c.name === generatorTitle(gen)
  gen.text = v
  if (auto) c.name = generatorTitle(gen)
}
function fitBox(): void {
  editText('Ajustar cuadro al texto', (gen) => (gen.autoFit = true))
}
/** Cambiar el ancho/alto a mano desactiva el ajuste automático. */
function manualBox(gen: TextGenerator): void {
  gen.autoFit = false
}
/** La fuente se carga antes de medir (si no, la caja se calcularía con la de respaldo). */
async function setFont(family: string): Promise<void> {
  await document.fonts.load(cssFont({ ...(text.value as TextGenerator), fontFamily: family }, 16), text.value?.text || 'A').catch(() => [])
  editText('Cambiar fuente', (gen) => (gen.fontFamily = family))
}

const val = (e: Event): string => (e.target as HTMLInputElement).value
const checked = (e: Event): boolean => (e.target as HTMLInputElement).checked
const aligns = [
  { v: 'left', icon: 'alignLeft', title: 'Izquierda' },
  { v: 'center', icon: 'alignCenter', title: 'Centro' },
  { v: 'right', icon: 'alignRight', title: 'Derecha' }
] as const
</script>

<template>
  <div v-if="g" data-testid="inspector-generator">
    <!-- Contenido -->
    <section>
      <header @click="open.content = !open.content">
        <Icon :name="open.content ? 'down' : 'right'" :size="12" /><Icon :name="text ? 'text' : 'rectangle'" :size="12" class="kind" />
        <span class="title">{{ text ? 'Texto' : 'Rectángulo' }}</span>
      </header>
      <div v-if="open.content" class="grid">
        <template v-if="text">
          <label class="top">Texto</label>
          <textarea
            class="txt"
            rows="3"
            :value="text.text"
            spellcheck="false"
            data-testid="gen-text"
            @focus="begin"
            @input="liveText((gen, c) => setText(gen, c, val($event)))"
            @blur="finish('Editar texto')"
          />

          <label>Fuente</label>
          <select :value="text.fontFamily" data-testid="gen-font" @change="setFont(val($event))">
            <option v-for="f in FONT_CHOICES" :key="f.value" :value="f.value">{{ f.label }}</option>
          </select>

          <label>Tamaño</label>
          <ScrubNumber :model-value="text.fontSize" :decimals="0" :min="1" :max="2000" suffix=" px" data-testid="gen-size" @start="begin" @update:model-value="liveText((gen) => (gen.fontSize = $event))" @end="finish('Cambiar tamaño de fuente')" />

          <label>Estilo</label>
          <div class="pair">
            <button class="btn mini" :class="{ on: text.bold }" title="Negrita" data-testid="gen-bold" @click="editText('Negrita', (gen) => (gen.bold = !gen.bold))"><Icon name="bold" :size="13" /></button>
            <button class="btn mini" :class="{ on: text.italic }" title="Cursiva" data-testid="gen-italic" @click="editText('Cursiva', (gen) => (gen.italic = !gen.italic))"><Icon name="italic" :size="13" /></button>
            <button v-for="a in aligns" :key="a.v" class="btn mini" :class="{ on: text.align === a.v }" :title="a.title" :data-testid="`gen-align-${a.v}`" @click="editText('Alineación', (gen) => (gen.align = a.v))">
              <Icon :name="a.icon" :size="13" />
            </button>
          </div>

          <label>Interlineado</label>
          <ScrubNumber :model-value="text.lineHeight" :decimals="2" :step="0.01" :min="0.5" :max="5" data-testid="gen-line-height" @start="begin" @update:model-value="liveText((gen) => (gen.lineHeight = $event))" @end="finish('Cambiar interlineado')" />

          <label>Color</label>
          <input type="color" :value="text.color" data-testid="gen-color" @pointerdown="begin" @input="liveText((gen) => (gen.color = val($event)))" @change="finish('Cambiar color del texto')" />

          <label>Cuadro</label>
          <div class="pair">
            <ScrubNumber :model-value="text.boxWidth" :decimals="0" :min="1" :max="8000" data-testid="gen-box-w" title="Ancho del cuadro de texto (el texto se ajusta a este ancho)" @start="begin" @update:model-value="liveText((gen) => (manualBox(gen), (gen.boxWidth = $event)))" @end="finish('Cambiar ancho del cuadro')" />
            <ScrubNumber :model-value="text.boxHeight" :decimals="0" :min="1" :max="8000" data-testid="gen-box-h" title="Alto del cuadro de texto" @start="begin" @update:model-value="liveText((gen) => (manualBox(gen), (gen.boxHeight = $event)))" @end="finish('Cambiar alto del cuadro')" />
            <button class="icon-btn" title="Ajustar el cuadro al texto" data-testid="gen-fit" @click="fitBox"><Icon name="maximize" :size="13" /></button>
          </div>
        </template>

        <template v-else-if="rect">
          <label>Ancho / Alto</label>
          <div class="pair">
            <ScrubNumber :model-value="rect.width" :decimals="0" :min="1" :max="8000" data-testid="gen-width" @start="begin" @update:model-value="live((gen) => gen.type === 'rectangle' && (gen.width = $event))" @end="finish('Cambiar ancho')" />
            <ScrubNumber :model-value="rect.height" :decimals="0" :min="1" :max="8000" data-testid="gen-height" @start="begin" @update:model-value="live((gen) => gen.type === 'rectangle' && (gen.height = $event))" @end="finish('Cambiar alto')" />
          </div>

          <label>Relleno</label>
          <div class="pair">
            <input type="checkbox" class="fixed" :checked="rect.fillEnabled" title="Activar relleno" data-testid="gen-fill-on" @change="edit('Relleno', (gen) => gen.type === 'rectangle' && (gen.fillEnabled = checked($event)))" />
            <input type="color" :value="rect.fill" :disabled="!rect.fillEnabled" data-testid="gen-fill" @pointerdown="begin" @input="live((gen) => gen.type === 'rectangle' && (gen.fill = val($event)))" @change="finish('Cambiar color de relleno')" />
          </div>

          <label>Esquinas</label>
          <ScrubNumber :model-value="rect.radius" :decimals="0" :min="0" :max="4000" suffix=" px" data-testid="gen-radius" @start="begin" @update:model-value="live((gen) => gen.type === 'rectangle' && (gen.radius = $event))" @end="finish('Cambiar esquinas')" />
        </template>
      </div>
    </section>

    <!-- Contorno -->
    <section>
      <header @click="open.stroke = !open.stroke">
        <Icon :name="open.stroke ? 'down' : 'right'" :size="12" /><span class="title">Contorno</span>
        <input type="checkbox" :checked="g.stroke.enabled" title="Activar contorno" data-testid="gen-stroke-on" @click.stop @change="edit('Contorno', (gen) => (gen.stroke.enabled = checked($event)))" />
      </header>
      <div v-if="open.stroke" class="grid" :class="{ off: !g.stroke.enabled }">
        <label>Color</label>
        <input type="color" :value="g.stroke.color" data-testid="gen-stroke-color" @pointerdown="begin" @input="live((gen) => (gen.stroke.color = val($event)))" @change="finish('Cambiar color del contorno')" />
        <label>Grosor</label>
        <ScrubNumber :model-value="g.stroke.width" :decimals="1" :step="0.5" :min="0" :max="200" suffix=" px" data-testid="gen-stroke-width" @start="begin" @update:model-value="live((gen) => (gen.stroke.width = $event))" @end="finish('Cambiar grosor del contorno')" />
      </div>
    </section>

    <!-- Sombra -->
    <section>
      <header @click="open.shadow = !open.shadow">
        <Icon :name="open.shadow ? 'down' : 'right'" :size="12" /><span class="title">Sombra</span>
        <input type="checkbox" :checked="g.shadow.enabled" title="Activar sombra" data-testid="gen-shadow-on" @click.stop @change="edit('Sombra', (gen) => (gen.shadow.enabled = checked($event)))" />
      </header>
      <div v-if="open.shadow" class="grid" :class="{ off: !g.shadow.enabled }">
        <label>Color</label>
        <input type="color" :value="g.shadow.color" data-testid="gen-shadow-color" @pointerdown="begin" @input="live((gen) => (gen.shadow.color = val($event)))" @change="finish('Cambiar color de la sombra')" />
        <label>Opacidad</label>
        <ScrubNumber :model-value="g.shadow.opacity * 100" :decimals="0" :min="0" :max="100" suffix=" %" data-testid="gen-shadow-opacity" @start="begin" @update:model-value="live((gen) => (gen.shadow.opacity = $event / 100))" @end="finish('Cambiar opacidad de la sombra')" />
        <label>Desenfoque</label>
        <ScrubNumber :model-value="g.shadow.blur" :decimals="0" :min="0" :max="200" suffix=" px" data-testid="gen-shadow-blur" @start="begin" @update:model-value="live((gen) => (gen.shadow.blur = $event))" @end="finish('Cambiar desenfoque de la sombra')" />
        <label>Desplazamiento</label>
        <div class="pair">
          <ScrubNumber :model-value="g.shadow.offsetX" :decimals="0" :min="-500" :max="500" data-testid="gen-shadow-x" @start="begin" @update:model-value="live((gen) => (gen.shadow.offsetX = $event))" @end="finish('Cambiar desplazamiento de la sombra')" />
          <ScrubNumber :model-value="g.shadow.offsetY" :decimals="0" :min="-500" :max="500" data-testid="gen-shadow-y" @start="begin" @update:model-value="live((gen) => (gen.shadow.offsetY = $event))" @end="finish('Cambiar desplazamiento de la sombra')" />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
section { border-top: 1px solid var(--border); }
header { display: flex; align-items: center; gap: 4px; height: 24px; padding: 0 6px 0 8px; cursor: pointer; background: var(--bg-panel-header); }
.kind { color: var(--accent); }
.title { flex: 1; font-weight: 600; }
.grid { display: grid; grid-template-columns: 96px 1fr; gap: 5px 8px; padding: 5px 0; align-items: center; }
.grid.off { opacity: 0.55; }
label { color: var(--text-dim); }
label.top { align-self: start; padding-top: 4px; }
.pair { display: flex; align-items: center; gap: 4px; }
.pair > * { flex: 1; min-width: 0; }
.pair .icon-btn, .pair .fixed { flex: none; }
select { width: 100%; font-size: 11px; }
.txt { width: 100%; resize: vertical; min-height: 48px; font: inherit; font-size: 11px; background: var(--bg-input); color: var(--text); border: 1px solid var(--border-subtle); border-radius: var(--radius); padding: 4px 6px; }
input[type='color'] { width: 100%; height: 22px; padding: 0; border: 1px solid var(--border-subtle); background: var(--bg-input); border-radius: var(--radius); cursor: pointer; }
input[type='color']:disabled { opacity: 0.5; cursor: default; }
.btn.mini { padding: 2px 4px; font-size: 10.5px; display: grid; place-items: center; }
.btn.mini.on { background: var(--accent); border-color: var(--accent); color: #fff; }
</style>
