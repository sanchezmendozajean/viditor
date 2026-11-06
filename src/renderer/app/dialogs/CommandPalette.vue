<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useUiStore } from '@/stores/ui'
import { executeCommand, paletteEntries } from '../commands'

const ui = useUiStore()
const query = ref('')
const index = ref(0)
const input = ref<HTMLInputElement | null>(null)
const list = ref<HTMLElement | null>(null)

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Se calcula al abrir: las comprobaciones de disponibilidad dependen del estado de ese momento
const entries = paletteEntries()
const matches = computed(() => {
  const words = fold(query.value).split(/\s+/).filter(Boolean)
  return entries
    .filter((e) => {
      const hay = fold(`${e.meta.category} ${e.meta.label}`)
      return words.every((w) => hay.includes(w))
    })
    .sort((a, b) => Number(b.available) - Number(a.available))
})

watch(query, () => (index.value = 0))
onMounted(() => input.value?.focus())

function close(): void {
  ui.paletteOpen = false
}
function run(i: number): void {
  const e = matches.value[i]
  if (!e || !e.available) return
  close()
  // El comando se ejecuta cuando el diálogo ya se cerró (algunos abren otros diálogos o piden el foco)
  void nextTick(() => executeCommand(e.meta.id))
}
function move(d: number): void {
  const n = matches.value.length
  if (n === 0) return
  index.value = (index.value + d + n) % n
  void nextTick(() => list.value?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }))
}
function onKey(e: KeyboardEvent): void {
  if (e.key === 'ArrowDown') move(1)
  else if (e.key === 'ArrowUp') move(-1)
  else if (e.key === 'Enter') run(index.value)
  else if (e.key === 'Escape') close()
  else return
  e.preventDefault()
  e.stopPropagation()
}
</script>

<template>
  <div class="backdrop" data-testid="palette" @pointerdown.self="close">
    <div class="palette" role="dialog" aria-modal="true" aria-label="Paleta de comandos">
      <input ref="input" v-model="query" type="text" spellcheck="false" placeholder="Escribe un comando…" data-testid="palette-input" @keydown="onKey" />
      <div ref="list" class="list" role="listbox">
        <div
          v-for="(e, i) in matches"
          :key="e.meta.id"
          class="item"
          :class="{ on: i === index, off: !e.available }"
          role="option"
          :aria-selected="i === index"
          data-testid="palette-item"
          :data-id="e.meta.id"
          @pointermove="index = i"
          @click="run(i)"
        >
          <span class="cat">{{ e.meta.category }}</span>
          <span class="label">{{ e.meta.label }}</span>
          <span class="key mono">{{ e.shortcut }}</span>
        </div>
        <div v-if="matches.length === 0" class="empty">Ningún comando coincide.</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; background: #0007; z-index: 120; display: flex; justify-content: center; align-items: flex-start; padding-top: 12vh; }
.palette { width: min(560px, 90vw); background: var(--bg-panel); border: 1px solid var(--border-subtle); border-radius: 6px; box-shadow: 0 14px 44px #000c; overflow: hidden; }
input { width: 100%; box-sizing: border-box; padding: 10px 14px; font-size: 13px; border: 0; border-bottom: 1px solid var(--border); background: var(--bg-input); }
.list { max-height: 340px; overflow: auto; padding: 4px 0; }
.item { display: grid; grid-template-columns: 110px 1fr auto; gap: 10px; align-items: center; padding: 5px 14px; cursor: pointer; }
.item.on { background: var(--accent); color: #fff; }
.item.off { opacity: 0.45; }
.cat { color: var(--text-dim); font-size: 10px; }
.item.on .cat, .item.on .key { color: #ffffffcc; }
.key { color: var(--text-dim); font-size: 10px; }
.empty { padding: 14px; color: var(--text-dim); text-align: center; }
</style>
