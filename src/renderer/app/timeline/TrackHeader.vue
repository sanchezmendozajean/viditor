<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type { Track } from '@shared/project-schema'
import { useProjectStore } from '@/stores/project'
import { useTimelineStore } from '@/stores/timeline'
import Icon from '../components/Icon.vue'

const props = defineProps<{ track: Track; height: number; selected: boolean; collapsed: boolean }>()
const emit = defineEmits<{ reorder: [e: PointerEvent]; menu: [e: MouseEvent] }>()

const tl = useTimelineStore()
const project = useProjectStore()
const editing = ref(false)
const nameInput = ref<HTMLInputElement | null>(null)

async function startEdit(): Promise<void> {
  editing.value = true
  await nextTick()
  nameInput.value?.select()
}
function finishEdit(e: Event): void {
  const v = (e.target as HTMLInputElement).value.trim()
  editing.value = false
  if (v && v !== props.track.name) tl.setTrack(props.track.id, 'name', v, 'Renombrar pista')
}

function startResize(e: PointerEvent): void {
  e.preventDefault()
  e.stopPropagation()
  const y0 = e.clientY
  const h0 = props.track.height
  const before = tl.snapshot()
  const move = (ev: PointerEvent): void => {
    const h = Math.max(28, Math.min(220, Math.round(h0 + ev.clientY - y0)))
    project.mutate((p) => {
      const t = p.tracks.find((x) => x.id === props.track.id)
      if (t) t.height = h
    })
  }
  const up = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    tl.commit('Cambiar altura de pista', before)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function setVolume(e: Event): void {
  tl.setTrack(props.track.id, 'volume', Number((e.target as HTMLInputElement).value) / 100, 'Volumen de pista')
}
</script>

<template>
  <div
    class="head"
    :class="{ selected, collapsed }"
    :style="{ height: height + 'px' }"
    :data-testid="`track-header-${track.name}`"
    @pointerdown.left="tl.selectedTrackId = track.id"
    @contextmenu="emit('menu', $event)"
  >
    <button class="grip" title="Arrastra para reordenar" data-testid="track-grip" @pointerdown.stop.prevent="emit('reorder', $event)">
      <Icon name="grip" :size="12" />
    </button>
    <div class="main">
      <div class="line">
        <input v-if="editing" ref="nameInput" class="name-edit" type="text" :value="track.name" @blur="finishEdit" @keydown.enter="($event.target as HTMLInputElement).blur()" @keydown.esc="editing = false" />
        <span v-else class="name" title="Doble clic para renombrar" @dblclick="startEdit">{{ track.name }}</span>
        <span class="sp" />
        <template v-if="track.kind === 'video'">
          <button class="tbtn" :class="{ on: track.hidden }" :title="track.hidden ? 'Mostrar pista' : 'Ocultar pista'" data-testid="btn-hide" @click="tl.setTrack(track.id, 'hidden', !track.hidden, track.hidden ? 'Mostrar pista' : 'Ocultar pista')">
            <Icon :name="track.hidden ? 'eyeOff' : 'eye'" :size="12" />
          </button>
        </template>
        <button class="tbtn" :class="{ on: track.locked }" :title="track.locked ? 'Desbloquear' : 'Bloquear'" data-testid="btn-lock" @click="tl.setTrack(track.id, 'locked', !track.locked, track.locked ? 'Desbloquear pista' : 'Bloquear pista')">
          <Icon :name="track.locked ? 'lock' : 'unlock'" :size="12" />
        </button>
        <button class="tbtn txt" :class="{ on: track.muted }" :title="track.muted ? 'Quitar silencio' : 'Silenciar'" data-testid="btn-mute" @click="tl.setTrack(track.id, 'muted', !track.muted, track.muted ? 'Activar audio de pista' : 'Silenciar pista')">
          <template v-if="track.kind === 'audio'">M</template><Icon v-else :name="track.muted ? 'volOff' : 'vol'" :size="12" />
        </button>
        <button class="tbtn txt" :class="{ on: track.solo, solo: track.solo }" title="Solo" data-testid="btn-solo" @click="tl.setTrack(track.id, 'solo', !track.solo, 'Solo de pista')">S</button>
      </div>
      <div v-if="track.kind === 'audio' && !collapsed && height >= 40" class="line">
        <Icon name="vol" :size="11" />
        <input class="vol" type="range" min="0" max="200" step="1" :value="Math.round(track.volume * 100)" title="Volumen de pista" @change="setVolume" @pointerdown.stop />
        <span class="dim num">{{ Math.round(track.volume * 100) }}%</span>
      </div>
    </div>
    <div class="resize" title="Arrastra para cambiar la altura" @pointerdown="startResize" />
  </div>
</template>

<style scoped>
.head { position: relative; display: flex; align-items: stretch; width: 100%; background: var(--bg-panel-header); border-bottom: 1px solid var(--border); border-right: 1px solid var(--border); overflow: hidden; }
.head.selected { background: #303030; }
.grip { width: 14px; flex: none; background: none; border: 0; color: var(--text-dim); cursor: grab; display: grid; place-items: center; padding: 0; }
.grip:hover { color: var(--text); }
.main { flex: 1; min-width: 0; padding: 3px 4px 3px 2px; display: flex; flex-direction: column; justify-content: center; gap: 3px; }
.line { display: flex; align-items: center; gap: 3px; min-width: 0; }
.sp { flex: 1; }
.name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: text; }
.name-edit { width: 70px; padding: 0 3px; font-size: 11px; }
.tbtn { width: 20px; height: 18px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid transparent; border-radius: 2px; background: none; color: var(--text-dim); cursor: pointer; padding: 0; font-size: 10px; font-weight: 600; }
.tbtn:hover { background: var(--bg-hover); color: var(--text); }
.tbtn.on { color: var(--text); background: #444; }
.tbtn.solo { background: var(--warn); color: #000; }
.vol { flex: 1; min-width: 0; height: 10px; accent-color: var(--accent); }
.num { width: 28px; text-align: right; font-size: 10px; }
.resize { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; cursor: row-resize; }
.resize:hover { background: var(--accent); }
</style>
