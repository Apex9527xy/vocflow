<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import ExamCategoryCard from '../components/exam/ExamCategoryCard.vue'
import ExamCollectionCard from '../components/exam/ExamCollectionCard.vue'
import ExamCollectionImportDialog from '../components/exam/ExamCollectionImportDialog.vue'
import ExamCollectionReader from '../components/exam/ExamCollectionReader.vue'
import ExamAnnotationDialog from '../components/exam/ExamAnnotationDialog.vue'
import { basicExamTypes, examMonthOptions, examPaperTypeImportOptions, examSeasonLabel } from '../lib/examMetadata'

type ExamSection = 'basic' | 'university' | 'overseas'
interface ExamCategoryItem { type: string; label: string; description: string; mark: string; gradeKeys?: string[] }

interface EditCollectionForm {
  id: number
  title: string
  examType: ExamPaperTypeKey
  year: number | null
  session: ExamSeasonKey
}

const route = useRoute()
const gradeLabels: Record<string, string> = { grade1: '一年级', grade2: '二年级', grade3: '三年级', grade4: '四年级', grade5: '五年级', grade6: '六年级', grade7: '七年级', grade8: '八年级', grade9: '九年级', grade10: '高一', grade11: '高二', grade12: '高三' }
const gradeAliases: Record<string, string[]> = { grade1: ['一年级','1年级','grade1'], grade2: ['二年级','2年级','grade2'], grade3: ['三年级','3年级','grade3'], grade4: ['四年级','4年级','grade4'], grade5: ['五年级','5年级','grade5'], grade6: ['六年级','6年级','grade6'], grade7: ['七年级','初一','7年级','grade7'], grade8: ['八年级','初二','8年级','grade8'], grade9: ['九年级','初三','9年级','grade9'], grade10: ['高一','高中一年级','10年级','grade10'], grade11: ['高二','高中二年级','11年级','grade11'], grade12: ['高三','高中三年级','12年级','grade12'] }
const gradeMapKey = 'vocflow-exam-grade-map'
const gradeKeys = Object.keys(gradeAliases)
const universityGradeKeys = ['POSTGRAD', 'CET4', 'CET6']
const overseasGradeKeys = ['IELTS', 'TOEFL']

const examSection = computed<ExamSection>(() => {
  const requested = String(route.query.section || '')
  if (requested === 'basic' || requested === 'university' || requested === 'overseas') return requested
  const legacyType = String(route.query.type || '')
  return overseasGradeKeys.includes(legacyType) ? 'overseas' : 'university'
})
const selectedGrade = ref(String(route.query.grade || 'all'))
const gradeKey = computed(() => selectedGrade.value === 'all' ? '' : selectedGrade.value)
const middleSchool = computed(() => examSection.value === 'basic')
const maxBatchPdfFiles = computed(() => examSection.value === 'basic' ? 5 : 10)

const basicCategories: ExamCategoryItem[] = [
  { type: 'basic-primary', label: '小学合集', description: '一年级至六年级', mark: '小', gradeKeys: ['grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6'] },
  { type: 'basic-junior', label: '初中合集', description: '七年级至九年级', mark: '初', gradeKeys: ['grade7', 'grade8', 'grade9'] },
  { type: 'basic-senior', label: '高中合集', description: '高一至高三', mark: '高', gradeKeys: ['grade10', 'grade11', 'grade12'] }
]
const universityCategories: ExamCategoryItem[] = [
  { type: 'POSTGRAD', label: '考研英语', description: '考研英语真题合集', mark: '研' },
  { type: 'CET4', label: '四级合集', description: '四级历年真题合集', mark: '四' },
  { type: 'CET6', label: '六级合集', description: '六级历年真题合集', mark: '六' }
]
const overseasCategories: ExamCategoryItem[] = [
  { type: 'IELTS', label: '雅思', description: '按剑桥 Test 分组', mark: '雅' },
  { type: 'TOEFL', label: '托福', description: '按 TPO 分组', mark: '托' }
]
const categories = computed<ExamCategoryItem[]>(() => {
  if (examSection.value === 'basic') return basicCategories
  if (examSection.value === 'overseas') return overseasCategories
  return universityCategories
})
const sectionMeta = computed(() => {
  if (examSection.value === 'basic') return { eyebrow: 'BASIC EDUCATION', title: '基础教育真题', description: '选择小学、初中或高中合集，也可以通过右侧年级按钮直接定位到一年级至高三的题目合集。' }
  if (examSection.value === 'overseas') return { eyebrow: 'OVERSEAS EXAMS', title: '出国考试真题', description: '雅思按剑桥 Test 分组，托福按 TPO 分组，导入和阅读流程保持不变。' }
  return { eyebrow: 'UNIVERSITY EXAMS', title: '大学板块真题', description: '考研英语、四级和六级真题合集，保留多套卷、双音频、批注、查词和音频播放能力。' }
})
const years = Array.from({ length: 31 }, (_, index) => 2030 - index)
const collections = ref<ExamCollectionSummary[]>([])
const loading = ref(true)
const query = ref('')
const selectedType = ref('all')
const collectionsBeforeImport = ref<Set<number>>(new Set())
const importOpen = ref(false)
const readerOpen = ref(false)
const activeCollectionId = ref<number | null>(null)
const annotationCollection = ref<ExamCollectionDetail | null>(null)
const editing = ref<EditCollectionForm | null>(null)
const savingEdit = ref(false)
const deleteTarget = ref<ExamCollectionSummary | null>(null)
const deleting = ref(false)
const selectionMode = ref(false)
const sortingCollections = ref(false)
const draggedCollectionId = ref<number | null>(null)
const dragOverCollectionId = ref<number | null>(null)
const selectedCollectionIds = ref<number[]>([])
const batchDeleteOpen = ref(false)
const batchDeleting = ref(false)
const notice = ref('')
const noticeType = ref<'success' | 'error'>('success')
const pendingAnalyses = ref<PendingAnalysisImport[]>([])
const bindingTarget = ref<PendingAnalysisImport | null>(null)
const bindingCollectionId = ref<number | null>(null)
const bindingPaperNo = ref<number | null>(null)
const bindingSaving = ref(false)
const selectedCollections = computed(() => collections.value.filter(collection => selectedCollectionIds.value.includes(collection.id)))

function readGradeMap(): Record<number, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(gradeMapKey) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch { return {} }
}

function collectionTypeForGrade(key: string): ExamPaperTypeKey | '' {
  if (['grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6'].includes(key)) return 'basic-primary'
  if (['grade7', 'grade8', 'grade9'].includes(key)) return 'basic-junior'
  if (['grade10', 'grade11', 'grade12'].includes(key)) return 'basic-senior'
  return ''
}

function collectionMatchesGrade(collection: ExamCollectionSummary, key: string): boolean {
  if (!key) return false
  if (readGradeMap()[collection.id] === key) return true
  const categoryType = collectionTypeForGrade(key)
  if (categoryType && collection.exam_type === categoryType) return true
  const title = String(collection.title || '').toLowerCase().replace(/\s+/g, '')
  return (gradeAliases[key] || []).some(alias => title.includes(alias.toLowerCase().replace(/\s+/g, '')))
}

function matchesGrade(collection: ExamCollectionSummary): boolean {
  if (!gradeKey.value) return true
  return collectionMatchesGrade(collection, gradeKey.value)
}

function isBasicCollection(collection: ExamCollectionSummary): boolean {
  return collection.exam_type === 'unknown' || basicExamTypes.includes(collection.exam_type) || gradeKeys.some(key => collectionMatchesGrade(collection, key))
}

const sectionCollections = computed(() => {
  if (examSection.value === 'basic') return collections.value.filter(isBasicCollection)
  if (examSection.value === 'overseas') return collections.value.filter(collection => overseasGradeKeys.includes(collection.exam_type))
  return collections.value.filter(collection => universityGradeKeys.includes(collection.exam_type))
})

function categoryStats(type: string): { count: number; complete: number } {
  const category = categories.value.find(item => item.type === type)
  if (!category) return { count: 0, complete: 0 }
  const rows = sectionCollections.value.filter(collection => {
    if (collection.exam_type === type) return true
    if (category.gradeKeys) return category.gradeKeys.some(key => collectionMatchesGrade(collection, key))
    return false
  })
  return { count: rows.length, complete: rows.filter(collection => collection.status === 'ready').length }
}

const summary = computed(() => ({
  collections: sectionCollections.value.length,
  papers: sectionCollections.value.reduce((sum, collection) => sum + collection.papers.length, 0),
  pending: sectionCollections.value.reduce((sum, collection) => sum + collection.pendingCount, 0),
  complete: sectionCollections.value.filter(collection => collection.status === 'ready').length
}))

const bindableCollections = computed(() => collections.value.filter(collection => collection.papers.length > 0 && collection.segmentCount > 0))
const bindingCollection = computed(() => collections.value.find(collection => collection.id === bindingCollectionId.value) || null)

const filteredCollections = computed(() => {
  const value = query.value.trim().toLowerCase()
  return sectionCollections.value.filter(collection => {
    if (selectedType.value === 'unknown') {
      if (collection.exam_type !== 'unknown') return false
    } else if (selectedType.value !== 'all') {
      if (examSection.value === 'basic') {
        const category = categories.value.find(item => item.type === selectedType.value)
        if (collection.exam_type !== selectedType.value && !category?.gradeKeys?.some(key => collectionMatchesGrade(collection, key))) return false
      } else if (collection.exam_type !== selectedType.value) {
        return false
      }
    }
    if (examSection.value === 'basic' && !matchesGrade(collection)) return false
    if (!value) return true
    return [collection.title, collection.exam_type, collection.year, collection.session].filter(Boolean).join(' ').toLowerCase().includes(value)
  })
})

function setSelectedGrade(event: Event): void {
  selectedGrade.value = (event.target as HTMLSelectElement).value
  selectedType.value = 'all'
}

watch(examSection, () => {
  selectedType.value = 'all'
  selectedGrade.value = 'all'
  query.value = ''
})

function setNotice(message: string, type: 'success' | 'error' = 'success'): void { notice.value = message; noticeType.value = type; window.setTimeout(() => { if (notice.value === message) notice.value = '' }, 4000) }

function toggleCollectionSorting(): void {
  sortingCollections.value = !sortingCollections.value
  draggedCollectionId.value = null
  dragOverCollectionId.value = null
  if (sortingCollections.value) {
    selectionMode.value = false
    selectedCollectionIds.value = []
    selectedType.value = 'all'
    selectedGrade.value = 'all'
    query.value = ''
  }
}

function startCollectionDrag(collection: ExamCollectionSummary, event: DragEvent): void {
  if (!sortingCollections.value) return
  draggedCollectionId.value = collection.id
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(collection.id))
  }
}

function markCollectionDragTarget(collection: ExamCollectionSummary, event: DragEvent): void {
  if (!sortingCollections.value || !draggedCollectionId.value || draggedCollectionId.value === collection.id) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dragOverCollectionId.value = collection.id
}

async function dropCollection(target: ExamCollectionSummary, event: DragEvent): Promise<void> {
  event.preventDefault()
  const sourceId = draggedCollectionId.value
  draggedCollectionId.value = null
  dragOverCollectionId.value = null
  if (!sourceId || sourceId === target.id) return
  const ordered = [...sectionCollections.value]
  const sourceIndex = ordered.findIndex(item => item.id === sourceId)
  if (sourceIndex < 0) return
  const targetElement = (event.currentTarget as HTMLElement | null)?.querySelector('.collection-card')
  const targetRect = targetElement?.getBoundingClientRect()
  const placeAfter = Boolean(targetRect && event.clientY > targetRect.top + targetRect.height / 2)
  const [source] = ordered.splice(sourceIndex, 1)
  const targetIndex = ordered.findIndex(item => item.id === target.id)
  if (targetIndex < 0) return
  ordered.splice(targetIndex + (placeAfter ? 1 : 0), 0, source)
  const visibleIds = new Set(ordered.map(item => item.id))
  collections.value = [...ordered, ...collections.value.filter(item => !visibleIds.has(item.id))]
  const result = await window.cet4Api.reorderExamCollections({ collectionIds: ordered.map(item => item.id) })
  if (!result.success) {
    setNotice(result.message || '真题排序保存失败', 'error')
    await loadCollections()
    return
  }
  if (result.collections) collections.value = result.collections
  setNotice('真题顺序已保存')
}

function finishCollectionDrag(): void {
  draggedCollectionId.value = null
  dragOverCollectionId.value = null
}

async function loadCollections(): Promise<void> {
  loading.value = true
  try {
    const [result, pendingResult] = await Promise.all([
      window.cet4Api.getExamCollections(),
      window.cet4Api.getPendingAnalyses()
    ])
    if (!result.success) throw new Error(result.message || '真题合集加载失败')
    collections.value = result.collections
    selectedCollectionIds.value = selectedCollectionIds.value.filter(id => result.collections.some(collection => collection.id === id))
    pendingAnalyses.value = pendingResult.success ? pendingResult.pending : []
  } catch (error) { setNotice((error as Error).message || '真题合集加载失败', 'error') }
  finally { loading.value = false }
}

function openReader(collection: ExamCollectionSummary): void { activeCollectionId.value = collection.id; readerOpen.value = true }
function openImport(): void { collectionsBeforeImport.value = new Set(collections.value.map(collection => collection.id)); importOpen.value = true }
async function handleCollectionsImported(): Promise<void> {
  await loadCollections()
  if (!gradeKey.value) return
  const map = readGradeMap()
  for (const collection of collections.value) if (!collectionsBeforeImport.value.has(collection.id)) map[collection.id] = gradeKey.value
  localStorage.setItem(gradeMapKey, JSON.stringify(map))
}
async function openAnnotation(collection: ExamCollectionSummary): Promise<void> {
  const result = await window.cet4Api.getExamCollection(collection.id)
  if (!result.success || !result.collection) return setNotice(result.message || '无法打开标注工具', 'error')
  annotationCollection.value = result.collection
}

async function importAudio(collection: ExamCollectionSummary, slot: 'A' | 'B'): Promise<void> {
  const picked = await window.cet4Api.pickCollectionAudio()
  if (!picked.success || picked.canceled || !picked.filePath) return
  const result = await window.cet4Api.importCollectionAudio({ collectionId: collection.id, audioSlot: slot, filePath: picked.filePath })
  if (!result.success) return setNotice(result.message, 'error')
  await loadCollections()
  setNotice(`合集 ${collection.title} 已导入听力 ${slot}`)
}

function startEdit(collection: ExamCollectionSummary): void {
  editing.value = { id: collection.id, title: collection.title, examType: collection.exam_type, year: collection.year, session: collection.session }
}

async function saveEdit(): Promise<void> {
  if (!editing.value) return
  savingEdit.value = true
  const result = await window.cet4Api.updateExamCollectionMetadata({ collectionId: editing.value.id, examType: editing.value.examType, year: editing.value.year, session: editing.value.session, title: editing.value.title })
  savingEdit.value = false
  if (!result.success) return setNotice(result.message || '合集更新失败', 'error')
  editing.value = null
  await loadCollections()
  setNotice(result.merged ? '已合并到已有真题合集' : '真题合集信息已更新')
}

function setEditYear(event: Event): void { if (editing.value) { const value = Number((event.target as HTMLSelectElement).value); editing.value.year = value === 0 ? null : value } }
function askDelete(collection: ExamCollectionSummary): void { deleteTarget.value = collection }
function toggleSelectionMode(): void {
  selectionMode.value = !selectionMode.value
  if (!selectionMode.value) selectedCollectionIds.value = []
}
function toggleCollectionSelection(collection: ExamCollectionSummary): void {
  selectedCollectionIds.value = selectedCollectionIds.value.includes(collection.id)
    ? selectedCollectionIds.value.filter(id => id !== collection.id)
    : [...selectedCollectionIds.value, collection.id]
}
async function confirmBatchDelete(): Promise<void> {
  if (!selectedCollections.value.length) return
  batchDeleting.value = true
  let deleted = 0
  let failed = 0
  for (const collection of selectedCollections.value) {
    const result = await window.cet4Api.deleteExamCollection(collection.id)
    if (result.success) deleted++
    else failed++
  }
  batchDeleting.value = false
  batchDeleteOpen.value = false
  selectionMode.value = false
  selectedCollectionIds.value = []
  await loadCollections()
  setNotice(`批量删除完成：已删除 ${deleted} 个合集${failed ? `，失败 ${failed} 个` : ''}`, failed ? 'error' : 'success')
}
async function confirmDelete(): Promise<void> {
  if (!deleteTarget.value) return
  deleting.value = true
  const result = await window.cet4Api.deleteExamCollection(deleteTarget.value.id)
  deleting.value = false
  if (!result.success) return setNotice(result.message || '删除失败', 'error')
  deleteTarget.value = null
  await loadCollections()
  setNotice('真题合集已删除，原始 PDF 文件未改动')
}

function openPendingBinding(item: PendingAnalysisImport): void {
  bindingTarget.value = item
  const candidates = bindableCollections.value.filter(collection =>
    (item.exam_type === 'unknown' || collection.exam_type === item.exam_type) &&
    (item.year == null || collection.year === item.year)
  )
  const preferred = candidates.find(collection => collection.papers.some(paper => paper.paper_no === item.set_no)) || candidates[0] || null
  bindingCollectionId.value = preferred?.id || null
  bindingPaperNo.value = preferred?.papers.find(paper => paper.paper_no === item.set_no)?.paper_no || preferred?.papers[0]?.paper_no || null
}

function setBindingCollection(event: Event): void {
  bindingCollectionId.value = Number((event.target as HTMLSelectElement).value) || null
  bindingPaperNo.value = bindingCollection.value?.papers.find(paper => paper.paper_no === bindingTarget.value?.set_no)?.paper_no || bindingCollection.value?.papers[0]?.paper_no || null
}

function setBindingPaper(event: Event): void {
  bindingPaperNo.value = Number((event.target as HTMLSelectElement).value) || null
}

async function bindPendingAnalysis(): Promise<void> {
  if (!bindingTarget.value || !bindingCollectionId.value || !bindingPaperNo.value) return
  bindingSaving.value = true
  const result = await window.cet4Api.bindPendingAnalysis({ pendingId: bindingTarget.value.id, collectionId: bindingCollectionId.value, paperNo: bindingPaperNo.value })
  bindingSaving.value = false
  if (!result.success) return setNotice(result.message || '解析绑定失败', 'error')
  bindingTarget.value = null
  await loadCollections()
  setNotice(result.message || '解析已绑定到目标试卷')
}

async function discardPendingAnalysis(item: PendingAnalysisImport): Promise<void> {
  const result = await window.cet4Api.discardPendingAnalysis(item.id)
  if (!result.success) return setNotice(result.message || '移除待绑定标记失败', 'error')
  await loadCollections()
  setNotice(result.message || '待绑定标记已移除，原始 PDF 未删除')
}

async function handleAnnotationUpdated(collection: ExamCollectionDetail): Promise<void> {
  annotationCollection.value = collection
  await loadCollections()
  setNotice('内容片段已更新')
}

onMounted(loadCollections)
</script>

<template>
  <div class="collection-hub">
    <header class="page-header">
      <div><div class="eyebrow">{{ sectionMeta.eyebrow }}</div><h1>{{ sectionMeta.title }}</h1><p>{{ sectionMeta.description }}</p></div>
      <div class="header-actions">
        <label v-if="examSection === 'basic'" class="grade-picker">
          <span>选择年级</span>
          <select :value="selectedGrade" aria-label="选择一年级至高三" @change="setSelectedGrade">
            <option value="all">全部年级</option>
            <option v-for="(label, key) in gradeLabels" :key="key" :value="key">{{ label }}</option>
          </select>
        </label>
        <button class="primary" type="button" @click="openImport">批量导入真题 / 听力</button><button v-if="!selectionMode" type="button" class="sort-button" :class="{ active: sortingCollections }" :disabled="sectionCollections.length < 2" @click="toggleCollectionSorting">{{ sortingCollections ? '完成排序' : '自主排序' }}</button><button v-if="!selectionMode && !sortingCollections" type="button" class="batch-delete-button" @click="toggleSelectionMode">批量删除</button><button v-if="selectionMode" type="button" @click="toggleSelectionMode">取消批量删除</button><button v-if="selectionMode" type="button" class="batch-delete-button active" :disabled="!selectedCollections.length" @click="batchDeleteOpen = true">删除已选（{{ selectedCollections.length }}）</button><button type="button" :disabled="sortingCollections" @click="loadCollections">刷新合集</button>
      </div>
    </header>

    <transition name="notice"><div v-if="notice" class="page-notice" :class="noticeType">{{ notice }}</div></transition>

    <section class="category-grid" :class="{ 'two-cards': examSection === 'overseas' }">
      <ExamCategoryCard v-for="category in categories" :key="category.type" :category="category.type" :label="category.label" :description="category.description" :mark="category.mark" :count="categoryStats(category.type).count" :complete="categoryStats(category.type).complete" :active="selectedType === category.type" @select="selectedType = $event" />
    </section>

    <section class="summary-strip">
      <div><span>合集</span><strong>{{ summary.collections }}</strong></div><div><span>卷子</span><strong>{{ summary.papers }}</strong></div><div><span>待核对片段</span><strong>{{ summary.pending }}</strong></div><div><span>可用合集</span><strong>{{ summary.complete }}</strong></div>
      <label class="search"><span>⌕</span><input v-model="query" type="search" :placeholder="examSection === 'basic' ? '搜索年级、年份或合集名称' : '搜索年份、场次、合集名称'" /></label>
      <button class="pending-filter" :class="{ active: selectedType === 'unknown' }" type="button" @click="selectedType = 'unknown'">待分类</button>
      <button class="all-filter" :class="{ active: selectedType === 'all' }" type="button" @click="selectedType = 'all'">全部合集</button>
    </section>

    <section v-if="pendingAnalyses.length" class="pending-analysis-panel">
      <header><div><strong>待绑定解析 {{ pendingAnalyses.length }}</strong><span>这些解析文件尚未找到同合集、同套号的真题卷，不会在首页独立生成合集卡片。</span></div></header>
      <article v-for="item in pendingAnalyses" :key="item.id">
        <div><b>{{ item.file_name }}</b><span>{{ item.year || '年份未识别' }} · {{ examSeasonLabel(item.session) }} · {{ item.set_no ? `第 ${item.set_no} 套` : '套号未识别' }}</span><small>{{ item.reason || '等待绑定目标试卷' }}</small></div>
        <div><button type="button" @click="openPendingBinding(item)">绑定到试卷</button><button type="button" class="quiet" @click="discardPendingAnalysis(item)">移除标记</button></div>
      </article>
    </section>

    <div v-if="loading" class="hub-state">正在加载真题合集…</div>
    <div v-else-if="!filteredCollections.length" class="hub-state empty"><div>📦</div><strong>还没有匹配的真题合集</strong><span>导入 PDF 和听力音频后，软件会自动建立合集、解析与 A/B 听力资源。</span><button type="button" @click="openImport">导入第一份真题资源</button></div>
    <section v-else class="collection-list">
      <ExamCollectionCard v-for="collection in filteredCollections" :key="collection.id" :collection="collection" :selection-mode="selectionMode" :selected="selectedCollectionIds.includes(collection.id)" @open="openReader" @audio="importAudio" @annotate="openAnnotation" @edit="startEdit" @delete="askDelete" @toggle-select="toggleCollectionSelection" />
    </section>

    <ExamCollectionImportDialog :open="importOpen" :max-pdf-files="maxBatchPdfFiles" @close="importOpen = false" @imported="handleCollectionsImported" />
    <ExamCollectionReader v-if="readerOpen && activeCollectionId" :collection-id="activeCollectionId" :type="middleSchool ? 'middleSchool' : String(route.query.type || '')" @close="readerOpen = false" @annotate="openAnnotation" />
    <ExamAnnotationDialog :open="Boolean(annotationCollection)" :collection="annotationCollection" @close="annotationCollection = null" @updated="handleAnnotationUpdated" />

    <div v-if="bindingTarget" class="modal-backdrop">
      <section class="edit-modal binding-modal">
        <header><div><span>BIND ANALYSIS</span><h2>绑定解析到试卷</h2></div><button type="button" @click="bindingTarget = null">×</button></header>
        <div class="binding-file"><strong>{{ bindingTarget.file_name }}</strong><span>{{ bindingTarget.segment_count }} 个解析片段 · {{ bindingTarget.reason }}</span></div>
        <div class="edit-grid">
          <label class="full"><span>目标合集</span><select :value="bindingCollectionId ?? 0" @change="setBindingCollection"><option :value="0">请选择合集</option><option v-for="collection in bindableCollections" :key="collection.id" :value="collection.id">{{ collection.year || '年份未分类' }} · {{ examSeasonLabel(collection.session) }} · {{ collection.title }}</option></select></label>
          <label class="full"><span>目标试卷</span><select :value="bindingPaperNo ?? 0" :disabled="!bindingCollection" @change="setBindingPaper"><option :value="0">请选择套号</option><option v-for="paper in bindingCollection?.papers || []" :key="paper.id" :value="paper.paper_no">卷 {{ paper.paper_no }} · {{ paper.title }}</option></select></label>
        </div>
        <footer><button type="button" :disabled="bindingSaving" @click="bindingTarget = null">取消</button><button class="primary" type="button" :disabled="bindingSaving || !bindingCollectionId || !bindingPaperNo" @click="bindPendingAnalysis">{{ bindingSaving ? '绑定中…' : '确认绑定' }}</button></footer>
      </section>
    </div>

    <div v-if="editing" class="modal-backdrop"><section class="edit-modal"><header><div><span>EDIT COLLECTION</span><h2>编辑合集信息</h2></div><button type="button" @click="editing = null">×</button></header><div class="edit-grid"><label class="full"><span>合集名称</span><input v-model="editing.title" type="text" /></label><label><span>考试类型</span><select v-model="editing.examType"><option v-for="item in examPaperTypeImportOptions" :key="item.value" :value="item.value">{{ item.label }}</option></select></label><label><span>年份</span><select :value="editing.year ?? 0" @change="setEditYear"><option :value="0">未识别</option><option v-for="year in years" :key="year" :value="year">{{ year }}</option></select></label><label><span>场次</span><select v-model="editing.session"><option v-for="month in examMonthOptions" :key="month.value" :value="month.value">{{ month.label }}</option><option value="unknown">未识别</option></select></label></div><footer><button type="button" :disabled="savingEdit" @click="editing = null">取消</button><button class="primary" type="button" :disabled="savingEdit" @click="saveEdit">{{ savingEdit ? '保存中…' : '保存合集' }}</button></footer></section></div>
    <div v-if="batchDeleteOpen" class="modal-backdrop"><section class="delete-modal"><div class="danger-icon">!</div><h2>批量删除 {{ selectedCollections.length }} 个真题合集？</h2><p>此操作会删除所选合集的数据库记录及软件管理的音频副本。</p><span>原始 PDF 不会被删除或修改。删除后无法撤销。</span><div><button type="button" :disabled="batchDeleting" @click="batchDeleteOpen = false">取消</button><button class="danger" type="button" :disabled="batchDeleting" @click="confirmBatchDelete">{{ batchDeleting ? '正在删除…' : '确认批量删除' }}</button></div></section></div>
    <div v-if="deleteTarget" class="modal-backdrop"><section class="delete-modal"><div class="danger-icon">!</div><h2>删除真题合集？</h2><p>{{ deleteTarget.title }}</p><span>只删除数据库记录和软件管理的音频副本，不会删除或修改任何原始 PDF。</span><div><button type="button" @click="deleteTarget = null">取消</button><button class="danger" type="button" :disabled="deleting" @click="confirmDelete">{{ deleting ? '处理中…' : '确认删除' }}</button></div></section></div>
  </div>
</template>

<style scoped>
.collection-hub { max-width: 1180px; margin: 0 auto; padding-bottom: 30px; position: relative; }
.page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 18px; }.eyebrow { color: var(--accent); font-family: var(--font-mono); font-size: 9px; font-weight: 800; letter-spacing: 1.5px; }.page-header h1 { margin-top: 4px; color: var(--text-primary); font-family: var(--font-display); font-size: 31px; font-weight: 550; }.page-header p { max-width: 700px; margin-top: 5px; color: var(--text-muted); font-size: 11px; line-height: 1.65; }.header-actions { display: flex; gap: 7px; }.header-actions button { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--glass-border); color: var(--text-secondary); background: var(--bg-card); font-size: 9px; font-weight: 700; }.header-actions button.batch-delete-button { color:#b91c1c; border-color:rgba(185,28,28,.18); background:rgba(254,242,242,.85); }.header-actions button.batch-delete-button.active { color:#fff; background:#b91c1c; border-color:transparent; }.header-actions button:disabled { opacity:.45; cursor:default; }
.header-actions button.primary { color: #fff; background: var(--accent); border-color: transparent; }
.page-notice { position: fixed; top: 42px; left: 50%; z-index: 98000; transform: translateX(-50%); padding: 8px 14px; border-radius: 8px; font-size: 9px; font-weight: 700; box-shadow: 0 12px 34px rgba(44,36,32,.14); }.page-notice.success { color: #047857; background: rgba(240,253,244,.97); border: 1px solid rgba(16,185,129,.18); }.page-notice.error { color: #b91c1c; background: rgba(254,242,242,.97); border: 1px solid rgba(220,38,38,.18); }
.category-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; margin-bottom: 10px; }.summary-strip { display: flex; align-items: center; gap: 18px; padding: 9px 11px; margin-bottom: 13px; border: 1px solid var(--glass-border); border-radius: 9px; background: var(--bg-card); }.summary-strip > div { display: flex; gap: 5px; align-items: baseline; }.summary-strip span { color: var(--text-muted); font-size: 8px; }.summary-strip strong { color: var(--text-primary); font-family: var(--font-mono); font-size: 12px; }.search { margin-left: auto; width: 220px; display: flex; align-items: center; gap: 5px; padding: 6px 8px; border: 1px solid var(--glass-border); border-radius: 7px; background: var(--bg-secondary); color: var(--text-muted); }.search input { width: 100%; min-width: 0; border: 0; outline: none; background: transparent; color: var(--text-primary); font-size: 8px; }.pending-filter, .all-filter { padding: 6px 8px; border-radius: 6px; border: 1px solid var(--glass-border); color: var(--text-muted); background: var(--bg-secondary); font-size: 8px; font-weight: 700; }.pending-filter.active, .all-filter.active { color: var(--accent); border-color: rgba(217,119,6,.25); background: rgba(217,119,6,.07); }
.pending-analysis-panel { margin-bottom: 12px; padding: 10px 12px; border: 1px solid rgba(245,158,11,.24); border-radius: 10px; background: rgba(255,251,235,.72); }.pending-analysis-panel > header { padding-bottom: 7px; border-bottom: 1px dashed rgba(245,158,11,.2); }.pending-analysis-panel > header div { display: flex; flex-direction: column; gap: 2px; }.pending-analysis-panel > header strong { color: #b45309; font-size: 10px; }.pending-analysis-panel > header span { color: var(--text-muted); font-size: 8px; }.pending-analysis-panel article { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px dashed rgba(245,158,11,.14); }.pending-analysis-panel article:last-child { border-bottom: 0; }.pending-analysis-panel article > div:first-child { min-width: 0; display: flex; flex-direction: column; gap: 2px; }.pending-analysis-panel b { color: var(--text-primary); font-size: 9px; }.pending-analysis-panel article span, .pending-analysis-panel article small { color: var(--text-muted); font-size: 8px; }.pending-analysis-panel article small { color: #b45309; }.pending-analysis-panel article > div:last-child { display: flex; gap: 5px; flex-shrink: 0; }.pending-analysis-panel button { padding: 5px 8px; border-radius: 6px; color: #fff; background: var(--accent); font-size: 8px; font-weight: 700; }.pending-analysis-panel button.quiet { color: var(--text-muted); border: 1px solid var(--glass-border); background: var(--bg-card); }.binding-modal .binding-file { display: flex; flex-direction: column; gap: 3px; margin: 12px 18px 0; padding: 9px 10px; border-radius: 8px; background: var(--bg-secondary); }.binding-modal .binding-file strong { color: var(--text-primary); font-size: 10px; }.binding-modal .binding-file span { color: var(--text-muted); font-size: 8px; line-height: 1.5; }
.collection-list { display: flex; flex-direction: column; gap: 8px; }.collection-sort-item { border-radius: 11px; transition: box-shadow .15s ease, transform .15s ease; }.collection-sort-item[draggable="true"] { cursor: grab; }.collection-sort-item.drag-over { box-shadow: 0 0 0 2px rgba(217,119,6,.3), 0 12px 28px rgba(44,36,32,.08); transform: translateY(-1px); }.header-actions button.sort-button.active { color:#fff; background:var(--accent); border-color:transparent; }.hub-state { min-height: 430px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; color: var(--text-muted); font-size: 9px; text-align: center; }.hub-state.empty > div { font-size: 36px; }.hub-state.empty strong { color: var(--text-secondary); font-size: 14px; }.hub-state.empty span { max-width: 420px; line-height: 1.6; }.hub-state.empty button { margin-top: 6px; padding: 8px 12px; border-radius: 7px; color: #fff; background: var(--accent); font-size: 9px; font-weight: 700; }
.modal-backdrop { position: fixed; inset: 0; z-index: 97000; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(37,29,24,.38); backdrop-filter: blur(5px); }.edit-modal, .delete-modal { width: min(540px,92vw); border-radius: 13px; background: var(--bg-card); border: 1px solid rgba(255,255,255,.55); box-shadow: 0 25px 80px rgba(35,28,23,.25); }.edit-modal header { display: flex; justify-content: space-between; padding: 16px 18px 12px; border-bottom: 1px solid var(--glass-border); }.edit-modal header span { color: var(--accent); font-family: var(--font-mono); font-size: 7px; font-weight: 800; letter-spacing: 1px; }.edit-modal header h2 { margin-top: 4px; color: var(--text-primary); font-family: var(--font-display); font-size: 18px; }.edit-modal header button { width: 25px; height: 25px; border-radius: 50%; color: var(--text-muted); background: transparent; font-size: 17px; }.edit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 15px 18px; }.edit-grid label { display: flex; flex-direction: column; gap: 4px; }.edit-grid label.full { grid-column: 1 / -1; }.edit-grid label span { color: var(--text-muted); font-size: 7px; font-weight: 700; }.edit-grid input, .edit-grid select { padding: 7px; border: 1px solid var(--glass-border); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); outline: none; font-size: 9px; }.edit-modal footer { display: flex; justify-content: flex-end; gap: 7px; padding: 11px 18px 15px; border-top: 1px solid var(--glass-border); }.edit-modal footer button, .delete-modal button { padding: 7px 11px; border-radius: 7px; border: 1px solid var(--glass-border); color: var(--text-secondary); background: var(--bg-secondary); font-size: 8px; font-weight: 700; }.edit-modal footer button.primary { color: #fff; background: var(--accent); border-color: transparent; }
.delete-modal { width: min(410px,90vw); padding: 21px; text-align: center; }.danger-icon { width: 35px; height: 35px; margin: 0 auto 9px; display: grid; place-items: center; border-radius: 50%; color: #b45309; background: rgba(245,158,11,.1); font-family: var(--font-display); font-size: 17px; }.delete-modal h2 { color: var(--text-primary); font-size: 15px; }.delete-modal p { margin-top: 5px; color: var(--text-secondary); font-size: 10px; }.delete-modal > span { display: block; margin-top: 9px; color: var(--text-muted); font-size: 8px; line-height: 1.55; }.delete-modal > div:last-child { display: flex; justify-content: center; gap: 7px; margin-top: 16px; }.delete-modal button.danger { color: #fff; background: #b91c1c; border-color: transparent; }.notice-enter-active,.notice-leave-active { transition: opacity .16s ease, transform .16s ease; }.notice-enter-from,.notice-leave-to { opacity: 0; transform: translate(-50%,-6px); }
@media(max-width:720px){.pending-analysis-panel article{align-items:flex-start;flex-direction:column;}.pending-analysis-panel article>div:last-child{width:100%;}}
.grade-picker { display: flex; align-items: center; gap: 6px; padding: 4px 6px 4px 9px; border: 1px solid rgba(217,119,6,.2); border-radius: 8px; color: var(--accent-dim); background: rgba(217,119,6,.06); font-size: 8px; font-weight: 700; }
.grade-picker select { max-width: 100px; padding: 4px 20px 4px 6px; border: 0; border-radius: 6px; outline: none; color: var(--text-primary); background: var(--bg-card); font-size: 8px; font-weight: 700; cursor: pointer; }
.category-grid.two-cards { grid-template-columns: repeat(2,minmax(0,1fr)); max-width: 920px; margin-inline: auto; }
@media(max-width:1050px){.category-grid,.category-grid.two-cards{grid-template-columns:repeat(2,minmax(0,1fr));}.summary-strip{flex-wrap:wrap;}.search{margin-left:0;}.page-header{align-items:flex-start;flex-direction:column;}}
</style>
