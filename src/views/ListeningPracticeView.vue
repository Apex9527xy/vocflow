<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AudioPlayer from '../components/exam/AudioPlayer.vue'

const route = useRoute()
const router = useRouter()

const paper = ref<any>(null)
const audioFiles = ref<any[]>([])
const questions = ref<any[]>([])
const selectedAudio = ref<any>(null)
const playerRef = ref<InstanceType<typeof AudioPlayer> | null>(null)

// 模式：listen（精听）或 dictation（听写）
const mode = ref<'listen' | 'dictation'>('listen')

// 听力原文分段
interface Segment {
  text: string
  startTime: number
  endTime: number
  questions: any[]
}

const segments = ref<Segment[]>([])
const currentSegmentIndex = ref(0)
const currentSegment = computed(() => segments.value[currentSegmentIndex.value])

// 听写模式
const dictationInput = ref('')
const dictationResult = ref<'pending' | 'correct' | 'wrong'>('pending')
const showAnswer = ref(false)

// 按 passage 分组构建 segments
function buildSegments() {
  const groups: { passage: string; questions: any[] }[] = []
  let lastPassage = ''
  for (const q of questions.value) {
    const p = q.passage || ''
    if (p !== lastPassage || groups.length === 0) {
      groups.push({ passage: p, questions: [q] })
      lastPassage = p
    } else {
      groups[groups.length - 1].questions.push(q)
    }
  }

  // 估算每段的时间（假设每段均匀分布）
  const totalDuration = 300 // 默认 5 分钟，实际由音频决定
  const segDuration = groups.length > 0 ? totalDuration / groups.length : 30

  segments.value = groups.map((g, i) => ({
    text: g.passage,
    startTime: i * segDuration,
    endTime: (i + 1) * segDuration,
    questions: g.questions
  }))
}

async function loadAudioFiles(paperId: number) {
  audioFiles.value = await window.cet4Api.getExamAudio(paperId)
  if (audioFiles.value.length > 0) {
    selectedAudio.value = audioFiles.value[0]
  }
}

function selectAudio(audio: any) {
  selectedAudio.value = audio
}

function playSegment(seg: Segment) {
  playerRef.value?.seekTo(seg.startTime)
  currentSegmentIndex.value = segments.value.indexOf(seg)
}

function nextSegment() {
  if (currentSegmentIndex.value < segments.value.length - 1) {
    currentSegmentIndex.value++
    const seg = segments.value[currentSegmentIndex.value]
    playerRef.value?.seekTo(seg.startTime)
  }
}

function prevSegment() {
  if (currentSegmentIndex.value > 0) {
    currentSegmentIndex.value--
    const seg = segments.value[currentSegmentIndex.value]
    playerRef.value?.seekTo(seg.startTime)
  }
}

function checkDictation() {
  if (!currentSegment.value) return
  const correct = currentSegment.value.text.toLowerCase().trim()
  const input = dictationInput.value.toLowerCase().trim()
  // 简单匹配：输入包含原文 60% 以上的词即为正确
  const correctWords = correct.split(/\s+/)
  const inputWords = input.split(/\s+/)
  const matchCount = correctWords.filter(w => inputWords.includes(w)).length
  const matchRate = correctWords.length > 0 ? matchCount / correctWords.length : 0
  dictationResult.value = matchRate >= 0.6 ? 'correct' : 'wrong'
  showAnswer.value = true
}

function nextDictation() {
  dictationInput.value = ''
  dictationResult.value = 'pending'
  showAnswer.value = false
  nextSegment()
}

onMounted(async () => {
  const paperId = Number(route.params.paperId)
  if (!paperId) { router.push('/exam'); return }

  paper.value = await window.cet4Api.getExamPaperById(paperId)
  if (!paper.value) { router.push('/exam'); return }

  questions.value = await window.cet4Api.getExamQuestions({ paperId, sectionType: 'listening' })
  await loadAudioFiles(paperId)
  buildSegments()
})
</script>

<template>
  <div class="listening-view">
    <div class="page-header">
      <button class="back-btn" @click="router.push('/exam')">← 返回</button>
      <h1 class="heading-display">精听训练</h1>
      <p class="subtitle">{{ paper?.title || '听力专项' }}</p>
    </div>

    <!-- 无音频提示 -->
    <div v-if="audioFiles.length === 0" class="no-audio">
      <div class="no-audio-icon">🎧</div>
      <div class="no-audio-title">暂无听力音频</div>
      <div class="no-audio-desc">请先在真题中心为该试卷关联听力音频文件</div>
      <button class="btn primary" @click="router.push('/exam')">返回真题中心</button>
    </div>

    <template v-else>
      <!-- 音频选择 -->
      <div v-if="audioFiles.length > 1" class="audio-selector">
        <button
          v-for="af in audioFiles"
          :key="af.id"
          class="audio-chip"
          :class="{ active: selectedAudio?.id === af.id }"
          @click="selectAudio(af)"
        >
          {{ af.file_name || af.section_type }}
        </button>
      </div>

      <!-- 播放器 -->
      <AudioPlayer
        v-if="selectedAudio"
        ref="playerRef"
        :src="`file:///${selectedAudio.file_path}`"
      />

      <!-- 模式切换 -->
      <div class="mode-switch">
        <button class="mode-btn" :class="{ active: mode === 'listen' }" @click="mode = 'listen'">
          精听模式
        </button>
        <button class="mode-btn" :class="{ active: mode === 'dictation' }" @click="mode = 'dictation'">
          听写模式
        </button>
      </div>

      <!-- 逐句列表 -->
      <div class="segments-list">
        <div
          v-for="(seg, i) in segments"
          :key="i"
          class="segment-card"
          :class="{ active: currentSegmentIndex === i }"
          @click="playSegment(seg)"
        >
          <div class="seg-header">
            <span class="seg-num">{{ i + 1 }}</span>
            <span class="seg-play">▶</span>
          </div>
          <div v-if="mode === 'listen'" class="seg-text">{{ seg.text || '(无原文)' }}</div>
          <div v-else class="seg-dictation">
            <div v-if="currentSegmentIndex === i && !showAnswer" class="dictation-area">
              <textarea
                v-model="dictationInput"
                class="dictation-input"
                placeholder="请听写你听到的内容..."
                rows="3"
              ></textarea>
              <button class="btn primary small" @click="checkDictation">核对</button>
            </div>
            <div v-else-if="currentSegmentIndex === i && showAnswer" class="dictation-result">
              <div class="result-tag" :class="dictationResult">
                {{ dictationResult === 'correct' ? '✓ 基本正确' : '✗ 需要加强' }}
              </div>
              <div class="answer-text">{{ seg.text }}</div>
              <button class="btn ghost small" @click="nextDictation">下一句</button>
            </div>
            <div v-else class="seg-placeholder">点击开始听写</div>
          </div>
          <div class="seg-questions" v-if="seg.questions.length > 0">
            <span class="seg-q-count">{{ seg.questions.length }} 题</span>
          </div>
        </div>
      </div>

      <!-- 分段导航 -->
      <div class="seg-nav">
        <button class="btn ghost" @click="prevSegment" :disabled="currentSegmentIndex === 0">上一段</button>
        <span class="seg-progress">{{ currentSegmentIndex + 1 }} / {{ segments.length }}</span>
        <button class="btn ghost" @click="nextSegment" :disabled="currentSegmentIndex >= segments.length - 1">下一段</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.listening-view { max-width: 800px; margin: 0 auto; }

.page-header { margin-bottom: 20px; }
.back-btn {
  font-size: 12px; color: var(--text-muted); margin-bottom: 8px;
  padding: 4px 8px; border-radius: var(--radius-sm);
}
.back-btn:hover { color: var(--accent); background: rgba(217, 119, 6, 0.06); }
.page-header h1 { font-size: 26px; font-weight: 400; color: var(--text-primary); margin-bottom: 2px; }
.subtitle { font-size: 13px; color: var(--text-muted); }

.no-audio { text-align: center; padding: 60px 20px; }
.no-audio-icon { font-size: 48px; opacity: 0.2; margin-bottom: 12px; }
.no-audio-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
.no-audio-desc { font-size: 13px; color: var(--text-muted); margin-bottom: 20px; }

.audio-selector { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.audio-chip {
  padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600;
  color: var(--text-muted); background: var(--bg-card); border: 1px solid var(--glass-border);
}
.audio-chip.active { color: var(--accent); border-color: var(--accent); background: rgba(217, 119, 6, 0.06); }

.mode-switch {
  display: flex; gap: 4px; margin: 16px 0;
  background: var(--bg-secondary); border-radius: var(--radius-sm); padding: 3px;
}
.mode-btn {
  flex: 1; padding: 8px; border-radius: 6px; font-size: 13px; font-weight: 600;
  color: var(--text-muted); background: transparent; transition: all var(--transition-fast);
}
.mode-btn.active { color: var(--accent); background: var(--bg-card); box-shadow: var(--shadow-card); }

.segments-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }

.segment-card {
  background: var(--bg-card); border: 1px solid var(--glass-border);
  border-radius: var(--radius-md); padding: 14px 16px;
  cursor: pointer; transition: all var(--transition-fast);
}
.segment-card:hover { background: var(--bg-card-hover); }
.segment-card.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }

.seg-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.seg-num {
  width: 22px; height: 22px; border-radius: 4px; font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-secondary); color: var(--text-muted); font-family: var(--font-mono);
}
.segment-card.active .seg-num { background: var(--accent); color: #fff; }
.seg-play { font-size: 11px; color: var(--accent); }

.seg-text { font-size: 14px; color: var(--text-secondary); line-height: 1.7; }
.seg-placeholder { font-size: 13px; color: var(--text-muted); font-style: italic; }
.seg-questions { margin-top: 8px; }
.seg-q-count { font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); }

.dictation-area { display: flex; flex-direction: column; gap: 8px; }
.dictation-input {
  width: 100%; resize: vertical; font-family: var(--font-body); font-size: 14px;
  line-height: 1.6; padding: 10px; border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm); background: var(--bg-secondary); color: var(--text-primary);
}
.dictation-input:focus { outline: none; border-color: var(--accent); }

.dictation-result { display: flex; flex-direction: column; gap: 8px; }
.result-tag {
  font-size: 13px; font-weight: 600; padding: 6px 10px; border-radius: var(--radius-sm);
}
.result-tag.correct { color: var(--success); background: rgba(107, 203, 119, 0.08); }
.result-tag.wrong { color: #ef4444; background: rgba(239, 68, 68, 0.06); }
.answer-text { font-size: 14px; color: var(--text-secondary); line-height: 1.7; padding: 10px; background: var(--bg-secondary); border-radius: var(--radius-sm); }

.seg-nav {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 12px; border-top: 1px solid var(--glass-border);
}
.seg-progress { font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); }

.btn { padding: 8px 18px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 600; transition: all var(--transition-fast); }
.btn.primary { color: #fff; background: var(--gradient-accent); }
.btn.primary:hover { opacity: 0.9; }
.btn.ghost { color: var(--text-secondary); background: transparent; border: 1px solid var(--glass-border); }
.btn.ghost:hover { background: var(--bg-secondary); }
.btn.small { padding: 6px 14px; font-size: 12px; }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
