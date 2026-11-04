<script setup lang="ts">
import type { HelpTopic } from '@shared/help-topics'
import Icon from './Icon.vue'

const props = defineProps<{ title: string; help?: HelpTopic }>()
function openHelp(): void {
  window.viditor.help.open(props.help)
}
</script>

<template>
  <section class="panel">
    <header>
      <div class="tab">{{ title }}</div>
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
.tab { height: 100%; padding: 0 12px; display: flex; align-items: center; font-weight: 600; border-bottom: 2px solid var(--accent); }
.spacer { flex: 1; }
.body { flex: 1; min-height: 0; overflow: auto; position: relative; }
</style>
