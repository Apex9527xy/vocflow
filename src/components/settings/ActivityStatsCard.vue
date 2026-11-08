<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

const summary = ref<ActivitySummary | null>(null)
const loading = ref(true)
const busy = ref(false)
const notice = ref('')
const showClearConfirm = ref(false)

const chartPoints = computed(() => {
  const days = summary.value?.last7Days || []
  if (!days.length) return ''
  return days.map((day, index) => {
    const x = 24 + index * (272 / 6)
    const y = day.active ? 24 : 78
    return `${x},${y}`
  }).join(' ')
})

const chartArea = computed(() => {
  const points = chartPoints.value
  return points ? `24,92 ${points} 296,92` : ''
})

async function loadSummary() {
  loading.value = true
  try {
    const result = await window.cet4Api.getActivitySummary()
    if (!result.success) throw new Error(result.message || '读取日活统计失败')
    summary.value = result.summary
  } catch (error) {
    notice.value = (error as Error).message || '读取日活统计失败'
  } finally {
    loading.value = false
  }
}

onMounted(loadSummary)

async function clearStats() {
  busy.value = true
  try {
    const result = await window.cet4Api.clearActivityStats()
    if (!result.success) throw new Error(result.message || '清空统计失败')
    showClearConfirm.value = false
    await loadSummary()
    notice.value = '日活统计已清空'
  } catch (error) {
    notice.value = (error as Error).message || '清空统计失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="activity-card">
    <div class="activity-heading">
      <div>
        <div class="card-title">日活统计</div>
        <p>仅统计本机启动情况，同一天多次打开只计为 1 个活跃日。</p>
      </div>
      <button class="clear-btn" type="button" @click="showClearConfirm = true">清空统计数据</button>
    </div>

    <div v-if="notice" class="activity-notice">{{ notice }}</div>
    <div v-if="loading" class="activity-loading">正在读取本地日活数据…</div>
    <template v-else-if="summary">
      <div class="activity-metrics">
        <div class="metric">
          <span>累计打开天数</span>
          <strong>{{ summary.totalActiveDays }}</strong>
          <small>天</small>
        </div>
        <div class="metric accent">
          <span>软件总启动次数</span>
          <strong>{{ summary.totalLaunches }}</strong>
          <small>次</small>
        </div>
      </div>

      <div class="chart-panel">
        <div class="chart-title">近 7 天日活</div>
        <svg class="activity-chart" viewBox="0 0 320 112" role="img" aria-label="近7天日活折线图">
          <defs>
            <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#d97706" stop-opacity=".22" />
              <stop offset="100%" stop-color="#d97706" stop-opacity="0" />
            </linearGradient>
          </defs>
          <line x1="24" y1="24" x2="296" y2="24" class="grid-line" />
          <line x1="24" y1="78" x2="296" y2="78" class="grid-line" />
          <polygon :points="chartArea" fill="url(#activityFill)" />
          <polyline :points="chartPoints" class="chart-line" />
          <g v-for="(day, index) in summary.last7Days" :key="day.date">
            <circle :cx="24 + index * (272 / 6)" :cy="day.active ? 24 : 78" r="4" :class="{ active: day.active }" />
            <text :x="24 + index * (272 / 6)" y="106" text-anchor="middle" class="day-label">{{ day.label }}</text>
          </g>
        </svg>
        <div class="chart-legend"><span class="legend-dot"></span>有启动记录为 1，无启动记录为 0</div>
      </div>

    </template>

    <div v-if="showClearConfirm" class="activity-modal-mask" @click.self="showClearConfirm = false">
      <div class="activity-modal">
        <h3>确认清空日活统计？</h3>
        <p>累计打开天数、近 7 天记录和软件总启动次数都会被删除，此操作不可撤销。</p>
        <div class="modal-actions">
          <button type="button" class="btn secondary" @click="showClearConfirm = false">取消</button>
          <button type="button" class="btn danger" :disabled="busy" @click="clearStats">{{ busy ? '正在清空…' : '确认清空' }}</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.activity-card { margin-bottom:14px; padding:22px 24px; border:1px solid var(--glass-border); border-radius:var(--radius-lg); background:var(--bg-card); box-shadow:var(--shadow-card); }
.activity-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
.card-title { color:var(--text-primary); font-size:15px; font-weight:700; }
.activity-heading p { margin:5px 0 0; color:var(--text-muted); font-size:10px; line-height:1.55; }
.clear-btn { padding:6px 9px; border:1px solid rgba(239,68,68,.14); border-radius:7px; color:#b91c1c; background:rgba(239,68,68,.05); font-size:9px; font-weight:700; white-space:nowrap; }
.activity-notice { margin-top:10px; padding:8px 10px; border-radius:7px; color:#6d28d9; background:rgba(139,92,246,.07); font-size:10px; }
.activity-loading { padding:26px; color:var(--text-muted); font-size:11px; text-align:center; }
.activity-metrics { display:grid; grid-template-columns:repeat(2,1fr); gap:9px; margin-top:16px; }
.metric { padding:13px 15px; border-radius:10px; background:var(--bg-secondary); }
.metric span { display:block; color:var(--text-muted); font-size:9px; }
.metric strong { margin-top:3px; color:var(--text-primary); font-family:var(--font-mono); font-size:26px; }
.metric small { margin-left:4px; color:var(--text-muted); font-size:9px; }
.metric.accent strong { color:var(--accent); }
.chart-panel { margin-top:11px; padding:12px 12px 8px; border-radius:10px; background:var(--bg-secondary); }
.chart-title { color:var(--text-secondary); font-size:10px; font-weight:700; }
.activity-chart { display:block; width:100%; height:auto; margin-top:4px; overflow:visible; }
.grid-line { stroke:rgba(44,36,32,.08); stroke-width:1; }
.chart-line { fill:none; stroke:#d97706; stroke-width:2.4; stroke-linecap:round; stroke-linejoin:round; }
circle { fill:#fff; stroke:#b45309; stroke-width:2; }
circle.active { fill:#d97706; stroke:#fff; }
.day-label { fill:var(--text-muted); font-size:8px; }
.chart-legend { display:flex; align-items:center; gap:5px; color:var(--text-muted); font-size:8px; }
.legend-dot { width:7px; height:7px; border-radius:50%; background:#d97706; }
.activity-modal-mask { position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(30,24,20,.34); backdrop-filter:blur(3px); }
.activity-modal { width:min(380px,100%); padding:22px; border-radius:14px; background:var(--bg-card); box-shadow:0 24px 70px rgba(44,36,32,.25); }
.activity-modal h3 { margin:0 0 8px; color:var(--text-primary); font-size:16px; }
.activity-modal p { margin:0; color:var(--text-muted); font-size:11px; line-height:1.7; }
.modal-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:18px; }
.modal-actions .btn { padding:8px 13px; border-radius:8px; font-size:10px; font-weight:700; }
.btn.secondary { color:var(--text-secondary); background:var(--bg-secondary); }
.btn.danger { color:#fff; background:#dc2626; }
</style>