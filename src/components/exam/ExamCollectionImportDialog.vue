<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toIpcPayload } from '../../lib/ipc-payload'
import { examMonthOptions, examPaperTypeImportOptions, examSeasonLabel } from '../../lib/examMetadata'

const props = withDefaults(defineProps<{ open: boolean; maxPdfFiles?: number }>(), { maxPdfFiles: 10 })
const emit = defineEmits<{ (event: 'close'): void; (event: 'imported'): void }>()

interface AudioImportRow {
  filePath: string
  fileName: string
  selected: boolean
  saved: boolean
  error: string
  matchHint: string
  metadata: {
    examType: ExamPaperTypeKey
    year: number | null
    session: ExamSeasonKey
    audioSlot: 'A' | 'B' | null
  }
}

interface ImportRow {
  analysis: CollectionPdfAnalysisResult
  selected: boolean
  duplicateCollectionId: number | null
  pendingBinding: boolean
  error: string
  saved: boolean
  matchHint: string
  metadata: {
    examType: ExamPaperTypeKey
    year: number | null
    session: ExamSeasonKey
    setNo: number | null
    audioSlot: 'A' | 'B' | null
  }
  segments: SemanticCollectionSegment[]
  expanded: boolean
}

const rows = ref<ImportRow[]>([])
const audioRows = ref<AudioImportRow[]>([])
const scanning = ref(false)
const importing = ref(false)
const scanProgress = ref(0)
const scanMessage = ref('')
const summary = ref('')
const errorMessage = ref('')

const categories = examPaperTypeImportOptions
const years = Array.from({ length: 31 }, (_, index) => 2030 - index)
const roleOptions: Array<{ value: CollectionContentType; label: string }> = [
  { value: 'paper', label: '真题题干' },
  { value: 'analysis', label: '解析' }
]
const audioExtensions = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'])
const saveableRows = computed(() => rows.value.filter(row => row.selected && !row.duplicateCollectionId && !row.saved))
const saveableAudioRows = computed(() => audioRows.value.filter(row => row.selected && !row.saved))
const pdfLimit = computed(() => Math.max(1, Math.round(Number(props.maxPdfFiles) || 10)))

function pdfCount(filePaths: string[]): number {
  return filePaths.filter(filePath => filePath.toLowerCase().endsWith('.pdf')).length
}

function validatePdfLimit(filePaths: string[]): boolean {
  const count = pdfCount(filePaths)
  if (count <= pdfLimit.value) return true
  errorMessage.value = `当前板块一次最多导入 ${pdfLimit.value} 个 PDF，本次选择了 ${count} 个。请减少文件后重试。`
  scanMessage.value = '未开始识别：PDF 数量超过当前板块限制'
  scanProgress.value = 0
  return false
}

function confidencePercent(value: number): number { return Math.round(value * 100) }
function categoryLabel(value: ExamPaperTypeKey): string { return categories.find(item => item.value === value)?.label || '未识别' }

function fileNameOf(filePath: string): string { return filePath.split(/[/\\]/).pop() || filePath }

function setNoFromFileName(fileName: string): number | null {
  const text = fileName.normalize('NFKC')
  const direct = text.match(/(?:第\s*([1-6])\s*套|卷\s*([1-6])|set\s*([1-6]))/i)
  if (direct) return Number(direct[1] || direct[2] || direct[3])
  const contextual = text.match(/(?:解析|答案|详解|分析|听力(?:音频)?|真题|试题|试卷)[^0-9]{0,10}([1-6])\s*(?:套|卷|$)/i)
  return contextual ? Number(contextual[1]) : null
}

function metadataKey(row: ImportRow | AudioImportRow): string {
  return `${row.metadata.examType}:${row.metadata.year ?? 'unknown'}:${row.metadata.session}`
}

function naturalCompare(left: ImportRow | AudioImportRow, right: ImportRow | AudioImportRow): number {
  return fileNameOf('filePath' in left ? left.filePath : left.analysis.filePath).localeCompare(
    fileNameOf('filePath' in right ? right.filePath : right.analysis.filePath),
    'zh-CN',
    { numeric: true }
  )
}

function applyBatchMatching(): void {
  const groups = new Map<string, ImportRow[]>()
  for (const row of rows.value) {
    const key = metadataKey(row)
    const group = groups.get(key) || []
    group.push(row)
    groups.set(key, group)
  }
  for (const group of groups.values()) {
    const paperRows = group.filter(row => row.segments.some(segment => segment.contentType === 'paper') && !row.segments.some(segment => segment.contentType === 'analysis')).sort(naturalCompare)
    const analysisRows = group.filter(row => row.segments.some(segment => segment.contentType === 'analysis') && !row.segments.some(segment => segment.contentType === 'paper')).sort(naturalCompare)
    const orderedPapers = [...paperRows].sort((left, right) => (left.metadata.setNo || 99) - (right.metadata.setNo || 99))
    if (orderedPapers.length > 0 && orderedPapers.length <= 3) {
      orderedPapers.forEach((row, index) => {
        if (!row.metadata.setNo) row.metadata.setNo = index + 1
      })
    }
    for (const row of orderedPapers) row.matchHint = row.metadata.setNo ? `卷 ${row.metadata.setNo} 题干` : '卷号待识别'
    for (let index = 0; index < analysisRows.length; index++) {
      const row = analysisRows[index]
      const fileSetNo = setNoFromFileName(row.analysis.fileName)
      if (!row.metadata.setNo && fileSetNo) row.metadata.setNo = fileSetNo
      if (!row.metadata.setNo && orderedPapers.length === analysisRows.length) row.metadata.setNo = orderedPapers[index]?.metadata.setNo || index + 1
      row.matchHint = row.metadata.setNo ? `卷 ${row.metadata.setNo} 解析` : '解析待绑定'
    }
  }
  const audioGroups = new Map<string, AudioImportRow[]>()
  for (const row of audioRows.value) {
    const key = metadataKey(row)
    const group = audioGroups.get(key) || []
    group.push(row)
    audioGroups.set(key, group)
  }
  for (const group of audioGroups.values()) {
    group.forEach((row, index) => {
      if (!row.metadata.audioSlot && index < 2) row.metadata.audioSlot = index === 0 ? 'A' : 'B'
      row.matchHint = row.metadata.audioSlot ? `听力 ${row.metadata.audioSlot}` : '自动 A/B'
    })
  }
}

function setYear(row: ImportRow | AudioImportRow, event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value)
  row.metadata.year = value === 0 ? null : value
}

function setSegmentRole(row: ImportRow, segment: SemanticCollectionSegment, event: Event): void {
  segment.contentType = (event.target as HTMLSelectElement).value as CollectionContentType
  segment.confidence = 1
  segment.status = 'confirmed'
}

async function openPicker(): Promise<void> {
  const picked = await window.cet4Api.pickCollectionPdfs()
  if (!picked.success || picked.canceled || !picked.filePaths.length) return
  if (!validatePdfLimit(picked.filePaths)) return
  await analyzeFiles(picked.filePaths)
}

async function openFolderPicker(): Promise<void> {
  const picked = await window.cet4Api.pickCollectionPdfFolder()
  if (!picked.success || picked.canceled) return
  if (!picked.filePaths.length) {
    errorMessage.value = picked.message || '该文件夹及其子文件夹中没有 PDF 或听力音频文件'
    return
  }
  if (!validatePdfLimit(picked.filePaths)) return
  await analyzeFiles(picked.filePaths)
}

async function analyzeFiles(filePaths: string[]): Promise<void> {
  if (!validatePdfLimit(filePaths)) return
  scanning.value = true
  errorMessage.value = ''
  summary.value = ''
  scanProgress.value = 0
  rows.value = []
  audioRows.value = []
  try {
    for (let index = 0; index < filePaths.length; index++) {
      const filePath = filePaths[index]
      const fileName = filePath.split(/[/\\]/).pop() || filePath
      const extension = fileName.split('.').pop()?.toLowerCase() || ''
      scanMessage.value = `正在识别资源 ${index + 1}/${filePaths.length}：${fileName}`
      scanProgress.value = Math.round((index / filePaths.length) * 100)
      if (audioExtensions.has(extension)) {
        const result = await window.cet4Api.analyzeCollectionAudio(filePath)
        if (!result.success || !result.audio) {
          audioRows.value.push({ filePath, fileName, selected: false, saved: false, error: result.message || '音频识别失败', matchHint: '待识别', metadata: { examType: 'unknown', year: null, session: 'unknown', audioSlot: null } })
          continue
        }
        audioRows.value.push({
          filePath,
          fileName,
          selected: true,
          saved: false,
          error: '',
          matchHint: result.audio.audioSlot ? `听力 ${result.audio.audioSlot}` : '自动 A/B',
          metadata: { examType: result.audio.examType, year: result.audio.year, session: result.audio.session, audioSlot: result.audio.audioSlot }
        })
        continue
      }
      const result = await window.cet4Api.analyzeCollectionPdf(filePath)
      if (!result.success || !result.analysis) {
        rows.value.push({
          analysis: { filePath, fileName, title: '', fileHash: '', fileSize: 0, pageCount: 0, metadata: { examType: 'unknown', year: null, session: 'unknown', setNo: null, audioSlot: null, confidence: 0, examTypeConfidence: 0, yearConfidence: 0, sessionConfidence: 0, sources: [] }, segments: [], requiresReview: true, warnings: [] },
          selected: false, duplicateCollectionId: null, pendingBinding: false, error: result.message || '分析失败', saved: false, matchHint: '识别失败',
          metadata: { examType: 'unknown', year: null, session: 'unknown', setNo: null, audioSlot: null }, segments: [], expanded: false
        })
        continue
      }
      const analysis = result.analysis
      rows.value.push({
        analysis,
        selected: !result.duplicateCollectionId,
        duplicateCollectionId: result.duplicateCollectionId || null,
        pendingBinding: false,
        error: '',
        saved: false,
        matchHint: analysis.metadata.setNo ? `卷 ${analysis.metadata.setNo}` : '待匹配',
        metadata: { examType: analysis.metadata.examType, year: analysis.metadata.year, session: analysis.metadata.session, setNo: analysis.metadata.setNo, audioSlot: analysis.metadata.audioSlot },
        segments: analysis.segments.map(segment => ({
          ...segment,
          confidence: segment.status === 'pending_review' ? Math.max(segment.confidence, 0.8) : segment.confidence,
          status: segment.status === 'pending_review' ? 'auto_confirmed' : segment.status,
          rangeInfo: JSON.parse(JSON.stringify(segment.rangeInfo))
        })),
        expanded: false
      })
    }
    applyBatchMatching()
    scanProgress.value = 100
    scanMessage.value = `识别完成：${rows.value.length} 个 PDF，${audioRows.value.length} 个听力音频`
    const unmatched = [...rows.value, ...audioRows.value].filter(row => row.matchHint.includes('待')).length
    if (unmatched) scanMessage.value += `；${unmatched} 个资源需核对绑定`
  } catch (error) {
    errorMessage.value = (error as Error).message || '资源识别失败'
  } finally {
    scanning.value = false
  }
}

async function importRows(): Promise<void> {
  const selected = [...saveableRows.value].sort((left, right) => {
    const leftHasPaper = left.segments.some(segment => segment.contentType === 'paper') ? 1 : 0
    const rightHasPaper = right.segments.some(segment => segment.contentType === 'paper') ? 1 : 0
    return rightHasPaper - leftHasPaper
  })
  const selectedAudio = [...saveableAudioRows.value]
  if (!selected.length && !selectedAudio.length) return
  importing.value = true
  errorMessage.value = ''
  scanProgress.value = 0
  let imported = 0
  let importedAudio = 0
  let skipped = 0
  let pending = 0
  let failed = 0
  const total = selected.length + selectedAudio.length
  try {
    for (let index = 0; index < selected.length; index++) {
      const row = selected[index]
      scanMessage.value = `正在保存 PDF ${index + 1}/${selected.length}：${row.analysis.fileName}`
      scanProgress.value = Math.max(4, Math.round((index / total) * 100))
      const result = await window.cet4Api.saveCollectionPdfImport(toIpcPayload({
        filePath: row.analysis.filePath,
        title: row.analysis.title,
        metadata: row.metadata,
        segments: row.segments
      }))
      if (result.success) { row.saved = true; imported++ }
      else if (result.pendingBinding) { pending++; row.saved = true; row.pendingBinding = true; row.error = result.message }
      else if (result.duplicate) { skipped++; row.duplicateCollectionId = result.collectionId || -1; row.error = result.message }
      else { failed++; row.error = result.message }
      scanProgress.value = Math.round(((index + 1) / total) * 100)
    }
    for (let index = 0; index < selectedAudio.length; index++) {
      const row = selectedAudio[index]
      scanMessage.value = `正在绑定听力 ${index + 1}/${selectedAudio.length}：${row.fileName}`
      const result = await window.cet4Api.saveCollectionAudioImport(toIpcPayload({ filePath: row.filePath, metadata: row.metadata }))
      if (result.success) { row.saved = true; importedAudio++ }
      else if (result.duplicate) { skipped++; row.error = result.message }
      else { failed++; row.error = result.message }
      scanProgress.value = Math.round(((selected.length + index + 1) / total) * 100)
    }
    scanProgress.value = 100
    summary.value = `导入完成：PDF ${imported}，听力 ${importedAudio}，待绑定解析 ${pending}，跳过 ${skipped}，失败 ${failed}`
    scanMessage.value = summary.value
    emit('imported')
  } catch (error) {
    errorMessage.value = (error as Error).message || '保存失败'
  } finally {
    importing.value = false
  }
}

function close(): void {
  if (scanning.value || importing.value) return
  emit('close')
}

watch(() => props.open, open => {
  if (open) {
    rows.value = []
    audioRows.value = []
    summary.value = ''
    errorMessage.value = ''
    scanProgress.value = 0
    scanMessage.value = `请选择真题 PDF/听力音频，或直接选择包含这些资源的文件夹；当前板块最多 ${pdfLimit.value} 个 PDF`
  } else {
    rows.value = []
    audioRows.value = []
    summary.value = ''
    errorMessage.value = ''
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="collection-import-overlay" @click.self="close">
      <section class="collection-import-dialog">
        <header>
          <div><span>EXAM RESOURCE IMPORT</span><h2>批量导入真题 PDF 与听力</h2><p>可多选文件或选择整个文件夹；当前板块一次最多 {{ pdfLimit }} 个 PDF。PDF 自动识别题干与解析，听力音频自动绑定到对应合集。</p></div>
          <button class="close" :disabled="scanning || importing" @click="close">×</button>
        </header>

        <div class="scan-bar">
          <button type="button" :disabled="scanning || importing" @click="openPicker">选择 PDF / 听力文件</button>
          <button type="button" class="folder-picker" :disabled="scanning || importing" @click="openFolderPicker">选择资源文件夹</button>
          <div class="scan-copy"><strong>{{ scanMessage || '请选择需要识别的真题或听力资源' }}</strong><span v-if="errorMessage" class="error">{{ errorMessage }}</span><span v-else-if="summary" class="success">{{ summary }}</span></div>
          <b>{{ scanProgress }}%</b>
        </div>
        <div class="progress-track"><div :style="{ width: `${scanProgress}%` }"></div></div>

        <div class="preview-list">
          <article v-for="audio in audioRows" :key="`audio-${audio.filePath}`" class="preview-card audio-preview" :class="{ failed: audio.error, saved: audio.saved }">
            <div class="row-head">
              <input v-model="audio.selected" type="checkbox" :disabled="audio.saved || importing" />
              <div class="file-copy"><strong>{{ audio.fileName }}</strong><span>听力音频 · 保存时自动匹配合集与 A/B 槽位</span></div>
              <span class="audio-badge">{{ audio.matchHint }}</span>
            </div>
            <div v-if="audio.error" class="row-message">{{ audio.error }}</div>
            <div class="metadata-grid">
              <label><span>考试类型</span><select v-model="audio.metadata.examType" :disabled="importing || audio.saved"><option v-for="item in categories" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
              <label><span>年份</span><select :value="audio.metadata.year ?? 0" :disabled="importing || audio.saved" @change="setYear(audio, $event)"><option :value="0">未识别</option><option v-for="year in years" :key="year" :value="year">{{ year }}</option></select></label>
              <label><span>场次</span><select v-model="audio.metadata.session" :disabled="importing || audio.saved"><option v-for="month in examMonthOptions" :key="month.value" :value="month.value">{{ month.label }}</option><option value="unknown">未识别</option></select></label>
              <label><span>听力槽位</span><select v-model="audio.metadata.audioSlot" :disabled="importing || audio.saved"><option :value="null">自动 A/B</option><option value="A">A</option><option value="B">B</option></select></label>
              <div class="meta-summary">{{ categoryLabel(audio.metadata.examType) }} · {{ audio.metadata.year || '年份未识别' }} · {{ examSeasonLabel(audio.metadata.session) }}</div>
            </div>
          </article>
          <article v-for="row in rows" :key="row.analysis.filePath" class="preview-card" :class="{ duplicate: row.duplicateCollectionId, pending: row.pendingBinding, failed: row.error && !row.duplicateCollectionId && !row.pendingBinding, saved: row.saved }">
            <div class="row-head">
              <input v-model="row.selected" type="checkbox" :disabled="Boolean(row.duplicateCollectionId) || row.saved || importing" />
              <div class="file-copy"><strong>{{ row.analysis.fileName }}</strong><span>{{ row.analysis.pageCount }} 页 · {{ row.segments.length }} 个语义片段 · {{ row.analysis.metadata.sources.join(' + ') || '元信息未识别' }}</span></div>
              <span class="match-chip" :class="{ low: row.matchHint.includes('待') }">{{ row.matchHint }}</span>
              <span class="confidence-chip" :class="{ low: row.analysis.metadata.confidence < 0.75 }">元信息 {{ confidencePercent(row.analysis.metadata.confidence) }}%</span>
              <button type="button" class="expand" @click="row.expanded = !row.expanded">{{ row.expanded ? '收起' : '查看片段' }}</button>
            </div>

            <div v-if="row.pendingBinding" class="row-message pending-message">{{ row.error }}</div>
            <div v-else-if="row.duplicateCollectionId" class="row-message duplicate-message">该 PDF 已导入，已自动跳过</div>
            <div v-else-if="row.error" class="row-message">{{ row.error }}</div>

            <div class="metadata-grid">
              <label><span>考试类型</span><select v-model="row.metadata.examType" :disabled="importing || row.saved"><option v-for="item in categories" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
              <label><span>年份</span><select :value="row.metadata.year ?? 0" :disabled="importing || row.saved" @change="setYear(row, $event)"><option :value="0">未识别</option><option v-for="year in years" :key="year" :value="year">{{ year }}</option></select></label>
              <label><span>场次</span><select v-model="row.metadata.session" :disabled="importing || row.saved"><option v-for="month in examMonthOptions" :key="month.value" :value="month.value">{{ month.label }}</option><option value="unknown">未识别</option></select></label>
              <label><span>套号</span><select v-model.number="row.metadata.setNo" :disabled="importing || row.saved"><option :value="null">未识别</option><option v-for="n in 3" :key="n" :value="n">第{{ n }}套</option></select></label>
              <div class="meta-summary">{{ categoryLabel(row.metadata.examType) }} · {{ row.metadata.year || '年份未识别' }} · {{ examSeasonLabel(row.metadata.session) }}</div>
            </div>

            <div v-if="row.expanded" class="segment-list">
              <div v-for="segment in row.segments" :key="`${segment.pageNo}-${segment.segmentOrder}`" class="segment-row">
                <span class="page-badge">P{{ segment.pageNo }}</span>
                <select :value="segment.contentType" :disabled="importing || row.saved" @change="setSegmentRole(row, segment, $event)"><option v-for="role in roleOptions" :key="role.value" :value="role.value">{{ role.label }}</option></select>
                <span class="segment-confidence" :class="{ low: segment.confidence < 0.75 }">{{ confidencePercent(segment.confidence) }}%</span>
                <span class="confirmed-label">{{ segment.status === 'confirmed' ? '已修正' : '系统自动判定' }}</span>
                <pre>{{ segment.textExcerpt || '该区域没有原生文字，需人工框选' }}</pre>
              </div>
              <div v-if="!row.segments.length" class="no-segments">未识别出内容片段，保存后可在“标注”中人工框选。</div>
            </div>
          </article>
        </div>

        <footer>
          <span>解析与答案会合并为解析内容；听力音频按考试类型、年份、场次自动绑定合集。</span>
          <div><button type="button" :disabled="scanning || importing" @click="close">{{ summary ? '完成' : '取消' }}</button><button class="primary" type="button" :disabled="scanning || importing || (!saveableRows.length && !saveableAudioRows.length)" @click="importRows">{{ importing ? '正在导入…' : `确认导入 ${saveableRows.length} 个 PDF / ${saveableAudioRows.length} 个音频` }}</button></div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.collection-import-overlay { position: fixed; inset: 0; z-index: 96000; display: flex; align-items: center; justify-content: center; padding: 28px; background: rgba(37,29,24,.38); backdrop-filter: blur(6px); }
.collection-import-dialog { width: min(1120px, 96vw); max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; border-radius: 16px; border: 1px solid rgba(255,255,255,.55); background: var(--bg-card); box-shadow: 0 30px 100px rgba(38,27,20,.28); }
header { display: flex; justify-content: space-between; padding: 18px 21px 14px; border-bottom: 1px solid var(--glass-border); background: linear-gradient(135deg, rgba(217,119,6,.055), transparent 60%); }
header span { color: var(--accent); font-family: var(--font-mono); font-size: 8px; font-weight: 800; letter-spacing: 1.3px; }
header h2 { margin-top: 4px; font-family: var(--font-display); font-size: 21px; color: var(--text-primary); }
header p { margin-top: 4px; color: var(--text-muted); font-size: 9px; }
header .close { width: 28px; height: 28px; border-radius: 50%; color: var(--text-muted); background: transparent; font-size: 18px; }
.scan-bar { display: flex; align-items: center; gap: 11px; padding: 11px 20px 8px; }
.scan-bar > button { padding: 8px 12px; border-radius: 8px; color: #fff; background: var(--accent); font-size: 9px; font-weight: 700; }.scan-bar > button.folder-picker { color: var(--accent); border: 1px solid rgba(217,119,6,.24); background: rgba(217,119,6,.06); }.scan-bar > button:disabled { opacity: .5; cursor: default; }
.scan-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; font-size: 9px; color: var(--text-muted); }
.scan-copy strong { color: var(--text-secondary); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.scan-bar b { color: var(--accent); font-family: var(--font-mono); font-size: 10px; }
.error { color: var(--danger); }.success { color: #047857; }
.progress-track { height: 3px; margin: 0 20px 9px; overflow: hidden; border-radius: 2px; background: rgba(44,36,32,.08); }
.progress-track div { height: 100%; background: var(--accent); transition: width .2s; }
.preview-list { flex: 1; min-height: 200px; overflow-y: auto; padding: 0 16px 12px; }
.preview-card { margin-bottom: 9px; padding: 11px 12px; border-radius: 10px; border: 1px solid var(--glass-border); background: var(--bg-primary); }
.preview-card.duplicate { opacity: .68; border-color: rgba(59,130,246,.18); }.preview-card.pending { border-color: rgba(245,158,11,.28); background: rgba(255,251,235,.58); }.preview-card.failed { border-color: rgba(220,38,38,.22); }.preview-card.saved { border-color: rgba(16,185,129,.2); }
.row-head { display: flex; align-items: center; gap: 8px; }
.file-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.file-copy strong { color: var(--text-primary); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }.file-copy span { color: var(--text-muted); font-size: 8px; }
.match-chip { padding: 3px 7px; border-radius: 8px; color: #047857; background: rgba(16,185,129,.08); font-size: 8px; font-weight: 700; white-space: nowrap; }
.match-chip.low { color: #b45309; background: rgba(245,158,11,.1); }
.audio-preview { border-color: rgba(59,130,246,.18); background: rgba(239,246,255,.34); }
.audio-badge { padding: 3px 7px; border-radius: 8px; color: #1d4ed8; background: rgba(59,130,246,.1); font-size: 8px; font-weight: 700; white-space: nowrap; }
.confidence-chip { padding: 3px 7px; border-radius: 8px; color: #047857; background: rgba(16,185,129,.08); font-size: 8px; font-weight: 700; }.confidence-chip.low { color: #b45309; background: rgba(245,158,11,.1); }
.expand { padding: 5px 8px; border-radius: 6px; color: var(--text-muted); background: var(--bg-secondary); border: 1px solid var(--glass-border); font-size: 8px; }
.row-message { margin: 8px 0; padding: 6px 8px; border-radius: 6px; color: var(--danger); background: rgba(220,38,38,.045); font-size: 8px; }.duplicate-message { color: #2563eb; background: rgba(59,130,246,.05); }.pending-message { color: #b45309; background: rgba(245,158,11,.07); }
.metadata-grid { display: flex; align-items: flex-end; gap: 7px; flex-wrap: wrap; margin-top: 9px; }
.metadata-grid label { display: flex; flex-direction: column; gap: 3px; }.metadata-grid label span { color: var(--text-muted); font-size: 7px; font-weight: 700; }
.metadata-grid select { min-width: 74px; padding: 5px; border: 1px solid var(--glass-border); border-radius: 6px; background: var(--bg-secondary); color: var(--text-secondary); outline: none; font-size: 8px; }
.meta-summary { margin-left: auto; padding-bottom: 5px; color: var(--text-muted); font-size: 8px; }
.segment-list { margin-top: 10px; padding-top: 9px; border-top: 1px dashed var(--glass-border); display: flex; flex-direction: column; gap: 6px; }
.segment-row { display: grid; grid-template-columns: 34px 110px 48px auto minmax(0,1fr); gap: 6px; align-items: start; padding: 6px; border-radius: 6px; background: var(--bg-secondary); }
.page-badge { color: var(--accent); font-family: var(--font-mono); font-size: 8px; font-weight: 700; padding-top: 5px; }
.segment-row select { padding: 4px; border: 1px solid var(--glass-border); border-radius: 5px; background: var(--bg-card); color: var(--text-primary); font-size: 8px; }
.segment-confidence { padding-top: 5px; color: #047857; font-family: var(--font-mono); font-size: 7px; }.segment-confidence.low { color: #b45309; }
.segment-row button { padding: 4px 6px; border-radius: 5px; color: var(--accent); background: rgba(217,119,6,.07); font-size: 7px; font-weight: 700; }
.confirmed-label { padding-top: 4px; color: #047857; font-size: 7px; }
.segment-row pre { grid-column: 1 / -1; max-height: 90px; overflow: auto; margin: 3px 0 0; padding: 6px; border-radius: 5px; background: var(--bg-card); color: var(--text-secondary); white-space: pre-wrap; font-family: var(--font-sans); font-size: 8px; line-height: 1.5; }
.no-segments { padding: 8px; color: var(--text-muted); font-size: 8px; }
footer { display: flex; justify-content: space-between; gap: 15px; align-items: center; padding: 11px 20px 14px; border-top: 1px solid var(--glass-border); color: var(--text-muted); font-size: 8px; }
footer > div { display: flex; gap: 7px; } footer button { padding: 7px 11px; border-radius: 7px; border: 1px solid var(--glass-border); color: var(--text-secondary); background: var(--bg-secondary); font-size: 8px; font-weight: 700; } footer button.primary { color: #fff; background: var(--accent); border-color: transparent; } footer button:disabled { opacity: .4; cursor: default; }
@media (max-width: 900px) { .collection-import-overlay { padding: 12px; }.collection-import-dialog { max-height: 96vh; }.segment-row { grid-template-columns: 30px 90px 42px auto; }.segment-row pre { grid-column: 1 / -1; }.meta-summary { margin-left: 0; } }
</style>

