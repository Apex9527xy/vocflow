<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

type Phase = 'practice' | 'result' | 'plan'
type PracticeMode = 'full' | 'section'

const phase = ref<Phase>('practice')
const practiceMode = ref<PracticeMode>('full')
const selectedPaper = ref<any>(null)
const questions = ref<any[]>([])
const currentSectionIndex = ref(0)
const currentQuestionIndex = ref(0)
const answers = ref<Record<number, string>>({})
const writingAnswer = ref('')
const translationAnswer = ref('')
const startTime = ref(0)
const elapsed = ref(0)
const timer = ref<ReturnType<typeof setInterval> | null>(null)
const timeWarning = ref(false)

// 各模块时间限制（分钟）
const sectionTimeLimits: Record<string, number> = {
  writing: 30,
  listening: 25,
  reading: 40,
  translation: 30
}
const FULL_EXAM_MINUTES = 130
const timeLimit = ref(FULL_EXAM_MINUTES * 60) // 秒


// 评分结果
const scores = ref<Record<string, { correct: number; total: number; score: number }>>({})
const totalScore = ref(0)

// CET-4 分值权重
const sectionWeights: Record<string, { percent: number; maxScore: number }> = {
  writing: { percent: 15, maxScore: 106.5 },
  listening: { percent: 35, maxScore: 248.5 },
  reading: { percent: 35, maxScore: 248.5 },
  translation: { percent: 15, maxScore: 106.5 }
}

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

// 按模块分组题目
const sections = computed(() => {
  const groups: Record<string, any[]> = {}
  for (const q of questions.value) {
    const st = q.section_type
    if (!groups[st]) groups[st] = []
    groups[st].push(q)
  }
  return Object.entries(groups).map(([type, qs]) => ({
    type,
    label: sectionLabels[type] || type,
    questions: qs
  }))
})

const currentSection = computed(() => sections.value[currentSectionIndex.value])
const currentQuestion = computed(() => currentSection.value?.questions[currentQuestionIndex.value])

// 听力题按 passage 分组
interface ListeningGroup {
  passage: string
  questions: any[]
}

const listeningGroups = computed<ListeningGroup[]>(() => {
  if (!currentSection.value || currentSection.value.type !== 'listening') return []
  const groups: ListeningGroup[] = []
  let lastPassage = ''
  for (const q of currentSection.value.questions) {
    const p = q.passage || ''
    if (p !== lastPassage || groups.length === 0) {
      groups.push({ passage: p, questions: [q] })
      lastPassage = p
    } else {
      groups[groups.length - 1].questions.push(q)
    }
  }
  return groups
})

const currentGroupIndex = ref(0)
const currentListeningGroup = computed(() => listeningGroups.value[currentGroupIndex.value])
const totalListeningGroups = computed(() => listeningGroups.value.length)
const totalSections = computed(() => sections.value.length)
const totalQuestions = computed(() => questions.value.length)
const answeredCount = computed(() => Object.keys(answers.value).length + (writingAnswer.value ? 1 : 0) + (translationAnswer.value ? 1 : 0))

const progress = computed(() => {
  if (totalQuestions.value === 0) return 0
  return Math.round((answeredCount.value / totalQuestions.value) * 100)
})

const remainingSeconds = computed(() => Math.max(0, timeLimit.value - elapsed.value))

const elapsedDisplay = computed(() => {
  const total = remainingSeconds.value
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

const toolbarTitle = computed(() => {
  if (practiceMode.value === 'section') {
    const sectionType = route.params.sectionType as string
    return sectionLabels[sectionType] ? sectionLabels[sectionType] + '专项训练' : '专项训练'
  }
  return selectedPaper.value?.title || '真题演练'
})

// 分模块模式下是否只有一个 section
const isSingleSection = computed(() => practiceMode.value === 'section')

// 分模块模式下的满分
const maxScoreForMode = computed(() => {
  if (practiceMode.value === 'section') {
    const sectionType = route.params.sectionType as string
    return sectionWeights[sectionType]?.maxScore || 177.5
  }
  return 710
})

// 分模块模式下的满分标签
const maxScoreLabel = computed(() => {
  if (practiceMode.value === 'section') {
    return `满分 ${maxScoreForMode.value} 分`
  }
  return '满分 710 分'
})

function startTimer() {
  startTime.value = Date.now()
  elapsed.value = 0
  timer.value = setInterval(() => {
    elapsed.value = Math.floor((Date.now() - startTime.value) / 1000)
    // 剩余5分钟警告
    if (remainingSeconds.value <= 300 && !timeWarning.value) {
      timeWarning.value = true
    }
    // 时间到自动提交
    if (remainingSeconds.value <= 0) {
      if (timer.value) clearInterval(timer.value)
      calculateScores()
    }
  }, 1000)
}

function selectAnswer(questionId: number, option: string) {
  const selection = window.getSelection()
  if (selection && !selection.isCollapsed) return
  answers.value[questionId] = option
}

function nextQuestion() {
  if (!currentSection.value) return
  if (currentQuestionIndex.value < currentSection.value.questions.length - 1) {
    currentQuestionIndex.value++
  } else if (currentSectionIndex.value < totalSections.value - 1) {
    currentSectionIndex.value++
    currentQuestionIndex.value = 0
  }
}

function prevQuestion() {
  if (currentQuestionIndex.value > 0) {
    currentQuestionIndex.value--
  } else if (currentSectionIndex.value > 0) {
    currentSectionIndex.value--
    currentQuestionIndex.value = (currentSection.value?.questions.length || 1) - 1
  }
}

function goToSection(index: number) {
  currentSectionIndex.value = index
  currentQuestionIndex.value = 0
  currentGroupIndex.value = 0
}

function nextListeningGroup() {
  if (currentGroupIndex.value < totalListeningGroups.value - 1) {
    currentGroupIndex.value++
  }
}

function prevListeningGroup() {
  if (currentGroupIndex.value > 0) {
    currentGroupIndex.value--
  }
}


// 评分
function calculateScores() {
  if (timer.value) clearInterval(timer.value)

  const result: Record<string, { correct: number; total: number; score: number }> = {}
  let total = 0
  const wrongList: { questionId: number; sectionType: string; userAnswer: string; correctAnswer: string }[] = []

  for (const section of sections.value) {
    let correct = 0
    let sectionTotal = section.questions.length

    if (section.type === 'writing' || section.type === 'translation') {
      const text = section.type === 'writing' ? writingAnswer.value : translationAnswer.value
      const wordCount = text.split(/\s+/).filter(w => w).length
      const hasStructure = /firstly|secondly|however|moreover|in conclusion|therefore/i.test(text)

      if (wordCount >= 50) correct = Math.floor(sectionTotal * 0.6)
      else if (wordCount >= 20) correct = Math.floor(sectionTotal * 0.4)
      else correct = Math.floor(sectionTotal * 0.2)

      if (hasStructure) correct = Math.min(sectionTotal, correct + 1)
    } else {
      for (const q of section.questions) {
        const userAnswer = answers.value[q.id]
        if (userAnswer && q.answer && userAnswer.toUpperCase() === q.answer.toUpperCase()) {
          correct++
        } else if (q.answer) {
          wrongList.push({
            questionId: q.id,
            sectionType: section.type,
            userAnswer: userAnswer || '',
            correctAnswer: q.answer
          })
        }
      }
    }

    const weight = sectionWeights[section.type] || { percent: 25, maxScore: 177.5 }
    const sectionScore = sectionTotal > 0 ? Math.round((correct / sectionTotal) * weight.maxScore) : 0

    result[section.type] = { correct, total: sectionTotal, score: sectionScore }
    total += sectionScore
  }

  scores.value = result
  totalScore.value = Math.round(total)
  phase.value = 'result'

  // 保存错题到数据库
  if (wrongList.length > 0 && selectedPaper.value?.id) {
    window.cet4Api.saveExamWrongAnswers(selectedPaper.value.id, wrongList)
  }
}

function generatePlan() {
  phase.value = 'plan'
}

function goBack() {
  if (timer.value) clearInterval(timer.value)
  router.push('/exam')
}

// 解析选项
function parseOptions(options: any): Record<string, string> {
  if (!options) return {}
  if (typeof options === 'object' && !Array.isArray(options)) return options
  if (typeof options === 'string') {
    try { return JSON.parse(options) } catch { return {} }
  }
  return {}
}

onMounted(async () => {
  const paperIdParam = route.params.paperId
  const sectionTypeParam = route.params.sectionType as string

  if (sectionTypeParam) {
    // 分模块模式
    const validTypes = ['writing', 'listening', 'reading', 'translation']
    if (!validTypes.includes(sectionTypeParam)) {
      router.push('/exam')
      return
    }
    practiceMode.value = 'section'
    const qs = await window.cet4Api.getExamQuestionsBySection({ sectionType: sectionTypeParam, limit: 50 })
    questions.value = qs
    selectedPaper.value = { title: sectionLabels[sectionTypeParam] + '专项训练' }
    timeLimit.value = (sectionTimeLimits[sectionTypeParam] || 30) * 60
    startTimer()
  } else if (paperIdParam) {
    // 整套模式
    practiceMode.value = 'full'
    const paperId = Number(paperIdParam)
    const paper = await window.cet4Api.getExamPaperById(paperId)
    if (!paper) {
      router.push('/exam')
      return
    }
    selectedPaper.value = paper
    questions.value = await window.cet4Api.getExamQuestions({ paperId })
    startTimer()
  } else {
    // 没有参数，返回 hub
    router.push('/exam')
  }
})

onUnmounted(() => {
  if (timer.value) clearInterval(timer.value)
})
</script>

<template>
  <div class="exam-practice">
    <!-- 做题阶段 -->
    <div v-if="phase === 'practice'" class="practice-phase">
      <!-- 顶部工具栏 -->
      <div class="practice-toolbar">
        <div class="toolbar-left">
          <button class="btn ghost" @click="goBack">退出</button>
          <span class="paper-name">{{ toolbarTitle }}</span>
        </div>
        <div class="toolbar-center">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: progress + '%' }"></div>
          </div>
          <span class="progress-text">{{ answeredCount }}/{{ totalQuestions }}</span>
        </div>
        <div class="toolbar-right">
          <span class="timer" :class="{ warning: timeWarning }">{{ elapsedDisplay }}</span>
        </div>
      </div>

      <!-- 模块切换（仅整套模式显示） -->
      <div v-if="!isSingleSection && sections.length > 1" class="section-tabs">
        <button
          v-for="(sec, idx) in sections"
          :key="sec.type"
          class="tab-btn"
          :class="{ active: currentSectionIndex === idx }"
          @click="goToSection(idx)"
        >
          <span class="tab-icon">{{ sectionIcons[sec.type] || '?' }}</span>
          <span class="tab-label">{{ sec.label }}</span>
          <span class="tab-count">{{ sec.questions.length }}</span>
        </button>
      </div>

      <!-- 题目区域 -->
      <div v-if="currentSection && (currentSection.type === 'listening' ? currentListeningGroup : currentQuestion)" class="question-area">
        <!-- 写作题 -->
        <div v-if="currentSection.type === 'writing'" class="writing-section">
          <div class="q-header">
            <span class="q-label">写作</span>
            <span class="q-hint">请根据题目要求，在下方写出你的作文</span>
          </div>
          <div class="q-text selectable">{{ currentQuestion.question_text }}</div>
          <textarea
            v-model="writingAnswer"
            class="writing-input"
            placeholder="在此输入你的作文..."
            rows="12"
          ></textarea>
          <div class="word-count">字数：{{ writingAnswer.split(/\s+/).filter(w => w).length }}</div>
        </div>

        <!-- 翻译题 -->
        <div v-else-if="currentSection.type === 'translation'" class="translation-section">
          <div class="q-header">
            <span class="q-label">翻译</span>
            <span class="q-hint">请将以下中文翻译成英文</span>
          </div>
          <div class="q-text selectable">{{ currentQuestion.question_text }}</div>
          <textarea
            v-model="translationAnswer"
            class="translation-input"
            placeholder="在此输入你的翻译..."
            rows="8"
          ></textarea>
        </div>

        <!-- 听力题：按对话分组显示 -->
        <div v-else-if="currentSection.type === 'listening' && currentListeningGroup" class="listening-group-section">
          <div class="q-header">
            <span class="q-label">听力</span>
            <span class="q-number">第 {{ currentGroupIndex + 1 }}/{{ totalListeningGroups }} 组对话</span>
          </div>

          <!-- 对话/短文上下文 -->
          <div v-if="currentListeningGroup.passage" class="passage-box selectable">
            {{ currentListeningGroup.passage }}
          </div>

          <!-- 该组所有题目 -->
          <div class="group-questions">
            <div
              v-for="(gq, gqIdx) in currentListeningGroup.questions"
              :key="gq.id"
              class="group-question-item"
            >
              <div class="gq-label">Question {{ gq.question_order || gqIdx + 1 }}</div>
              <div v-if="gq.options_json" class="options">
                <button
                  v-for="(text, key) in parseOptions(gq.options_json)"
                  :key="key"
                  class="option-btn"
                  :class="{
                    selected: answers[gq.id] === key,
                    correct: answers[gq.id] && key === gq.answer,
                    wrong: answers[gq.id] === key && key !== gq.answer
                  }"
                  @click="selectAnswer(gq.id, key as string)"
                >
                  <span class="opt-key">{{ String(key).replace('.', '') }}</span>
                  <span class="opt-text">{{ text }}</span>
                </button>
              </div>
              <div v-if="answers[gq.id] && gq.answer" class="answer-feedback">
                <div v-if="answers[gq.id].toUpperCase() === gq.answer.toUpperCase()" class="feedback correct">
                  回答正确！
                </div>
                <div v-else class="feedback wrong">
                  正确答案：{{ gq.answer }}
                </div>
                <div v-if="gq.explanation" class="explanation">
                  {{ gq.explanation }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 阅读选择题 -->
        <div v-else class="choice-section">
          <div class="q-header">
            <span class="q-label">{{ sectionLabels[currentSection.type] || currentSection.type }}</span>
            <span class="q-number">第 {{ currentQuestionIndex + 1 }}/{{ currentSection.questions.length }} 题</span>
          </div>

          <div v-if="currentQuestion.passage" class="passage-box selectable">
            {{ currentQuestion.passage }}
          </div>

          <div class="q-text selectable">{{ currentQuestion.question_text }}</div>

          <div v-if="currentQuestion.options_json" class="options">
            <button
              v-for="(text, key) in parseOptions(currentQuestion.options_json)"
              :key="key"
              class="option-btn"
              :class="{
                selected: answers[currentQuestion.id] === key,
                correct: answers[currentQuestion.id] && key === currentQuestion.answer,
                wrong: answers[currentQuestion.id] === key && key !== currentQuestion.answer
              }"
              @click="selectAnswer(currentQuestion.id, key as string)"
            >
              <span class="opt-key">{{ String(key).replace('.', '') }}</span>
              <span class="opt-text">{{ text }}</span>
            </button>
          </div>

          <div v-if="answers[currentQuestion.id] && currentQuestion.answer" class="answer-feedback">
            <div v-if="answers[currentQuestion.id].toUpperCase() === currentQuestion.answer.toUpperCase()" class="feedback correct">
              回答正确！
            </div>
            <div v-else class="feedback wrong">
              正确答案：{{ currentQuestion.answer }}
            </div>
            <div v-if="currentQuestion.explanation" class="explanation">
              {{ currentQuestion.explanation }}
            </div>
          </div>
        </div>

        <!-- 导航按钮 -->
        <div class="nav-buttons">
          <!-- 听力：按组导航 -->
          <template v-if="currentSection.type === 'listening'">
            <button class="btn ghost" @click="prevListeningGroup" :disabled="currentGroupIndex === 0">
              上一组
            </button>
            <span class="nav-hint">双击文本可查词</span>
            <button
              v-if="currentGroupIndex === totalListeningGroups - 1 && currentSectionIndex === totalSections - 1"
              class="btn primary"
              @click="calculateScores"
            >
              提交答卷
            </button>
            <button
              v-else-if="currentGroupIndex === totalListeningGroups - 1"
              class="btn primary"
              @click="goToSection(currentSectionIndex + 1)"
            >
              下一模块
            </button>
            <button v-else class="btn primary" @click="nextListeningGroup">
              下一组
            </button>
          </template>
          <!-- 其他题型：按题导航 -->
          <template v-else>
            <button class="btn ghost" @click="prevQuestion" :disabled="currentSectionIndex === 0 && currentQuestionIndex === 0">
              上一题
            </button>
            <span class="nav-hint">双击文本可查词</span>
            <button
              v-if="currentSectionIndex === totalSections - 1 && currentQuestionIndex === (currentSection?.questions.length || 1) - 1"
              class="btn primary"
              @click="calculateScores"
            >
              提交答卷
            </button>
            <button v-else class="btn primary" @click="nextQuestion">
              下一题
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- 评分阶段 -->
    <div v-if="phase === 'result'" class="result-phase">
      <div class="result-card">
        <div class="result-header">
          <h2 class="result-title">考试成绩</h2>
          <div class="total-score">
            <span class="score-number">{{ totalScore }}</span>
            <span class="score-unit">分</span>
          </div>
          <div class="score-subtitle">{{ maxScoreLabel }}</div>
          <div class="elapsed">用时：{{ elapsedDisplay }}</div>
        </div>

        <div class="score-breakdown">
          <div
            v-for="(data, type) in scores"
            :key="type"
            class="breakdown-item"
          >
            <div class="bd-label">{{ sectionLabels[type] || type }}</div>
            <div class="bd-bar">
              <div
                class="bd-fill"
                :style="{ width: (data.total > 0 ? (data.correct / data.total * 100) : 0) + '%' }"
              ></div>
            </div>
            <div class="bd-score">{{ data.score }}/{{ sectionWeights[type]?.maxScore || 177.5 }}</div>
            <div class="bd-detail">{{ data.correct }}/{{ data.total }} 正确</div>
          </div>
        </div>

        <div class="result-actions">
          <button class="btn ghost" @click="phase = 'practice'">查看答题</button>
          <button class="btn ghost" @click="goBack">返回真题中心</button>
          <button class="btn primary" @click="generatePlan">生成复习计划</button>
        </div>
      </div>
    </div>

    <!-- 复习计划阶段 -->
    <div v-if="phase === 'plan'" class="plan-phase">
      <div class="plan-card">
        <div class="plan-header">
          <h2 class="plan-title">个性化复习计划</h2>
          <p class="plan-subtitle">根据你的答题情况生成</p>
        </div>

        <div class="weakness-list">
          <div
            v-for="(data, type) in scores"
            :key="type"
            class="weakness-item"
            :class="{ weak: data.total > 0 && (data.correct / data.total) < 0.6 }"
          >
            <div class="wi-header">
              <span class="wi-label">{{ sectionLabels[type] || type }}</span>
              <span class="wi-rate">{{ data.total > 0 ? Math.round(data.correct / data.total * 100) : 0 }}%</span>
            </div>
            <div v-if="data.total > 0 && (data.correct / data.total) < 0.6" class="wi-suggestion">
              <div class="suggestion-title">薄弱项建议：</div>
              <ul class="suggestion-list">
                <li v-if="type === 'reading'">每天练习 2 篇阅读理解，重点分析长难句</li>
                <li v-if="type === 'reading'">积累阅读高频词汇，提升阅读速度</li>
                <li v-if="type === 'listening'">每天精听 15 分钟，注意连读和弱读</li>
                <li v-if="type === 'listening'">多做听力真题，熟悉题型和出题规律</li>
                <li v-if="type === 'writing'">背诵万能句型和高分模板</li>
                <li v-if="type === 'writing'">每周练习 2 篇作文，注意结构和连贯性</li>
                <li v-if="type === 'translation'">积累常用翻译句型和高频词汇</li>
                <li v-if="type === 'translation'">每天翻译 1 段中文，对照参考答案改进</li>
              </ul>
            </div>
            <div v-else class="wi-good">表现良好，继续保持！</div>
          </div>
        </div>

        <div class="plan-summary">
          <div class="summary-title">总体建议</div>
          <div class="summary-text">
            <p v-if="totalScore >= 500">成绩优秀！建议保持当前学习节奏，重点突破薄弱模块。</p>
            <p v-else-if="totalScore >= 400">成绩中等，建议加强薄弱模块的专项训练。</p>
            <p v-else>需要系统性提升，建议制定每日学习计划，从基础词汇和语法开始。</p>
          </div>
        </div>

        <div class="plan-actions">
          <button class="btn ghost" @click="phase = 'result'">返回成绩</button>
          <button class="btn ghost" @click="goBack">返回真题中心</button>
          <button class="btn primary" @click="router.push('/plan')">查看学习计划</button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.exam-practice {
  max-width: 900px;
  margin: 0 auto;
  position: relative;
}

/* Practice phase */
.practice-phase {
  padding: 0;
}

.practice-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--glass-border);
  margin-bottom: 16px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.paper-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.toolbar-center {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  max-width: 300px;
  margin: 0 20px;
}

.progress-bar {
  flex: 1;
  height: 4px;
  background: var(--bg-secondary);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.3s;
}

.progress-text {
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--text-muted);
  white-space: nowrap;
}

.toolbar-right {
  display: flex;
  align-items: center;
}

.timer {
  font-size: 16px;
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--accent);
}

.timer.warning {
  color: #ef4444;
  animation: timer-pulse 1s ease-in-out infinite;
}

@keyframes timer-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.section-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  padding: 3px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-muted);
  background: transparent;
  transition: all var(--transition-fast);
}

.tab-btn:hover {
  color: var(--text-secondary);
}

.tab-btn.active {
  color: var(--accent);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  font-weight: 600;
}

.tab-icon {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: var(--accent);
}

.tab-count {
  font-family: var(--font-mono);
  font-size: 11px;
  opacity: 0.6;
}

/* Question area */
.question-area {
  background: var(--bg-card);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  padding: 28px;
  box-shadow: var(--shadow-card);
}

.q-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.q-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  background: rgba(217, 119, 6, 0.08);
  padding: 3px 10px;
  border-radius: var(--radius-sm);
}

.q-number {
  font-size: 12px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.q-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.q-text {
  font-size: 15px;
  color: var(--text-primary);
  line-height: 1.7;
  margin-bottom: 18px;
}

.selectable {
  cursor: text;
  user-select: text;
}

/* Passage box */
.passage-box {
  max-height: 250px;
  overflow-y: auto;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-secondary);
  margin-bottom: 18px;
  border: 1px solid var(--glass-border);
}

/* Listening group */
.listening-group-section .passage-box {
  max-height: 300px;
}

.group-questions {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.group-question-item {
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
}

.group-question-item .gq-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  margin-bottom: 10px;
}

.group-question-item .options {
  margin-bottom: 12px;
}

.group-question-item .answer-feedback {
  margin-top: 8px;
}

/* Options */
.options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
}

.option-btn {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 5px 6px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  font-size: 14px;
  color: var(--text-primary);
  transition: background var(--transition-fast), color var(--transition-fast);
  cursor: pointer;
  user-select: text;
}

.option-btn:hover { background: rgba(217, 119, 6, 0.045); }
.option-btn.selected { background: rgba(217, 119, 6, 0.07); }
.option-btn.correct { background: rgba(22, 163, 74, 0.055); color: var(--success); }
.option-btn.wrong { background: rgba(220, 38, 38, 0.045); color: var(--danger); }

.opt-key {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid rgba(44, 36, 32, 0.16);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  background: transparent;
  flex-shrink: 0;
  user-select: none;
  transition: all var(--transition-fast);
}

.option-btn:hover .opt-key { border-color: var(--accent); color: var(--accent); }
.option-btn.selected .opt-key { color: #fff; border-color: var(--accent); background: var(--accent); }
.option-btn.correct .opt-key { color: #fff; border-color: var(--success); background: var(--success); }
.option-btn.wrong .opt-key { color: #fff; border-color: #ef4444; background: #ef4444; }

.opt-text {
  flex: 1;
  line-height: 1.55;
  user-select: text;
}

/* Answer feedback */
.answer-feedback {
  margin-top: 12px;
}

.feedback {
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}

.feedback.correct {
  color: var(--success);
  background: rgba(107, 203, 119, 0.08);
}

.feedback.wrong {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.06);
}

.explanation {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
}

/* Writing / Translation */
.writing-input, .translation-input {
  width: 100%;
  resize: vertical;
  font-family: var(--font-body);
  font-size: 14px;
  line-height: 1.7;
  padding: 14px;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  color: var(--text-primary);
  margin-bottom: 8px;
}

.writing-input:focus, .translation-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-glow);
}

.word-count {
  font-size: 12px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  text-align: right;
}

/* Nav buttons */
.nav-buttons {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--glass-border);
}

.nav-hint {
  font-size: 11px;
  color: var(--text-muted);
  opacity: 0.6;
}

/* Result phase */
.result-phase, .plan-phase {
  padding: 20px 0;
}

.result-card, .plan-card {
  background: var(--bg-card);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  padding: 32px;
  box-shadow: var(--shadow-lg);
}

.result-header {
  text-align: center;
  margin-bottom: 28px;
}

.result-title, .plan-title {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 16px;
}

.total-score {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
  margin-bottom: 4px;
}

.score-number {
  font-size: 56px;
  font-weight: 700;
  color: var(--accent);
  font-family: var(--font-display);
  line-height: 1;
}

.score-unit {
  font-size: 18px;
  color: var(--text-muted);
}

.score-subtitle {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.elapsed {
  font-size: 13px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.score-breakdown {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 28px;
}

.breakdown-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bd-label {
  width: 50px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.bd-bar {
  flex: 1;
  height: 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
  overflow: hidden;
}

.bd-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 4px;
  transition: width 0.5s;
}

.bd-score {
  width: 80px;
  text-align: right;
  font-size: 13px;
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--text-primary);
}

.bd-detail {
  width: 70px;
  text-align: right;
  font-size: 12px;
  color: var(--text-muted);
}

.result-actions, .plan-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

/* Plan phase */
.plan-header {
  text-align: center;
  margin-bottom: 24px;
}

.plan-subtitle {
  font-size: 13px;
  color: var(--text-muted);
}

.weakness-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.weakness-item {
  background: var(--bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: 14px 16px;
}

.weakness-item.weak {
  border-color: rgba(239, 68, 68, 0.2);
}

.wi-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.wi-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.wi-rate {
  font-size: 14px;
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--accent);
}

.wi-good {
  font-size: 13px;
  color: var(--success);
}

.suggestion-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.suggestion-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.8;
}

.plan-summary {
  background: rgba(217, 119, 6, 0.04);
  border: 1px solid rgba(217, 119, 6, 0.1);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 24px;
}

.summary-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.summary-text {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.summary-text p {
  margin: 0;
}

/* Buttons */
.btn {
  padding: 8px 18px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.3px;
  transition: all var(--transition-fast);
}

.btn.primary {
  color: #fff;
  background: var(--gradient-accent);
}

.btn.primary:hover {
  opacity: 0.9;
}

.btn.ghost {
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--glass-border);
}

.btn.ghost:hover {
  background: var(--bg-secondary);
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
