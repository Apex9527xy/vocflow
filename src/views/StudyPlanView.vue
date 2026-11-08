<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const activeWeek = ref(1)

const weeks = [
  { week: 1, title: '基础夯实周', subtitle: '单词基础 + 高频词 + 基础听力', tasks: [
    { title: '核心词汇学习', desc: '每天学习 30 个高频四级词汇，使用 SM-2 间隔重复', icon: '◎', route: '/study' },
    { title: '每日复习', desc: '完成所有到期复习任务，巩固记忆', icon: '↻', route: '/review' },
    { title: '基础听力', desc: '每天 10 分钟听写练习，熟悉四级听力语速', icon: '▶', route: '/listening' },
    { title: '例句阅读', desc: '每天阅读 5 条例句，培养语感', icon: '▦', route: '/reading' },
    { title: '专注学习', desc: '每天至少完成 2 个番茄钟（50 分钟）', icon: '◉', route: '/focus' }
  ], tip: '本周重点：建立学习节奏。不要贪多，关键是每天都学。' },
  { week: 2, title: '能力提升周', subtitle: '阅读训练 + 长难句 + 真题词汇', tasks: [
    { title: '扩充词汇', desc: '每天继续学习 30 个新词，重点攻克顽固词', icon: '◎', route: '/study' },
    { title: '强化复习', desc: '错词专项突破，确保不再犯同样的错误', icon: '✕', route: '/wrong-words' },
    { title: '阅读理解', desc: '每天精读 1 篇短文，分析长难句结构', icon: '▦', route: '/reading' },
    { title: '句子结构精读', desc: '划选文章句子，查看成分、修饰关系与中文释义', icon: '⌕', route: '/reading' },
    { title: '听力进阶', desc: '延长听力时间至 15 分钟，尝试精听', icon: '▶', route: '/listening' }
  ], tip: '本周重点：从单词过渡到句子和篇章。注意错词的反复强化。' },
  { week: 3, title: '实战强化周', subtitle: '真题强化 + 听力提升 + 阅读专项', tasks: [
    { title: '真题词汇', desc: '集中学习真题中出现的高频词汇和短语', icon: '◎', route: '/study' },
    { title: '真题归档', desc: '批量导入至少 2 套真题 PDF，确认年份和考季', icon: '▣', route: '/exam' },
    { title: '阅读专项', desc: '集中精读真题文章，训练长难句和定位能力', icon: '▦', route: '/reading' },
    { title: '真题整理', desc: '检查真题年份、考季与类型，处理未分类文件', icon: '▤', route: '/exam' },
    { title: '听力冲刺', desc: '每天 20 分钟听力，尝试跟读和精听', icon: '▶', route: '/listening' }
  ], tip: '本周重点：开始接触真题，适应考试节奏。强化阅读定位与听力精听。' },
  { week: 4, title: '考前冲刺周', subtitle: '模拟考试 + 高频词汇 + 查漏补缺', tasks: [
    { title: '限时训练', desc: '打开真题 PDF 完成 3 套限时训练，记录生词', icon: '▣', route: '/exam' },
    { title: '错词清零', desc: '回顾所有错词，确保顽固词全部攻克', icon: '✕', route: '/wrong-words' },
    { title: '高频词汇回顾', desc: '快速回顾高频核心词和顽固错词，保持词汇热度', icon: '↻', route: '/review' },
    { title: '真题回看', desc: '回看高频年份真题，整理仍需巩固的词汇和句子', icon: '▤', route: '/exam' },
    { title: '状态调整', desc: '保证充足睡眠，保持积极心态', icon: '◉', route: '/focus' }
  ], tip: '本周重点：模拟考试环境，调整心态。不要再学新内容，重点复习和巩固。' }
]

const currentWeekData = computed(() => weeks[activeWeek.value - 1])
</script>

<template>
  <div class="plan-view">
    <div class="page-header">
      <h1 class="heading-display">四周冲刺计划</h1>
      <p class="subtitle">科学规划，一个月通过四级</p>
    </div>

    <div class="week-tabs">
      <button v-for="w in weeks" :key="w.week" :class="{ active: activeWeek === w.week }" @click="activeWeek = w.week">
        第{{ w.week }}周
      </button>
    </div>

    <div class="week-content" v-if="currentWeekData">
      <div class="week-banner">
        <div class="week-number">第 {{ currentWeekData.week }} 周</div>
        <div class="week-title">{{ currentWeekData.title }}</div>
        <div class="week-subtitle">{{ currentWeekData.subtitle }}</div>
      </div>

      <div class="task-list">
        <div v-for="task in currentWeekData.tasks" :key="task.title" class="task-card" @click="task.route ? router.push(task.route) : null" :class="{ clickable: !!task.route }">
          <div class="task-icon">{{ task.icon }}</div>
          <div class="task-info">
            <div class="task-title">{{ task.title }}</div>
            <div class="task-desc">{{ task.desc }}</div>
          </div>
          <div v-if="task.route" class="task-arrow">→</div>
        </div>
      </div>

      <div class="week-tip">
        <span class="tip-label">提示</span>
        <span>{{ currentWeekData.tip }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.plan-view { max-width: 700px; margin: 0 auto; }

.page-header { margin-bottom: 24px; }
.page-header h1 { font-size: 26px; font-weight: 400; color: var(--text-primary); margin-bottom: 2px; }
.subtitle { font-size: 13px; color: var(--text-muted); }

.week-tabs { display: flex; gap: 6px; margin-bottom: 22px; }

.week-tabs button {
  flex: 1; padding: 10px; border-radius: var(--radius-md);
  font-size: 13px; font-weight: 600; background: var(--bg-card);
  color: var(--text-muted); border: 1px solid var(--glass-border);
}

.week-tabs button.active {
  background: var(--accent); color: var(--bg-primary); border-color: var(--accent);
}

.week-banner {
  background: var(--bg-card); border-radius: var(--radius-lg);
  padding: 28px; margin-bottom: 20px;
  border: 1px solid var(--glass-border); box-shadow: var(--shadow-card);
}

.week-number {
  font-size: 11px; color: var(--accent); text-transform: uppercase;
  letter-spacing: 2px; margin-bottom: 6px; font-weight: 600;
}

.week-title { font-size: 26px; font-weight: 400; color: var(--text-primary); margin-bottom: 6px; font-family: var(--font-display); }
.week-subtitle { font-size: 13px; color: var(--text-muted); }

.task-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px; }

.task-card {
  display: flex; align-items: center; gap: 14px;
  padding: 16px 20px; background: var(--bg-card); border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  transition: all var(--transition-fast);
}

.task-card.clickable { cursor: pointer; }
.task-card.clickable:hover { background: var(--bg-card-hover); }

.task-icon { font-size: 18px; width: 36px; text-align: center; flex-shrink: 0; color: var(--accent); }
.task-info { flex: 1; }
.task-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 3px; }
.task-desc { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
.task-arrow { font-size: 14px; color: var(--text-muted); transition: transform var(--transition-fast); }
.task-card.clickable:hover .task-arrow { transform: translateX(4px); }

.week-tip {
  background: rgba(240, 168, 96, 0.04); border-radius: var(--radius-md);
  padding: 16px 20px; font-size: 13px; color: var(--text-secondary);
  line-height: 1.7; border: 1px solid rgba(240, 168, 96, 0.08);
  display: flex; align-items: flex-start; gap: 10px;
}

.tip-label {
  font-size: 10px; color: var(--warning); text-transform: uppercase;
  letter-spacing: 1px; font-weight: 600; flex-shrink: 0; margin-top: 2px;
}
</style>
