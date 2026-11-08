<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { examMonthOptions, examPaperTypeOptions, examSeasonLabel } from '../../lib/examMetadata'

const props = defineProps<{ open: boolean; initialMode?: 'files' | 'folder' }>()
const emit = defineEmits<{ (event: 'close'): void; (event: 'imported'): void }>()

type Role = ExamResourceRoleKey

const files = ref<ExamResourceCandidate[]>([])
const drafts = ref<ExamResourceDraft[]>([])
const unmatchedFileIds = ref<string[]>([])
const rootPath = ref('')
const scanning = ref(false)
const importing = ref(false)
const scanMessage = ref('')
const importMessage = ref('')
const errorMessage = ref('')
const progress = ref(0)
const progressLabel = ref('')
const importedCount = ref(0)
const skippedCount = ref(0)
const failedCount = ref(0)
const lastBatchRoot = ref('')

const categoryOptions = examPaperTypeOptions
const yearOptions = Array.from({ length: 31 }, (_, index) => 2030 - index)

const candidateMap = computed(() => new Map(files.value.map(file => [file.id, file])))
const unmatchedFiles = computed(() => unmatchedFileIds.value.map(id => candidateMap.value.get(id)).filter(Boolean) as ExamResourceCandidate[])
const readyCount = computed(() => drafts.value.filter(draft => Boolean(candidateMap.value.get(draft.textFileId))).length)

const validationErrors = computed<string[]>(() => {
  const errors: string[] = []
  const used = new Map<string, string>()
  drafts.value.forEach((draft, index) => {
    const label = draft.title || `第 ${index + 1} 组`
    const text = candidateMap.value.get(draft.textFileId)
    if (!text) errors.push(`${label}：缺少真题文本`)
    if (draft.paperType === 'unknown') errors.push(`${label}：请选择考试类型`)
    for (const role of ['text', 'audio', 'analysis'] as Role[]) {
      const id = role === 'text' ? draft.textFileId : role === 'audio' ? draft.audioFileId : draft.analysisFileId
      if (!id) continue
      const candidate = candidateMap.value.get(id)
      if (!candidate) {
        errors.push(`${label}：${roleLabel(role)}文件无效`)
        continue
      }
      if (candidate.role !== role) errors.push(`${label}：${candidate.fileName} 不能作为${roleLabel(role)}`)
      const previous = used.get(id)
      if (previous) errors.push(`${label}：${candidate.fileName} 已被“${previous}”使用`)
      else used.set(id, label)
    }
  })
  return errors
})

function roleLabel(role: Role): string {
  return role === 'text' ? '真题文本' : role === 'audio' ? '配套音频' : '解析文本'
}

function filesForRole(role: Role): ExamResourceCandidate[] {
  return files.value.filter(file => file.role === role)
}

function candidate(id: string): ExamResourceCandidate | null {
  return candidateMap.value.get(id) || null
}

function confidenceLabel(value: number): string {
  return value >= 90 ? '高置信匹配' : value >= 70 ? '中置信匹配' : value >= 45 ? '低置信匹配' : '待手动匹配'
}

function categoryLabel(value: ExamPaperTypeKey): string {
  return categoryOptions.find(item => item.value === value)?.label || '未识别'
}

function setDraftYear(draft: ExamResourceDraft, event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value)
  draft.year = value === 0 ? null : value
}

function setDraftFile(draft: ExamResourceDraft, role: Role, event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (role === 'text') draft.textFileId = value
  else if (role === 'audio') draft.audioFileId = value
  else draft.analysisFileId = value
}

function removeDraft(id: string): void {
  drafts.value = drafts.value.filter(draft => draft.id !== id)
}

function addDraft(): void {
  const assigned = new Set(drafts.value.flatMap(draft => [draft.textFileId, draft.audioFileId, draft.analysisFileId]).filter(Boolean))
  const text = files.value.find(file => file.role === 'text' && !assigned.has(file.id))
  drafts.value.push({
    id: `manual-${Date.now()}-${drafts.value.length}`,
    title: text?.fileName.replace(/\.[^.]+$/, '') || '新真题资源集',
    paperType: text?.paperType === 'unknown' ? 'CET4' : text?.paperType || 'CET4',
    year: text?.year || null,
    season: text?.season || 'unknown',
    setNo: text?.setNo || null,
    textFileId: text?.id || '',
    audioFileId: '',
    analysisFileId: '',
    confidence: text ? 100 : 0,
    warnings: []
  })
}

function mergeCandidateFiles(incoming: ExamResourceCandidate[]): void {
  const existing = new Map(files.value.map(file => [file.id, file]))
  for (const file of incoming) existing.set(file.id, file)
  files.value = [...existing.values()]
}

async function runScan(filePaths: string[], scanRoot = ''): Promise<void> {
  if (!filePaths.length || scanning.value) return
  scanning.value = true
  errorMessage.value = ''
  importMessage.value = ''
  scanMessage.value = `正在扫描 ${filePaths.length} 个文件…`
  try {
    const result = await window.cet4Api.scanExamResourceFiles({ filePaths, rootPath: scanRoot })
    if (!result.success || !result.result) throw new Error(result.message || '资源扫描失败')
    files.value = result.result.files
    drafts.value = result.result.drafts
    unmatchedFileIds.value = result.result.unmatchedFileIds
    rootPath.value = result.result.rootPath || scanRoot
    lastBatchRoot.value = result.result.rootPath || scanRoot
    scanMessage.value = `扫描完成：${result.result.files.length} 个文件，自动生成 ${result.result.drafts.length} 套资源`
    if (result.result.warnings.length) scanMessage.value += `，${result.result.warnings.length} 条提示`
    if (!drafts.value.length) errorMessage.value = '没有找到可作为真题文本的 PDF/TXT/MD 文件'
  } catch (error) {
    errorMessage.value = (error as Error).message || '资源扫描失败'
  } finally {
    scanning.value = false
  }
}

async function chooseFiles(): Promise<void> {
  const result = await window.cet4Api.selectExamResourceFiles()
  if (!result.success) return setError(result.message || '无法打开文件选择器')
  if (!result.canceled) await runScan(result.filePaths)
}

async function chooseFolder(): Promise<void> {
  const result = await window.cet4Api.selectExamResourceFolder()
  if (!result.success) return setError(result.message || '无法打开文件夹选择器')
  if (result.canceled) return
  if (!result.filePaths.length) return setError('文件夹中没有可识别的真题资源文件')
  if (result.message) scanMessage.value = result.message
  await runScan(result.filePaths, result.rootPath)
}

function setError(message: string): void {
  errorMessage.value = message
}

async function importAll(): Promise<void> {
  if (validationErrors.value.length) {
    errorMessage.value = validationErrors.value[0]
    return
  }
  importing.value = true
  errorMessage.value = ''
  importMessage.value = ''
  importedCount.value = 0
  skippedCount.value = 0
  failedCount.value = 0
  let batchId: number | null = null
  try {
    const batch = await window.cet4Api.beginExamResourceBatch({
      rootPath: lastBatchRoot.value,
      importMode: lastBatchRoot.value ? 'folder' : 'files',
      totalSets: drafts.value.length
    })
    batchId = batch.success ? batch.batchId || null : null

    for (let index = 0; index < drafts.value.length; index++) {
      const draft = drafts.value[index]
      progress.value = Math.round((index / drafts.value.length) * 100)
      progressLabel.value = `正在导入 ${index + 1}/${drafts.value.length}：${draft.title}`
      const text = candidate(draft.textFileId)
      const audio = candidate(draft.audioFileId)
      const analysis = candidate(draft.analysisFileId)
      if (!text) continue
      const result = await window.cet4Api.importExamResourceSet({
        batchId,
        title: draft.title,
        paperType: draft.paperType,
        year: draft.year,
        season: draft.season,
        setNo: draft.setNo,
        remark: '',
        text,
        audio,
        analysis
      })
      if (result.success) importedCount.value += 1
      else if (result.duplicate) skippedCount.value += 1
      else failedCount.value += 1
    }
    progress.value = 100
    progressLabel.value = '导入完成'
    importMessage.value = `成功 ${importedCount.value} 套，跳过重复 ${skippedCount.value} 套，失败 ${failedCount.value} 套`
    if (batchId) {
      await window.cet4Api.finishExamResourceBatch({
        batchId,
        imported: importedCount.value,
        skipped: skippedCount.value,
        failed: failedCount.value,
        details: { rootPath: lastBatchRoot.value, total: drafts.value.length }
      })
    }
    emit('imported')
  } catch (error) {
    errorMessage.value = (error as Error).message || '批量导入失败'
  } finally {
    importing.value = false
  }
}

function close(): void {
  if (scanning.value || importing.value) return
  emit('close')
}

let autoPickerStarted = false
watch(() => props.open, async (open) => {
  if (open && !autoPickerStarted) {
    autoPickerStarted = true
    files.value = []
    drafts.value = []
    unmatchedFileIds.value = []
    rootPath.value = ''
    lastBatchRoot.value = ''
    scanMessage.value = ''
    importMessage.value = ''
    progress.value = 0
    await nextTick()
    if (props.initialMode === 'folder') await chooseFolder()
    else await chooseFiles()
    return
  }
  if (!open) {
    autoPickerStarted = false
    progress.value = 0
    importMessage.value = ''
    errorMessage.value = ''
  }
})
</script>

<template>
  <Teleport to="body">
    <transition name="batch-modal">
      <div v-if="open" class="batch-overlay" @click.self="close">
        <section class="batch-dialog">
          <header class="batch-header">
            <div>
              <div class="batch-kicker">REAL EXAM RESOURCE SET</div>
              <h2>批量导入真题资源</h2>
              <p>自动把真题文本、配套音频和解析文本配成一套；低置信匹配可直接在下方修正。</p>
            </div>
            <button class="batch-close" type="button" :disabled="scanning || importing" @click="close">×</button>
          </header>

          <div class="batch-source-bar">
            <button class="source-button primary" type="button" :disabled="scanning || importing" @click="chooseFolder">选择真题文件夹</button>
            <button class="source-button" type="button" :disabled="scanning || importing" @click="chooseFiles">选择多个文件</button>
            <span class="source-hint">PDF / TXT / MD + MP3 / WAV / M4A / OGG</span>
          </div>

          <div v-if="scanning || progressLabel || importMessage" class="batch-progress">
            <div class="progress-head">
              <strong>{{ scanning ? scanMessage : progressLabel || scanMessage }}</strong>
              <span>{{ progress }}%</span>
            </div>
            <div class="progress-track"><div :style="{ width: `${progress}%` }"></div></div>
            <p v-if="scanMessage && !scanning && !importMessage">{{ scanMessage }}</p>
          </div>

          <div v-if="errorMessage" class="batch-error">{{ errorMessage }}</div>
          <div v-if="importMessage" class="batch-success">{{ importMessage }}</div>

          <div v-if="unmatchedFiles.length && !importing" class="unmatched-strip">
            <strong>未自动匹配文件 {{ unmatchedFiles.length }} 个</strong>
            <span v-for="file in unmatchedFiles.slice(0, 8)" :key="file.id">{{ file.fileName }}</span>
            <i v-if="unmatchedFiles.length > 8">等</i>
          </div>

          <div class="draft-list">
            <article v-for="(draft, index) in drafts" :key="draft.id" class="draft-card">
              <div class="draft-head">
                <span class="draft-index">{{ String(index + 1).padStart(2, '0') }}</span>
                <input v-model="draft.title" class="draft-title-input" type="text" :disabled="importing" />
                <span class="confidence" :class="{ low: draft.confidence < 70 }">{{ confidenceLabel(draft.confidence) }}</span>
                <button type="button" class="draft-remove" :disabled="importing" @click="removeDraft(draft.id)">×</button>
              </div>

              <div class="draft-metadata">
                <label><span>考试类型</span><select v-model="draft.paperType" :disabled="importing"><option v-for="item in categoryOptions" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
                <label><span>年份</span><select :value="draft.year ?? 0" :disabled="importing" @change="setDraftYear(draft, $event)"><option :value="0">未分类</option><option v-for="year in yearOptions" :key="year" :value="year">{{ year }}</option></select></label>
                <label><span>考季</span><select v-model="draft.season" :disabled="importing"><option v-for="month in examMonthOptions" :key="month.value" :value="month.value">{{ month.label }}</option><option value="unknown">未分类</option></select></label>
                <label><span>套号</span><select v-model.number="draft.setNo" :disabled="importing"><option :value="null">未设置</option><option v-for="n in 6" :key="n" :value="n">第 {{ n }} 套</option></select></label>
                <span class="meta-summary">{{ categoryLabel(draft.paperType) }} · {{ draft.year || '年份未分类' }} · {{ examSeasonLabel(draft.season) }}</span>
              </div>

              <div class="resource-slots">
                <label v-for="role in (['text','audio','analysis'] as Role[])" :key="role" class="resource-slot" :class="{ filled: Boolean(role === 'text' ? draft.textFileId : role === 'audio' ? draft.audioFileId : draft.analysisFileId), required: role === 'text' }">
                  <span class="slot-label">{{ roleLabel(role) }}<b v-if="role === 'text'">必须</b></span>
                  <select :value="role === 'text' ? draft.textFileId : role === 'audio' ? draft.audioFileId : draft.analysisFileId" :disabled="importing" @change="setDraftFile(draft, role, $event)">
                    <option value="">未选择</option>
                    <option v-for="file in filesForRole(role)" :key="file.id" :value="file.id">{{ file.fileName }}</option>
                  </select>
                  <small v-if="candidate(role === 'text' ? draft.textFileId : role === 'audio' ? draft.audioFileId : draft.analysisFileId)">
                    {{ candidate(role === 'text' ? draft.textFileId : role === 'audio' ? draft.audioFileId : draft.analysisFileId)?.relativePath }}
                  </small>
                  <small v-else>尚未匹配文件</small>
                </label>
              </div>
            </article>

            <div v-if="!drafts.length && !scanning" class="batch-empty">
              <strong>还没有可导入的真题资源集</strong>
              <span>选择包含真题文本、音频和解析的文件夹，或手动选择多个文件。</span>
              <button type="button" @click="chooseFolder">选择文件夹</button>
            </div>
          </div>

          <footer class="batch-footer">
            <div class="footer-info">
              <button class="add-draft" type="button" :disabled="importing || !files.length" @click="addDraft">＋ 新增一组</button>
              <span v-if="validationErrors.length" class="validation-error">{{ validationErrors[0] }}</span>
              <span v-else-if="drafts.length" class="validation-ok">{{ readyCount }} 套已具备真题文本，可以导入</span>
            </div>
            <div class="footer-actions">
              <button class="cancel-button" type="button" :disabled="scanning || importing" @click="close">{{ importMessage ? '完成' : '取消' }}</button>
              <button v-if="!importMessage" class="import-button" type="button" :disabled="scanning || importing || !drafts.length || validationErrors.length > 0" @click="importAll">
                {{ importing ? '正在导入…' : `确认导入 ${drafts.length} 套` }}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.batch-overlay { position: fixed; inset: 0; z-index: 96000; display: flex; align-items: center; justify-content: center; padding: 30px; background: rgba(37,29,24,.38); backdrop-filter: blur(6px); }
.batch-dialog { width: min(1120px, 96vw); max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; border: 1px solid rgba(255,255,255,.55); border-radius: 16px; background: var(--bg-card); box-shadow: 0 32px 100px rgba(38,27,20,.28); }
.batch-header { display: flex; justify-content: space-between; gap: 20px; padding: 20px 22px 15px; border-bottom: 1px solid var(--glass-border); background: linear-gradient(135deg, rgba(217,119,6,.055), transparent 55%); }
.batch-kicker { margin-bottom: 5px; color: var(--accent); font-family: var(--font-mono); font-size: 9px; font-weight: 800; letter-spacing: 1.4px; }
.batch-header h2 { color: var(--text-primary); font-family: var(--font-display); font-size: 21px; font-weight: 650; }
.batch-header p { max-width: 720px; margin-top: 4px; color: var(--text-muted); font-size: 10px; line-height: 1.6; }
.batch-close { width: 29px; height: 29px; flex-shrink: 0; border-radius: 50%; color: var(--text-muted); background: transparent; font-size: 20px; }
.batch-close:hover { color: var(--text-primary); background: var(--bg-secondary); }
.batch-source-bar { display: flex; align-items: center; gap: 8px; padding: 12px 20px; border-bottom: 1px solid var(--glass-border); }
.source-button { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--glass-border); color: var(--text-secondary); background: var(--bg-secondary); font-size: 10px; font-weight: 700; }
.source-button.primary { color: #fff; background: var(--accent); border-color: transparent; }
.source-button:hover:not(:disabled) { transform: translateY(-1px); }
.source-button:disabled { opacity: .45; cursor: default; }
.source-hint { margin-left: auto; color: var(--text-muted); font-size: 8px; }
.batch-progress { margin: 12px 20px 0; padding: 10px 12px; border-radius: 9px; border: 1px solid var(--glass-border); background: var(--bg-secondary); }
.progress-head { display: flex; justify-content: space-between; gap: 18px; color: var(--text-secondary); font-size: 10px; }
.progress-head span { color: var(--accent); font-family: var(--font-mono); font-weight: 700; }
.progress-track { height: 4px; margin-top: 7px; overflow: hidden; border-radius: 2px; background: rgba(44,36,32,.08); }
.progress-track div { height: 100%; border-radius: 2px; background: linear-gradient(90deg, #d97706, #f59e0b); transition: width .2s ease; }
.batch-progress p { margin-top: 6px; color: var(--text-muted); font-size: 8px; }
.batch-error, .batch-success { margin: 10px 20px 0; padding: 8px 10px; border-radius: 8px; font-size: 9px; font-weight: 650; }
.batch-error { color: #b91c1c; background: rgba(220,38,38,.06); border: 1px solid rgba(220,38,38,.13); }
.batch-success { color: #047857; background: rgba(16,185,129,.06); border: 1px solid rgba(16,185,129,.13); }
.unmatched-strip { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 10px 20px 0; padding: 8px 10px; border-radius: 8px; color: #b45309; background: rgba(245,158,11,.05); border: 1px solid rgba(245,158,11,.14); font-size: 8px; }
.unmatched-strip strong { margin-right: 4px; }
.unmatched-strip span { padding: 2px 5px; border-radius: 5px; background: rgba(255,255,255,.55); }
.draft-list { flex: 1; min-height: 180px; overflow-y: auto; padding: 12px 16px 16px; }
.draft-card { margin-bottom: 10px; padding: 12px 13px; border-radius: 11px; border: 1px solid var(--glass-border); background: var(--bg-primary); }
.draft-head { display: flex; align-items: center; gap: 8px; }
.draft-index { color: var(--accent); font-family: var(--font-mono); font-size: 9px; font-weight: 800; }
.draft-title-input { flex: 1; min-width: 0; border: 0; outline: none; color: var(--text-primary); background: transparent; font-size: 12px; font-weight: 700; }
.confidence { flex-shrink: 0; padding: 3px 7px; border-radius: 8px; color: #047857; background: rgba(16,185,129,.08); font-size: 8px; font-weight: 700; }
.confidence.low { color: #b45309; background: rgba(245,158,11,.1); }
.draft-remove { width: 22px; height: 22px; border-radius: 50%; color: var(--text-muted); background: transparent; font-size: 14px; }
.draft-remove:hover { color: var(--danger); background: rgba(220,38,38,.05); }
.draft-metadata { display: flex; align-items: flex-end; gap: 7px; flex-wrap: wrap; margin-top: 9px; }
.draft-metadata label { display: flex; flex-direction: column; gap: 3px; }
.draft-metadata label span { color: var(--text-muted); font-size: 7px; font-weight: 700; }
.draft-metadata select { min-width: 78px; padding: 5px 6px; border-radius: 6px; border: 1px solid var(--glass-border); color: var(--text-secondary); background: var(--bg-secondary); outline: none; font-size: 8px; }
.meta-summary { margin-left: auto; padding-bottom: 5px; color: var(--text-muted); font-size: 8px; }
.resource-slots { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 9px; }
.resource-slot { min-width: 0; padding: 8px 9px; border-radius: 8px; border: 1px dashed var(--glass-border); background: var(--bg-secondary); display: flex; flex-direction: column; gap: 4px; }
.resource-slot.filled { border-style: solid; border-color: rgba(217,119,6,.18); background: rgba(217,119,6,.035); }
.resource-slot.required:not(.filled) { border-color: rgba(220,38,38,.22); background: rgba(220,38,38,.025); }
.slot-label { display: flex; align-items: center; gap: 5px; color: var(--text-secondary); font-size: 8px; font-weight: 700; }
.slot-label b { padding: 1px 3px; border-radius: 4px; color: #b91c1c; background: rgba(220,38,38,.07); font-size: 6px; }
.resource-slot select { width: 100%; min-width: 0; padding: 5px; border: 1px solid var(--glass-border); border-radius: 5px; color: var(--text-primary); background: var(--bg-card); outline: none; font-size: 8px; }
.resource-slot small { color: var(--text-muted); font-size: 7px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.batch-empty { min-height: 240px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; text-align: center; color: var(--text-muted); }
.batch-empty strong { color: var(--text-secondary); font-size: 13px; }
.batch-empty span { font-size: 9px; }
.batch-empty button { margin-top: 8px; padding: 7px 12px; border-radius: 7px; color: var(--accent); background: rgba(217,119,6,.07); font-size: 9px; font-weight: 700; }
.batch-footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 20px 15px; border-top: 1px solid var(--glass-border); background: var(--bg-card); }
.footer-info { display: flex; align-items: center; gap: 9px; min-width: 0; }
.add-draft { padding: 7px 10px; border-radius: 7px; border: 1px solid var(--glass-border); color: var(--text-secondary); background: var(--bg-secondary); font-size: 8px; font-weight: 700; }
.validation-error { color: #b91c1c; font-size: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.validation-ok { color: #047857; font-size: 8px; }
.footer-actions { display: flex; gap: 7px; flex-shrink: 0; }
.cancel-button, .import-button { padding: 8px 13px; border-radius: 8px; font-size: 9px; font-weight: 700; }
.cancel-button { color: var(--text-secondary); background: var(--bg-secondary); border: 1px solid var(--glass-border); }
.import-button { color: #fff; background: var(--accent); }
.import-button:disabled, .cancel-button:disabled, .add-draft:disabled { opacity: .45; cursor: default; }
.batch-modal-enter-active, .batch-modal-leave-active { transition: opacity .16s ease; }
.batch-modal-enter-active .batch-dialog, .batch-modal-leave-active .batch-dialog { transition: transform .16s ease; }
.batch-modal-enter-from, .batch-modal-leave-to { opacity: 0; }
.batch-modal-enter-from .batch-dialog, .batch-modal-leave-to .batch-dialog { transform: translateY(8px) scale(.99); }
@media (max-width: 900px) { .batch-overlay { padding: 14px; } .batch-dialog { max-height: 96vh; } .resource-slots { grid-template-columns: 1fr; } .source-hint { display: none; } }
</style>
