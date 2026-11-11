<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import Modal from '../components/Modal.vue'
import Icon from '../components/Icon.vue'

const ui = useUiStore()
const files = computed(() => ui.deleteAsk?.files ?? [])
const others = computed(() => ui.deleteAsk?.others ?? [])
const total = computed(() => files.value.length + others.value.length)
</script>

<template>
  <Modal
    :title="total === 1 ? 'Eliminar recurso' : `Eliminar ${total} recursos`"
    :subtitle="files.length ? 'Esta acción no se puede deshacer' : 'Se quitarán del proyecto'"
    icon="trash"
    tone="danger"
    hint="Esc cancelar"
    @close="ui.deleteAsk?.resolve(false)"
  >
    <div class="body" data-testid="delete-media-dialog">
      <template v-if="files.length">
        <p>{{ files.length === 1 ? 'Este archivo se eliminará físicamente del disco y no podrá recuperarse desde Viditor:' : `Estos ${files.length} archivos se eliminarán físicamente del disco y no podrán recuperarse desde Viditor:` }}</p>
        <ul class="list" data-testid="delete-media-files">
          <li v-for="(f, i) in files" :key="'f' + i" class="file"><Icon name="film" :size="14" />{{ f }}</li>
        </ul>
      </template>
      <template v-if="others.length">
        <p>{{ files.length ? 'Además se quitarán del proyecto (no se borra ningún archivo):' : 'Se quitarán del proyecto (no se borra ningún archivo):' }}</p>
        <ul class="list" data-testid="delete-media-others">
          <li v-for="(f, i) in others" :key="'o' + i" class="file"><Icon name="link" :size="14" />{{ f }}</li>
        </ul>
      </template>
      <div class="note"><Icon name="alert" :size="13" />{{ total === 1 ? 'Sus clips' : 'Los clips de estos recursos' }} en la línea de tiempo también se quitarán.</div>
    </div>
    <template #footer>
      <button class="btn" @click="ui.deleteAsk?.resolve(false)">Cancelar</button>
      <button class="btn danger" data-testid="delete-media-confirm" @click="ui.deleteAsk?.resolve(true)">{{ files.length ? 'Eliminar del disco' : 'Quitar del proyecto' }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.body { display: grid; gap: 10px; }
p { margin: 0; }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; max-height: 180px; overflow-y: auto; }
.file { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: 4px; font-family: var(--font-mono); font-size: 11.5px; word-break: break-all; user-select: text; }
.file :deep(svg) { color: var(--text-dim); flex: none; }
.note { display: flex; gap: 8px; padding: 8px 10px; border-radius: 4px; color: var(--text); background: color-mix(in srgb, var(--danger) 9%, transparent); border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent); }
.note :deep(svg) { color: var(--danger); flex: none; margin-top: 2px; }
</style>
