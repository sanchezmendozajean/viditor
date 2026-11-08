<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'
import { insertMenuItems } from '../components/insert-menu'
import Modal from '../components/Modal.vue'
import Icon from '../components/Icon.vue'

const ui = useUiStore()
const project = useProjectStore()
const media = computed(() => project.project?.media.find((m) => m.id === ui.previewMediaId) ?? null)
const name = computed(() => media.value?.path.split('/').pop() ?? '')
const failed = ref(false)
// Si el original no se puede reproducir (códec/contenedor), se intenta con el proxy cuando existe.
const useProxy = ref(false)
const src = computed(() => (media.value ? window.viditor.media.sourceUrl(media.value.id, useProxy.value) : ''))
const poster = computed(() => (media.value ? window.viditor.media.thumbnailUrl(media.value.id) : ''))

// Controles propios, fuera del vídeo, para no tapar la imagen.
const player = ref<HTMLMediaElement | null>(null)
const playing = ref(false)
const time = ref(0)
const duration = ref(0)
const muted = ref(false)
const volume = ref(1)
const hasMedia = computed(() => media.value?.kind !== 'image' && !failed.value)

function sync(): void {
  const el = player.value
  if (!el) return
  playing.value = !el.paused
  time.value = el.currentTime
  duration.value = Number.isFinite(el.duration) ? el.duration : 0
}
function toggle(): void {
  const el = player.value
  if (!el) return
  if (el.paused) void el.play()
  else el.pause()
}
function seek(e: Event): void {
  if (player.value) player.value.currentTime = Number((e.target as HTMLInputElement).value)
}
function setVolume(e: Event): void {
  volume.value = Number((e.target as HTMLInputElement).value)
  muted.value = volume.value === 0
  if (player.value) {
    player.value.volume = volume.value
    player.value.muted = muted.value
  }
}
function toggleMute(): void {
  muted.value = !muted.value
  if (player.value) player.value.muted = muted.value
}
function fmt(s: number): string {
  const t = Math.floor(s)
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}
function onKey(e: KeyboardEvent): void {
  if (e.code === 'Space' && hasMedia.value && (e.target as HTMLElement).tagName !== 'BUTTON') {
    e.preventDefault()
    toggle()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

function onError(): void {
  if (!useProxy.value && media.value?.proxy) useProxy.value = true
  else failed.value = true
}
function close(): void {
  ui.previewMediaId = null
}
function insertMenu(e: MouseEvent): void {
  if (!media.value) return
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  // El menú se abre hacia arriba desde el botón (queda en la parte inferior del modal).
  const items = insertMenuItems(media.value.id, close)
  ui.openMenu(new MouseEvent('click', { clientX: r.right - 240, clientY: r.top - items.length * 22 - 12 }), items)
}
</script>

<template>
  <Modal :title="name" closable @close="close">
    <div class="body" data-testid="media-preview-dialog">
      <p v-if="failed" class="dim fail">No se puede reproducir este archivo en la vista previa.</p>
      <img v-else-if="media?.kind === 'image'" :src="src" :alt="name" />
      <audio v-else-if="media?.kind === 'audio'" :key="src" ref="player" :src="src" autoplay @error="onError" @play="sync" @pause="sync" @timeupdate="sync" @loadedmetadata="sync" @durationchange="sync" />
      <video v-else :key="src" ref="player" :src="src" :poster="poster" autoplay @error="onError" @play="sync" @pause="sync" @timeupdate="sync" @loadedmetadata="sync" @durationchange="sync" @click="toggle" />
      <footer>
        <div v-if="hasMedia" class="ctrl" data-testid="preview-controls">
          <button class="ib" :title="playing ? 'Pausar' : 'Reproducir'" @click="toggle"><Icon :name="playing ? 'pause' : 'play'" :size="15" /></button>
          <span class="mono tm">{{ fmt(time) }} / {{ fmt(duration) }}</span>
          <input class="seek" type="range" min="0" :max="duration || 0" step="0.05" :value="time" aria-label="Posición" @input="seek" />
          <button class="ib" :title="muted ? 'Activar sonido' : 'Silenciar'" @click="toggleMute"><Icon :name="muted || volume === 0 ? 'volOff' : 'vol'" :size="15" /></button>
          <input class="vol" type="range" min="0" max="1" step="0.05" :value="muted ? 0 : volume" aria-label="Volumen" @input="setVolume" />
        </div>
        <button class="btn primary" data-testid="media-preview-insert" @click="insertMenu"><Icon name="plus" :size="13" /> Insertar <Icon name="down" :size="11" /></button>
      </footer>
    </div>
  </Modal>
</template>

<style scoped>
.body { width: min(900px, 80vw); }
video, img { display: block; width: 100%; max-height: 65vh; object-fit: contain; background: #000; }
audio { display: none; }
video { cursor: pointer; }
.fail { padding: 40px 0; text-align: center; }
footer { display: flex; align-items: center; justify-content: flex-end; gap: 16px; margin-top: 12px; }
.ctrl { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; }
.ib { display: grid; place-items: center; width: 26px; height: 26px; padding: 0; background: none; border: 0; border-radius: 3px; cursor: pointer; color: var(--text); }
.ib:hover { background: var(--bg-hover); }
.tm { font-size: 11px; color: var(--text-dim); white-space: nowrap; }
.seek { flex: 1; min-width: 0; }
.vol { width: 80px; }
footer .btn { display: inline-flex; align-items: center; gap: 6px; }
</style>
