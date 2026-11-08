<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { analyzeMorphology, describeOriginFallback, getLemmaCandidates, type Morpheme } from '../data/morphology'
import { LOCAL_SENTENCE_AI_MODELS, PAID_SENTENCE_AI_MODELS, SentenceAiError, getSentenceAiModelConfig, isLocalSentenceAiProvider, readOllamaModelPath, readSentenceAiApiKey, readSentenceAiProvider, saveSentenceAiApiKey, saveSentenceAiProvider, type SentenceAiProvider } from '../lib/sentenceAi'
import { cacheMorphologyAi, getCachedMorphologyAi, requestMorphologyWithAi } from '../lib/morphologyAi'
import { useLookupViewport } from '../composables/useLookupViewport'
import { playWordPronunciation, stopWordPronunciation } from '../composables/useWordPronunciation'

interface LookupResult {
  id?: number
  word: string
  query: string
  phonetic_us?: string
  phonetic_uk?: string
  meaning_cn: string
  pos?: string
  example_sentence?: string
  lemma?: string
  exam_types?: string[]
  etymology?: string
  source: string
}

const route = useRoute()
const card = ref<HTMLElement | null>(null)
const canvas = ref<HTMLElement | null>(null)
const visible = ref(false)
const loading = ref(false)
const result = ref<LookupResult | null>(null)
const activeWord = ref('')
const position = ref({ left: 0, top: 0 })
const added = ref(false)
const etymologyExpanded = ref(false)
const playingAccent = ref<'' | 'us' | 'uk'>('')
const speechNotice = ref('')
type AutoPronounceAccent = '' | 'us' | 'uk'
const AUTO_PRONUNCIATION_KEY = 'vocflow.lookup.auto-pronunciation'

function readAutoPronounceAccent(): AutoPronounceAccent {
  try {
    const saved = window.localStorage.getItem(AUTO_PRONUNCIATION_KEY)
    return saved === 'us' || saved === 'uk' ? saved : ''
  } catch {
    return ''
  }
}

const autoPronounceAccent = ref<AutoPronounceAccent>(readAutoPronounceAccent())
const anchor = ref({ x: 0, y: 0 })
const {
  panning,
  transformStyle,
  reset: resetViewport,
  handleWheel,
  handlePanStart,
  handlePanMove,
  handlePanEnd
} = useLookupViewport(card, canvas)
let requestId = 0
let outsideCloseSuppressedUntil = 0
let currentAudio: HTMLAudioElement | null = null

const localMorphemes = computed(() => analyzeMorphology(activeWord.value))
const aiMorphemes = ref<Morpheme[]>([])
const morphemes = computed(() => aiMorphemes.value.length ? aiMorphemes.value : localMorphemes.value)
const aiProvider = ref<SentenceAiProvider>(readSentenceAiProvider())
const aiApiKey = ref(readSentenceAiApiKey(aiProvider.value))
const aiModelConfig = computed(() => getSentenceAiModelConfig(aiProvider.value))
const aiIsLocal = computed(() => isLocalSentenceAiProvider(aiProvider.value))
const aiLoading = ref(false)
const aiMessage = ref('')
const aiMessageType = ref<'info' | 'success' | 'error'>('info')
const aiSettingsOpen = ref(false)
const aiKeyVisible = ref(false)
const aiNote = ref('')
let morphologyRequestId = 0
const originText = computed(() => result.value?.etymology || describeOriginFallback(activeWord.value))
const hasPronunciation = computed(() => Boolean(result.value?.phonetic_us || result.value?.phonetic_uk))
function cleanWord(value: string): string {
  return value.replace(/^['’-]+|['’-]+$/g, '').trim()
}

function pdfWordAtTarget(target: EventTarget | null, x: number, y: number): string {
  const directTarget = target instanceof Element ? target : document.elementFromPoint(x, y)
  const markedSpan = directTarget?.closest<HTMLElement>('[data-pdf-word]')
  if (markedSpan?.dataset.pdfWord) return cleanWord(markedSpan.dataset.pdfWord)
  return ''
}

function selectedSingleWord(): string {
  const selected = window.getSelection()?.toString().trim() || ''
  return /^[A-Za-z][A-Za-z'’-]*$/.test(selected) ? cleanWord(selected) : ''
}

function extractWordAtPoint(target: EventTarget | null, x: number, y: number): string {
  const pdfWord = pdfWordAtTarget(target, x, y)
  if (pdfWord) return pdfWord
  const selectedWord = selectedSingleWord()
  if (selectedWord) return selectedWord
  let range: Range | null = null
  const legacyDocument = document as Document & {
    caretRangeFromPoint?: (clientX: number, clientY: number) => Range | null
  }
  const modernDocument = document as Document & {
    caretPositionFromPoint?: (clientX: number, clientY: number) => { offsetNode: Node; offset: number } | null
  }

  if (legacyDocument.caretRangeFromPoint) {
    range = legacyDocument.caretRangeFromPoint(x, y)
  } else if (modernDocument.caretPositionFromPoint) {
    const positionAtPoint = modernDocument.caretPositionFromPoint(x, y)
    if (positionAtPoint) {
      range = document.createRange()
      range.setStart(positionAtPoint.offsetNode, positionAtPoint.offset)
      range.collapse(true)
    }
  }

  if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return ''
  const textNode = range.startContainer as Text
  const text = textNode.data
  let offset = Math.min(range.startOffset, text.length - 1)
  const isWordChar = (char: string | undefined) => Boolean(char && /[A-Za-z'’\-]/.test(char))

  if (!isWordChar(text[offset]) && offset > 0 && isWordChar(text[offset - 1])) offset -= 1
  if (!isWordChar(text[offset])) return ''

  let start = offset
  let end = offset + 1
  while (start > 0 && isWordChar(text[start - 1])) start -= 1
  while (end < text.length && isWordChar(text[end])) end += 1
  return cleanWord(text.slice(start, end))
}

function shouldIgnoreTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true
  return Boolean(target.closest(
    'button, a, input, textarea, select, option, label, [contenteditable], [data-word-lookup-ignore], .word-lookup-card, .word-popup, .sentence-lookup-card'
  ))
}

function positionCard(): void {
  if (!card.value) return
  const rect = card.value.getBoundingClientRect()
  const margin = 12
  const gap = 14
  let left = anchor.value.x + gap
  let top = anchor.value.y + 18

  if (left + rect.width > window.innerWidth - margin) left = anchor.value.x - rect.width - gap
  if (top + rect.height > window.innerHeight - margin) top = anchor.value.y - rect.height - gap

  position.value = {
    left: Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin)),
    top: Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin))
  }
}

async function searchLocal(word: string): Promise<LookupResult | null> {
  for (const candidate of getLemmaCandidates(word)) {
    const rows = await window.cet4Api.searchWords(candidate)
    const exact = Array.isArray(rows)
      ? rows.find((row: any) => String(row?.word || '').toLowerCase() === candidate)
      : null
    if (exact) {
      return {
        id: Number(exact.id) || undefined,
        word: exact.word,
        query: word,
        phonetic_us: exact.phonetic_us,
        phonetic_uk: '',
        meaning_cn: exact.meaning_cn,
        pos: exact.pos,
        example_sentence: exact.example_sentence,
        lemma: exact.word.toLowerCase() !== word.toLowerCase() ? exact.word : '',
        exam_types: ['CET4'],
        etymology: '',
        source: '本地词库'
      }
    }
  }
  return null
}

async function lookup(word: string): Promise<LookupResult | null> {
  const local = await searchLocal(word)
  if (local) return local
  if (typeof window.cet4Api.lookupWordOnline === 'function') {
    return await window.cet4Api.lookupWordOnline(word)
  }
  return null
}

async function enrichOrigin(word: string, id: number): Promise<void> {
  if (typeof window.cet4Api.lookupWordOnline !== 'function') return
  try {
    const online = await window.cet4Api.lookupWordOnline(word)
    if (id !== requestId || !result.value || !online?.etymology) return
    result.value = { ...result.value, etymology: online.etymology }
    await nextTick()
    positionCard()
  } catch {
    // The local fallback remains visible when the online etymology is unavailable.
  }
}

function applyCachedMorphologyAi(word: string, runId: number): boolean {
  const cached = getCachedMorphologyAi(aiProvider.value, word)
  if (!cached || runId !== requestId) return false
  aiMorphemes.value = cached.parts
  aiNote.value = cached.note
  aiMessageType.value = 'success'
  aiMessage.value = `已使用 ${aiModelConfig.value.label} 补全词根词缀`
  return true
}

async function enrichMorphologyWithAi(word: string, runId: number, force = false): Promise<void> {
  if (!word || runId !== requestId) return
  const token = ++morphologyRequestId
  const provider = aiProvider.value
  const apiKey = aiApiKey.value.trim()
  aiLoading.value = false
  aiMorphemes.value = []
  aiNote.value = ''

  if (!force && applyCachedMorphologyAi(word, runId)) return
  if (!aiIsLocal.value && !apiKey) {
    aiMessageType.value = 'info'
    aiMessage.value = '未配置 API Key，当前显示内置词根词缀分析'
    return
  }

  aiLoading.value = true
  aiMessageType.value = 'info'
  aiMessage.value = `正在调用 ${aiModelConfig.value.label} 补全词根词缀…`
  try {
    const analysis = await requestMorphologyWithAi(
      word,
      provider,
      apiKey,
      aiIsLocal.value ? readOllamaModelPath() : ''
    )
    if (runId !== requestId || token !== morphologyRequestId) return
    aiMorphemes.value = analysis.parts
    aiNote.value = analysis.note
    cacheMorphologyAi(provider, word, analysis.parts, analysis.note)
    aiMessageType.value = 'success'
    aiMessage.value = `已使用 ${aiModelConfig.value.label} 补全词根词缀`
  } catch (error) {
    if (runId !== requestId || token !== morphologyRequestId) return
    aiMorphemes.value = []
    aiMessageType.value = error instanceof SentenceAiError && error.code === 'missing_key' ? 'info' : 'error'
    aiMessage.value = error instanceof Error ? error.message : '大模型分析失败，已保留内置词根词缀'
  } finally {
    if (runId === requestId && token === morphologyRequestId) aiLoading.value = false
  }
}

function refreshMorphologyWithAi(): void {
  if (!activeWord.value || !visible.value) return
  void enrichMorphologyWithAi(activeWord.value, requestId, true)
}

function toggleAiKeyVisibility(): void {
  aiKeyVisible.value = !aiKeyVisible.value
}

function openAiKeyPage(): void {
  void window.cet4Api.openLiteratureUrl(aiModelConfig.value.keyUrl)
}
async function openLookup(word: string, x: number, y: number): Promise<void> {
  resetViewport()
  const id = ++requestId
  anchor.value = { x, y }
  activeWord.value = word
  result.value = null
  loading.value = true
  visible.value = true
  added.value = false
  etymologyExpanded.value = false
  playingAccent.value = ''
  aiLoading.value = false
  aiMorphemes.value = []
  aiMessage.value = ''
  aiMessageType.value = 'info'
  aiNote.value = ''
  morphologyRequestId += 1
  position.value = {
    left: Math.max(12, Math.min(x + 14, window.innerWidth - 360)),
    top: Math.max(12, y + 18)
  }

  await nextTick()
  positionCard()
  void enrichMorphologyWithAi(word, id)

  try {
    const found = await lookup(word)
    if (id !== requestId) return
    result.value = found
    if (found) {
      void window.cet4Api.recordLookup({
        word: activeWord.value,
        meaningCn: found.meaning_cn,
        phoneticUs: found.phonetic_us,
        source: found.source,
        context: found.example_sentence?.split('\n')[0]
      })
    }
    if (found?.source === '本地词库' && !found.etymology) {
      void enrichOrigin(word, id)
    }
  } catch {
    if (id !== requestId) return
    result.value = null
  } finally {
    if (id === requestId) {
      loading.value = false
      await nextTick()
      positionCard()
      if (result.value && autoPronounceAccent.value) {
        void playPronunciation(autoPronounceAccent.value)
      }
    }
  }
}

function close(): void {
  morphologyRequestId += 1
  aiLoading.value = false
  aiMorphemes.value = []
  stopWordPronunciation()
  playingAccent.value = ''
  visible.value = false
  loading.value = false
  result.value = null
  requestId += 1
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
  speechSynthesis?.cancel()
}

function handleDocumentDoubleClick(event: MouseEvent): void {
  if (event.button !== 0) return
  if (shouldIgnoreTarget(event.target)) return
  const word = extractWordAtPoint(event.target, event.clientX, event.clientY)
  if (!word || (!/[A-Za-z]/.test(word)) || (word.length < 2 && !['a', 'i'].includes(word.toLowerCase()))) return
  void openLookup(word, event.clientX, event.clientY)
}

function handleExternalLookup(event: Event): void {
  outsideCloseSuppressedUntil = performance.now() + 350
  const detail = (event as CustomEvent<{ word?: string; x?: number; y?: number }>).detail
  const word = cleanWord(String(detail?.word || ''))
  if (!word || !/[A-Za-z]/.test(word)) return
  void openLookup(word, Number(detail?.x) || window.innerWidth / 2, Number(detail?.y) || window.innerHeight / 2)
}

function eventInsideLookupCard(event: Event): boolean {
  const selector = '.word-lookup-card, .word-popup, .sentence-lookup-card'
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  if (path.some(node => node instanceof Element && node.matches(selector))) return true
  return event.target instanceof Element && Boolean(event.target.closest(selector))
}

function handleScroll(event: Event): void {
  if (eventInsideLookupCard(event) || performance.now() < outsideCloseSuppressedUntil) return
  close()
}

function handlePointerDown(event: PointerEvent): void {
  if (!visible.value || eventInsideLookupCard(event) || performance.now() < outsideCloseSuppressedUntil) return
  close()
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close()
}

function toggleAutoPronunciation(accent: Exclude<AutoPronounceAccent, ''>): void {
  autoPronounceAccent.value = autoPronounceAccent.value === accent ? '' : accent
  try {
    window.localStorage.setItem(AUTO_PRONUNCIATION_KEY, autoPronounceAccent.value)
  } catch {
    // The switch still works for this popup when persistent storage is unavailable.
  }
}

async function playPronunciation(accent: 'us' | 'uk'): Promise<void> {
  const word = result.value?.word || activeWord.value
  if (!word) return
  speechNotice.value = ''
  playingAccent.value = accent
  try {
    await playWordPronunciation(word, accent)
  } catch (error) {
    speechNotice.value = (error as Error).message || '发音播放失败，请稍后重试'
    window.setTimeout(() => { speechNotice.value = '' }, 2600)
  } finally {
    playingAccent.value = ''
  }
}

async function addToVocabulary(): Promise<void> {
  if (!result.value || added.value) return
  await window.cet4Api.addVocabWord({
    wordId: result.value.id,
    wordText: activeWord.value || result.value.word,
    meaningCn: result.value.meaning_cn,
    phoneticUs: result.value.phonetic_us,
    source: 'dblclick-lookup',
    context: result.value.example_sentence?.split('\n')[0]
  })
  added.value = true
  window.setTimeout(() => { added.value = false }, 2000)
}

watch(aiProvider, provider => {
  saveSentenceAiProvider(provider)
  aiApiKey.value = readSentenceAiApiKey(provider)
  aiKeyVisible.value = false
  aiMessage.value = ''
  aiMessageType.value = 'info'
  if (activeWord.value && visible.value) refreshMorphologyWithAi()
})

watch(aiApiKey, key => {
  saveSentenceAiApiKey(aiProvider.value, key)
})

watch(() => route.fullPath, close)
onMounted(() => {
  document.addEventListener('dblclick', handleDocumentDoubleClick, true)
  document.addEventListener('pointerdown', handlePointerDown, true)
  document.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', positionCard)
  window.addEventListener('scroll', handleScroll, true)
  window.addEventListener('vocflow:lookup-word', handleExternalLookup as EventListener)
})
onUnmounted(() => {
  document.removeEventListener('dblclick', handleDocumentDoubleClick, true)
  document.removeEventListener('pointerdown', handlePointerDown, true)
  document.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', positionCard)
  window.removeEventListener('scroll', handleScroll, true)
  window.removeEventListener('vocflow:lookup-word', handleExternalLookup as EventListener)
  stopWordPronunciation()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="word-card">
      <aside
        v-if="visible"
        ref="card"
        class="word-lookup-card"
        :class="{ panning }"
        :style="{ left: position.left + 'px', top: position.top + 'px' }"
        @click.stop
        @mousedown.stop
        @pointerdown.stop="handlePanStart"
        @pointermove.stop="handlePanMove"
        @pointerup.stop="handlePanEnd"
        @pointercancel.stop="handlePanEnd"
        @lostpointercapture.stop="handlePanEnd"
        @auxclick.prevent.stop
        @mousedown.middle.prevent
        @dragstart.prevent
      >
        <button class="lookup-close" type="button" title="关闭" @pointerdown.stop @click.stop="close">×</button>
        <div ref="canvas" class="lookup-canvas" :style="transformStyle" @wheel.prevent.stop="handleWheel">
          <div v-if="speechNotice" class="speech-notice">{{ speechNotice }}</div>
          <div v-if="loading" class="lookup-loading"><span class="lookup-spinner"></span><span>正在查询 “{{ activeWord }}”…</span></div>
          <template v-else-if="activeWord">
            <header class="lookup-header">
              <div>
                <div class="lookup-word">{{ activeWord }}</div>
                <div v-if="result?.word && result.word.toLowerCase() !== activeWord.toLowerCase()" class="lookup-lemma">原形：{{ result.word }}</div>
                <div v-if="result?.phonetic_us || result?.phonetic_uk" class="lookup-phonetics"><span v-if="result?.phonetic_us">美 {{ result.phonetic_us }}</span><span v-if="result?.phonetic_uk">英 {{ result.phonetic_uk }}</span></div>
              </div>
              <div class="lookup-heading-actions">
                <span class="lookup-source">{{ result?.source || '词根词缀分析' }}</span>
                <div class="lookup-audio-group" :class="{ 'auto-enabled': autoPronounceAccent === 'us' }">
                  <button class="lookup-audio-btn" :class="{ playing: playingAccent === 'us' }" type="button" @click="playPronunciation('us')">🔊 美</button>
                  <button class="pronunciation-auto-switch" type="button" role="switch" :aria-checked="autoPronounceAccent === 'us'" :title="autoPronounceAccent === 'us' ? '关闭美式自动发音' : '弹窗打开时自动播放美式发音'" @click="toggleAutoPronunciation('us')">
                    <span class="switch-track"><span class="switch-dot"></span></span><span>自动</span>
                  </button>
                </div>
                <div class="lookup-audio-group" :class="{ 'auto-enabled': autoPronounceAccent === 'uk' }">
                  <button class="lookup-audio-btn" :class="{ playing: playingAccent === 'uk' }" type="button" @click="playPronunciation('uk')">🔊 英</button>
                  <button class="pronunciation-auto-switch" type="button" role="switch" :aria-checked="autoPronounceAccent === 'uk'" :title="autoPronounceAccent === 'uk' ? '关闭英式自动发音' : '弹窗打开时自动播放英式发音'" @click="toggleAutoPronunciation('uk')">
                    <span class="switch-track"><span class="switch-dot"></span></span><span>自动</span>
                  </button>
                </div>
              </div>
            </header>
            <div v-if="!result" class="lookup-missing-result"><strong>词库暂未找到释义</strong><span>仍可使用词根词缀分析，或点击下方重新查询。</span><button type="button" @click.stop="openLookup(activeWord, anchor.x, anchor.y)">重新查询</button></div>
            <section v-if="result" class="lookup-section meaning-section"><span class="section-kicker">释义</span><p>{{ result.meaning_cn }}</p><small v-if="result.pos">{{ result.pos }}</small></section>
            <section class="lookup-section morphology-section">
              <div class="morphology-heading">
                <div>
                  <span class="section-kicker">词根词缀</span>
                  <small class="morphology-source">{{ aiMorphemes.length ? aiModelConfig.label + ' 补全' : '内置词库' }}</small>
                </div>
                <div class="morphology-actions">
                  <button type="button" :disabled="aiLoading || !activeWord" @click.stop="refreshMorphologyWithAi">{{ aiLoading ? '分析中…' : 'AI 补全' }}</button>
                  <button type="button" :class="{ active: aiSettingsOpen }" title="模型设置" @click.stop="aiSettingsOpen = !aiSettingsOpen">⚙</button>
                </div>
              </div>
              <div v-if="aiSettingsOpen" class="morphology-ai-settings" @pointerdown.stop @click.stop @wheel.stop>
                <label>
                  <span>模型</span>
                  <select v-model="aiProvider" aria-label="选择词根词缀分析模型">
                    <optgroup label="免费（本地 Ollama）">
                      <option v-for="model in LOCAL_SENTENCE_AI_MODELS" :key="model.id" :value="model.id">{{ model.label }}</option>
                    </optgroup>
                    <optgroup label="付费（在线 API）">
                      <option v-for="model in PAID_SENTENCE_AI_MODELS" :key="model.id" :value="model.id">{{ model.label }}</option>
                    </optgroup>
                  </select>
                </label>
                <label v-if="!aiIsLocal">
                  <span>API Key</span>
                  <div class="morphology-key-row">
                    <input v-model="aiApiKey" :type="aiKeyVisible ? 'text' : 'password'" autocomplete="off" placeholder="与划选句式分析共用" @pointerdown.stop />
                    <button type="button" @click.stop="toggleAiKeyVisibility">{{ aiKeyVisible ? '隐藏' : '显示' }}</button>
                    <button type="button" @click.stop="openAiKeyPage">获取</button>
                  </div>
                </label>
                <p v-else>{{ readOllamaModelPath() ? '本地模型由划选句式分析功能共用，模型目录已配置。' : '本地模型与划选句式分析共用；如未部署，请先在划选句子窗口完成下载。' }}</p>
              </div>
              <div v-if="aiMessage" class="morphology-ai-status" :class="aiMessageType"><span v-if="aiLoading" class="morphology-ai-spinner"></span>{{ aiMessage }}</div>
              <div v-if="morphemes.length" class="morpheme-list"><span v-for="(part, index) in morphemes" :key="index" class="morpheme-chip" :class="part.type"><b>{{ part.text }}</b><small>{{ part.meaning }}</small></span></div>
              <p v-else class="morphology-empty">当前未识别到可靠构词拆分，可点击“AI 补全”重试。</p>
              <small v-if="aiNote" class="morphology-ai-note">{{ aiNote }}</small>
            </section>
            <section v-if="result" class="lookup-section etymology-section"><div class="etymology-heading"><span class="section-kicker">词源</span><button type="button" @click.stop="etymologyExpanded = !etymologyExpanded">{{ etymologyExpanded ? '收起' : '展开全部' }}</button></div><p v-if="etymologyExpanded" class="origin-text">{{ originText }}</p></section>
            <section v-if="result?.example_sentence" class="lookup-section"><span class="section-kicker">例句</span><p class="example-text">{{ result.example_sentence }}</p></section>
            <footer class="lookup-footer"><span>中键拖动窗口</span><button v-if="result" type="button" class="vocab-add" :disabled="added" @click="addToVocabulary">{{ added ? '已收藏' : '+ 收藏词汇' }}</button></footer>
          </template>
          <div v-else class="lookup-empty"><strong>没有找到单词</strong><span>请在英文文字上双击重试。</span></div>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.word-lookup-card { position: fixed; z-index: 99999; width: min(430px, calc(100vw - 24px)); max-height: min(720px, calc(100vh - 24px)); overflow: hidden; border-radius: 16px; border: 1px solid rgba(217,119,6,.22); background: rgba(255,252,247,.98); box-shadow: 0 22px 70px rgba(44,36,32,.24); color: var(--text-primary); }.word-lookup-card.panning { cursor: grabbing; }.lookup-canvas { max-height: min(720px, calc(100vh - 24px)); overflow: auto; padding: 14px; transform-origin: 0 0; }.lookup-close { position:absolute; z-index:3; top:9px; right:10px; width:27px; height:27px; border-radius:50%; color:var(--text-muted); background:transparent; font-size:20px; }.lookup-close:hover { background:rgba(44,36,32,.06); }.lookup-header { display:flex; justify-content:space-between; gap:14px; padding:4px 34px 10px 2px; border-bottom:1px solid rgba(61,51,45,.1); }.lookup-word { font-family:var(--font-display); font-size:28px; font-weight:700; }.lookup-lemma { margin-top:2px; color:var(--text-muted); font-size:10px; }.lookup-phonetics { display:flex; gap:12px; margin-top:5px; color:var(--text-muted); font-family:var(--font-mono); font-size:11px; }.lookup-heading-actions { display:flex; flex-wrap:wrap; align-content:flex-start; justify-content:flex-end; gap:5px; }.lookup-source { width:100%; text-align:right; color:var(--accent); font-size:8px; }.lookup-audio-btn { padding:5px 8px; border:1px solid rgba(217,119,6,.18); border-radius:7px; color:var(--accent-dim); background:rgba(217,119,6,.06); font-size:10px; }.lookup-audio-btn.playing { animation:lookup-audio-pulse .7s ease-in-out infinite alternate; background:rgba(217,119,6,.18); }.etymology-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; }.etymology-heading button { padding:3px 7px; border:1px solid rgba(217,119,6,.16); border-radius:6px; color:var(--accent-dim); background:rgba(217,119,6,.06); font-size:9px; font-weight:700; }.lookup-missing-result { display:flex; flex-direction:column; gap:5px; padding:10px 11px; border:1px solid rgba(245,158,11,.16); border-radius:9px; color:var(--text-secondary); background:rgba(245,158,11,.06); }
.lookup-missing-result strong { color:var(--text-primary); font-size:11px; }
.lookup-missing-result span { color:var(--text-muted); font-size:9px; line-height:1.5; }
.lookup-missing-result button { align-self:flex-start; margin-top:2px; padding:4px 7px; border-radius:6px; color:var(--accent-dim); background:rgba(217,119,6,.08); font-size:9px; font-weight:700; }
.lookup-section { padding:11px 2px; border-bottom:1px solid rgba(61,51,45,.08); }.section-kicker { color:var(--text-muted); font-size:9px; font-weight:700; letter-spacing:1px; }.lookup-section p { margin-top:6px; color:var(--text-secondary); font-size:13px; line-height:1.75; white-space:pre-wrap; }.meaning-section p { color:var(--text-primary); font-size:15px; font-weight:600; }.meaning-section small { color:var(--accent); }.morpheme-list { display:flex; flex-wrap:wrap; gap:7px; margin-top:8px; }.morpheme-chip { display:flex; flex-direction:column; gap:2px; padding:6px 8px; border-radius:8px; background:var(--bg-secondary); }.morpheme-chip b { font-size:11px; }.morpheme-chip small { color:var(--text-muted); font-size:9px; }.morpheme-chip.prefix { background:rgba(96,165,250,.12); }.morpheme-chip.root { background:rgba(52,211,153,.12); }.morpheme-chip.suffix { background:rgba(251,191,36,.14); }.origin-text,.example-text { color:var(--text-secondary) !important; }.lookup-footer { display:flex; justify-content:space-between; align-items:center; gap:10px; padding-top:12px; color:var(--text-muted); font-size:9px; }.vocab-add { padding:7px 10px; border-radius:8px; color:#fff; background:var(--accent); font-size:10px; font-weight:700; }.vocab-add:disabled { opacity:.5; }.lookup-loading,.lookup-empty { min-height:160px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:9px; color:var(--text-muted); font-size:11px; text-align:center; }.lookup-empty strong { color:var(--text-primary); font-size:14px; }.lookup-spinner { width:20px; height:20px; border:2px solid rgba(217,119,6,.18); border-top-color:var(--accent); border-radius:50%; animation:lookup-spin .7s linear infinite; }.speech-notice { margin:0 0 8px; padding:6px 9px; border-radius:7px; color:#9a3412; background:#fff7ed; border:1px solid rgba(245,158,11,.2); font-size:9px; }.word-card-enter-active,.word-card-leave-active { transition:opacity .14s ease,transform .14s ease; }.word-card-enter-from,.word-card-leave-to { opacity:0; transform:translateY(5px) scale(.99); }@keyframes lookup-spin{to{transform:rotate(360deg)}}@keyframes lookup-audio-pulse{to{transform:scale(1.06);opacity:.72}}
.lookup-audio-group { display:inline-flex; align-items:center; gap:4px; padding:2px; border-radius:9px; transition:background .16s ease, box-shadow .16s ease; }
.lookup-audio-group.auto-enabled { background:rgba(217,119,6,.08); box-shadow:inset 0 0 0 1px rgba(217,119,6,.12); }
.pronunciation-auto-switch { display:inline-flex; align-items:center; gap:3px; padding:3px 4px; border-radius:6px; color:var(--text-muted); background:transparent; font-size:8px; line-height:1; }
.pronunciation-auto-switch:hover { color:var(--accent-dim); background:rgba(217,119,6,.07); }
.switch-track { position:relative; width:20px; height:11px; border-radius:999px; background:rgba(95,75,60,.2); transition:background .16s ease; }
.switch-dot { position:absolute; left:2px; top:2px; width:7px; height:7px; border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(44,36,32,.22); transition:transform .16s ease; }
.pronunciation-auto-switch[aria-checked="true"] { color:var(--accent); font-weight:700; }
.pronunciation-auto-switch[aria-checked="true"] .switch-track { background:var(--accent); }
.pronunciation-auto-switch[aria-checked="true"] .switch-dot { transform:translateX(9px); }
.morphology-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
.morphology-heading > div:first-child { display:flex; align-items:baseline; gap:7px; }
.morphology-source { color:var(--accent); font-size:8px; }
.morphology-actions { display:flex; gap:4px; }
.morphology-actions button { padding:4px 7px; border:1px solid rgba(217,119,6,.16); border-radius:6px; color:var(--accent-dim); background:rgba(217,119,6,.06); font-size:9px; font-weight:700; }
.morphology-actions button:disabled { opacity:.45; }
.morphology-actions button.active { background:rgba(217,119,6,.15); }
.morphology-ai-settings { display:flex; flex-direction:column; gap:7px; margin-top:9px; padding:9px; border:1px solid rgba(61,51,45,.09); border-radius:9px; background:rgba(255,255,255,.5); }
.morphology-ai-settings label { display:grid; grid-template-columns:52px 1fr; align-items:center; gap:7px; color:var(--text-muted); font-size:9px; }
.morphology-ai-settings select,.morphology-ai-settings input { min-width:0; padding:5px 7px; border:1px solid rgba(61,51,45,.12); border-radius:6px; color:var(--text-primary); background:var(--bg-card); font-size:9px; }
.morphology-key-row { display:flex; gap:4px; min-width:0; }
.morphology-key-row input { flex:1; }
.morphology-key-row button { padding:4px 6px; border-radius:6px; color:var(--accent-dim); background:rgba(217,119,6,.07); font-size:8px; }
.morphology-ai-settings p { margin:0; color:var(--text-muted); font-size:8px; line-height:1.5; }
.morphology-ai-status { display:flex; align-items:center; gap:5px; margin-top:8px; padding:5px 7px; border-radius:6px; color:var(--text-muted); background:rgba(61,51,45,.04); font-size:8px; line-height:1.45; }
.morphology-ai-status.success { color:#047857; background:rgba(52,211,153,.09); }
.morphology-ai-status.error { color:#b45309; background:rgba(245,158,11,.09); }
.morphology-ai-spinner { width:9px; height:9px; flex:none; border:1.5px solid rgba(217,119,6,.18); border-top-color:var(--accent); border-radius:50%; animation:lookup-spin .7s linear infinite; }
.morphology-empty { color:var(--text-muted) !important; font-size:10px !important; }
.morphology-ai-note { display:block; margin-top:7px; color:var(--text-muted); font-size:8px; line-height:1.55; }
</style>
