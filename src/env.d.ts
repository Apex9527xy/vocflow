/// <reference types="vite/client" />

declare const __VOCFLOW_USER_BUILD__: boolean
declare const __VOCFLOW_CLOUD_ENDPOINT_JSON__: string

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

type ExamSeasonKey = '01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10' | '11' | '12' | 'unknown'
type ExamPaperTypeKey = 'basic-primary' | 'basic-junior' | 'basic-senior' | 'CET4' | 'CET6' | 'POSTGRAD' | 'IELTS' | 'TOEFL' | 'unknown'
type ExamDetectionSourceKey = 'filename' | 'pdf-text' | 'ocr' | 'manual' | 'unknown'

interface ExamLibraryDocument {
  id: number
  title: string
  paper_name: string | null
  file_name: string | null
  file_path: string | null
  source_path: string | null
  file_hash: string | null
  file_size: number | null
  page_count: number | null
  year: number | null
  season: ExamSeasonKey | null
  paper_type: ExamPaperTypeKey | null
  detection_source: ExamDetectionSourceKey | null
  text_excerpt: string | null
  cover_path: string | null
  remark: string | null
  library_root: string | null
  last_opened_at: string | null
  imported_at: string
  updated_at: string | null
}

interface ExamPdfInspectionResult {
  filePath: string
  fileName: string
  title: string
  fileHash: string
  fileSize: number
  pageCount: number
  year: number | null
  season: ExamSeasonKey
  paperType: ExamPaperTypeKey
  detectionSource: ExamDetectionSourceKey
  needsOcr: boolean
  textExcerpt: string
  warning: string
  duplicate: { id: number; title: string; year: number | null; season: ExamSeasonKey | null } | null
}

type ExamResourceRoleKey = 'text' | 'audio' | 'analysis'

interface ExamResourceRecord {
  id: number
  paper_id: number
  role: ExamResourceRoleKey
  file_name: string
  file_path: string
  file_hash: string
  file_size: number
  mime_type: string | null
  page_count: number | null
  duration_seconds: number | null
  extracted_text: string | null
  created_at: string
  updated_at: string
}

interface ExamSetRecord {
  id: number
  title: string
  paper_name: string | null
  year: number | null
  season: ExamSeasonKey | null
  paper_type: ExamPaperTypeKey | null
  set_no: number | null
  variant: string | null
  resource_status: string
  resource_fingerprint: string | null
  import_batch_id: number | null
  reader_mode: string | null
  last_position_json: string | null
  source: string | null
  remark: string | null
  imported_at: string
  updated_at: string | null
  last_opened_at: string | null
  resources: Record<ExamResourceRoleKey, ExamResourceRecord | null>
}

interface ExamResourceCandidate {
  id: string
  path: string
  fileName: string
  relativePath: string
  directory: string
  role: ExamResourceRoleKey
  mimeType: string
  fileSize: number
  fileHash: string
  pageCount: number | null
  paperType: ExamPaperTypeKey
  year: number | null
  season: ExamSeasonKey
  setNo: number | null
  normalizedStem: string
}

interface ExamResourceDraft {
  id: string
  title: string
  paperType: ExamPaperTypeKey
  year: number | null
  season: ExamSeasonKey
  setNo: number | null
  textFileId: string
  audioFileId: string
  analysisFileId: string
  confidence: number
  warnings: string[]
}

interface ExamResourceScanResult {
  rootPath: string
  files: ExamResourceCandidate[]
  drafts: ExamResourceDraft[]
  unmatchedFileIds: string[]
  warnings: string[]
}

type CollectionContentType = 'paper' | 'answer' | 'analysis' | 'listening_script'
type CollectionSegmentStatus = 'auto_confirmed' | 'pending_review' | 'confirmed' | 'rejected'

interface ExamCollectionRecord {
  id: number
  collection_key: string
  exam_type: ExamPaperTypeKey
  year: number | null
  session: ExamSeasonKey
  title: string
  status: string
  sort_order: number
  created_at: string
  updated_at: string
}

interface ExamCollectionPaper {
  id: number
  collection_id: number
  paper_no: number
  title: string
  status: string
  created_at: string
  updated_at: string
}

interface ExamCollectionAudio {
  id: number
  collection_id: number
  audio_slot: 'A' | 'B'
  label: string | null
  source_file_path: string
  managed_file_path: string | null
  file_name: string
  file_hash: string
  file_size: number
  mime_type: string | null
  duration_seconds: number | null
  status: string
  imported_at: string
  updated_at: string
}

interface ExamCollectionAnalysisRecord {
  id: number
  collection_id: number
  paper_id: number | null
  audio_slot: 'A' | 'B' | null
  title: string
  source_file_path: string
  source_file_hash: string
  file_name: string | null
  status: string
  imported_at: string
  updated_at: string
}

interface ExamContentSegmentRecord {
  id: number
  collection_id: number
  paper_id: number | null
  analysis_id: number | null
  audio_slot: 'A' | 'B' | null
  source_file_path: string
  source_file_hash: string
  page_no: number
  range_info: any
  content_type: CollectionContentType
  text_excerpt: string | null
  segment_order: number
  confidence: number
  status: CollectionSegmentStatus
  manual_override: number
  created_at: string
  updated_at: string
}

interface ExamCollectionSummary extends ExamCollectionRecord {
  papers: ExamCollectionPaper[]
  audio: ExamCollectionAudio[]
  analyses: ExamCollectionAnalysisRecord[]
  segmentCount: number
  pendingCount: number
}

interface PendingAnalysisImport {
  id: number
  source_file_path: string
  source_file_hash: string
  file_name: string
  exam_type: ExamPaperTypeKey
  year: number | null
  session: ExamSeasonKey
  set_no: number | null
  file_size: number
  page_count: number
  segment_count: number
  payload: any
  reason: string | null
  status: string
  created_at: string
  updated_at: string
}

interface ExamCollectionDetail extends ExamCollectionSummary {
  segments: ExamContentSegmentRecord[]
  sourceFiles: Array<{ path: string; hash: string; fileName: string }>
}

interface SemanticCollectionSegment {
  contentType: CollectionContentType
  pageNo: number
  rangeInfo: any
  textExcerpt: string
  confidence: number
  status: CollectionSegmentStatus
  segmentOrder: number
  setNo: number | null
  audioSlot: 'A' | 'B' | null
}

interface CollectionAudioAnalysisResult {
  filePath: string
  fileName: string
  examType: ExamPaperTypeKey
  year: number | null
  session: ExamSeasonKey
  audioSlot: 'A' | 'B' | null
  fileSize: number
}

interface CollectionPdfAnalysisResult {
  filePath: string
  fileName: string
  title: string
  fileHash: string
  fileSize: number
  pageCount: number
  metadata: {
    examType: ExamPaperTypeKey
    year: number | null
    session: ExamSeasonKey
    setNo: number | null
    audioSlot: 'A' | 'B' | null
    confidence: number
    examTypeConfidence: number
    yearConfidence: number
    sessionConfidence: number
    sources: string[]
  }
  segments: SemanticCollectionSegment[]
  requiresReview: boolean
  warnings: string[]
}

interface Cet4Api {
  getWords: (params: { limit: number; offset: number; level?: string }) => Promise<any[]>
  getDictionary: () => Promise<Array<{ word: string; pos: string | null; meaning_cn: string | null }>>
  getWordById: (id: number) => Promise<any>
  getNewWords: (limit: number) => Promise<any[]>
  searchWords: (query: string) => Promise<any[]>
  lookupWordOnline: (query: string) => Promise<any | null>
  translateSelection: (sentences: string[]) => Promise<any | null>

  requestSentenceAi: (payload: { provider: 'qwen' | 'deepseek' | 'glm' | 'deepseek-r1:8b' | 'qwen2.5:7b' | 'qwen2.5:14b'; apiKey: string; sentence: string; systemPrompt: string; schema: any; modelPath?: string }) => Promise<{ success: boolean; content?: string; message?: string }>
  listSentenceLocalModels: (payload?: { modelPath?: string }) => Promise<{ success: boolean; ollamaAvailable: boolean; installed: string[]; message?: string }>
  downloadSentenceLocalModel: (payload: { model: string; modelPath?: string }) => Promise<{ success: boolean; needsInstall?: boolean; message: string; output?: string }>
  installSentenceOllama: (payload?: { installPath?: string }) => Promise<{ success: boolean; message: string; ollamaAvailable?: boolean; installerPath?: string }>
  pickSentenceAiDirectory: (payload?: { title?: string; defaultPath?: string }) => Promise<{ success: boolean; path: string; canceled: boolean }>
  onSentenceOllamaInstallProgress: (callback: (progress: { phase: 'download' | 'verify' | 'install' | 'complete' | 'error'; percent: number; message: string }) => void) => () => void
  fetchTtsAudio: (payload: { text: string; accent: 'us' | 'uk' }) => Promise<{ success: boolean; audioBase64?: string; mimeType?: string; provider?: string; message?: string }>
  importWordbook: (words: any[]) => Promise<{ success: boolean; message: string; added: number }>
  importCustomWordbook: (payload: { name?: string; stage?: string; description?: string; sourceFile?: string; words: any[] }) => Promise<{ success: boolean; message: string; added: number; slug?: string; name?: string }>
  deleteCustomWordbook: (slug: string) => Promise<{ success: boolean; message: string }>
  getWordCount: () => Promise<number>
  getYesterdayWords: (limit: number) => Promise<any[]>
  getReviewWords: (limit: number) => Promise<any[]>
  getWordBooks: () => Promise<any[]>
  setWordBookEnabled: (params: { slug: string; enabled: boolean }) => Promise<{ success: boolean }>
  getEnabledWordCount: () => Promise<number>
  getLookupHistory: (limit?: number) => Promise<any[]>
  recordLookup: (entry: { word: string; meaningCn?: string; phoneticUs?: string; source?: string; context?: string }) => Promise<{ success: boolean }>
  deleteLookupHistory: (id: number) => Promise<{ success: boolean }>
  clearLookupHistory: () => Promise<{ success: boolean }>
  getAppVersion: () => Promise<string>
  checkForUpdate: (force?: boolean) => Promise<any>
  installUpdate: () => Promise<{ success: boolean; message: string }>
  updateWordProgress: (params: {
    wordId: number
    familiarity: number
    correct: boolean
  }) => Promise<any>
  getTodayPlan: () => Promise<any>
  completePlan: () => Promise<any>
  saveSettings: (settings: { newWordsTarget: number; reviewWordsTarget: number; listeningMinutes: number; readingMinutes: number }) => Promise<{ success: boolean; plan?: any }>
  getDashboardStats: () => Promise<any>
  getStudyHeatmap: () => Promise<any[]>
  getWeakWords: (limit: number) => Promise<any[]>
  getSkillAnalysis: () => Promise<any[]>
  getEfficiencyTrend: (days: number) => Promise<any[]>
  getMemoryDistribution: () => Promise<{ status: string; count: number }[]>
  recordPomodoro: () => Promise<{ success: boolean }>
  exportData: () => Promise<any>
  resetProgress: () => Promise<{ success: boolean }>
  startSession: (type: string) => Promise<any>
  updateSession: (params: { wordsStudied: number; durationSeconds: number }) => Promise<any>

  // 真题导入
  selectExamPdfs: () => Promise<{ success: boolean; canceled: boolean; filePaths: string[]; message?: string }>
  selectExamFolder: () => Promise<{ success: boolean; canceled: boolean; filePaths: string[]; truncated: boolean; message?: string }>
  inspectExamPdf: (filePath: string) => Promise<{ success: boolean; inspection?: ExamPdfInspectionResult; message?: string; filePath?: string }>
  detectExamOcrMetadata: (payload: { fileName: string; text: string }) => Promise<{ success: boolean; metadata?: {
    year: number | null
    season: ExamSeasonKey
    paperType: ExamPaperTypeKey
    detectionSource: ExamDetectionSourceKey
    textExcerpt: string
  }; message?: string }>
  readExamPdf: (filePath: string) => Promise<{ success: boolean; data: Uint8Array | null; message?: string }>
  getExamLibrary: () => Promise<{
    success: boolean
    documents: ExamLibraryDocument[]
    stats: { total: number; cet4: number; cet6: number; unclassified: number; totalBytes: number } | null
    storagePath: string
    message?: string
  }>
  importExamDocument: (input: {
    title: string
    fileName: string
    sourcePath: string
    fileHash: string
    fileSize: number
    pageCount: number
    year: number | null
    season: ExamSeasonKey
    paperType: ExamPaperTypeKey
    detectionSource: ExamDetectionSourceKey
    textExcerpt: string
    remark: string
  }) => Promise<{ success: boolean; duplicate?: boolean; message: string; document?: ExamLibraryDocument }>
  updateExamDocument: (payload: {
    id: number
    title?: string
    year?: number | null
    season?: ExamSeasonKey
    paperType?: ExamPaperTypeKey
    remark?: string
  }) => Promise<{ success: boolean; message?: string; document?: ExamLibraryDocument }>
  refreshExamDocumentMetadata: (id: number) => Promise<{ success: boolean; message?: string; document?: ExamLibraryDocument; needsOcr?: boolean }>
  openExamDocument: (id: number) => Promise<{ success: boolean; message?: string }>
  showExamDocument: (id: number) => Promise<{ success: boolean; message?: string }>
  openExamLibraryFolder: () => Promise<{ success: boolean; message?: string }>
  deleteExamDocument: (payload: { id: number; deleteFile?: boolean }) => Promise<{ success: boolean; message?: string }>

  // 真题合集与内容片段
  getExamAnnotations: (scopeKey: string) => Promise<{ success: boolean; annotations: any[]; message?: string }>
  addExamAnnotation: (payload: any) => Promise<{ success: boolean; id?: number; annotation?: any; message?: string }>
  updateExamAnnotationGeometry: (payload: { id: number; geometry: any }) => Promise<{ success: boolean; message?: string }>
  deleteExamAnnotation: (id: number) => Promise<{ success: boolean; message?: string }>
  pickCollectionPdfs: () => Promise<{ success: boolean; canceled: boolean; filePaths: string[] }>
  pickCollectionPdfFolder: () => Promise<{ success: boolean; canceled: boolean; folderPath: string; filePaths: string[]; warnings: string[]; truncated: boolean; message?: string }>
  pickCollectionAudio: () => Promise<{ success: boolean; canceled: boolean; filePath: string }>
  pickCollectionAudioFiles: () => Promise<{ success: boolean; canceled: boolean; filePaths: string[] }>
  analyzeCollectionPdf: (filePath: string) => Promise<{ success: boolean; analysis?: CollectionPdfAnalysisResult; duplicateCollectionId?: number | null; message?: string }>
  analyzeCollectionAudio: (filePath: string) => Promise<{ success: boolean; audio?: CollectionAudioAnalysisResult; message?: string }>
  saveCollectionAudioImport: (payload: any) => Promise<{ success: boolean; collectionId?: number; audio?: ExamCollectionAudio; duplicate?: boolean; message: string }>
  saveCollectionPdfImport: (payload: any) => Promise<{ success: boolean; duplicate?: boolean; pendingBinding?: boolean; pendingId?: number; bound?: boolean; paperNo?: number; collectionId?: number; collection?: ExamCollectionDetail; message: string }>
  getExamCollections: () => Promise<{ success: boolean; collections: ExamCollectionSummary[]; message?: string }>
  reorderExamCollections: (payload: { collectionIds: number[] }) => Promise<{ success: boolean; collections?: ExamCollectionSummary[]; message?: string }>
  getPendingAnalyses: () => Promise<{ success: boolean; pending: PendingAnalysisImport[]; message?: string }>
  bindPendingAnalysis: (payload: { pendingId: number; collectionId: number; paperNo: number }) => Promise<{ success: boolean; collectionId?: number; paperNo?: number; collection?: ExamCollectionDetail; message?: string }>
  discardPendingAnalysis: (pendingId: number) => Promise<{ success: boolean; message?: string }>
  getExamCollection: (id: number) => Promise<{ success: boolean; collection?: ExamCollectionDetail; message?: string }>
  updateExamCollectionMetadata: (payload: { collectionId: number; examType: ExamPaperTypeKey; year: number | null; session: ExamSeasonKey; title?: string }) => Promise<{ success: boolean; merged?: boolean; collection?: ExamCollectionDetail; message?: string }>
  importCollectionAudio: (payload: { collectionId: number; audioSlot: 'A' | 'B'; filePath: string }) => Promise<{ success: boolean; audio?: ExamCollectionAudio; duplicate?: boolean; message: string }>
  getCollectionAudioData: (payload: { collectionId: number; audioSlot: 'A' | 'B' }) => Promise<{ success: boolean; audio?: ExamCollectionAudio; data?: Uint8Array; mimeType?: string; message?: string }>
  removeCollectionAudio: (payload: { collectionId: number; audioSlot: 'A' | 'B' }) => Promise<{ success: boolean; message?: string }>
  extractExamSegmentText: (payload: { filePath: string; pageNo: number; rects: any[] }) => Promise<{ success: boolean; text?: string; message?: string }>
  createManualExamSegment: (payload: any) => Promise<{ success: boolean; segment?: ExamContentSegmentRecord; collection?: ExamCollectionDetail; message?: string }>
  updateExamSegment: (payload: any) => Promise<{ success: boolean; segment?: ExamContentSegmentRecord; collection?: ExamCollectionDetail; message?: string }>
  deleteExamSegment: (segmentId: number) => Promise<{ success: boolean; message?: string }>
  readCollectionSourcePdf: (filePath: string) => Promise<{ success: boolean; data?: Uint8Array; message?: string }>
  showCollectionSource: (filePath: string) => Promise<{ success: boolean; message?: string }>
  deleteExamCollection: (collectionId: number) => Promise<{ success: boolean; message?: string }>

  // 真题资源集
  selectExamResourceFiles: () => Promise<{ success: boolean; canceled: boolean; filePaths: string[]; message?: string }>
  selectExamResourceFolder: () => Promise<{ success: boolean; canceled: boolean; filePaths: string[]; rootPath: string; truncated: boolean; message?: string }>
  selectExamResourceFile: (role: ExamResourceRoleKey) => Promise<{ success: boolean; canceled: boolean; filePath: string; message?: string }>
  scanExamResourceFiles: (payload: { filePaths: string[]; rootPath?: string }) => Promise<{
    success: boolean
    result?: ExamResourceScanResult
    message?: string
  }>
  beginExamResourceBatch: (payload: { rootPath?: string; importMode?: string; totalSets?: number }) => Promise<{ success: boolean; batchId?: number; message?: string }>
  finishExamResourceBatch: (payload: { batchId: number; imported: number; skipped: number; failed: number; details?: unknown }) => Promise<{ success: boolean; message?: string }>
  importExamResourceSet: (input: {
    batchId?: number | null
    title: string
    paperType: ExamPaperTypeKey
    year: number | null
    season: ExamSeasonKey
    setNo: number | null
    remark?: string
    text: ExamResourceCandidate
    audio?: ExamResourceCandidate | null
    analysis?: ExamResourceCandidate | null
  }) => Promise<{ success: boolean; duplicate?: boolean; message: string; set?: ExamSetRecord }>
  replaceExamResource: (payload: { paperId: number; role: ExamResourceRoleKey; filePath: string }) => Promise<{ success: boolean; message?: string; set?: ExamSetRecord }>
  removeExamResource: (payload: { paperId: number; role: ExamResourceRoleKey }) => Promise<{ success: boolean; message?: string; set?: ExamSetRecord }>
  getExamSets: () => Promise<{
    success: boolean
    sets: ExamSetRecord[]
    stats: {
      total: number; complete: number; cet4: number; cet6: number; postgrad: number
      ielts: number; toefl: number; missingAudio: number; missingAnalysis: number
    }
    storagePath: string
  }>
  updateExamSet: (payload: {
    id: number
    title?: string
    paperType?: ExamPaperTypeKey
    year?: number | null
    season?: ExamSeasonKey
    setNo?: number | null
    variant?: string
    remark?: string
  }) => Promise<{ success: boolean; message?: string; set?: ExamSetRecord }>
  deleteExamSet: (payload: { id: number; deleteFiles?: boolean }) => Promise<{ success: boolean; message?: string }>
  showExamSetInFolder: (id: number) => Promise<{ success: boolean; message?: string }>
  getExamResourceData: (payload: { paperId: number; role: ExamResourceRoleKey }) => Promise<{
    success: boolean
    message?: string
    resource?: ExamResourceRecord
    kind?: 'pdf' | 'audio' | 'text'
    mimeType?: string
    data?: Uint8Array | string
  }>
  saveExamReaderState: (payload: { paperId: number; mode: 'single' | 'compare'; position?: unknown }) => Promise<{ success: boolean; message?: string }>

  // 旧版真题接口
  importExamPaper: (data: {
    title: string
    year?: number
    season?: string
    source?: string
    questions: {
      section_type: string
      question_order?: number
      passage?: string
      question_text: string
      options?: string[] | Record<string, string>
      answer?: string
      explanation?: string
    }[]
  }) => Promise<{ success: boolean; message: string; paperId: number; questionCount: number }>
  importExamPdf: (filePath: string) => Promise<{
    success: boolean
    message: string
    paperId: number
    questionCount: number
    parsed: { title: string; sections: { type: string; label: string; count: number }[] } | null
  }>
  getExamPapers: () => Promise<any[]>
  getExamPaperById: (id: number) => Promise<any>
  getExamQuestions: (params: { paperId: number; sectionType?: string }) => Promise<any[]>
  getExamQuestionsBySection: (params: { sectionType: string; limit?: number }) => Promise<any[]>
  getExamPaperStats: (paperId: number) => Promise<{ section_type: string; count: number }[]>
  deleteExamPaper: (id: number) => Promise<{ success: boolean }>
  getExamQuestionCount: (sectionType?: string) => Promise<number>
  getExamSectionCounts: () => Promise<{ section_type: string; count: number }[]>

  // 错题
  saveExamWrongAnswers: (paperId: number, wrongs: { questionId: number; sectionType: string; userAnswer: string; correctAnswer: string }[]) => Promise<{ success: boolean }>
  getExamWrongAnswers: (filters?: { paperId?: number; sectionType?: string }) => Promise<any[]>
  getExamWrongAnswerCount: (filters?: { paperId?: number; sectionType?: string }) => Promise<number>
  deleteExamWrongAnswer: (id: number) => Promise<{ success: boolean }>

  // 听力音频
  saveExamAudio: (paperId: number, filePath: string, fileName: string) => Promise<{ success: boolean }>
  getExamAudio: (paperId: number) => Promise<any[]>
  deleteExamAudio: (id: number) => Promise<{ success: boolean }>

  // 生词本
  addVocabWord: (word: { wordId?: number; wordText: string; meaningCn?: string; phoneticUs?: string; source?: string; context?: string }) => Promise<{ success: boolean }>
  getVocabWords: () => Promise<any[]>
  deleteVocabWord: (id: number) => Promise<{ success: boolean }>
  getVocabWordCount: () => Promise<number>

  // 阅读文章
  getReadingPassages: (params: { topic?: string; limit?: number }) => Promise<any[]>
  getReadingTopics: () => Promise<{ topic: string; count: number }[]>
  getReadingCount: () => Promise<number>
  importReadingPassages: (passages: any[]) => Promise<{ success: boolean; message: string; added: number }>
  deleteReadingPassage: (id: number) => Promise<{ success: boolean }>

  // 翻译句子
  getTranslationSentences: (params: { topic?: string; limit?: number }) => Promise<any[]>
  getTranslationTopics: () => Promise<{ topic: string; count: number }[]>
  getTranslationCount: () => Promise<number>
  importTranslationSentences: (sentences: any[]) => Promise<{ success: boolean; message: string; added: number }>
  deleteTranslationSentence: (id: number) => Promise<{ success: boolean }>

  // 写作历史
  saveWritingHistory: (data: {
    topic: string; prompt?: string; essay_text: string; word_count: number
    total_score: number; keyword_score: number; structure_score: number; length_score: number; feedback?: string[]
  }) => Promise<{ success: boolean; id: number }>
  getWritingHistory: (limit?: number) => Promise<any[]>
  deleteWritingHistory: (id: number) => Promise<{ success: boolean }>
  getWritingStats: () => Promise<{ count: number; avgScore: number }>

  // 学习提醒
  getReminders: () => Promise<any[]>
  addReminder: (data: { hour: number; minute: number; message?: string }) => Promise<{ success: boolean; id: number }>
  updateReminder: (id: number, data: { hour?: number; minute?: number; message?: string; enabled?: number }) => Promise<{ success: boolean }>
  toggleReminder: (id: number) => Promise<{ success: boolean }>
  deleteReminder: (id: number) => Promise<{ success: boolean }>

  // 对话框 & 文件工具
  openFileDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>
  openAudioFileDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>
  getFilePath: (file: File) => string

  // 文献阅读
  getDefaultLiteraturePath: () => Promise<string>
  chooseLiteratureDirectory: (currentPath?: string) => Promise<{ success: boolean; canceled?: boolean; path?: string }>
  listLiterature: () => Promise<any[]>
  getLiterature: (id: number) => Promise<any>
  touchLiterature: (id: number) => Promise<{ success: boolean }>
  setLiteratureAutoImportWatch: (payload: { enabled: boolean; path: string }) => Promise<{ success: boolean; message: string; count?: number }>
  onLiteratureChanged: (callback: (item: any) => void) => () => void
  chooseLiteratureFile: (storagePath?: string) => Promise<{ success: boolean; canceled?: boolean; item?: any; message?: string }>
  importLiteraturePath: (payload: { path: string; storagePath?: string }) => Promise<{ success: boolean; item?: any; message?: string }>
  deleteLiterature: (id: number) => Promise<{ success: boolean }>
  showLiteratureInFolder: (id: number) => Promise<{ success: boolean; message?: string }>
  renameLiteratureFile: (payload: { id: number; name: string }) => Promise<{ success: boolean; item?: any; message?: string }>
  readLiteratureFile: (id: number) => Promise<Uint8Array>
  openLiteratureUrl: (url: string) => Promise<{ success: boolean; message?: string }>
  getLiteratureAnnotations: (itemId: number) => Promise<any[]>
  addLiteratureAnnotation: (input: { itemId: number; annotationType?: 'highlight' | 'underline' | 'note' | 'text' | 'drawing'; pageNumber?: number; quote?: string; note?: string; color?: string; geometry?: any }) => Promise<{ success: boolean; annotation: any }>
  updateLiteratureAnnotationGeometry: (payload: { id: number; geometry: any }) => Promise<{ success: boolean; annotation?: any; message?: string }>
  deleteLiteratureAnnotation: (id: number) => Promise<{ success: boolean }>

  // 日活统计（本地数据库）
  getActivitySummary: () => Promise<ActivitySummaryResult>
  clearActivityStats: () => Promise<{ success: boolean; message?: string }>
}

interface DailyActivityPoint {
  date: string
  label: string
  active: number
}

interface ActivitySummary {
  totalActiveDays: number
  totalLaunches: number
  last7Days: DailyActivityPoint[]
}

interface ActivitySummaryResult {
  success: boolean
  summary: ActivitySummary | null
  message?: string
}

interface Window {
  cet4Api: Cet4Api
}
