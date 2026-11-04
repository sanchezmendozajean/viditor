<script setup lang="ts">
import { onMounted } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'
import Icon from './components/Icon.vue'

const project = useProjectStore()
const ui = useUiStore()
onMounted(() => void project.loadRecents())

function fmt(ts: number): string {
  return new Date(ts).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })
}
async function removeRecent(path: string): Promise<void> {
  project.recents = await window.viditor.project.removeRecent(path)
}
</script>

<template>
  <main class="start">
    <div class="hero">
      <div class="brand"><span class="mark">V</span><h1>Viditor</h1></div>
      <p class="dim">Editor de video con transiciones programables.</p>
      <div class="actions">
        <button class="btn primary" data-testid="new-project" @click="ui.newProjectOpen = true"><Icon name="folder-plus" /> Nuevo proyecto</button>
        <button class="btn" data-testid="open-project" @click="project.openWithDialog()"><Icon name="folder-open" /> Abrir proyecto</button>
      </div>
    </div>
    <section class="recents">
      <h2>Proyectos recientes</h2>
      <p v-if="project.recents.length === 0" class="dim" data-testid="no-recents">Todavía no hay proyectos recientes.</p>
      <ul v-else>
        <li v-for="r in project.recents" :key="r.path" data-testid="recent" @dblclick="project.open(r.path)">
          <Icon name="film" :size="22" />
          <div class="info" @click="project.open(r.path)">
            <strong>{{ r.name }}</strong>
            <span class="dim path">{{ r.path }}</span>
          </div>
          <span class="dim date">{{ fmt(r.openedAt) }}</span>
          <button class="icon-btn" title="Quitar de la lista" @click="removeRecent(r.path)"><Icon name="x" :size="14" /></button>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.start { flex: 1; display: grid; grid-template-columns: 380px 1fr; background: var(--bg-panel); min-height: 0; }
.hero { padding: 64px 40px; border-right: 1px solid var(--border); }
.brand { display: flex; align-items: center; gap: 12px; }
.mark { width: 40px; height: 40px; display: grid; place-items: center; background: var(--accent); color: #fff; font-size: 22px; font-weight: 700; border-radius: 6px; }
h1 { font-size: 26px; margin: 0; font-weight: 600; }
.actions { display: flex; flex-direction: column; gap: 8px; margin-top: 32px; }
.actions .btn { display: flex; align-items: center; gap: 8px; justify-content: center; padding: 9px 12px; }
.recents { padding: 40px; overflow: auto; }
h2 { font-size: 12px; margin: 0 0 12px; font-weight: 600; }
ul { list-style: none; margin: 0; padding: 0; }
li { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: var(--radius); }
li:hover { background: var(--bg-hover); }
.info { flex: 1; min-width: 0; display: flex; flex-direction: column; cursor: pointer; }
.path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.date { white-space: nowrap; }
</style>
