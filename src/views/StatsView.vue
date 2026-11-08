<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useStudyStore } from '../stores/study.store'

const studyStore = useStudyStore()
const heatmapData = ref<any[]>([])
const weakWords = ref<any[]>([])
const skillData = ref<any[]>([])
const efficiencyData = ref<any[]>([])
const memoryData = ref<any[]>([])
const weekStats = ref({ totalLearned: 0, totalReviewed: 0, totalMinutes: 0 })

onMounted(async () => {
  await studyStore.loadDashboard()
  heatmapData.value = await window.cet4Api.getStudyHeatmap()
  weakWords.value = await window.cet4Api.getWeakWords(10)
  skillData.value = await window.cet4Api.getSkillAnalysis()
  efficiencyData.value = await window.cet4Api.getEfficiencyTrend(14)
  memoryData.value = await window.cet4Api.getMemoryDistribution()

  const week = heatmapData.value.slice(-7)
  weekStats.value = {
    totalLearned: week.reduce((s: number, d: any) => s + d.words_learned, 0),
    totalReviewed: week.reduce((s: number, d: any) => s + d.words_reviewed, 0),
    totalMinutes: week.reduce((s: number, d: any) => s + (d.total_study_minutes ?? 0), 0)
  }
})

const overallMastery = computed(() => {
  if (skillData.value.length === 0) return 0
  const total = skillData.value.reduce((s: number, d: any) => s + d.total, 0)
  const mastered = skillData.value.reduce((s: number, d: any) => s + d.mastered, 0)
  return total > 0 ? Math.round((mastered / total) * 100) : 0
})

const weakestSkill = computed(() => {
  if (skillData.value.length === 0) return null
  return skillData.value.reduce((min: any, d: any) => d.masteryRate < min.masteryRate ? d : min, skillData.value[0])
})

const diagnosis = computed(() => {
  const items: string[] = []
  if (weakWords.value.length >= 5) items.push(`你有 ${weakWords.value.length} 个顽固词需要重点攻克，建议每天额外花10分钟专项复习。`)
  if (weekStats.value.totalMinutes < 60) items.push('本周学习时间不足，建议每天至少学习30分钟，保持学习节奏。')
  if (weekStats.value.totalLearned < 30) items.push('本周新词量偏低，建议每天学习20-30个新词。')
  if (weakestSkill.value && weakestSkill.value.masteryRate < 30) items.push(`${weakestSkill.value.name}掌握率仅${weakestSkill.value.masteryRate}%，是当前最薄弱环节，建议重点突破。`)
  if (items.length === 0) items.push('学习状态良好，继续保持当前节奏！')
  return items
})

const memoryTotal = computed(() => memoryData.value.reduce((s, d) => s + d.count, 0))
const memorySegments = computed(() => {
  const colors: Record<string, string> = {
    new: '#6b7280', learning: '#f59e0b', review: '#3b82f6', mastered: '#10b981'
  }
  const labels: Record<string, string> = {
    new: '未学习', learning: '学习中', review: '复习中', mastered: '已掌握'
  }
  return memoryData.value.map(d => ({
    ...d,
    color: colors[d.status] || '#6b7280',
    label: labels[d.status] || d.status,
    percent: memoryTotal.value > 0 ? Math.round(d.count / memoryTotal.value * 100) : 0
  }))
})

const efficiencyAvg = computed(() => {
  if (efficiencyData.value.length === 0) return '0'
  const vals = efficiencyData.value.filter((d: any) => d.efficiency > 0)
  if (vals.length === 0) return '0'
  const avg = vals.reduce((s: number, d: any) => s + d.efficiency, 0) / vals.length
  return avg.toFixed(1)
})
</script>

<template>
  <div class="stats-view">
    <div class="page-header">
      <h1 class="heading-display">学习统计</h1>
      <p class="subtitle">多维度分析你的学习状况</p>
    </div>

    <!-- 本周概览 -->
    <section class="section">
      <div class="section-label">本周概览</div>
      <div class="stat-grid">
        <div class="stat-card">
          <div class="sv">{{ weekStats.totalLearned }}</div>
          <div class="sl">新学单词</div>
        </div>
        <div class="stat-card">
          <div class="sv accent">{{ weekStats.totalReviewed }}</div>
          <div class="sl">复习单词</div>
        </div>
        <div class="stat-card">
          <div class="sv warm">{{ weekStats.totalMinutes }}<span class="unit">min</span></div>
          <div class="sl">学习时长</div>
        </div>
      </div>
    </section>

    <!-- 技能维度分析 -->
    <section class="section">
      <div class="section-label">技能维度分析</div>
      <div class="skill-grid">
        <div v-for="s in skillData" :key="s.key" class="skill-card">
          <div class="skill-header">
            <span class="skill-name">{{ s.name }}</span>
            <span class="skill-rate" :class="{ good: s.masteryRate >= 60, ok: s.masteryRate >= 30 && s.masteryRate < 60, low: s.masteryRate < 30 }">{{ s.masteryRate }}%</span>
          </div>
          <div class="skill-bar-track">
            <div class="skill-bar-fill" :style="{ width: `${s.masteryRate}%` }"></div>
          </div>
          <div class="skill-meta">
            <span>已掌握 {{ s.mastered }}</span>
            <span>薄弱 {{ s.weak }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 学习效率趋势 -->
    <section class="section">
      <div class="section-label">学习效率趋势（近14天）</div>
      <div class="efficiency-card">
        <div class="eff-summary">
          <div class="eff-item">
            <span class="eff-val">{{ efficiencyAvg }}</span>
            <span class="eff-label">词/分钟</span>
          </div>
          <div class="eff-item">
            <span class="eff-val">{{ efficiencyData.filter((d: any) => d.total_study_minutes > 0).length }}</span>
            <span class="eff-label">有效学习天数</span>
          </div>
        </div>
        <div class="eff-chart">
          <div v-for="(d, i) in efficiencyData.slice(-14)" :key="i" class="eff-bar-group">
            <div class="eff-bar-track">
              <div
                class="eff-bar-fill"
                :style="{ height: `${Math.min((d.efficiency / 5) * 100, 100)}%` }"
                :title="`${d.stat_date}: ${d.efficiency} 词/分`"
              ></div>
            </div>
            <span class="eff-day">{{ d.stat_date.slice(5) }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 热力图 -->
    <section class="section">
      <div class="section-label">学习热力图（近 90 天）</div>
      <div class="heatmap-box">
        <div class="heatmap">
          <div v-for="day in heatmapData.slice(-84)" :key="day.stat_date" class="cell"
            :class="{ l0: day.words_learned === 0, l1: day.words_learned > 0 && day.words_learned <= 5, l2: day.words_learned > 5 && day.words_learned <= 15, l3: day.words_learned > 15 && day.words_learned <= 30, l4: day.words_learned > 30 }"
            :title="`${day.stat_date}: ${day.words_learned} 词`" />
        </div>
        <div class="legend">
          <span class="lg-label">少</span>
          <div class="lg l0" /><div class="lg l1" /><div class="lg l2" /><div class="lg l3" /><div class="lg l4" />
          <span class="lg-label">多</span>
        </div>
      </div>
    </section>

    <!-- 记忆分布 -->
    <section class="section">
      <div class="section-label">单词记忆分布</div>
      <div class="memory-card">
        <div class="memory-ring-wrap">
          <svg viewBox="0 0 120 120" class="memory-ring">
            <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="12" />
            <circle
              v-for="(seg, i) in memorySegments"
              :key="seg.status"
              cx="60" cy="60" r="50"
              fill="none"
              :stroke="seg.color"
              stroke-width="12"
              :stroke-dasharray="`${seg.percent * 3.14} ${314 - seg.percent * 3.14}`"
              :stroke-dashoffset="`-${memorySegments.slice(0, i).reduce((s, d) => s + d.percent * 3.14, 0)}`"
              stroke-linecap="round"
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div class="memory-ring-center">
            <div class="memory-total">{{ memoryTotal }}</div>
            <div class="memory-label">总词数</div>
          </div>
        </div>
        <div class="memory-legend">
          <div v-for="seg in memorySegments" :key="seg.status" class="legend-item">
            <span class="legend-dot" :style="{ background: seg.color }"></span>
            <span class="legend-label">{{ seg.label }}</span>
            <span class="legend-count">{{ seg.count }}</span>
            <span class="legend-percent">{{ seg.percent }}%</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 顽固词 Top 10 -->
    <section class="section">
      <div class="section-label">顽固词 Top 10</div>
      <div v-if="weakWords.length === 0" class="empty">暂无顽固词，继续保持！</div>
      <div v-else class="weak-list">
        <div v-for="(w, i) in weakWords" :key="(w as any).id" class="weak-item">
          <span class="rank" :class="{ top: i < 3 }">{{ i + 1 }}</span>
          <div class="wi-info">
            <span class="wi-word">{{ (w as any).word }}</span>
            <span class="wi-meaning">{{ (w as any).meaning_cn }}</span>
          </div>
          <span class="wi-count">错 {{ (w as any).wrong_count }} 次</span>
        </div>
      </div>
    </section>

    <!-- 弱项诊断 -->
    <section class="section">
      <div class="section-label">弱项诊断</div>
      <div class="diagnosis-card">
        <div v-for="(d, i) in diagnosis" :key="i" class="diag-item">{{ d }}</div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.stats-view { max-width: 700px; margin: 0 auto; }

.page-header { margin-bottom: 28px; }
.page-header h1 { font-size: 26px; font-weight: 400; color: var(--text-primary); margin-bottom: 2px; }
.subtitle { font-size: 13px; color: var(--text-muted); }

.section { margin-bottom: 32px; }
.section-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 2px; font-weight: 600; margin-bottom: 14px; }

.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }

.stat-card {
  background: var(--bg-card); border-radius: var(--radius-md);
  padding: 18px; text-align: center;
  border: 1px solid var(--glass-border); box-shadow: var(--shadow-card);
}

.sv { font-size: 28px; font-weight: 700; color: var(--text-primary); font-family: var(--font-mono); margin-bottom: 4px; letter-spacing: -1px; }
.sv .unit { font-size: 14px; color: var(--text-muted); margin-left: 2px; }
.sv.accent { color: var(--accent); }
.sv.warm { color: var(--warning); }
.sl { font-size: 11px; color: var(--text-muted); letter-spacing: 0.5px; }

/* 技能维度 */
.skill-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }

.skill-card {
  background: var(--bg-card); border-radius: var(--radius-md);
  padding: 16px; border: 1px solid var(--glass-border);
}

.skill-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.skill-name { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.skill-rate { font-size: 16px; font-weight: 700; font-family: var(--font-mono); }
.skill-rate.good { color: var(--success); }
.skill-rate.ok { color: var(--warning); }
.skill-rate.low { color: var(--danger); }

.skill-bar-track { height: 5px; background: rgba(255,255,255,0.04); border-radius: 3px; overflow: hidden; margin-bottom: 8px; }
.skill-bar-fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width 0.5s ease; }

.skill-meta { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); }

/* 效率趋势 */
.efficiency-card {
  background: var(--bg-card); border-radius: var(--radius-lg);
  padding: 20px; border: 1px solid var(--glass-border); box-shadow: var(--shadow-card);
}

.eff-summary { display: flex; gap: 28px; margin-bottom: 18px; }
.eff-item { display: flex; align-items: baseline; gap: 6px; }
.eff-val { font-size: 22px; font-weight: 700; color: var(--accent); font-family: var(--font-mono); }
.eff-label { font-size: 11px; color: var(--text-muted); }

.eff-chart { display: flex; gap: 4px; align-items: flex-end; height: 80px; }
.eff-bar-group { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.eff-bar-track { width: 100%; height: 60px; background: rgba(255,255,255,0.02); border-radius: 2px; display: flex; align-items: flex-end; }
.eff-bar-fill { width: 100%; background: var(--accent); border-radius: 2px 2px 0 0; min-height: 2px; transition: height 0.4s ease; }
.eff-day { font-size: 9px; color: var(--text-muted); font-family: var(--font-mono); }

/* 热力图 */
.heatmap-box {
  background: var(--bg-card); border-radius: var(--radius-lg);
  padding: 18px; border: 1px solid var(--glass-border); box-shadow: var(--shadow-card);
}

.heatmap {
  display: grid; grid-template-columns: repeat(7, 1fr);
  gap: 3px; grid-auto-flow: column; grid-template-rows: repeat(12, 1fr);
  max-width: 100%; overflow-x: auto; margin-bottom: 10px;
}

.cell { width: 14px; height: 14px; border-radius: 2px; transition: transform var(--transition-fast); }
.cell:hover { transform: scale(1.3); }
.cell.l0 { background: rgba(44, 36, 32, 0.03); }
.cell.l1 { background: rgba(217, 119, 6, 0.15); }
.cell.l2 { background: rgba(217, 119, 6, 0.3); }
.cell.l3 { background: rgba(217, 119, 6, 0.55); }
.cell.l4 { background: rgba(217, 119, 6, 0.85); }

.legend { display: flex; align-items: center; gap: 3px; justify-content: flex-end; }
.lg-label { font-size: 10px; color: var(--text-muted); margin: 0 4px; }
.lg { width: 10px; height: 10px; border-radius: 2px; }
.lg.l0 { background: rgba(44, 36, 32, 0.03); }
.lg.l1 { background: rgba(217, 119, 6, 0.15); }
.lg.l2 { background: rgba(217, 119, 6, 0.3); }
.lg.l3 { background: rgba(217, 119, 6, 0.55); }
.lg.l4 { background: rgba(217, 119, 6, 0.85); }

/* 顽固词 */
.weak-list { display: flex; flex-direction: column; gap: 4px; }

.weak-item {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; background: var(--bg-card); border-radius: var(--radius-md);
  border: 1px solid var(--glass-border); transition: background var(--transition-fast);
}
.weak-item:hover { background: var(--bg-card-hover); }

.rank {
  font-size: 12px; color: var(--text-muted); width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 4px; background: rgba(44, 36, 32, 0.04);
  font-weight: 700; font-family: var(--font-mono); flex-shrink: 0;
}
.rank.top { background: rgba(232, 107, 107, 0.1); color: var(--danger); }

.wi-info { flex: 1; display: flex; flex-direction: column; gap: 1px; }
.wi-word { font-size: 14px; font-weight: 600; color: var(--text-primary); font-family: var(--font-mono); }
.wi-meaning { font-size: 12px; color: var(--text-muted); }
.wi-count { font-size: 12px; color: var(--danger); font-family: var(--font-mono); }

.empty { text-align: center; padding: 28px; color: var(--text-muted); font-size: 13px; }

/* 弱项诊断 */
.diagnosis-card {
  background: var(--bg-card); border-radius: var(--radius-lg);
  padding: 20px; border: 1px solid var(--glass-border); box-shadow: var(--shadow-card);
}
.diag-item {
  font-size: 13px; color: var(--text-secondary); line-height: 1.8;
  padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.02);
}
.diag-item:last-child { border-bottom: none; }
.diag-item::before { content: '→ '; color: var(--accent); font-weight: 600; }

/* 记忆分布 */
.memory-card {
  background: var(--bg-card); border-radius: var(--radius-lg);
  padding: 24px; border: 1px solid var(--glass-border); box-shadow: var(--shadow-card);
  display: flex; align-items: center; gap: 32px;
}
.memory-ring-wrap { position: relative; width: 140px; height: 140px; flex-shrink: 0; }
.memory-ring { width: 100%; height: 100%; }
.memory-ring-center {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
}
.memory-total { font-size: 24px; font-weight: 700; color: var(--text-primary); font-family: var(--font-mono); }
.memory-label { font-size: 11px; color: var(--text-muted); }
.memory-legend { flex: 1; display: flex; flex-direction: column; gap: 10px; }
.legend-item { display: flex; align-items: center; gap: 8px; }
.legend-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
.legend-label { font-size: 13px; color: var(--text-secondary); flex: 1; }
.legend-count { font-size: 14px; font-weight: 700; color: var(--text-primary); font-family: var(--font-mono); min-width: 36px; text-align: right; }
.legend-percent { font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); min-width: 36px; text-align: right; }
</style>
