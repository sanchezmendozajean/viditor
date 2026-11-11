<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import Icon from './Icon.vue'
import type { IconName } from './Icon.vue'

type Tone = 'accent' | 'danger' | 'warn' | 'ok'

withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    icon?: IconName
    tone?: Tone
    /** Ancho en px (máx. 90vw) */
    width?: number
    closable?: boolean
    /** Pista de teclado del pie, a la izquierda (p. ej. «Esc cancelar») */
    hint?: string
  }>(),
  { tone: 'accent', width: 440, closable: true }
)
const emit = defineEmits<{ close: [] }>()

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="backdrop" @pointerdown.self="emit('close')">
    <div class="dialog" :class="`tone-${tone}`" :style="{ width: `${width}px` }" role="dialog" aria-modal="true" :aria-label="title">
      <header class="head">
        <span v-if="icon" class="badge"><Icon :name="icon" :size="15" /></span>
        <div class="titles">
          <h2>{{ title }}</h2>
          <p v-if="subtitle">{{ subtitle }}</p>
        </div>
        <button v-if="closable" class="x" title="Cerrar" aria-label="Cerrar" data-testid="modal-close" @click="emit('close')"><Icon name="x" :size="14" /></button>
      </header>
      <div class="body"><slot /></div>
      <footer v-if="$slots.footer" class="foot">
        <span v-if="hint" class="hint">{{ hint }}</span>
        <slot name="footer" />
      </footer>
    </div>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; background: #000a; display: grid; place-items: center; z-index: 100; }
.dialog {
  --tone: var(--accent);
  max-width: 90vw; background: var(--bg-panel); border: 1px solid var(--border-subtle); border-radius: 6px; overflow: hidden;
  box-shadow: 0 0 0 1px #0008, 0 16px 48px #000c; animation: pop 0.14s ease-out;
}
.tone-danger { --tone: var(--danger); }
.tone-warn { --tone: var(--warn); }
.tone-ok { --tone: var(--ok); }

.head {
  display: flex; align-items: center; gap: 10px; padding: 10px 10px 10px 14px;
  background: var(--bg-panel-header); border-bottom: 1px solid var(--border); box-shadow: inset 0 2px 0 var(--tone);
}
.badge {
  flex: none; width: 28px; height: 28px; border-radius: 5px; display: grid; place-items: center; color: var(--tone);
  background: color-mix(in srgb, var(--tone) 16%, transparent); border: 1px solid color-mix(in srgb, var(--tone) 35%, transparent);
}
.titles { flex: 1; min-width: 0; }
h2 { margin: 0; font-size: 13px; font-weight: 600; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.titles p { margin: 0; font-size: 11px; color: var(--text-dim); }
.x {
  flex: none; display: grid; place-items: center; width: 26px; height: 26px; padding: 0;
  background: none; border: 0; border-radius: 4px; cursor: pointer; color: var(--text-dim);
}
.x:hover { background: var(--bg-hover); color: var(--text); }
.x:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

.body { padding: 16px; font-size: 12px; }
.foot {
  display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding: 12px 16px;
  border-top: 1px solid var(--border); background: #1f1f1f;
}
.foot :deep(button:focus-visible) { outline: 2px solid var(--accent); outline-offset: 1px; }
.hint { margin-right: auto; font-size: 11px; color: var(--text-dim); }

@keyframes pop { from { opacity: 0; transform: translateY(4px) scale(0.98); } }
@media (prefers-reduced-motion: reduce) { .dialog { animation: none; } }
</style>
