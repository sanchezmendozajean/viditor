<script setup lang="ts">
import type { HelpTopic } from '@shared/help-topics'
import Panel from '../components/Panel.vue'

defineProps<{ title: string; hint: string; help?: HelpTopic; mono?: boolean }>()
</script>

<template>
  <Panel :title="title" :help="help">
    <div class="ph" :class="{ mono }"><span>{{ hint }}</span><slot /></div>
  </Panel>
</template>

<style scoped>
.ph { height: 100%; display: grid; place-content: center; text-align: center; color: var(--text-dim); padding: 12px; }
</style>
