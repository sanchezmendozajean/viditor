<script setup lang="ts">
import { useExportStore, type ExportJobView } from '@/stores/export'
import Panel from '../components/Panel.vue'

const ex = useExportStore()
const reveal = (p: string): void => window.viditor.export.reveal(p)
const play = (p: string): void => window.viditor.export.open(p)

function clock(s: number | null): string {
  if (s === null || !Number.isFinite(s)) return '—'
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}
const pct = (j: ExportJobView): number => (j.total > 0 ? Math.min(100, Math.round((j.frame / j.total) * 100)) : 0)
const label = (j: ExportJobView): string => {
  switch (j.phase) {
    case 'audio':
      return 'Mezclando audio…'
    case 'video':
      return `Renderizando… ${j.frame} / ${j.total}`
    case 'done':
      return `Terminado en ${clock(j.elapsedSeconds ?? null)}`
    case 'cancelled':
      return 'Cancelada'
    default:
      return 'Error'
  }
}
</script>

<template>
  <Panel title="Cola de exportación" help="export">
    <template #actions>
      <button class="link" data-testid="export-clear" :disabled="!ex.jobs.some((j) => j.phase !== 'audio' && j.phase !== 'video')" @click="ex.clearFinished()">Limpiar</button>
    </template>
    <div v-if="ex.jobs.length === 0" class="empty">Sin exportaciones.</div>
    <ul v-else class="jobs">
      <li v-for="j in ex.jobs" :key="j.jobId" class="job" :class="j.phase" :data-testid="`export-job-${j.phase}`">
        <div class="thumb"><img v-if="j.thumb" :src="j.thumb" alt="" /></div>
        <div class="info">
          <div class="name" :title="j.outputPath">{{ j.name }}</div>
          <div class="state" :class="{ err: j.phase === 'error' }" data-testid="export-state">{{ label(j) }}</div>
          <template v-if="j.phase === 'audio' || j.phase === 'video'">
            <div class="bar"><div class="fill" :style="{ width: pct(j) + '%' }" /></div>
            <div class="meta dim">
              <span>{{ pct(j) }} %</span>
              <span v-if="j.fps > 0">{{ j.fps.toFixed(1) }} fps de render</span>
              <span v-if="j.etaSeconds !== null">Quedan {{ clock(j.etaSeconds) }}</span>
              <span v-if="j.encoder">{{ j.encoder }}</span>
            </div>
          </template>
          <div v-else-if="j.phase === 'error'" class="msg" data-testid="export-error">{{ j.message }}</div>
        </div>
        <div class="btns">
          <button v-if="j.phase === 'audio' || j.phase === 'video'" class="btn" data-testid="export-cancel" @click="ex.cancel(j.jobId)">Cancelar</button>
          <template v-else-if="j.phase === 'done' && j.outputPath">
            <button class="btn" @click="reveal(j.outputPath)">Mostrar</button>
            <button class="btn" @click="play(j.outputPath)">Reproducir</button>
          </template>
        </div>
      </li>
    </ul>
  </Panel>
</template>

<style scoped>
.empty { height: 100%; display: grid; place-content: center; color: var(--text-dim); }
.jobs { list-style: none; margin: 0; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
.job { display: flex; gap: 10px; align-items: center; background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: var(--radius); padding: 8px; }
.thumb { width: 96px; height: 54px; flex: none; background: #000; border-radius: 3px; overflow: hidden; display: grid; place-content: center; }
.thumb img { width: 100%; height: 100%; object-fit: contain; }
.info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.state.err { color: var(--danger); }
.msg { color: var(--danger); user-select: text; white-space: pre-wrap; }
.bar { height: 5px; background: var(--bg-app); border-radius: 3px; overflow: hidden; }
.fill { height: 100%; background: var(--accent); transition: width 0.2s; }
.meta { display: flex; gap: 14px; font-size: 10px; }
.dim { color: var(--text-dim); }
.btns { display: flex; gap: 6px; flex: none; }
.link { background: none; border: 0; color: var(--text-dim); cursor: pointer; font-size: 10px; }
.link:hover:not(:disabled) { color: var(--text); }
.link:disabled { opacity: 0.4; cursor: default; }
</style>
