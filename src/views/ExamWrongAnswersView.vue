<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const wrongAnswers = ref<any[]>([])
const filterSection = ref('')
const loading = ref(true)

const sectionLabels: Record<string, string> = {
  writing: '写作',
  listening: '听力',
  reading: '阅读',
  translation: '翻译'
}

const sectionIcons: Record<string, string> = {
  writing: '写',
  listening: '听',
  reading: '读',
  translation: '译'
}

const sectionColors: Record<string, string> = {
  writing: '#ef4444',
  listening: '#3b82f6',
  reading: '#10b981',
  translation: '#f59e0b'
}

async function loadWrongAnswers() {
  loading.value = true
  const filters: any = {}
  if (filterSection.value) filters.sectionType = filterSection.value
  wrongAnswers.value = await window.cet4Api.getExamWrongAnswers(filters)
  loading.value = false
}

async function deleteWrong(id: number) {
  await window.cet4Api.deleteExamWrongAnswer(id)
  wrongAnswers.value = wrongAnswers.value.filter(w => w.id !== id)
}

function parseOptions(options: any): Record<string, string> {
  if (!options) return {}
  if (typeof options === 'object' && !Array.isArray(options)) return options
  if (typeof options === 'string') {
    try { return JSON.parse(options) } catch { return {} }
  }
  return {}
}

function setFilter(type: string) {
  filterSection.value = filterSection.value === type ? '' : type
  loadWrongAnswers()
}

onMounted(loadWrongAnswers)
</script>

<template>
  <div class="wrong-answers-view">
    <div class="page-header">
      <button class="back-btn" @click="router.push('/exam')">← 返回</button>
      <h1 class="heading-display">错题本</h1>
      <p class="subtitle">共 {{ wrongAnswers.length }} 道错题</p>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <button
        v-for="(label, type) in sectionLabels"
        :key="type"
        class="filter-chip"
        :class="{ active: filterSection === type }"
        :style="{ '--chip-color': sectionColors[type] }"
        @click="setFilter(type)"
      >
        {{ sectionIcons[type] }} {{ label }}
      </button>
    </div>

    <!-- 空状态 -->
    <div v-if="!loading && wrongAnswers.length === 0" class="empty-state">
      <div class="empty-icon">✓</div>
      <div class="empty-title">{{ filterSection ? '该模块暂无错题' : '暂无错题记录' }}</div>
      <div class="empty-desc">完成真题演练后，错题会自动记录到这里</div>
    </div>

    <!-- 错题列表 -->
    <div v-else class="wrong-list">
      <div v-for="wa in wrongAnswers" :key="wa.id" class="wrong-card">
        <div class="wrong-header">
          <span
            class="section-tag"
            :style="{ background: sectionColors[wa.section_type] || '#6b7280' }"
          >
            {{ sectionLabels[wa.section_type] || wa.section_type }}
          </span>
          <span class="paper-name">{{ wa.paper_title }}</span>
          <button class="remove-btn" @click="deleteWrong(wa.id)" title="移除">×</button>
        </div>

        <div v-if="wa.passage" class="wrong-passage">{{ wa.passage }}</div>
        <div class="wrong-question">{{ wa.question_text }}</div>

        <div v-if="wa.options_json" class="wrong-options">
          <div
            v-for="(text, key) in parseOptions(wa.options_json)"
            :key="key"
            class="wrong-option"
            :class="{
              userWrong: key === wa.user_answer,
              correct: key === wa.correct_answer
            }"
          >
            <span class="opt-key">{{ String(key).replace('.', '') }}</span>
            <span class="opt-text">{{ text }}</span>
          </div>
        </div>

        <div class="wrong-answers-row">
          <div class="ans-item wrong-ans">
            <span class="ans-label">你的答案</span>
            <span class="ans-value">{{ wa.user_answer || '未作答' }}</span>
          </div>
          <div class="ans-item correct-ans">
            <span class="ans-label">正确答案</span>
            <span class="ans-value">{{ wa.correct_answer }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wrong-answers-view { max-width: 800px; margin: 0 auto; }

.page-header { margin-bottom: 20px; }
.back-btn {
  font-size: 12px; color: var(--text-muted); margin-bottom: 8px;
  padding: 4px 8px; border-radius: var(--radius-sm);
}
.back-btn:hover { color: var(--accent); background: rgba(217, 119, 6, 0.06); }
.page-header h1 { font-size: 26px; font-weight: 400; color: var(--text-primary); margin-bottom: 2px; }
.subtitle { font-size: 13px; color: var(--text-muted); }

.filter-bar { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
.filter-chip {
  padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600;
  color: var(--text-muted); background: var(--bg-card); border: 1px solid var(--glass-border);
  transition: all var(--transition-fast);
}
.filter-chip:hover { border-color: var(--chip-color); color: var(--chip-color); }
.filter-chip.active { background: color-mix(in srgb, var(--chip-color) 12%, transparent); color: var(--chip-color); border-color: var(--chip-color); }

.empty-state { text-align: center; padding: 60px 20px; }
.empty-icon { font-size: 48px; color: var(--success); opacity: 0.3; margin-bottom: 12px; }
.empty-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
.empty-desc { font-size: 13px; color: var(--text-muted); }

.wrong-list { display: flex; flex-direction: column; gap: 12px; }

.wrong-card {
  background: var(--bg-card); border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg); padding: 18px 20px;
  box-shadow: var(--shadow-card);
}

.wrong-header {
  display: flex; align-items: center; gap: 10px; margin-bottom: 12px;
}
.section-tag {
  padding: 2px 10px; border-radius: 4px; font-size: 11px;
  font-weight: 700; color: #fff;
}
.paper-name { font-size: 12px; color: var(--text-muted); flex: 1; }
.remove-btn {
  width: 24px; height: 24px; border-radius: 50%; font-size: 16px;
  color: var(--text-muted); display: flex; align-items: center; justify-content: center;
}
.remove-btn:hover { color: #ef4444; background: rgba(239, 68, 68, 0.08); }

.wrong-passage {
  font-size: 13px; color: var(--text-secondary); line-height: 1.7;
  padding: 12px; background: var(--bg-secondary); border-radius: var(--radius-md);
  margin-bottom: 12px; max-height: 150px; overflow-y: auto; border: 1px solid var(--glass-border);
}

.wrong-question {
  font-size: 14px; color: var(--text-primary); line-height: 1.6; margin-bottom: 12px;
}

.wrong-options { display: flex; flex-direction: column; gap: 2px; margin-bottom: 14px; }
.wrong-option {
  display: grid; grid-template-columns: 26px minmax(0, 1fr); align-items: center; gap: 9px;
  padding: 5px 6px; border: 0; border-radius: 8px;
  font-size: 13px; color: var(--text-secondary); background: transparent;
}
.wrong-option.userWrong { background: rgba(239, 68, 68, 0.05); color: var(--danger); }
.wrong-option.correct { background: rgba(22, 163, 74, 0.055); color: var(--success); }
.wrong-option .opt-key {
  width: 26px; height: 26px; min-width: 26px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid rgba(44, 36, 32, 0.16); font-size: 11px;
  font-weight: 700; font-family: var(--font-mono); color: var(--text-secondary);
  background: transparent; user-select: none;
}
.wrong-option.userWrong .opt-key { color: #fff; border-color: var(--danger); background: var(--danger); }
.wrong-option.correct .opt-key { color: #fff; border-color: var(--success); background: var(--success); }

.wrong-answers-row { display: flex; gap: 16px; }
.ans-item { flex: 1; padding: 10px 12px; border-radius: var(--radius-sm); }
.ans-label { font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 2px; }
.ans-value { font-size: 15px; font-weight: 700; font-family: var(--font-mono); }
.wrong-ans { background: rgba(239, 68, 68, 0.04); }
.wrong-ans .ans-value { color: #ef4444; }
.correct-ans { background: rgba(107, 203, 119, 0.04); }
.correct-ans .ans-value { color: var(--success); }
</style>
