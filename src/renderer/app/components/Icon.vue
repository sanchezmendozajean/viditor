<script setup lang="ts">
import { computed } from 'vue'
import folder from 'lucide-static/icons/folder.svg?raw'
import folderOpen from 'lucide-static/icons/folder-open.svg?raw'
import folderPlus from 'lucide-static/icons/folder-plus.svg?raw'
import plus from 'lucide-static/icons/plus.svg?raw'
import x from 'lucide-static/icons/x.svg?raw'
import minus from 'lucide-static/icons/minus.svg?raw'
import square from 'lucide-static/icons/square.svg?raw'
import copy from 'lucide-static/icons/copy.svg?raw'
import search from 'lucide-static/icons/search.svg?raw'
import link from 'lucide-static/icons/link.svg?raw'
import alert from 'lucide-static/icons/triangle-alert.svg?raw'
import film from 'lucide-static/icons/film.svg?raw'
import music from 'lucide-static/icons/music.svg?raw'
import image from 'lucide-static/icons/image.svg?raw'
import grid from 'lucide-static/icons/layout-grid.svg?raw'
import list from 'lucide-static/icons/list.svg?raw'
import help from 'lucide-static/icons/circle-question-mark.svg?raw'
import save from 'lucide-static/icons/save.svg?raw'
import download from 'lucide-static/icons/download.svg?raw'
import video from 'lucide-static/icons/video.svg?raw'

const icons = { folder, 'folder-open': folderOpen, 'folder-plus': folderPlus, plus, x, minus, square, copy, search, link, alert, film, music, image, grid, list, help, save, download, video }
export type IconName = keyof typeof icons

const props = defineProps<{ name: IconName; size?: number }>()
const svg = computed(() => icons[props.name])
const px = computed(() => `${props.size ?? 16}px`)
</script>

<template>
  <span class="icon" :style="{ width: px, height: px }" aria-hidden="true" v-html="svg" />
</template>

<style scoped>
.icon { display: inline-flex; flex: none; }
.icon :deep(svg) { width: 100%; height: 100%; }
</style>
