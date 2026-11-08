import { contextBridge, ipcRenderer, webUtils } from 'electron'

function toIpcValue(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date) return new Date(value.getTime())
  if (value instanceof ArrayBuffer) return value.slice(0)
  if (ArrayBuffer.isView(value)) return value
  const cached = seen.get(value)
  if (cached !== undefined) return cached
  if (Array.isArray(value)) {
    const copy: unknown[] = []
    seen.set(value, copy)
    for (const item of value) copy.push(toIpcValue(item, seen))
    return copy
  }
  const copy: Record<string, unknown> = {}
  seen.set(value, copy)
  for (const [key, item] of Object.entries(value)) copy[key] = toIpcValue(item, seen)
  return copy
}

const invokeIpc = (channel: string, ...args: unknown[]): Promise<any> =>
  ipcRenderer.invoke(channel, ...args.map(value => toIpcValue(value)))

const api: Record<string, (...args: any[]) => any> = {}

// 单词
api.getWords = (params: { limit: number; offset: number; level?: string }) =>
  invokeIpc('words:get', params)
api.getDictionary = () => invokeIpc('words:getDictionary')
api.getWordById = (id: number) => invokeIpc('words:getById', id)
api.getNewWords = (limit: number) => invokeIpc('words:getNew', limit)
api.searchWords = (query: string) => invokeIpc('words:search', query)
api.lookupWordOnline = (query: string) => invokeIpc('dictionary:lookup', query)
api.translateSelection = (sentences: string[]) => invokeIpc('sentence:translate', sentences)
api.requestSentenceAi = (payload: any) => invokeIpc('sentence-ai:request', payload)
api.listSentenceLocalModels = (payload?: { modelPath?: string }) => invokeIpc('sentence-ai:local-models', payload || {})
api.downloadSentenceLocalModel = (payload: { model: string; modelPath?: string }) => invokeIpc('sentence-ai:download-local-model', payload)
api.installSentenceOllama = (payload?: { installPath?: string }) => invokeIpc('sentence-ai:install-ollama', payload || {})
api.pickSentenceAiDirectory = (payload?: { title?: string; defaultPath?: string }) => invokeIpc('sentence-ai:pick-directory', payload || {})
api.onSentenceOllamaInstallProgress = (callback: (progress: any) => void) => {
  const listener = (_event: Electron.IpcRendererEvent, progress: any) => callback(progress)
  ipcRenderer.on('sentence-ai:ollama-install-progress', listener)
  return () => ipcRenderer.removeListener('sentence-ai:ollama-install-progress', listener)
}
api.fetchTtsAudio = (payload: { text: string; accent: 'us' | 'uk' }) => invokeIpc('tts:fetch', payload)
api.importWordbook = (words: any[]) => invokeIpc('words:importWordbook', words)
api.importCustomWordbook = (payload: any) => invokeIpc('words:importCustomBook', payload)
api.deleteCustomWordbook = (slug: string) => invokeIpc('words:deleteCustomBook', slug)
api.getWordCount = () => invokeIpc('words:getWordCount')
api.getYesterdayWords = (limit: number) => invokeIpc('words:getYesterdayWords', limit)
api.getReviewWords = (limit: number) => invokeIpc('words:getReview', limit)
// 词书
api.getWordBooks = () => invokeIpc('words:getBooks')
api.setWordBookEnabled = (params: { slug: string; enabled: boolean }) => invokeIpc('words:setBookEnabled', params)
api.getEnabledWordCount = () => invokeIpc('words:getEnabledCount')
// 查词历史
api.getLookupHistory = (limit: number) => invokeIpc('lookupHistory:get', limit)
api.recordLookup = (entry: any) => invokeIpc('lookupHistory:record', entry)
api.deleteLookupHistory = (id: number) => invokeIpc('lookupHistory:delete', id)
api.clearLookupHistory = () => invokeIpc('lookupHistory:clear')
// 软件更新
api.getAppVersion = () => invokeIpc('update:getVersion')
api.checkForUpdate = (force?: boolean) => invokeIpc('update:check', force)
api.installUpdate = () => invokeIpc('update:install')

// 学习记录
api.updateWordProgress = (params: { wordId: number; familiarity: number; correct: boolean }) =>
  invokeIpc('study:updateProgress', params)

// 每日计划
api.getTodayPlan = () => invokeIpc('plan:getToday')
api.completePlan = () => invokeIpc('plan:complete')
api.saveSettings = (settings: { newWordsTarget: number; reviewWordsTarget: number; listeningMinutes: number; readingMinutes: number }) =>
  invokeIpc('settings:save', settings)

// 统计
api.getDashboardStats = () => invokeIpc('stats:dashboard')
api.getStudyHeatmap = () => invokeIpc('stats:heatmap')
api.getWeakWords = (limit: number) => invokeIpc('stats:weakWords', limit)
api.getSkillAnalysis = () => invokeIpc('stats:analysis')
api.getEfficiencyTrend = (days: number) => invokeIpc('stats:efficiency', days)
api.getMemoryDistribution = () => invokeIpc('stats:memoryDistribution')
api.recordPomodoro = () => invokeIpc('stats:recordPomodoro')
api.exportData = () => invokeIpc('data:export')
api.resetProgress = () => invokeIpc('data:resetProgress')

// 学习会话
api.startSession = (type: string) => invokeIpc('study:startSession', type)
api.updateSession = (params: { wordsStudied: number; durationSeconds: number }) =>
  invokeIpc('study:updateSession', params)

// 对话框 & 文件工具
api.openFileDialog = () => invokeIpc('dialog:openFile')
api.openAudioFileDialog = () => invokeIpc('dialog:openAudioFile')
api.getFilePath = (file: File) => webUtils.getPathForFile(file)
// 文献模板
api.getDefaultLiteraturePath = () => invokeIpc('literature:getDefaultPath')
api.chooseLiteratureDirectory = (currentPath?: string) => invokeIpc('literature:chooseDirectory', currentPath)
api.listLiterature = () => invokeIpc('literature:list')
api.getLiterature = (id: number) => invokeIpc('literature:get', id)
api.touchLiterature = (id: number) => invokeIpc('literature:touch', id)
api.setLiteratureAutoImportWatch = (payload: { enabled: boolean; path: string }) => invokeIpc('literature:setAutoImportWatch', payload)
api.onLiteratureChanged = (callback: (item: any) => void) => {
  const listener = (_event: any, item: any) => callback(item)
  ipcRenderer.on('literature:changed', listener)
  return () => ipcRenderer.removeListener('literature:changed', listener)
}
api.chooseLiteratureFile = (storagePath?: string) => invokeIpc('literature:chooseFile', storagePath)
api.importLiteraturePath = (payload: { path: string; storagePath?: string }) => invokeIpc('literature:importPath', payload)
api.deleteLiterature = (id: number) => invokeIpc('literature:delete', id)
api.showLiteratureInFolder = (id: number) => invokeIpc('literature:showInFolder', id)
api.renameLiteratureFile = (payload: { id: number; name: string }) => invokeIpc('literature:renameFile', payload)
api.readLiteratureFile = (id: number) => invokeIpc('literature:readFile', id)
api.openLiteratureUrl = (url: string) => invokeIpc('literature:openUrl', url)
api.getLiteratureAnnotations = (itemId: number) => invokeIpc('literature:getAnnotations', itemId)
api.addLiteratureAnnotation = (input: any) => invokeIpc('literature:addAnnotation', input)
api.updateLiteratureAnnotationGeometry = (payload: any) => invokeIpc('literature:updateAnnotationGeometry', payload)
api.deleteLiteratureAnnotation = (id: number) => invokeIpc('literature:deleteAnnotation', id)

// 真题导入
api.selectExamPdfs = () => invokeIpc('exam:selectPdfs')
api.selectExamFolder = () => invokeIpc('exam:selectFolder')
api.inspectExamPdf = (filePath: string) => invokeIpc('exam:inspectPdf', filePath)
api.detectExamOcrMetadata = (payload: { fileName: string; text: string }) => invokeIpc('exam:detectOcrMetadata', payload)
api.readExamPdf = (filePath: string) => invokeIpc('exam:readPdf', filePath)
api.getExamLibrary = () => invokeIpc('exam:library:list')
api.importExamDocument = (input: any) => invokeIpc('exam:library:import', input)
api.updateExamDocument = (payload: any) => invokeIpc('exam:library:update', payload)
api.refreshExamDocumentMetadata = (id: number) => invokeIpc('exam:library:refreshMetadata', id)
api.openExamDocument = (id: number) => invokeIpc('exam:library:open', id)
api.showExamDocument = (id: number) => invokeIpc('exam:library:show', id)
api.openExamLibraryFolder = () => invokeIpc('exam:library:openFolder')
api.deleteExamDocument = (payload: { id: number; deleteFile?: boolean }) => invokeIpc('exam:library:delete', payload)

// 真题资源集
api.selectExamResourceFiles = () => invokeIpc('exam:resources:pickFiles')
api.selectExamResourceFolder = () => invokeIpc('exam:resources:pickFolder')
api.selectExamResourceFile = (role: string) => invokeIpc('exam:resources:pickOne', role)
api.scanExamResourceFiles = (payload: any) => invokeIpc('exam:resources:scan', payload)
api.beginExamResourceBatch = (payload: any) => invokeIpc('exam:batches:begin', payload)
api.finishExamResourceBatch = (payload: any) => invokeIpc('exam:batches:finish', payload)
api.importExamResourceSet = (input: any) => invokeIpc('exam:resources:importSet', input)
api.replaceExamResource = (payload: any) => invokeIpc('exam:resources:replace', payload)
api.removeExamResource = (payload: any) => invokeIpc('exam:resources:remove', payload)
api.getExamSets = () => invokeIpc('exam:sets:list')
api.updateExamSet = (payload: any) => invokeIpc('exam:sets:update', payload)
api.deleteExamSet = (payload: any) => invokeIpc('exam:sets:delete', payload)
api.showExamSetInFolder = (id: number) => invokeIpc('exam:sets:showInFolder', id)
api.getExamResourceData = (payload: any) => invokeIpc('exam:sets:resourceData', payload)
api.saveExamReaderState = (payload: any) => invokeIpc('exam:reader:saveState', payload)

// 真题合集与内容片段
api.getExamAnnotations = (scopeKey: string) => invokeIpc('exam:annotations:list', scopeKey)
api.addExamAnnotation = (payload: any) => invokeIpc('exam:annotations:add', payload)
api.updateExamAnnotationGeometry = (payload: any) => invokeIpc('exam:annotations:updateGeometry', payload)
api.deleteExamAnnotation = (id: number) => invokeIpc('exam:annotations:delete', id)
api.pickCollectionPdfs = () => invokeIpc('exam:collections:pickPdfs')
api.pickCollectionPdfFolder = () => invokeIpc('exam:collections:pickPdfFolder')
api.pickCollectionAudio = () => invokeIpc('exam:collections:pickAudio')
api.pickCollectionAudioFiles = () => invokeIpc('exam:collections:pickAudioFiles')
api.analyzeCollectionPdf = (filePath: string) => invokeIpc('exam:collections:analyzePdf', filePath)
api.analyzeCollectionAudio = (filePath: string) => invokeIpc('exam:collections:analyzeAudio', filePath)
api.saveCollectionAudioImport = (payload: any) => invokeIpc('exam:collections:saveAudioImport', payload)
api.saveCollectionPdfImport = (payload: any) => invokeIpc('exam:collections:savePdfImport', payload)
api.getExamCollections = () => invokeIpc('exam:collections:list')
api.reorderExamCollections = (payload: any) => invokeIpc('exam:collections:reorder', payload)
api.getPendingAnalyses = () => invokeIpc('exam:collections:pendingAnalysis')
api.bindPendingAnalysis = (payload: any) => invokeIpc('exam:collections:bindAnalysis', payload)
api.discardPendingAnalysis = (pendingId: number) => invokeIpc('exam:collections:discardPendingAnalysis', pendingId)
api.getExamCollection = (id: number) => invokeIpc('exam:collections:get', id)
api.updateExamCollectionMetadata = (payload: any) => invokeIpc('exam:collections:updateMetadata', payload)
api.importCollectionAudio = (payload: any) => invokeIpc('exam:collections:importAudio', payload)
api.getCollectionAudioData = (payload: any) => invokeIpc('exam:collections:audioData', payload)
api.removeCollectionAudio = (payload: any) => invokeIpc('exam:collections:removeAudio', payload)
api.extractExamSegmentText = (payload: any) => invokeIpc('exam:segments:extractText', payload)
api.createManualExamSegment = (payload: any) => invokeIpc('exam:segments:createManual', payload)
api.updateExamSegment = (payload: any) => invokeIpc('exam:segments:update', payload)
api.deleteExamSegment = (segmentId: number) => invokeIpc('exam:segments:delete', segmentId)
api.readCollectionSourcePdf = (filePath: string) => invokeIpc('exam:collections:readSourcePdf', filePath)
api.showCollectionSource = (filePath: string) => invokeIpc('exam:collections:showSource', filePath)
api.deleteExamCollection = (collectionId: number) => invokeIpc('exam:collections:delete', collectionId)

// 旧版真题练习接口保留用于历史数据兼容
api.importExamPaper = (data: any) => invokeIpc('exam:importPaper', data)
api.importExamPdf = (filePath: string) => invokeIpc('exam:importPdf', filePath)
api.getExamPapers = () => invokeIpc('exam:getPapers')
api.getExamPaperById = (id: number) => invokeIpc('exam:getPaperById', id)
api.getExamQuestions = (params: { paperId: number; sectionType?: string }) =>
  invokeIpc('exam:getQuestions', params)
api.getExamQuestionsBySection = (params: { sectionType: string; limit?: number }) =>
  invokeIpc('exam:getQuestionsBySection', params)
api.getExamPaperStats = (paperId: number) => invokeIpc('exam:getPaperStats', paperId)
api.deleteExamPaper = (id: number) => invokeIpc('exam:deletePaper', id)
api.getExamQuestionCount = (sectionType?: string) => invokeIpc('exam:getQuestionCount', sectionType)
api.getExamSectionCounts = () => invokeIpc('exam:getSectionCounts')

// 错题
api.saveExamWrongAnswers = (paperId: number, wrongs: any[]) =>
  invokeIpc('exam:saveWrongAnswers', paperId, wrongs)
api.getExamWrongAnswers = (filters?: { paperId?: number; sectionType?: string }) =>
  invokeIpc('exam:getWrongAnswers', filters)
api.getExamWrongAnswerCount = (filters?: { paperId?: number; sectionType?: string }) =>
  invokeIpc('exam:getWrongAnswerCount', filters)
api.deleteExamWrongAnswer = (id: number) => invokeIpc('exam:deleteWrongAnswer', id)

// 听力音频
api.saveExamAudio = (paperId: number, filePath: string, fileName: string) =>
  invokeIpc('exam:saveAudio', paperId, filePath, fileName)
api.getExamAudio = (paperId: number) => invokeIpc('exam:getAudio', paperId)
api.deleteExamAudio = (id: number) => invokeIpc('exam:deleteAudio', id)

// 生词本
api.addVocabWord = (word: any) => invokeIpc('exam:addVocabWord', word)
api.getVocabWords = () => invokeIpc('exam:getVocabWords')
api.deleteVocabWord = (id: number) => invokeIpc('exam:deleteVocabWord', id)
api.getVocabWordCount = () => invokeIpc('exam:getVocabWordCount')

// 阅读文章
api.getReadingPassages = (params: { topic?: string; limit?: number }) =>
  invokeIpc('reading:getPassages', params)
api.getReadingTopics = () => invokeIpc('reading:getTopics')
api.getReadingCount = () => invokeIpc('reading:getCount')
api.importReadingPassages = (passages: any[]) => invokeIpc('reading:import', passages)
api.deleteReadingPassage = (id: number) => invokeIpc('reading:delete', id)

// 翻译句子
api.getTranslationSentences = (params: { topic?: string; limit?: number }) =>
  invokeIpc('translation:getSentences', params)
api.getTranslationTopics = () => invokeIpc('translation:getTopics')
api.getTranslationCount = () => invokeIpc('translation:getCount')
api.importTranslationSentences = (sentences: any[]) => invokeIpc('translation:import', sentences)
api.deleteTranslationSentence = (id: number) => invokeIpc('translation:delete', id)

// 写作历史
api.saveWritingHistory = (data: any) => invokeIpc('writing:save', data)
api.getWritingHistory = (limit?: number) => invokeIpc('writing:getHistory', limit)
api.deleteWritingHistory = (id: number) => invokeIpc('writing:deleteHistory', id)
api.getWritingStats = () => invokeIpc('writing:getStats')

// 学习提醒
api.getReminders = () => invokeIpc('reminder:getAll')
api.addReminder = (data: { hour: number; minute: number; message?: string }) =>
  invokeIpc('reminder:add', data)
api.updateReminder = (id: number, data: { hour?: number; minute?: number; message?: string; enabled?: number }) =>
  invokeIpc('reminder:update', id, data)
api.toggleReminder = (id: number) => invokeIpc('reminder:toggle', id)
api.deleteReminder = (id: number) => invokeIpc('reminder:delete', id)

// 日活统计（本地数据库）
api.getActivitySummary = () => invokeIpc('activity:getSummary')
api.clearActivityStats = () => invokeIpc('activity:clear')

contextBridge.exposeInMainWorld('cet4Api', api)
