<script setup lang="ts">
import { useUiStore } from '@/stores/ui'
import Modal from '../components/Modal.vue'
import Icon from '../components/Icon.vue'

const ui = useUiStore()
</script>

<template>
  <Modal
    title="Eliminar recurso"
    subtitle="Esta acción no se puede deshacer"
    icon="trash"
    tone="danger"
    hint="Esc cancelar"
    @close="ui.deleteAsk?.resolve(false)"
  >
    <div class="body" data-testid="delete-media-dialog">
      <p>Este archivo se eliminará físicamente del disco y no podrá recuperarse desde Viditor:</p>
      <div class="file"><Icon name="film" :size="14" />{{ ui.deleteAsk?.name }}</div>
      <div class="note"><Icon name="alert" :size="13" />Sus clips en la línea de tiempo también se quitarán.</div>
    </div>
    <template #footer>
      <button class="btn" @click="ui.deleteAsk?.resolve(false)">Cancelar</button>
      <button class="btn danger" data-testid="delete-media-confirm" @click="ui.deleteAsk?.resolve(true)">Eliminar del disco</button>
    </template>
  </Modal>
</template>

<style scoped>
.body { display: grid; gap: 10px; }
p { margin: 0; }
.file { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: 4px; font-family: var(--font-mono); font-size: 11.5px; word-break: break-all; user-select: text; }
.file :deep(svg) { color: var(--text-dim); flex: none; }
.note { display: flex; gap: 8px; padding: 8px 10px; border-radius: 4px; color: var(--text); background: color-mix(in srgb, var(--danger) 9%, transparent); border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent); }
.note :deep(svg) { color: var(--danger); flex: none; margin-top: 2px; }
</style>
