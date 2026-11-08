<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'

const props = defineProps<{
  src: string
}>()

const audio = ref<HTMLAudioElement | null>(null)
const playing = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const playbackRate = ref(1)
const rates = [0.5, 0.75, 1, 1.25, 1.5, 2]

function initAudio() {
  if (audio.value) {
    audio.value.pause()
    audio.value.src = ''
  }
  audio.value = new Audio(props.src)
  audio.value.playbackRate = playbackRate.value

  audio.value.addEventListener('loadedmetadata', () => {
    duration.value = audio.value?.duration || 0
  })
  audio.value.addEventListener('timeupdate', () => {
    currentTime.value = audio.value?.currentTime || 0
  })
  audio.value.addEventListener('ended', () => {
    playing.value = false
  })
}

watch(() => props.src, initAudio, { immediate: true })

onUnmounted(() => {
  if (audio.value) {
    audio.value.pause()
    audio.value.src = ''
  }
})

function togglePlay() {
  if (!audio.value) return
  if (playing.value) {
    audio.value.pause()
  } else {
    audio.value.play()
  }
  playing.value = !playing.value
}

function seek(e: MouseEvent) {
  if (!audio.value || !duration.value) return
  const bar = e.currentTarget as HTMLElement
  const rect = bar.getBoundingClientRect()
  const ratio = (e.clientX - rect.left) / rect.width
  audio.value.currentTime = ratio * duration.value
}

function cycleRate() {
  const idx = rates.indexOf(playbackRate.value)
  playbackRate.value = rates[(idx + 1) % rates.length]
  if (audio.value) audio.value.playbackRate = playbackRate.value
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// 暴露给父组件：跳转到指定时间
function seekTo(time: number) {
  if (!audio.value) return
  audio.value.currentTime = time
  if (!playing.value) {
    audio.value.play()
    playing.value = true
  }
}

defineExpose({ seekTo })
</script>

<template>
  <div class="audio-player">
    <button class="play-btn" @click="togglePlay">
      {{ playing ? '❚❚' : '▶' }}
    </button>

    <span class="time current">{{ formatTime(currentTime) }}</span>

    <div class="progress-bar" @click="seek">
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: (duration ? (currentTime / duration * 100) : 0) + '%' }"></div>
      </div>
    </div>

    <span class="time total">{{ formatTime(duration) }}</span>

    <button class="rate-btn" @click="cycleRate" title="播放速度">
      {{ playbackRate }}x
    </button>
  </div>
</template>

<style scoped>
.audio-player {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; background: var(--bg-secondary);
  border-radius: var(--radius-md); border: 1px solid var(--glass-border);
}

.play-btn {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--accent); color: #fff; font-size: 14px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.play-btn:hover { opacity: 0.9; }

.time {
  font-size: 12px; font-family: var(--font-mono);
  color: var(--text-muted); min-width: 36px; text-align: center;
}

.progress-bar { flex: 1; cursor: pointer; padding: 4px 0; }
.progress-track {
  height: 4px; background: rgba(255,255,255,0.06);
  border-radius: 2px; overflow: hidden;
}
.progress-fill {
  height: 100%; background: var(--accent); border-radius: 2px;
  transition: width 0.1s linear;
}

.rate-btn {
  padding: 3px 8px; border-radius: var(--radius-sm);
  font-size: 11px; font-weight: 700; font-family: var(--font-mono);
  color: var(--accent); background: rgba(217, 119, 6, 0.08);
  border: 1px solid rgba(217, 119, 6, 0.15);
}
.rate-btn:hover { background: rgba(217, 119, 6, 0.15); }
</style>
