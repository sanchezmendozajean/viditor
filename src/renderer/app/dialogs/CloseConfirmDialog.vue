<script setup lang="ts">
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'
import Modal from '../components/Modal.vue'

const project = useProjectStore()
const ui = useUiStore()

function cancel(): void {
  ui.closeAsk = false
}
async function saveAndExit(): Promise<void> {
  if (await project.save()) window.viditor.window.forceClose()
  else ui.closeAsk = false // el error ya se mostró; la app sigue abierta
}
function discardAndExit(): void {
  window.viditor.window.forceClose()
}
</script>

<template>
  <Modal title="Cambios sin guardar" @close="cancel">
    <div class="body" data-testid="close-dialog">
      <p>El proyecto <strong>{{ project.projectName }}</strong> tiene cambios sin guardar. ¿Quieres guardarlos antes de salir?</p>
      <footer>
        <button class="btn" data-testid="close-cancel" @click="cancel">Cancelar</button>
        <button class="btn" data-testid="close-discard" @click="discardAndExit">No guardar</button>
        <button class="btn primary" data-testid="close-save" @click="saveAndExit">Guardar y salir</button>
      </footer>
    </div>
  </Modal>
</template>

<style scoped>
.body { width: 420px; font-size: 12px; }
p { margin: 0 0 8px; }
footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
</style>
