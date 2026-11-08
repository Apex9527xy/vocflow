<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

interface AppNotice {
  id: string
  title: string
  body: string
  route: string
}

const router = useRouter()
const notices = ref<AppNotice[]>([])
const SEEN_UPDATE_KEY = 'vocflow.notifications.seen-update-key'
let updatePoll = 0

function addNotice(notice: AppNotice): void {
  if (notices.value.some(item => item.id === notice.id)) return
  notices.value = [notice, ...notices.value].slice(0, 4)
}

function dismiss(id: string): void {
  notices.value = notices.value.filter(item => item.id !== id)
}

function openNotice(notice: AppNotice): void {
  dismiss(notice.id)
  void router.push(notice.route)
}

async function checkUpdate(): Promise<void> {
  try {
    const result = await window.cet4Api.checkForUpdate(false)
    if (!result?.hasUpdate) return
    const key = `${result.latestVersion}|${result.downloadUrl || ''}|${result.sha256 || ''}`
    if (localStorage.getItem(SEEN_UPDATE_KEY) === key) return
    localStorage.setItem(SEEN_UPDATE_KEY, key)
    addNotice({
      id: `update-${key}`,
      title: `发现新版本 v${result.latestVersion}`,
      body: 'VocFlow 有新版本可用，请前往设置页查看更新日志并安装。',
      route: '/settings'
    })
  } catch {}
}

onMounted(() => {
  window.setTimeout(() => void checkUpdate(), 700)
  updatePoll = window.setInterval(() => void checkUpdate(), 5 * 60 * 1000)
})
onUnmounted(() => window.clearInterval(updatePoll))
</script>

<template>
  <TransitionGroup name="app-notice" tag="div" class="app-notice-stack">
    <article v-for="notice in notices" :key="notice.id" class="app-notice update">
      <button type="button" class="notice-close" title="关闭提示" @click="dismiss(notice.id)">×</button>
      <div class="notice-kicker">SOFTWARE UPDATE</div>
      <h3>{{ notice.title }}</h3>
      <p>{{ notice.body }}</p>
      <button type="button" class="notice-action" @click="openNotice(notice)">查看更新</button>
    </article>
  </TransitionGroup>
</template>

<style scoped>
.app-notice-stack { position:fixed; right:20px; bottom:20px; z-index:300000; width:min(350px, calc(100vw - 40px)); display:flex; flex-direction:column; gap:10px; pointer-events:none; }
.app-notice { position:relative; padding:15px 16px 14px; border:1px solid var(--glass-border); border-left:4px solid #d97706; border-radius:12px; background:rgba(255,252,247,.98); box-shadow:0 16px 45px rgba(44,36,32,.2); pointer-events:auto; backdrop-filter:blur(14px); }
.app-notice.update { border-left-color:#d97706; }
.notice-kicker { color:var(--accent); font-size:8px; font-weight:800; letter-spacing:1.2px; }
.app-notice h3 { margin:6px 28px 4px 0; color:var(--text-primary); font-size:13px; line-height:1.4; }
.app-notice p { margin:0; color:var(--text-secondary); font-size:10px; line-height:1.6; }
.notice-close { position:absolute; top:9px; right:9px; width:22px; height:22px; padding:0; border-radius:50%; color:var(--text-muted); background:transparent; font-size:15px; }
.notice-close:hover { color:var(--text-primary); background:var(--bg-secondary); }
.notice-action { margin-top:10px; padding:6px 10px; border-radius:7px; color:#fff; background:var(--accent); font-size:9px; font-weight:700; }
.app-notice-enter-active,.app-notice-leave-active { transition:opacity .2s ease, transform .2s ease; }
.app-notice-enter-from,.app-notice-leave-to { opacity:0; transform:translateY(8px); }
</style>




