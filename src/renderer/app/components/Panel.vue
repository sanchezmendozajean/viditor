<script setup lang="ts">
import type { HelpTopic } from '@shared/help-topics'
import Icon from './Icon.vue'

export interface PanelTab {
  id: string
  label: string
}

/** Panel acoplable. Con `tabs` la cabecera muestra pestañas (p. ej. Proyecto | Transiciones) en lugar de un solo título. */
const props = defineProps<{ title: string; help?: HelpTopic; tabs?: PanelTab[]; modelValue?: string }>()
const emit = defineEmits<{ 'update:modelValue': [id: string] }>()
function openHelp(): void {
  window.viditor.help.open(props.help)
}
</script>

<template>
  <section class="panel">
    <header>
      <template v-if="tabs">
        <button v-for="t in tabs" :key="t.id" class="tab btn-tab" :class="{ active: modelValue === t.id }" :data-testid="`ptab-${t.id}`" @click="emit('update:modelValue', t.id)">
          {{ t.label }}
        </button>
      </template>
      <div v-else class="tab active">{{ title }}</div>
      <div class="spacer" />
      <slot name="actions" />
      <button v-if="help" class="icon-btn" :title="`Ayuda: ${title}`" @click="openHelp">
        <Icon name="help" :size="14" />
      </button>
    </header>
    <div class="body"><slot /></div>
  </section>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; background: var(--bg-panel); min-width: 0; min-height: 0; flex: 1; overflow: hidden; }
header { display: flex; align-items: center; height: 26px; flex: none; background: var(--bg-panel-header); border-bottom: 1px solid var(--border); padding-right: 4px; }
.tab { height: 100%; padding: 0 12px; display: flex; align-items: center; font-weight: 600; border-bottom: 2px solid transparent; }
.tab.active { border-bottom-color: var(--accent); }
.btn-tab { background: none; border-top: 0; border-left: 0; border-right: 0; color: var(--text-dim); cursor: pointer; font-size: 11px; }
.btn-tab.active { color: var(--text); }
.btn-tab:hover { color: var(--text); }
.spacer { flex: 1; }
.body { flex: 1; min-height: 0; overflow: auto; position: relative; }
</style>
