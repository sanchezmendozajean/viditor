<script setup lang="ts">
import { useUiStore } from '@/stores/ui'
import Modal from '../components/Modal.vue'

const ui = useUiStore()
</script>

<template>
  <Modal title="Eliminar recurso" @close="ui.deleteAsk?.resolve(false)">
    <div class="body" data-testid="delete-media-dialog">
      <p>
        El recurso <strong>{{ ui.deleteAsk?.name }}</strong> se eliminará físicamente del disco y no será recuperable a través del programa.
      </p>
      <p class="dim">Sus clips en la línea de tiempo también se quitarán. Esta acción no se puede deshacer.</p>
      <footer>
        <button class="btn" @click="ui.deleteAsk?.resolve(false)">Cancelar</button>
        <button class="btn primary" data-testid="delete-media-confirm" @click="ui.deleteAsk?.resolve(true)">Eliminar</button>
      </footer>
    </div>
  </Modal>
</template>

<style scoped>
.body { width: 420px; font-size: 12px; }
p { margin: 0 0 8px; }
footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
</style>
