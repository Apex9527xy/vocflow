<script setup lang="ts">
import { ref, onUnmounted, computed } from 'vue'

const WORK = 25, BREAK = 5
const minutes = ref(WORK)
const seconds = ref(0)
const isRunning = ref(false)
const isBreak = ref(false)
const pomodoroCount = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

const progress = computed(() => {
  const total = (isBreak.value ? BREAK : WORK) * 60
  return ((total - (minutes.value * 60 + seconds.value)) / total) * 100
})

function start() {
  if (isRunning.value) return
  isRunning.value = true
  timer = setInterval(() => {
    if (seconds.value === 0) {
      if (minutes.value === 0) complete()
      else { minutes.value--; seconds.value = 59 }
    } else seconds.value--
  }, 1000)
}

function pause() { isRunning.value = false; if (timer) { clearInterval(timer); timer = null } }

function complete() {
  pause()
  if (isBreak.value) { isBreak.value = false; minutes.value = WORK; seconds.value = 0; pomodoroCount.value++; window.cet4Api.recordPomodoro() }
  else { isBreak.value = true; minutes.value = BREAK; seconds.value = 0 }
}

function reset() { pause(); isBreak.value = false; minutes.value = WORK; seconds.value = 0; pomodoroCount.value = 0 }

onUnmounted(() => pause())

const fmt = (m: number, s: number) => `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
</script>

<template>
  <div class="focus-view">
    <div class="center">
      <div class="phase" :class="{ break: isBreak }">{{ isBreak ? '休息' : '专注' }}</div>

      <div class="ring-wrap">
        <svg viewBox="0 0 200 200" class="ring">
          <circle cx="100" cy="100" r="88" class="ring-bg" />
          <circle cx="100" cy="100" r="88" class="ring-fg" :class="{ brk: isBreak, on: isRunning }"
            :stroke-dasharray="553" :stroke-dashoffset="553 * (1 - progress / 100)" />
        </svg>
        <div class="time" :class="{ break: isBreak }">{{ fmt(minutes, seconds) }}</div>
      </div>

      <div class="pomo-count" v-if="pomodoroCount > 0">已完成 <strong>{{ pomodoroCount }}</strong> 个番茄钟</div>

      <div class="controls">
        <button v-if="!isRunning" class="btn accent" @click="start">▶ 开始</button>
        <button v-else class="btn warn" @click="pause">⏸ 暂停</button>
        <button class="btn ghost" @click="reset">↺ 重置</button>
      </div>

      <div class="tip">{{ isBreak ? '站起来走动一下' : '保持专注，25 分钟很快就过去了' }}</div>
    </div>
  </div>
</template>

<style scoped>
.focus-view { display: flex; align-items: center; justify-content: center; height: calc(100vh - 64px); }
.center { text-align: center; }

.phase {
  font-size: 11px; color: var(--text-muted); text-transform: uppercase;
  letter-spacing: 3px; margin-bottom: 28px; font-weight: 600;
}
.phase.break { color: var(--success); }

.ring-wrap { position: relative; width: 220px; height: 220px; margin: 0 auto 24px; }
.ring { width: 100%; height: 100%; transform: rotate(-90deg); }
.ring-bg { fill: none; stroke: rgba(44, 36, 32, 0.04); stroke-width: 5; }
.ring-fg {
  fill: none; stroke: var(--accent); stroke-width: 5; stroke-linecap: round;
  transition: stroke-dashoffset 1s linear, stroke 0.3s ease;
}
.ring-fg.brk { stroke: var(--success); }
.ring-fg.on { animation: pulse 2s ease-in-out infinite; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.time {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  font-size: 52px; font-weight: 300; font-family: var(--font-mono);
  color: var(--text-primary); letter-spacing: 2px;
}
.time.break { color: var(--success); }

.pomo-count { font-size: 13px; color: var(--text-muted); margin-bottom: 24px; }
.pomo-count strong { color: var(--accent); font-family: var(--font-mono); }

.controls { display: flex; gap: 10px; justify-content: center; margin-bottom: 28px; }

.btn { padding: 10px 28px; border-radius: var(--radius-md); font-size: 14px; font-weight: 600; }
.btn.accent { background: var(--accent); color: var(--bg-primary); }
.btn.accent:hover { background: var(--accent-light); box-shadow: 0 4px 16px var(--accent-glow); }
.btn.warn { background: rgba(240, 168, 96, 0.1); color: var(--warning); border: 1px solid rgba(240, 168, 96, 0.15); }
.btn.ghost { background: transparent; color: var(--text-muted); border: 1px solid var(--glass-border); }
.btn.ghost:hover { color: var(--text-secondary); }

.tip { font-size: 13px; color: var(--text-muted); opacity: 0.6; }
</style>
