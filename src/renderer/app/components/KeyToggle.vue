<script setup lang="ts">
import { computed } from 'vue'
import { isAnimated, keyAt, sourceTimeAt, type KeyProp } from '@shared/keyframes'
import { clipEnd } from '@shared/timeline-ops'
import { useTimelineStore } from '@/stores/timeline'

const props = defineProps<{ keys: KeyProp[] }>()
const tl = useTimelineStore()

const clip = computed(() => tl.selectedClips[0])
const inside = computed(() => Boolean(clip.value) && tl.playhead >= (clip.value?.start ?? 0) && tl.playhead < (clip.value ? clipEnd(clip.value) : 0))
const animated = computed(() => Boolean(clip.value) && props.keys.some((k) => isAnimated(clip.value!, k)))
const on = computed(() => {
  const c = clip.value
  if (!c || !inside.value) return false
  const s = sourceTimeAt(c, tl.playhead)
  return props.keys.every((k) => keyAt(c, k, s))
})
const title = computed(() =>
  !inside.value
    ? 'Coloca el cabezal sobre el clip para animar'
    : on.value
      ? 'Quitar fotograma clave (clic derecho: quitar toda la animación)'
      : animated.value
        ? 'Agregar fotograma clave aquí (clic derecho: quitar toda la animación)'
        : 'Animar: agregar fotograma clave en el cabezal'
)
</script>

<template>
  <span class="keytoggle" data-testid="keytoggle">
    <button class="nav" :disabled="!animated" title="Fotograma anterior" data-testid="key-prev" @click.stop="tl.seekKey(-1, keys)">‹</button>
    <button
      class="dia"
      :class="{ on, animated }"
      :disabled="!inside"
      :title="title"
      :aria-pressed="on"
      data-testid="key-diamond"
      @click.stop="tl.toggleKey(keys)"
      @contextmenu.prevent.stop="tl.clearAnimation(keys)"
    />
    <button class="nav" :disabled="!animated" title="Fotograma siguiente" data-testid="key-next" @click.stop="tl.seekKey(1, keys)">›</button>
  </span>
</template>

<style scoped>
.keytoggle { display: inline-flex; align-items: center; gap: 1px; vertical-align: middle; margin-right: 4px; }
.dia { width: 9px; height: 9px; padding: 0; transform: rotate(45deg); border: 1px solid var(--text-dim); background: transparent; cursor: pointer; border-radius: 1px; }
.dia.animated { border-color: var(--accent); }
.dia.on { background: var(--accent); border-color: var(--accent); }
.dia:disabled { opacity: 0.35; cursor: default; }
.nav { border: 0; background: none; color: var(--text-dim); cursor: pointer; padding: 0 2px; font-size: 12px; line-height: 1; }
.nav:disabled { opacity: 0.35; cursor: default; }
.nav:hover:not(:disabled) { color: var(--text); }
</style>
