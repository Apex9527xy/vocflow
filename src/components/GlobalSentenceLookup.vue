<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  analyzeSentence,
  isSentenceSelection,
  splitEnglishSentences,
  type DictionaryEntry,
  type SentenceAnalysis
} from '../data/sentenceAnalysis'
import { useLookupViewport } from '../composables/useLookupViewport'
import { cleanPdfEnglishText } from '../lib/pdfTextClean'
import SentenceTreeBranch from './SentenceTreeBranch.vue'
import { playPronunciationSequence, stopWordPronunciation, type PronunciationAccent } from '../composables/useWordPronunciation'
import { LOCAL_SENTENCE_AI_MODELS, PAID_SENTENCE_AI_MODELS, SENTENCE_AI_MODELS, SentenceAiError, cacheSentenceAiTree, getCachedSentenceAiTree, getSentenceAiModelConfig, isLocalSentenceAiProvider, readOllamaInstallPath, readOllamaModelPath, readSentenceAiApiKey, readSentenceAiProvider, requestSentenceTreeWithAi, saveOllamaInstallPath, saveOllamaModelPath, saveSentenceAiApiKey, saveSentenceAiProvider, type SentenceAiProvider } from '../lib/sentenceAi'
import type { SentenceTreeAnalysis } from '../data/sentenceTree'

const route = useRoute()
const card = ref<HTMLElement | null>(null)
const canvas = ref<HTMLElement | null>(null)
const visible = ref(false)
const loading = ref(false)
const analyses = ref<SentenceAnalysis[]>([])
const grammarViewMode = ref<'flat' | 'tree'>('tree')
const analysisCache = new Map<string, SentenceAnalysis>()
const aiProvider = ref<SentenceAiProvider>(readSentenceAiProvider())
const aiApiKey = ref(readSentenceAiApiKey(aiProvider.value))
const aiKeyVisible = ref(false)
const aiLoading = ref(false)
const aiMessage = ref('')
const aiMessageType = ref<'info' | 'success' | 'error'>('info')
const aiLastError = ref('')
const aiModelConfig = computed(() => getSentenceAiModelConfig(aiProvider.value))
const aiIsLocal = computed(() => isLocalSentenceAiProvider(aiProvider.value))
const installedLocalModels = ref<string[]>([])
const ollamaAvailable = ref<boolean | null>(null)
const localModelBusy = ref(false)
const localModelNotice = ref('')
const ollamaInstallProgress = ref(0)
const ollamaInstallPath = ref(readOllamaInstallPath())
const ollamaModelPath = ref(readOllamaModelPath())
let removeOllamaProgressListener: (() => void) | null = null
const selectedLocalInstalled = computed(() => !aiIsLocal.value || installedLocalModels.value.includes(aiProvider.value))
const translations = ref<string[]>([])
const fullTranslation = ref('')
const speakUrl = ref('')
const position = ref({ left: 0, top: 0 })
const anchor = ref({ left: 0, right: 0, top: 0, bottom: 0 })
const playing = ref(false)
const playingAccent = ref<'' | PronunciationAccent>('')
const loadingAccent = ref<'' | PronunciationAccent>('')
const speechNotice = ref('')
const copied = ref(false)
type AutoPronounceAccent = '' | PronunciationAccent
const AUTO_PRONUNCIATION_KEY = 'vocflow.sentence.auto-pronunciation'
const SENTENCE_RATE_KEY = 'vocflow.sentence.playback-rate'
const sentencePlaybackRates = [0.75, 0.9, 1, 1.25, 1.5, 2]

function readAutoPronounceAccent(): AutoPronounceAccent {
  try {
    const saved = window.localStorage.getItem(AUTO_PRONUNCIATION_KEY)
    return saved === 'us' || saved === 'uk' ? saved : ''
  } catch {
    return ''
  }
}

const autoPronounceAccent = ref<AutoPronounceAccent>(readAutoPronounceAccent())

function readSentencePlaybackRate(): number {
  try {
    const saved = Number(window.localStorage.getItem(SENTENCE_RATE_KEY))
    return sentencePlaybackRates.includes(saved) ? saved : 0.9
  } catch {
    return 0.9
  }
}

const sentencePlaybackRate = ref(readSentencePlaybackRate())
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
let selectionTimer: number | null = null
interface PdfCaretPoint {
  node: Text
  offset: number
  layer: HTMLElement
}

let selectionGesture: { x: number; y: number; pointerId: number; pdfStart: PdfCaretPoint | null } | null = null
let outsideCloseSuppressedUntil = 0
let currentAudio: HTMLAudioElement | null = null
let dictionaryPromise: Promise<Map<string, DictionaryEntry>> | null = null

const sourceText = computed(() => analyses.value.map(item => item.text).join(' '))
const sentenceCount = computed(() => analyses.value.length)

function loadDictionary(): Promise<Map<string, DictionaryEntry>> {
  if (dictionaryPromise) return dictionaryPromise
  dictionaryPromise = window.cet4Api.getDictionary()
    .then((rows) => {
      const map = new Map<string, DictionaryEntry>()
      for (const row of rows || []) {
        if (!row?.word) continue
        map.set(String(row.word).toLowerCase(), {
          pos: String(row.pos || ''),
          meaning_cn: String(row.meaning_cn || '')
        })
      }
      return map
    })
    .catch(() => {
      dictionaryPromise = null
      return new Map<string, DictionaryEntry>()
    })
  return dictionaryPromise
}

function analyzeCached(sentence: string, dictionary: Map<string, DictionaryEntry>): SentenceAnalysis {
  const cached = analysisCache.get(sentence)
  if (cached) return cached
  const result = analyzeSentence(sentence, dictionary)
  analysisCache.set(sentence, result)
  return result
}

async function pickOllamaInstallDirectory(): Promise<string | null> {
  const result = await window.cet4Api.pickSentenceAiDirectory({
    title: '选择 Ollama 安装路径',
    defaultPath: ollamaInstallPath.value || undefined
  })
  if (!result.success || result.canceled || !result.path) return null
  ollamaInstallPath.value = result.path
  saveOllamaInstallPath(result.path)
  return result.path
}

async function pickOllamaModelDirectory(): Promise<string | null> {
  const result = await window.cet4Api.pickSentenceAiDirectory({
    title: '选择免费大模型存储路径',
    defaultPath: ollamaModelPath.value || undefined
  })
  if (!result.success || result.canceled || !result.path) return null
  ollamaModelPath.value = result.path
  saveOllamaModelPath(result.path)
  return result.path
}

async function refreshLocalModels(): Promise<void> {
  try {
    const result = await window.cet4Api.listSentenceLocalModels({ modelPath: ollamaModelPath.value || undefined })
    installedLocalModels.value = Array.isArray(result.installed) ? result.installed : []
    ollamaAvailable.value = Boolean(result.ollamaAvailable)
    if (!result.success && result.message) localModelNotice.value = result.message
  } catch (error) {
    ollamaAvailable.value = false
    localModelNotice.value = (error as Error).message || '无法检测本地模型'
  }
}

async function installOllamaForLocalModels(): Promise<boolean> {
  const installPath = await pickOllamaInstallDirectory()
  if (!installPath) {
    localModelNotice.value = '已取消 Ollama 安装路径选择'
    return false
  }
  localModelNotice.value = `正在自动下载并安装 Ollama 到 ${installPath}…`
  ollamaInstallProgress.value = 0
  const result = await window.cet4Api.installSentenceOllama({ installPath })
  if (!result.success) {
    localModelNotice.value = result.message || 'Ollama 自动安装失败'
    return false
  }
  await refreshLocalModels()
  if (!ollamaAvailable.value) {
    localModelNotice.value = 'Ollama 已安装，但服务尚未就绪，请重启软件后重试'
    return false
  }
  localModelNotice.value = 'Ollama 自动安装完成'
  return true
}

async function downloadSelectedLocalModel(): Promise<void> {
  if (!aiIsLocal.value || localModelBusy.value) return
  localModelBusy.value = true
  try {
    if (!ollamaAvailable.value) {
      const installed = await installOllamaForLocalModels()
      if (!installed) return
    }
    const modelPath = await pickOllamaModelDirectory()
    if (!modelPath) {
      localModelNotice.value = '已取消免费大模型存储路径选择'
      return
    }
    localModelNotice.value = `正在下载 ${aiProvider.value} 到 ${modelPath}…`
    const result = await window.cet4Api.downloadSentenceLocalModel({ model: aiProvider.value, modelPath })
    localModelNotice.value = result.message
    if (result.success) await refreshLocalModels()
  } catch (error) {
    localModelNotice.value = (error as Error).message || '本地模型下载失败'
  } finally {
    localModelBusy.value = false
    ollamaInstallProgress.value = 0
  }
}

async function installOllamaAutomatically(): Promise<void> {
  if (localModelBusy.value) return
  localModelBusy.value = true
  try {
    const installed = await installOllamaForLocalModels()
    if (installed) {
      const modelPath = await pickOllamaModelDirectory()
      if (!modelPath) {
        localModelNotice.value = 'Ollama 已安装，已取消模型目录选择'
        return
      }
      localModelNotice.value = `Ollama 已就绪，继续部署 ${aiProvider.value} 到 ${modelPath}…`
      const result = await window.cet4Api.downloadSentenceLocalModel({ model: aiProvider.value, modelPath })
      localModelNotice.value = result.message
      if (result.success) await refreshLocalModels()
    }
  } catch (error) {
    localModelNotice.value = (error as Error).message || 'Ollama 自动安装失败'
  } finally {
    localModelBusy.value = false
    ollamaInstallProgress.value = 0
  }
}


function applyAiTree(index: number, tree: SentenceTreeAnalysis): void {
  const current = analyses.value[index]
  if (!current) return
  const root = tree.tree[0]
  const maxDepth = (node: any): number => 1 + Math.max(0, ...(node.children || []).map(maxDepth))
  analyses.value[index] = {
    ...current,
    tree,
    pattern: root?.pattern || current.pattern,
    complexity: tree.valid
      ? (root?.children?.length ? (maxDepth(root) > 2 ? '多重复合句' : '复合句') : current.complexity)
      : '语法校验待复核'
  }
}

async function runAiAnalyses(sentences: string[], requestToken: number): Promise<void> {
  const provider = aiProvider.value
  const apiKey = aiApiKey.value.trim()
  const local = isLocalSentenceAiProvider(provider)
  if (!sentences.length) return
  if (local) {
    await refreshLocalModels()
    if (!selectedLocalInstalled.value) {
      aiMessageType.value = 'error'
      aiMessage.value = `${provider} 尚未部署，请点击底部下载按钮完成本地部署。`
      return
    }
  } else if (!apiKey) {
    aiMessageType.value = 'error'
    aiMessage.value = 'API密钥未填写；已显示本地句法分析。'
    return
  }
  aiLoading.value = true
  aiLastError.value = ''
  aiMessageType.value = 'info'
  aiMessage.value = `正在调用 ${aiModelConfig.value.label} 优化句法树…`
  let successCount = 0
  let failedCount = 0
  try {
    for (let index = 0; index < sentences.length; index += 1) {
      if (requestToken !== requestId) return
      const sentence = sentences[index]
      const cached = getCachedSentenceAiTree(provider, sentence)
      if (cached) {
        applyAiTree(index, cached)
        successCount += 1
        continue
      }
      try {
        const tree = await requestSentenceTreeWithAi(sentence, provider, apiKey, local ? ollamaModelPath.value : '')
        if (requestToken !== requestId) return
        applyAiTree(index, tree)
        cacheSentenceAiTree(provider, sentence, tree)
        successCount += 1
      } catch (error) {
        failedCount += 1
        aiLastError.value = error instanceof Error ? error.message : '接口请求失败'
        if (error instanceof SentenceAiError && error.code === 'missing_key') {
          aiMessageType.value = 'error'
          aiMessage.value = 'API密钥未填写；已显示本地句法分析。'
          return
        }
      }
    }
    if (successCount) {
      aiMessageType.value = failedCount ? 'info' : 'success'
      aiMessage.value = failedCount
        ? `部分句子接口请求失败；已保留其余本地解析和 ${successCount} 个模型解析结果。`
        : `已使用 ${aiModelConfig.value.label} 更新句法树。`
    } else {
      aiMessageType.value = 'error'
      aiMessage.value = local
        ? `本地模型请求失败${aiLastError.value ? `：${aiLastError.value}` : ''}；已保留本地句法分析。`
        : '接口请求失败；已保留本地句法分析。'
    }
  } finally {
    if (requestToken === requestId) aiLoading.value = false
  }
}

function toggleAiKeyVisibility(): void {
  aiKeyVisible.value = !aiKeyVisible.value
}

function openAiKeyPage(): void {
  void window.cet4Api.openLiteratureUrl(aiModelConfig.value.keyUrl)
}

function treeRoot(item: SentenceAnalysis) {
  return item.tree.tree[0]
}

function chunkText(item: SentenceAnalysis, id: string): string {
  return item.chunks.find(chunk => chunk.id === id)?.text || ''
}

function nestedChunkText(clause: SentenceAnalysis['clauses'][number], id: string): string {
  return clause.chunks.find(chunk => chunk.id === id)?.text || ''
}

function clauseMaxDepth(item: SentenceAnalysis): number {
  return item.clauses.reduce((max, clause) => Math.max(max, clause.depth), 0)
}

function clauseIndent(depth: number): string {
  return String(Math.min(Math.max(depth - 1, 0), 5) * 18) + 'px'
}

watch(aiProvider, provider => {
  saveSentenceAiProvider(provider)
  aiApiKey.value = readSentenceAiApiKey(provider)
  aiKeyVisible.value = false
  aiMessage.value = ''
  aiMessageType.value = 'info'
  localModelNotice.value = ''
  if (isLocalSentenceAiProvider(provider)) void refreshLocalModels()
})

watch(aiApiKey, key => {
  saveSentenceAiApiKey(aiProvider.value, key)
})

function shouldIgnoreTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true
  return Boolean(target.closest(
    'input, textarea, select, option, [contenteditable], [data-no-sentence-lookup], .sentence-lookup-card, .word-lookup-card'
  ))
}

function eventInsideCard(event: Event): boolean {
  if (!card.value) return false
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  return path.includes(card.value) || (event.target instanceof Node && card.value.contains(event.target))
}

function positionCard(): void {
  if (!card.value) return
  const rect = card.value.getBoundingClientRect()
  const margin = 12
  const gap = 10
  let left = anchor.value.left
  let top = anchor.value.bottom + gap
  if (left + rect.width > window.innerWidth - margin) left = window.innerWidth - rect.width - margin
  if (top + rect.height > window.innerHeight - margin) top = anchor.value.top - rect.height - gap
  position.value = {
    left: Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin)),
    top: Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin))
  }
}

function close(): void {
  visible.value = false
  loading.value = false
  analyses.value = []
  translations.value = []
  fullTranslation.value = ''
  speakUrl.value = ''
  playing.value = false
  copied.value = false
  aiLoading.value = false
  aiMessage.value = ''
  aiLastError.value = ''
  requestId += 1
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
  stopSpeaking()
}

async function openSelection(text: string, rect: DOMRect): Promise<void> {
  stopSpeaking()
  speechNotice.value = ''
  resetViewport()
  const id = ++requestId
  anchor.value = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
  analyses.value = []
  translations.value = []
  fullTranslation.value = ''
  speakUrl.value = ''
  loading.value = true
  visible.value = true
  copied.value = false
  position.value = {
    left: Math.max(12, Math.min(rect.left, window.innerWidth - 640)),
    top: Math.max(12, rect.bottom + 10)
  }

  await nextTick()
  positionCard()

  try {
    const dictionary = await loadDictionary()
    const sentences = splitEnglishSentences(cleanPdfEnglishText(text, dictionary))
    if (!sentences.length) {
      close()
      return
    }
    const translation = typeof window.cet4Api.translateSelection === 'function'
      ? await window.cet4Api.translateSelection(sentences).catch(() => null)
      : null
    if (id !== requestId) return
    analyses.value = sentences.map(sentence => analyzeCached(sentence, dictionary))
    translations.value = Array.isArray(translation?.translations) ? translation.translations : []
    fullTranslation.value = translation?.fullTranslation || ''
    speakUrl.value = translation?.speakUrl || ''
  } catch {
    if (id !== requestId) return
    const dictionary = await loadDictionary().catch(() => new Map<string, DictionaryEntry>())
    if (id !== requestId) return
    const sentences = splitEnglishSentences(cleanPdfEnglishText(text, dictionary))
    analyses.value = sentences.map(sentence => analyzeCached(sentence, dictionary))
  } finally {
    if (id === requestId) {
      loading.value = false
      await nextTick()
      positionCard()
      if (analyses.value.length) void runAiAnalyses(analyses.value.map(item => item.text), id)
      if (visible.value && sourceText.value && autoPronounceAccent.value) {
        void speakSentence(autoPronounceAccent.value)
      }
    }
  }
}

function selectedTextFragment(node: Text, range: Range): string {
  const start = node === range.startContainer ? range.startOffset : 0
  const end = node === range.endContainer ? range.endOffset : node.data.length
  return start < end ? node.data.slice(start, end) : ''
}

function fragmentRect(node: Text, text: string): DOMRect | null {
  try {
    const range = document.createRange()
    range.selectNodeContents(node)
    const rect = range.getBoundingClientRect()
    if (rect.width || rect.height) return rect
  } catch {
    // Fall through to the parent span when a text range cannot be measured.
  }
  return node.parentElement?.getBoundingClientRect() || null
}

interface PdfSelectionFragment {
  text: string
  rect: DOMRect
  line: string
  spaceBefore: boolean
}

function pdfSelectionText(range: Range): string {
  const startElement = range.startContainer.nodeType === Node.TEXT_NODE
    ? range.startContainer.parentElement
    : range.startContainer instanceof Element ? range.startContainer : null
  const endElement = range.endContainer.nodeType === Node.TEXT_NODE
    ? range.endContainer.parentElement
    : range.endContainer instanceof Element ? range.endContainer : null
  const startLayer = startElement?.closest<HTMLElement>('.vocflow-pdf-text-layer, .segment-pdf-text-layer') || null
  const endLayer = endElement?.closest<HTMLElement>('.vocflow-pdf-text-layer, .segment-pdf-text-layer') || null
  // A normal selection must begin and end in the same PDF page text layer.
  // An uncontained end would otherwise let the walker expand the selection to
  // the page sentinel or the complete document.
  if (!startLayer || !endLayer || endLayer !== startLayer) return ''
  if (!startElement || !endElement || !startLayer.contains(startElement) || !startLayer.contains(endElement)) return ''
  if (startElement.closest('.endOfContent') || endElement.closest('.endOfContent')) return ''

  const fragments: PdfSelectionFragment[] = []
  const walker = document.createTreeWalker(startLayer, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode() as Text | null
  while (node) {
    if (!node.parentElement?.closest('.endOfContent') && range.intersectsNode(node)) {
      const fragment = selectedTextFragment(node, range)
      const rect = fragment ? fragmentRect(node, fragment) : null
      if (fragment && rect) {
        const span = node.parentElement?.closest<HTMLElement>('span[data-pdf-line]')
        fragments.push({
          text: fragment,
          rect,
          line: span?.dataset.pdfLine || '',
          spaceBefore: span?.dataset.pdfSpaceBefore === '1'
        })
      }
    }
    node = walker.nextNode() as Text | null
  }
  if (!fragments.length) return ''

  const advances: number[] = []
  for (let index = 1; index < fragments.length; index += 1) {
    const previous = fragments[index - 1]
    const current = fragments[index]
    const sameLine = Math.abs(current.rect.top - previous.rect.top) <= Math.max(previous.rect.height, current.rect.height) * 0.4
    const advance = current.rect.left - previous.rect.left
    if (sameLine && advance > 0) advances.push(advance)
  }
  advances.sort((a, b) => a - b)
  const medianAdvance = advances[Math.floor(advances.length / 2)] || 0

  let result = ''
  let previous: PdfSelectionFragment | null = null
  for (const fragment of fragments) {
    const piece = fragment.text
    if (!piece) continue
    if (previous && result) {
      const previousLast = result[result.length - 1]
      const nextFirst = piece[0]
      const lineChanged = Boolean(fragment.line && previous.line && fragment.line !== previous.line)
      const joinsHyphenatedWord = lineChanged && /[A-Za-z]-$/.test(result) && /^[a-z]/.test(piece)
      if (joinsHyphenatedWord) {
        result = result.slice(0, -1)
      } else {
        const advance = fragment.rect.left - previous.rect.left
        const looksLikeWordGap = medianAdvance > 0 && advance > medianAdvance * 1.35
        const geometryGap = !fragment.line && (lineChanged || looksLikeWordGap)
        const punctuationGap = /[.,;:!?]$/.test(result) && /^[A-Za-z0-9]/.test(piece)
        const needsSpace = fragment.spaceBefore || geometryGap || punctuationGap
        const noSpaceBefore = /^[.,;:!?%)]}”’]/.test(nextFirst)
        const noSpaceAfter = /[([{“‘]$/.test(previousLast)
        if (needsSpace && !noSpaceBefore && !noSpaceAfter && !/\s$/.test(result) && !/^\s/.test(piece)) {
          result += ' '
        }
      }
    }
    result += piece
    previous = fragment
  }
  return result.replace(/\s+/g, ' ').trim()
}

function pdfTextLayerForRange(range: Range): HTMLElement | null {
  const element = range.startContainer.nodeType === Node.TEXT_NODE
    ? range.startContainer.parentElement
    : range.startContainer instanceof Element ? range.startContainer : null
  return element?.closest<HTMLElement>('.vocflow-pdf-text-layer, .segment-pdf-text-layer') || null
}

function selectionText(range: Range): string {
  // When a PDF selection is detected, never fall back to selection.toString():
  // PDF.js can expose its full-page endOfContent sentinel and produce the whole page.
  if (pdfTextLayerForRange(range)) return pdfSelectionText(range)
  return window.getSelection()?.toString() || ''
}

function pdfCaretPointAt(x: number, y: number): PdfCaretPoint | null {
  const legacyDocument = document as Document & {
    caretRangeFromPoint?: (clientX: number, clientY: number) => Range | null
  }
  const modernDocument = document as Document & {
    caretPositionFromPoint?: (clientX: number, clientY: number) => { offsetNode: Node; offset: number } | null
  }
  let node: Node | null = null
  let offset = 0
  if (legacyDocument.caretRangeFromPoint) {
    const range = legacyDocument.caretRangeFromPoint(x, y)
    if (range) {
      node = range.startContainer
      offset = range.startOffset
    }
  } else if (modernDocument.caretPositionFromPoint) {
    const point = modernDocument.caretPositionFromPoint(x, y)
    if (point) {
      node = point.offsetNode
      offset = point.offset
    }
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return null
  const text = node as Text
  const layer = text.parentElement?.closest<HTMLElement>('.vocflow-pdf-text-layer, .segment-pdf-text-layer') || null
  if (!layer || text.parentElement?.closest('.endOfContent')) return null
  return { node: text, offset: Math.max(0, Math.min(offset, text.data.length)), layer }
}

function rangeFromPdfGesture(gesture: { pdfStart: PdfCaretPoint | null; x: number; y: number }, endX: number, endY: number): Range | null {
  const start = gesture.pdfStart
  const end = pdfCaretPointAt(endX, endY)
  if (!start || !end || start.layer !== end.layer) return null
  const range = document.createRange()
  const position = start.node.compareDocumentPosition(end.node)
  const reversed = Boolean(position & Node.DOCUMENT_POSITION_PRECEDING)
    || (start.node === end.node && end.offset < start.offset)
  try {
    if (reversed) {
      range.setStart(end.node, end.offset)
      range.setEnd(start.node, start.offset)
    } else {
      range.setStart(start.node, start.offset)
      range.setEnd(end.node, end.offset)
    }
  } catch {
    return null
  }
  return range.collapsed ? null : range
}

function captureSelection(preferredRange?: Range): void {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return
  const nativeRange = selection.getRangeAt(0)
  const range = preferredRange || nativeRange
  const text = selectionText(range).replace(/\s+/g, ' ').trim()
  if (!isSentenceSelection(text)) return

  const layer = pdfTextLayerForRange(range)
  if (layer) {
    const layerText = (layer.textContent || '').replace(/\s+/g, ' ').trim()
    if (layerText.length > 40 && text.length >= layerText.length * 0.45) return
    if (text.length > 1600) return
    const endElement = range.endContainer.nodeType === Node.TEXT_NODE
      ? range.endContainer.parentElement
      : range.endContainer instanceof Element ? range.endContainer : null
    const endLayer = endElement?.closest<HTMLElement>('.vocflow-pdf-text-layer, .segment-pdf-text-layer') || null
    if (!endElement || endLayer !== layer || !layer.contains(endElement)) return
  }

  const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 1 && rect.height > 1)
  const rect = rects.find(item => item.bottom > 0 && item.top < window.innerHeight) || range.getBoundingClientRect()
  if (!rect.width && !rect.height) return
  void openSelection(text, rect)
}

function isReaderManagedPdfTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null
  return Boolean(element?.closest('.vocflow-pdf-text-layer, .segment-pdf-text-layer'))
}

function handleMouseUp(event: MouseEvent): void {
  if (isReaderManagedPdfTarget(event.target)) return
  const gesture = selectionGesture
  selectionGesture = null
  if (shouldIgnoreTarget(event.target)) return
  if (!gesture || (event.clientX === gesture.x && event.clientY === gesture.y)) return
  if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 3) return

  // PDF.js 的选择范围偶尔会扩展到整页。使用按下/松开位置的文本锚点重建范围，
  // 既修复视觉上的过度高亮，也保证送入句子分析的是用户实际划过的文本。
  const precisePdfRange = gesture.pdfStart ? rangeFromPdfGesture(gesture, event.clientX, event.clientY) : null
  if (precisePdfRange) {
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(precisePdfRange)
  }

  if (selectionTimer !== null) window.clearTimeout(selectionTimer)
  selectionTimer = window.setTimeout(() => {
    selectionTimer = null
    captureSelection(precisePdfRange || undefined)
  }, 40)
}

function handlePointerDown(event: PointerEvent): void {
  if (visible.value && !eventInsideCard(event) && performance.now() >= outsideCloseSuppressedUntil) {
    window.getSelection()?.removeAllRanges()
    close()
  }
  if (event.button !== 0 || shouldIgnoreTarget(event.target)) {
    selectionGesture = null
    return
  }
  if (isReaderManagedPdfTarget(event.target)) {
    selectionGesture = null
    return
  }
  const targetElement = event.target instanceof Element ? event.target : null
  const inPdfLayer = Boolean(targetElement?.closest('.vocflow-pdf-text-layer, .segment-pdf-text-layer'))
  selectionGesture = {
    x: event.clientX,
    y: event.clientY,
    pointerId: event.pointerId,
    pdfStart: inPdfLayer ? pdfCaretPointAt(event.clientX, event.clientY) : null
  }
}

function handleExternalSentence(event: Event): void {
  outsideCloseSuppressedUntil = performance.now() + 350
  const detail = (event as CustomEvent<{ text?: string; left?: number; top?: number; right?: number; bottom?: number }>).detail
  const text = String(detail?.text || '').trim()
  if (!isSentenceSelection(text.replace(/\s+/g, ' '))) return
  void openSelection(text, new DOMRect(Number(detail?.left) || 0, Number(detail?.top) || 0, Math.max(1, (Number(detail?.right) || 0) - (Number(detail?.left) || 0)), Math.max(1, (Number(detail?.bottom) || 0) - (Number(detail?.top) || 0))))
}

function handlePointerCancel(): void {
  selectionGesture = null
}

function handleOutsideClick(event: MouseEvent): void {
  if (!visible.value || performance.now() < outsideCloseSuppressedUntil) return
  if (eventInsideCard(event)) return
  close()
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close()
}

function stopSpeaking(): void {
  playing.value = false
  playingAccent.value = ''
  loadingAccent.value = ''
  stopWordPronunciation()
  speechSynthesis?.cancel()
}

function setSentencePlaybackRate(event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value)
  if (!Number.isFinite(value)) return
  sentencePlaybackRate.value = Math.max(0.5, Math.min(2, value))
  try {
    window.localStorage.setItem(SENTENCE_RATE_KEY, String(sentencePlaybackRate.value))
  } catch {
    // Keep the current popup rate even when persistent storage is unavailable.
  }
}

function toggleAutoPronunciation(accent: PronunciationAccent): void {
  autoPronounceAccent.value = autoPronounceAccent.value === accent ? '' : accent
  try {
    window.localStorage.setItem(AUTO_PRONUNCIATION_KEY, autoPronounceAccent.value)
  } catch {
    // The switch still works for the current popup when persistent storage is unavailable.
  }
}

async function speakSentence(accent: PronunciationAccent): Promise<void> {
  if (!sourceText.value) return
  if (playingAccent.value === accent) { stopSpeaking(); return }
  stopSpeaking(); playing.value = true; playingAccent.value = accent; loadingAccent.value = accent; speechNotice.value = ''
  try {
    await playPronunciationSequence(sourceText.value, accent, sentencePlaybackRate.value, () => {
      if (playingAccent.value === accent) loadingAccent.value = ''
    })
  } catch (error) {
    speechNotice.value = (error as Error).message || '发音加载失败，请检查网络'
    window.setTimeout(() => { speechNotice.value = '' }, 2600)
  } finally {
    playing.value = false
    playingAccent.value = ''
    loadingAccent.value = ''
  }
}

async function copyTranslation(): Promise<void> {
  const text = fullTranslation.value || translations.value.join('\n')
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 1500)
  } catch {
    copied.value = false
  }
}

function handleScroll(event: Event): void {
  if (eventInsideCard(event) || performance.now() < outsideCloseSuppressedUntil) return
  close()
}

watch(() => route.fullPath, close)
onMounted(() => {
  removeOllamaProgressListener = window.cet4Api.onSentenceOllamaInstallProgress(progress => {
    ollamaInstallProgress.value = progress.percent
    localModelNotice.value = progress.message
  })
  void refreshLocalModels()
  document.addEventListener('mouseup', handleMouseUp, true)
  window.addEventListener('vocflow:analyze-selection', handleExternalSentence as EventListener)
  document.addEventListener('pointerdown', handlePointerDown, true)
  document.addEventListener('pointercancel', handlePointerCancel, true)
  document.addEventListener('click', handleOutsideClick, true)
  document.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', positionCard)
  window.addEventListener('scroll', handleScroll, true)
})
onUnmounted(() => {
  removeOllamaProgressListener?.()
  removeOllamaProgressListener = null
  if (selectionTimer !== null) window.clearTimeout(selectionTimer)
  document.removeEventListener('mouseup', handleMouseUp, true)
  window.removeEventListener('vocflow:analyze-selection', handleExternalSentence as EventListener)
  document.removeEventListener('pointerdown', handlePointerDown, true)
  document.removeEventListener('pointercancel', handlePointerCancel, true)
  document.removeEventListener('click', handleOutsideClick, true)
  document.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', positionCard)
  window.removeEventListener('scroll', handleScroll, true)
  stopSpeaking()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="sentence-card">
      <aside
        v-if="visible"
        ref="card"
        class="sentence-lookup-card"
        :class="{ panning }"
        :style="{ left: position.left + 'px', top: position.top + 'px' }"
        @click.stop
        @mousedown.stop
        @mouseup.stop
        @pointerdown.stop="handlePanStart"
        @pointermove.stop="handlePanMove"
        @pointerup.stop="handlePanEnd"
        @pointercancel.stop="handlePanEnd"
        @lostpointercapture.stop="handlePanEnd"
        @auxclick.prevent.stop
        @mousedown.middle.prevent
        @dragstart.prevent
      >
        <button class="sentence-close" type="button" title="关闭" @pointerdown.stop @click.stop="close">×</button>

        <div ref="canvas" class="sentence-canvas" :style="transformStyle" @wheel.prevent.stop="handleWheel">
        <header class="sentence-header">
          <div>
            <div class="sentence-kicker">SELECTION TRANSLATOR</div>
            <div class="sentence-title">句子翻译与成分解析</div>
            <div v-if="sentenceCount" class="sentence-count">共 {{ sentenceCount }} 个句子</div>
          </div>
          <div class="sentence-actions">
            <span class="sentence-source">有道翻译</span>
            <div class="sentence-audio-group" :class="{ 'auto-enabled': autoPronounceAccent === 'us' }">
              <button class="sentence-action-btn" type="button" :disabled="loading || !sourceText" :class="{ active: playingAccent === 'us', loading: loadingAccent === 'us' }" @click="speakSentence('us')">🔊 美式</button>
              <button class="sentence-auto-switch" type="button" role="switch" :aria-checked="autoPronounceAccent === 'us'" :title="autoPronounceAccent === 'us' ? '关闭美式自动发音' : '弹窗打开时自动播放美式发音'" @click="toggleAutoPronunciation('us')">
                <span class="sentence-switch-track"><span class="sentence-switch-dot"></span></span><span>自动</span>
              </button>
            </div>
            <div class="sentence-audio-group" :class="{ 'auto-enabled': autoPronounceAccent === 'uk' }">
              <button class="sentence-action-btn" type="button" :disabled="loading || !sourceText" :class="{ active: playingAccent === 'uk', loading: loadingAccent === 'uk' }" @click="speakSentence('uk')">🔊 英式</button>
              <button class="sentence-auto-switch" type="button" role="switch" :aria-checked="autoPronounceAccent === 'uk'" :title="autoPronounceAccent === 'uk' ? '关闭英式自动发音' : '弹窗打开时自动播放英式发音'" @click="toggleAutoPronunciation('uk')">
                <span class="sentence-switch-track"><span class="sentence-switch-dot"></span></span><span>自动</span>
              </button>
            </div>
            <label class="sentence-rate">
              <span>倍速</span>
              <select :value="sentencePlaybackRate" aria-label="句子朗读倍速" @change="setSentencePlaybackRate">
                <option v-for="rate in sentencePlaybackRates" :key="rate" :value="rate">{{ rate }}×</option>
              </select>
            </label>
            <button
              class="sentence-action-btn"
              type="button"
              :disabled="!fullTranslation"
              @click="copyTranslation"
            >
              {{ copied ? '✓ 已复制' : '复制译文' }}
            </button>
          </div>
        </header>

        <div v-if="speechNotice" class="speech-notice">{{ speechNotice }}</div>
        <div v-if="loading" class="sentence-loading">
          <span class="sentence-spinner"></span>
          <span>正在翻译并分析句子结构…</span>
        </div>

        <template v-else>
          <section class="sentence-section translation-panel">
            <div class="sentence-section-title">中文释义</div>
            <div v-if="fullTranslation" class="translation-text">{{ fullTranslation }}</div>
            <div v-else class="translation-unavailable">
              在线翻译暂不可用，但下方仍会显示本地句式分析。
            </div>
          </section>

          <section class="sentence-section grammar-panel">
            <div class="grammar-heading">
              <div class="sentence-section-title">句式与成分</div>
              <div class="grammar-view-switch">
                <button type="button" :class="{ active: grammarViewMode === 'flat' }" @click="grammarViewMode = 'flat'">平铺标注</button>
                <button type="button" :class="{ active: grammarViewMode === 'tree' }" @click="grammarViewMode = 'tree'">树形层级</button>
              </div>
              <div class="role-legend">
                <span class="legend-item subject">主语</span>
                <span class="legend-item predicate">谓语</span>
                <span class="legend-item object">宾语</span>
                <span class="legend-item adverbial">状语</span>
                <span class="legend-item modifier">修饰语</span>
              </div>
            </div>

            <div v-if="aiMessage" class="sentence-ai-status" :class="aiMessageType">
              <span v-if="aiLoading" class="sentence-ai-mini-spinner"></span>
              {{ aiMessage }}
            </div>

            <details
              v-for="(item, index) in analyses"
              :key="`${item.text}-${index}`"
              class="sentence-block"
              :open="index === 0"
            >
              <summary class="sentence-summary">
                <span class="sentence-index">句 {{ index + 1 }}</span>
                <span class="sentence-preview">{{ item.text }}</span>
              </summary>

              <div class="sentence-body">
                <div v-if="translations[index]" class="sentence-translation">
                  {{ translations[index] }}
                </div>

                <div class="sentence-meta">
                  <span>{{ item.sentenceType }}</span>
                  <span>{{ treeRoot(item)?.pattern || item.pattern }}</span>
                  <span>{{ item.complexity }}</span>
                  <span v-if="!item.tree.valid" class="tree-invalid-chip">语法校验需复核</span>
                  <span v-if="item.clauses.length">从句 {{ item.clauses.length }} 个 · 最深 {{ clauseMaxDepth(item) }} 层</span>
                </div>

                <div v-if="grammarViewMode === 'flat'" class="grammar-flat-view">
                <div class="chunk-flow">
                  <div
                    v-for="chunk in item.chunks"
                    :key="chunk.id"
                    class="phrase-chunk"
                    :class="chunk.role"
                  >
                    <span class="phrase-label">{{ chunk.label }}</span>
                    <span class="phrase-text">{{ chunk.text }}</span>
                  </div>
                </div>

                <div v-if="item.dependencies.length" class="dependency-map">
                  <div
                    v-for="(dependency, dependencyIndex) in item.dependencies"
                    :key="`${dependency.fromId}-${dependency.toId}-${dependencyIndex}`"
                    class="dependency-row"
                  >
                    <span class="dependency-source">{{ chunkText(item, dependency.fromId) }}</span>
                    <span class="dependency-track">
                      <span class="dependency-relation">{{ dependency.relation }}</span>
                    </span>
                    <span class="dependency-target">{{ chunkText(item, dependency.toId) }}</span>
                  </div>
                </div>

                <div v-if="item.clauses.length" class="clause-tree-panel">
                  <div class="clause-tree-heading">
                    <span>递归从句结构</span>
                    <small>逐层拆到最内层从句</small>
                  </div>
                  <article
                    v-for="clause in item.clauses"
                    :key="clause.id"
                    class="clause-node"
                    :style="{ marginLeft: clauseIndent(clause.depth) }"
                  >
                    <div class="clause-node-heading">
                      <span class="clause-level">L{{ clause.depth }}</span>
                      <strong>{{ clause.clauseType }}</strong>
                      <span class="clause-marker">引导词 {{ clause.marker }}</span>
                    </div>
                    <div class="clause-path">{{ clause.path }}</div>
                    <div class="clause-relation">{{ clause.relation }}</div>
                    <div class="clause-text">{{ clause.text }}</div>
                    <div v-if="clause.components.length" class="clause-components">
                      <span
                        v-for="(component, componentIndex) in clause.components"
                        :key="`${clause.id}-component-${componentIndex}`"
                        class="clause-component"
                        :class="component.role"
                      >
                        <b>{{ component.label }}</b>{{ component.text }}
                      </span>
                    </div>
                    <div v-if="clause.dependencies.length" class="clause-dependencies">
                      <div
                        v-for="(dependency, dependencyIndex) in clause.dependencies"
                        :key="`${clause.id}-dependency-${dependencyIndex}`"
                        class="clause-dependency"
                      >
                        <span>{{ nestedChunkText(clause, dependency.fromId) }}</span>
                        <em>{{ dependency.relation }}</em>
                        <span>{{ nestedChunkText(clause, dependency.toId) }}</span>
                      </div>
                    </div>
                    <div v-if="clause.notes.length" class="clause-notes">
                      <span v-for="note in clause.notes" :key="note">{{ note }}</span>
                    </div>
                  </article>
                </div>

                </div>

                <div v-else class="sentence-tree-view">
                  <div v-if="treeRoot(item)" class="tree-main-stem">
                    <span>主句主干</span>
                    <strong>{{ treeRoot(item)!.subject.text }}</strong>
                    <b>+</b>
                    <strong>{{ treeRoot(item)!.predicate.text }}</strong>
                    <em>{{ treeRoot(item)!.pattern }}</em>
                  </div>
                  <SentenceTreeBranch v-for="node in item.tree.tree" :key="node.id" :node="node" :depth="0" />
                  <div v-if="!item.tree.valid" class="tree-validation-summary">
                    <strong>句式校验提示</strong>
                    <span v-for="error in item.tree.validationErrors" :key="error">{{ error }}</span>
                  </div>
                </div>

                <div v-if="item.notes.length" class="grammar-notes">
                  <div v-for="note in item.notes" :key="note">• {{ note }}</div>
                </div>
              </div>
            </details>
          </section>

          <footer class="sentence-footer">
            <span>划选英文句子或连续多句即可重新解析</span>
            <span>中键拖动 · Esc 关闭</span>
          </footer>
        </template>
        </div>

        <div class="sentence-ai-settings" @wheel.stop>
          <label class="ai-model-field">
            <span>模型</span>
            <select v-model="aiProvider" aria-label="选择句法分析模型">
              <optgroup label="免费（本地 Ollama）">
                <option v-for="model in LOCAL_SENTENCE_AI_MODELS" :key="model.id" :value="model.id">{{ model.label }}</option>
              </optgroup>
              <optgroup label="付费（在线 API）">
                <option v-for="model in PAID_SENTENCE_AI_MODELS" :key="model.id" :value="model.id">{{ model.label }}</option>
              </optgroup>
            </select>
          </label>

          <div v-if="aiIsLocal" class="local-model-field">
            <span>本地部署</span>
            <div class="local-model-actions">
              <b :class="{ ready: selectedLocalInstalled, missing: !selectedLocalInstalled }">{{ selectedLocalInstalled ? '已部署' : (ollamaAvailable === false ? '需安装 Ollama' : '未部署') }}</b>
              <button type="button" class="local-download-button" :disabled="localModelBusy || selectedLocalInstalled" @click="downloadSelectedLocalModel">{{ localModelBusy ? '下载中…' : (selectedLocalInstalled ? '已下载' : '下载') }}</button>
            </div>
          </div>

          <label v-else class="ai-key-field">
            <span>API Key</span>
            <div class="ai-key-input-wrap">
              <input v-model="aiApiKey" :type="aiKeyVisible ? 'text' : 'password'" autocomplete="off" placeholder="填写 API Key 后自动同步解析" />
              <button type="button" class="ai-eye-button" :title="aiKeyVisible ? '隐藏 API Key' : '显示 API Key'" @click="toggleAiKeyVisibility">{{ aiKeyVisible ? '🙈' : '👁' }}</button>
            </div>
          </label>

          <button v-if="!aiIsLocal" type="button" class="ai-key-page-button" :title="`前往 ${aiModelConfig.label} 获取 API Key`" @click="openAiKeyPage">前往</button>
          <button v-else type="button" class="ai-key-page-button" :disabled="localModelBusy" title="选择 Ollama 安装路径后自动下载、校验、安装并部署所选模型" @click="installOllamaAutomatically">{{ localModelBusy ? '部署中…' : '自动安装' }}</button>

          <div class="ai-provider-note">
            <span>{{ localModelNotice || (aiIsLocal && ollamaModelPath ? `模型目录：${ollamaModelPath}` : aiModelConfig.description) }}</span>
            <i v-if="localModelBusy && ollamaInstallProgress" :style="{ width: ollamaInstallProgress + '%' }"></i>
          </div>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sentence-lookup-card {
  position: fixed;
  display: flex;
  flex-direction: column;
  z-index: 100000;
  width: min(760px, calc(100vw - 24px));
  max-height: min(760px, calc(100vh - 24px));
  overflow: hidden;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid rgba(217, 119, 6, 0.22);
  border-radius: 18px;
  box-shadow: 0 24px 72px rgba(44, 36, 32, 0.24), 0 6px 20px rgba(44, 36, 32, 0.12);
  font-family: var(--font-sans);
}
.sentence-lookup-card.panning { cursor: grabbing; user-select: none; }
.sentence-lookup-card.panning * { cursor: grabbing !important; }
.sentence-canvas {
  width: 100%;
  flex: 1;
  min-height: 0;
  max-height: min(760px, calc(100vh - 24px));
  overflow-y: auto;
  overflow-x: hidden;
  transform-origin: 0 0;
  will-change: transform;
  scrollbar-gutter: stable;
}
.sentence-card-enter-active,
.sentence-card-leave-active { transition: opacity 140ms ease, transform 140ms ease; }
.sentence-card-enter-from,
.sentence-card-leave-to { opacity: 0; transform: translateY(6px) scale(0.99); }

.sentence-close {
  position: absolute;
  z-index: 2;
  top: 12px;
  right: 12px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: var(--text-muted);
  background: transparent;
  font-size: 21px;
  line-height: 1;
}
.sentence-close:hover { color: var(--text-primary); background: rgba(44, 36, 32, 0.06); }

.sentence-header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 46px 10px 16px;
  background: color-mix(in srgb, var(--bg-card) 94%, transparent);
  border-bottom: 1px solid rgba(44, 36, 32, 0.08);
  backdrop-filter: blur(12px);
}
.sentence-kicker {
  color: var(--accent);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.5px;
}
.sentence-title {
  margin-top: 3px;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
}
.sentence-count { margin-top: 3px; color: var(--text-muted); font-size: 10px; }
.sentence-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.sentence-audio-group { display:inline-flex; align-items:center; gap:3px; padding:2px; border-radius:9px; transition:background 160ms ease, box-shadow 160ms ease; }
.sentence-audio-group.auto-enabled { background:rgba(217,119,6,.08); box-shadow:inset 0 0 0 1px rgba(217,119,6,.13); }
.sentence-auto-switch { display:inline-flex; align-items:center; gap:3px; padding:4px; border-radius:6px; color:var(--text-muted); background:transparent; font-size:8px; line-height:1; }
.sentence-auto-switch:hover { color:var(--accent-dim); background:rgba(217,119,6,.08); }
.sentence-switch-track { position:relative; width:20px; height:11px; border-radius:999px; background:rgba(95,75,60,.2); transition:background 160ms ease; }
.sentence-switch-dot { position:absolute; left:2px; top:2px; width:7px; height:7px; border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(44,36,32,.22); transition:transform 160ms ease; }
.sentence-auto-switch[aria-checked="true"] { color:var(--accent); font-weight:700; }
.sentence-auto-switch[aria-checked="true"] .sentence-switch-track { background:var(--accent); }
.sentence-auto-switch[aria-checked="true"] .sentence-switch-dot { transform:translateX(9px); }
.sentence-rate { display:inline-flex; align-items:center; gap:4px; padding:4px 6px; border:1px solid rgba(217,119,6,.18); border-radius:8px; color:var(--text-muted); background:rgba(217,119,6,.045); font-size:9px; white-space:nowrap; }
.sentence-rate select { padding:2px 3px; border:0; outline:none; color:var(--accent-dim); background:transparent; font-family:var(--font-mono); font-size:9px; font-weight:700; cursor:pointer; }
.sentence-source {
  padding: 3px 7px;
  border-radius: 999px;
  color: var(--accent-dim);
  background: rgba(217, 119, 6, 0.08);
  font-size: 9px;
  white-space: nowrap;
}
.sentence-action-btn {
  position: relative;
  padding: 6px 9px;
  border: 1px solid rgba(217, 119, 6, 0.18);
  border-radius: 8px;
  color: var(--accent-dim);
  background: rgba(217, 119, 6, 0.055);
  font-size: 10px;
}
.sentence-action-btn:hover:not(:disabled),
.sentence-action-btn.active { border-color: var(--accent); background: rgba(217, 119, 6, 0.13); }
.sentence-action-btn:disabled { opacity: 0.45; cursor: default; }
.sentence-action-btn.loading { padding-left: 25px; }
.sentence-action-btn.loading::before { content:''; position:absolute; left:8px; top:50%; width:10px; height:10px; margin-top:-5px; border:2px solid rgba(217,119,6,.22); border-top-color:var(--accent); border-radius:50%; animation:sentence-audio-spin .7s linear infinite; }
@keyframes sentence-audio-spin { to { transform:rotate(360deg); } }

.speech-notice { margin:10px 16px 0; padding:6px 9px; border-radius:7px; color:#9a3412; background:#fff7ed; border:1px solid rgba(245,158,11,.2); font-size:10px; }
.sentence-loading {
  min-height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 13px;
}
.sentence-spinner {
  width: 17px;
  height: 17px;
  border: 2px solid rgba(217, 119, 6, 0.18);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: sentence-spin 700ms linear infinite;
}
@keyframes sentence-spin { to { transform: rotate(360deg); } }

.sentence-section { padding: 12px 16px; }
.sentence-section + .sentence-section { border-top: 1px solid rgba(44, 36, 32, 0.08); }
.sentence-section-title {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.1px;
}
.translation-panel { background: linear-gradient(180deg, rgba(217, 119, 6, 0.035), transparent); }
.translation-text {
  margin-top: 7px;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.65;
  white-space: pre-line;
}
.translation-unavailable {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  font-size: 12px;
}

.grammar-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 7px; }
.role-legend { display: flex; flex-wrap: wrap; gap: 5px; }
.legend-item {
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 8px;
  font-weight: 700;
}
.legend-item.subject { color: #1d4ed8; background: rgba(59, 130, 246, 0.11); }
.legend-item.predicate { color: #b45309; background: rgba(245, 158, 11, 0.13); }
.legend-item.object { color: #047857; background: rgba(16, 185, 129, 0.11); }
.legend-item.adverbial { color: #6d28d9; background: rgba(139, 92, 246, 0.1); }
.legend-item.modifier { color: #9f1239; background: rgba(244, 63, 94, 0.09); }

.sentence-block {
  margin-top: 6px;
  overflow: hidden;
  border: 1px solid rgba(44, 36, 32, 0.09);
  border-radius: 11px;
  background: var(--bg-elevated);
}
.sentence-summary {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 9px;
  cursor: pointer;
  list-style: none;
  background: var(--bg-secondary);
}
.sentence-summary::-webkit-details-marker { display: none; }
.sentence-index {
  flex-shrink: 0;
  padding: 2px 5px;
  border-radius: 4px;
  color: var(--accent-dim);
  background: rgba(217, 119, 6, 0.1);
  font-size: 9px;
  font-weight: 700;
}
.sentence-preview { color: var(--text-primary); font-size: 12px; line-height: 1.55; }
.sentence-block[open] .sentence-preview { font-weight: 600; }
.sentence-body { padding: 9px; }
.sentence-translation {
  margin-bottom: 7px;
  padding: 6px 9px;
  border-left: 3px solid rgba(217, 119, 6, 0.42);
  border-radius: 0 7px 7px 0;
  color: var(--text-secondary);
  background: rgba(217, 119, 6, 0.04);
  font-size: 12px;
  line-height: 1.65;
}
.sentence-meta { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 7px; }
.sentence-meta span {
  padding: 2px 6px;
  border-radius: 5px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  font-size: 9px;
}

.token-line {
  padding: 11px;
  border-radius: 9px;
  background: #fffdf9;
  border: 1px solid rgba(44, 36, 32, 0.06);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 2;
}
.chunk-flow {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 4px 3px;
  padding: 8px;
  border: 1px solid rgba(44, 36, 32, 0.06);
  border-radius: 9px;
  background: #fffdf9;
}
.phrase-chunk {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  padding: 2px 5px 4px;
  border-radius: 5px;
  background: rgba(44, 36, 32, 0.025);
}
.phrase-label {
  color: var(--text-muted);
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.25px;
  line-height: 1.2;
}
.phrase-text {
  padding: 1px 2px 3px;
  border-bottom: 2px solid currentColor;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.phrase-chunk.subject { background: rgba(96,165,250,.13); }.phrase-chunk.subject .phrase-text { color: #1d4ed8; }
.phrase-chunk.predicate { background: rgba(251,191,36,.16); }.phrase-chunk.predicate .phrase-text { color: #a34f06; font-weight: 700; }
.phrase-chunk.object { background: rgba(52,211,153,.13); }.phrase-chunk.object .phrase-text { color: #047857; }
.phrase-chunk.complement { background: rgba(192,132,252,.12); }.phrase-chunk.complement .phrase-text { color: #7e22ce; }
.phrase-chunk.adverbial { background: rgba(167,139,250,.13); }.phrase-chunk.adverbial .phrase-text { color: #5b21b6; }
.phrase-chunk.modifier { background: rgba(251,113,133,.1); }.phrase-chunk.modifier .phrase-text { color: #9f1239; }

.dependency-map {
  display: grid;
  gap: 3px;
  margin-top: 7px;
  padding: 7px 8px;
  border-radius: 8px;
  background: var(--bg-secondary);
}
.dependency-row {
  display: grid;
  grid-template-columns: minmax(90px, auto) minmax(80px, 1fr) minmax(90px, auto);
  align-items: center;
  gap: 5px;
  min-height: 23px;
}
.dependency-source,
.dependency-target {
  max-width: 180px;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 9px;
  line-height: 1.35;
  text-decoration: underline;
  text-decoration-color: rgba(44, 36, 32, 0.28);
  text-underline-offset: 2px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dependency-source { color: #6d28d9; }
.dependency-target { color: #0f766e; text-align: right; }
.dependency-track {
  position: relative;
  align-self: end;
  height: 12px;
  margin-bottom: 5px;
  border-bottom: 1px solid rgba(44, 36, 32, 0.28);
}
.dependency-track::after {
  content: '';
  position: absolute;
  right: -1px;
  bottom: -4px;
  width: 7px;
  height: 7px;
  border-top: 1px solid rgba(44, 36, 32, 0.45);
  border-right: 1px solid rgba(44, 36, 32, 0.45);
  transform: rotate(45deg);
}
.dependency-relation {
  position: absolute;
  left: 50%;
  top: -5px;
  transform: translateX(-50%);
  padding: 0 4px;
  color: var(--text-muted);
  background: var(--bg-secondary);
  font-size: 8px;
  line-height: 1.4;
  white-space: nowrap;
}
.sentence-token { display: inline; padding: 1px 2px; border-radius: 3px; }
.sentence-token.subject { color: #1d4ed8; background: rgba(59, 130, 246, 0.1); }
.sentence-token.predicate { color: #b45309; background: rgba(245, 158, 11, 0.14); font-weight: 700; }
.sentence-token.object { color: #047857; background: rgba(16, 185, 129, 0.1); }
.sentence-token.complement { color: #7e22ce; background: rgba(168, 85, 247, 0.09); }
.sentence-token.adverbial { color: #5b21b6; background: rgba(139, 92, 246, 0.09); }
.sentence-token.modifier { color: #9f1239; background: rgba(244, 63, 94, 0.09); }
.sentence-token.other { color: var(--text-secondary); }

.component-list { display: grid; gap: 6px; margin-top: 11px; }
.component-item {
  padding: 8px 10px;
  border: 1px solid rgba(44, 36, 32, 0.07);
  border-radius: 8px;
  background: var(--bg-secondary);
}
.component-item.subject { border-left: 3px solid #60a5fa; }
.component-item.predicate { border-left: 3px solid #f59e0b; }
.component-item.object { border-left: 3px solid #34d399; }
.component-item.complement { border-left: 3px solid #c084fc; }
.component-item.adverbial { border-left: 3px solid #a78bfa; }
.component-item.modifier { border-left: 3px solid #fb7185; }
.component-head { display: flex; align-items: baseline; gap: 8px; }
.component-label { flex-shrink: 0; color: var(--text-muted); font-size: 9px; font-weight: 700; }
.component-head strong { color: var(--text-primary); font-size: 12px; line-height: 1.5; }
.component-note { margin-top: 2px; color: var(--text-muted); font-size: 9px; }

.modifier-panel { margin-top: 12px; padding-top: 10px; border-top: 1px dashed rgba(44, 36, 32, 0.1); }
.modifier-row {
  display: grid;
  grid-template-columns: minmax(70px, auto) 16px minmax(64px, auto) 1fr;
  align-items: center;
  gap: 5px;
  margin-top: 6px;
  padding: 6px 8px;
  border-radius: 7px;
  background: var(--bg-secondary);
  font-size: 10px;
}
.modifier-word { color: #6d28d9; font-weight: 600; }
.modifier-arrow { color: var(--accent); text-align: center; font-weight: 700; }
.modifier-target { color: #0f766e; font-weight: 600; }
.modifier-relation { color: var(--text-secondary); }
.grammar-notes { margin-top: 10px; color: var(--text-muted); font-size: 10px; line-height: 1.6; }

.clause-tree-panel {
  margin-top: 14px;
  padding: 11px;
  border: 1px solid rgba(217, 119, 6, 0.16);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(255, 251, 243, 0.95), rgba(250, 247, 241, 0.72));
}
.clause-tree-heading { display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin-bottom:7px; }
.clause-tree-heading span { color:var(--text-primary); font-size:11px; font-weight:700; letter-spacing:.4px; }
.clause-tree-heading small { color:var(--text-muted); font-size:8px; }
.clause-node {
  position: relative;
  margin-top: 8px;
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid rgba(61, 51, 45, 0.09);
  border-left: 3px solid rgba(217, 119, 6, 0.58);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.74);
  box-shadow: 0 3px 12px rgba(61, 51, 45, 0.045);
}
.clause-node::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 16px;
  width: 7px;
  border-top: 1px solid rgba(217, 119, 6, 0.38);
}
.clause-node-heading { display:flex; align-items:center; flex-wrap:wrap; gap:5px; }
.clause-level { padding:2px 5px; border-radius:5px; color:#fff; background:var(--accent); font-size:8px; font-weight:800; }
.clause-node-heading strong { color:var(--text-primary); font-size:11px; }
.clause-marker { padding:2px 5px; border-radius:5px; color:var(--accent-dim); background:rgba(217,119,6,.09); font-size:8px; }
.clause-path { margin-top:5px; color:var(--text-muted); font-size:8px; line-height:1.45; }
.clause-relation { margin-top:4px; color:#6d28d9; font-size:9px; font-weight:600; }
.clause-text { margin-top:5px; padding:6px 8px; border-radius:7px; color:var(--text-secondary); background:rgba(61,51,45,.035); font-family:var(--font-mono); font-size:10px; line-height:1.55; }
.clause-components { display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; }
.clause-component { display:inline-flex; align-items:center; gap:4px; padding:4px 6px; border-radius:6px; color:var(--text-secondary); background:var(--bg-secondary); font-size:9px; line-height:1.35; }
.clause-component b { color:var(--text-muted); font-size:7px; letter-spacing:.3px; }
.clause-component.subject { color:#1d4ed8; background:rgba(96,165,250,.13); }
.clause-component.predicate { color:#a34f06; background:rgba(251,191,36,.16); }
.clause-component.object { color:#047857; background:rgba(52,211,153,.13); }
.clause-component.complement { color:#7e22ce; background:rgba(192,132,252,.12); }
.clause-component.adverbial { color:#5b21b6; background:rgba(167,139,250,.13); }
.clause-component.modifier { color:#9f1239; background:rgba(251,113,133,.11); }
.clause-dependencies { display:grid; gap:4px; margin-top:7px; }
.clause-dependency { display:grid; grid-template-columns:minmax(70px,auto) minmax(90px,1fr) minmax(70px,auto); align-items:center; gap:5px; padding:4px 6px; border-radius:6px; background:rgba(61,51,45,.035); font-size:8px; }
.clause-dependency span { overflow:hidden; color:var(--text-secondary); text-decoration:underline; text-decoration-color:rgba(44,36,32,.22); text-underline-offset:2px; text-overflow:ellipsis; white-space:nowrap; }
.clause-dependency span:last-child { color:#0f766e; text-align:right; }
.clause-dependency em { color:var(--text-muted); font-style:normal; text-align:center; }
.clause-notes { display:flex; flex-wrap:wrap; gap:4px 8px; margin-top:6px; color:var(--text-muted); font-size:8px; line-height:1.45; }
.clause-notes span::before { content: '• '; }

.grammar-view-switch { display:flex; gap:3px; padding:2px; border:1px solid rgba(217,119,6,.16); border-radius:8px; background:rgba(217,119,6,.045); }
.grammar-view-switch button { padding:4px 7px; border:0; border-radius:5px; color:var(--text-muted); background:transparent; font-size:8px; }
.grammar-view-switch button.active { color:#fff; background:var(--accent); }
.tree-invalid-chip { color:#b91c1c !important; background:rgba(220,38,38,.07) !important; }
.grammar-flat-view { min-width:0; }
.sentence-tree-view { margin-top:9px; padding:10px; border:1px solid rgba(217,119,6,.18); border-radius:12px; background:linear-gradient(180deg,rgba(255,251,243,.96),rgba(248,246,242,.72)); }
.tree-main-stem { display:flex; align-items:baseline; flex-wrap:wrap; gap:6px; padding:8px 10px; border-radius:8px; color:#7c2d12; background:rgba(251,146,60,.11); font-size:10px; }
.tree-main-stem > span { padding:2px 6px; border-radius:5px; color:#fff; background:#c2410c; font-size:8px; font-weight:800; }
.tree-main-stem strong { font-size:12px; }
.tree-main-stem b { color:var(--accent); }
.tree-main-stem em { margin-left:auto; padding:2px 6px; border-radius:5px; color:#1d4ed8; background:rgba(59,130,246,.1); font-family:var(--font-mono); font-size:8px; font-style:normal; font-weight:800; }
.tree-validation-summary { display:flex; flex-direction:column; gap:4px; margin-top:9px; padding:8px; border-radius:7px; color:#991b1b; background:rgba(220,38,38,.055); font-size:8px; line-height:1.5; }
.tree-validation-summary strong { font-size:9px; }
.sentence-ai-status { display:flex; align-items:center; gap:6px; margin:0 0 8px; padding:7px 9px; border-radius:8px; font-size:9px; line-height:1.45; }
.sentence-ai-status.info { color:#1d4ed8; background:rgba(59,130,246,.07); }
.sentence-ai-status.success { color:#047857; background:rgba(16,185,129,.08); }
.sentence-ai-status.error { color:#b91c1c; background:rgba(220,38,38,.06); }
.sentence-ai-mini-spinner { width:11px; height:11px; flex-shrink:0; border:2px solid rgba(59,130,246,.18); border-top-color:#3b82f6; border-radius:50%; animation:sentence-audio-spin .7s linear infinite; }
.sentence-ai-settings { flex-shrink:0; display:grid; grid-template-columns:118px minmax(210px,1fr) auto auto; gap:8px; align-items:end; padding:10px 16px 12px; border-top:1px solid rgba(44,36,32,.11); background:rgba(250,247,242,.98); }
.ai-model-field,.ai-key-field { display:flex; flex-direction:column; gap:3px; min-width:0; }
.ai-model-field > span,.ai-key-field > span { color:var(--text-muted); font-size:7px; font-weight:800; letter-spacing:.5px; text-transform:uppercase; }
.ai-model-field select,.ai-key-input-wrap input { height:29px; border:1px solid var(--glass-border); border-radius:7px; color:var(--text-primary); background:#fff; font-size:9px; outline:none; }
.ai-model-field select { padding:0 6px; }
.ai-key-input-wrap { position:relative; display:flex; }
.ai-key-input-wrap input { width:100%; padding:0 30px 0 8px; }
.ai-key-input-wrap input:focus { border-color:rgba(217,119,6,.45); box-shadow:0 0 0 2px rgba(217,119,6,.08); }
.ai-eye-button { position:absolute; right:2px; top:2px; width:25px; height:25px; padding:0; border:0; border-radius:5px; background:transparent; font-size:11px; cursor:pointer; }
.ai-eye-button:hover { background:rgba(61,51,45,.06); }
.ai-key-page-button { height:29px; padding:0 12px; border:1px solid rgba(217,119,6,.24); border-radius:7px; color:#fff; background:var(--accent); font-size:9px; font-weight:700; cursor:pointer; }
.local-model-field { display:flex; flex-direction:column; gap:3px; min-width:0; }
.local-model-field > span { color:var(--text-muted); font-size:7px; font-weight:800; letter-spacing:.5px; text-transform:uppercase; }
.local-model-actions { height:29px; display:flex; align-items:center; gap:7px; }
.local-model-actions b { flex:1; color:#b45309; font-size:8px; white-space:nowrap; }
.local-model-actions b.ready { color:#047857; }
.local-model-actions b.missing { color:#b91c1c; }
.local-download-button { height:26px; padding:0 10px; border:1px solid rgba(217,119,6,.24); border-radius:6px; color:var(--accent-dim); background:rgba(217,119,6,.07); font-size:8px; font-weight:700; cursor:pointer; }
.local-download-button:disabled { opacity:.55; cursor:default; }
.ai-provider-note { position:relative; align-self:center; min-width:110px; max-width:160px; overflow:hidden; color:var(--text-muted); font-size:7px; line-height:1.35; }
.ai-provider-note i { position:absolute; left:0; bottom:-3px; height:2px; border-radius:2px; background:var(--accent); transition:width .2s ease; }
.sentence-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 20px 14px;
  border-top: 1px solid rgba(44, 36, 32, 0.08);
  color: var(--text-muted);
  font-size: 9px;
}

@media (max-width: 620px) {
  .sentence-header { flex-direction: column; padding-right: 46px; }
  .sentence-actions { justify-content: flex-start; }
  .sentence-ai-settings { grid-template-columns:1fr auto; }
  .ai-key-field { grid-column:1 / -1; }
  .ai-provider-note { display:none; }
  .grammar-heading { align-items: flex-start; flex-direction: column; }
  .clause-tree-heading { align-items:flex-start; flex-direction:column; }
  .clause-dependency { grid-template-columns:1fr; }
  .clause-dependency span:last-child { text-align:left; }
  .modifier-row { grid-template-columns: auto 16px auto; }
  .modifier-relation { grid-column: 1 / -1; }
}
</style>
