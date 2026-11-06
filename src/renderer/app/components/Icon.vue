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
import eye from 'lucide-static/icons/eye.svg?raw'
import eyeOff from 'lucide-static/icons/eye-off.svg?raw'
import lock from 'lucide-static/icons/lock.svg?raw'
import unlock from 'lucide-static/icons/lock-open.svg?raw'
import vol from 'lucide-static/icons/volume-2.svg?raw'
import volOff from 'lucide-static/icons/volume-x.svg?raw'
import grip from 'lucide-static/icons/grip-vertical.svg?raw'
import pointer from 'lucide-static/icons/mouse-pointer-2.svg?raw'
import razor from 'lucide-static/icons/scissors.svg?raw'
import hand from 'lucide-static/icons/hand.svg?raw'
import magnet from 'lucide-static/icons/magnet.svg?raw'
import right from 'lucide-static/icons/chevron-right.svg?raw'
import down from 'lucide-static/icons/chevron-down.svg?raw'
import flag from 'lucide-static/icons/flag.svg?raw'
import play from 'lucide-static/icons/play.svg?raw'
import pause from 'lucide-static/icons/pause.svg?raw'
import skipBack from 'lucide-static/icons/skip-back.svg?raw'
import skipFwd from 'lucide-static/icons/skip-forward.svg?raw'
import left from 'lucide-static/icons/chevron-left.svg?raw'
import rightArrow from 'lucide-static/icons/chevron-right.svg?raw'
import repeat from 'lucide-static/icons/repeat.svg?raw'

const icons = { folder, 'folder-open': folderOpen, 'folder-plus': folderPlus, plus, x, minus, square, copy, search, link, alert, film, music, image, grid, list, help, save, download, video, eye, eyeOff, lock, unlock, vol, volOff, grip, pointer, razor, hand, magnet, right, down, flag, play, pause, skipBack, skipFwd, left, rightArrow, repeat }
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
