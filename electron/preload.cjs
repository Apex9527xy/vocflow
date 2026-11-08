"use strict";
const { contextBridge, ipcRenderer, webUtils } = require("electron");

function toIpcValue(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (ArrayBuffer.isView(value)) return value;
  const cached = seen.get(value);
  if (cached !== undefined) return cached;
  if (Array.isArray(value)) {
    const copy = [];
    seen.set(value, copy);
    for (const item of value) copy.push(toIpcValue(item, seen));
    return copy;
  }
  const copy = {};
  seen.set(value, copy);
  for (const [key, item] of Object.entries(value)) copy[key] = toIpcValue(item, seen);
  return copy;
}

function invokeIpc(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args.map(value => toIpcValue(value)));
}

const api = {
  getWords: function(params) { return invokeIpc("words:get", params); },
  getDictionary: function() { return invokeIpc("words:getDictionary"); },
  getWordById: function(id) { return invokeIpc("words:getById", id); },
  getNewWords: function(limit) { return invokeIpc("words:getNew", limit); },
  searchWords: function(query) { return invokeIpc("words:search", query); },
  lookupWordOnline: function(query) { return invokeIpc("dictionary:lookup", query); },
  translateSelection: function(sentences) { return invokeIpc("sentence:translate", sentences); },
  requestSentenceAi: function(payload) { return invokeIpc("sentence-ai:request", payload); },
  listSentenceLocalModels: function(payload) { return invokeIpc("sentence-ai:local-models", payload || {}); },
  downloadSentenceLocalModel: function(payload) { return invokeIpc("sentence-ai:download-local-model", payload); },
  installSentenceOllama: function(payload) { return invokeIpc("sentence-ai:install-ollama", payload || {}); },
  pickSentenceAiDirectory: function(payload) { return invokeIpc("sentence-ai:pick-directory", payload || {}); },
  onSentenceOllamaInstallProgress: function(callback) { const listener = (_event, progress) => callback(progress); ipcRenderer.on("sentence-ai:ollama-install-progress", listener); return () => ipcRenderer.removeListener("sentence-ai:ollama-install-progress", listener); },
  fetchTtsAudio: function(payload) { return invokeIpc("tts:fetch", payload); },
  importWordbook: function(words) { return invokeIpc("words:importWordbook", words); },
  importCustomWordbook: function(payload) { return invokeIpc("words:importCustomBook", payload); },
  deleteCustomWordbook: function(slug) { return invokeIpc("words:deleteCustomBook", slug); },
  getWordCount: function() { return invokeIpc("words:getWordCount"); },
  getYesterdayWords: function(limit) { return invokeIpc("words:getYesterdayWords", limit); },
  getReviewWords: function(limit) { return invokeIpc("words:getReview", limit); },
  getWordBooks: function() { return invokeIpc("words:getBooks"); },
  setWordBookEnabled: function(params) { return invokeIpc("words:setBookEnabled", params); },
  getEnabledWordCount: function() { return invokeIpc("words:getEnabledCount"); },
  getLookupHistory: function(limit) { return invokeIpc("lookupHistory:get", limit); },
  recordLookup: function(entry) { return invokeIpc("lookupHistory:record", entry); },
  deleteLookupHistory: function(id) { return invokeIpc("lookupHistory:delete", id); },
  clearLookupHistory: function() { return invokeIpc("lookupHistory:clear"); },
  getAppVersion: function() { return invokeIpc("update:getVersion"); },
  checkForUpdate: function(force) { return invokeIpc("update:check", force); },
  installUpdate: function() { return invokeIpc("update:install"); },

  updateWordProgress: function(params) { return invokeIpc("study:updateProgress", params); },

  getTodayPlan: function() { return invokeIpc("plan:getToday"); },
  completePlan: function() { return invokeIpc("plan:complete"); },
  saveSettings: function(settings) { return invokeIpc("settings:save", settings); },

  getDashboardStats: function() { return invokeIpc("stats:dashboard"); },
  getStudyHeatmap: function() { return invokeIpc("stats:heatmap"); },
  getWeakWords: function(limit) { return invokeIpc("stats:weakWords", limit); },
  getSkillAnalysis: function() { return invokeIpc("stats:analysis"); },
  getEfficiencyTrend: function(days) { return invokeIpc("stats:efficiency", days); },
  getMemoryDistribution: function() { return invokeIpc("stats:memoryDistribution"); },
  recordPomodoro: function() { return invokeIpc("stats:recordPomodoro"); },
  exportData: function() { return invokeIpc("data:export"); },
  resetProgress: function() { return invokeIpc("data:resetProgress"); },

  startSession: function(type) { return invokeIpc("study:startSession", type); },
  updateSession: function(params) { return invokeIpc("study:updateSession", params); },

  openFileDialog: function() { return invokeIpc("dialog:openFile"); },
  openAudioFileDialog: function() { return invokeIpc("dialog:openAudioFile"); },
  getFilePath: function(file) { return webUtils.getPathForFile(file); },
  getDefaultLiteraturePath: function() { return invokeIpc("literature:getDefaultPath"); },
  chooseLiteratureDirectory: function(currentPath) { return invokeIpc("literature:chooseDirectory", currentPath); },
  listLiterature: function() { return invokeIpc("literature:list"); },
  getLiterature: function(id) { return invokeIpc("literature:get", id); },
  touchLiterature: function(id) { return invokeIpc("literature:touch", id); },
  setLiteratureAutoImportWatch: function(payload) { return invokeIpc("literature:setAutoImportWatch", payload); },
  onLiteratureChanged: function(callback) { const listener = function(_event, item) { callback(item); }; ipcRenderer.on("literature:changed", listener); return function() { ipcRenderer.removeListener("literature:changed", listener); }; },
  chooseLiteratureFile: function(storagePath) { return invokeIpc("literature:chooseFile", storagePath); },
  importLiteraturePath: function(payload) { return invokeIpc("literature:importPath", payload); },
  deleteLiterature: function(id) { return invokeIpc("literature:delete", id); },
  showLiteratureInFolder: function(id) { return invokeIpc("literature:showInFolder", id); },
  renameLiteratureFile: function(payload) { return invokeIpc("literature:renameFile", payload); },
  readLiteratureFile: function(id) { return invokeIpc("literature:readFile", id); },
  openLiteratureUrl: function(url) { return invokeIpc("literature:openUrl", url); },
  getLiteratureAnnotations: function(itemId) { return invokeIpc("literature:getAnnotations", itemId); },
  addLiteratureAnnotation: function(input) { return invokeIpc("literature:addAnnotation", input); },
  updateLiteratureAnnotationGeometry: function(payload) { return invokeIpc("literature:updateAnnotationGeometry", payload); },
  deleteLiteratureAnnotation: function(id) { return invokeIpc("literature:deleteAnnotation", id); },

  selectExamPdfs: function() { return invokeIpc("exam:selectPdfs"); },
  selectExamFolder: function() { return invokeIpc("exam:selectFolder"); },
  inspectExamPdf: function(filePath) { return invokeIpc("exam:inspectPdf", filePath); },
  detectExamOcrMetadata: function(payload) { return invokeIpc("exam:detectOcrMetadata", payload); },
  readExamPdf: function(filePath) { return invokeIpc("exam:readPdf", filePath); },
  getExamLibrary: function() { return invokeIpc("exam:library:list"); },
  importExamDocument: function(input) { return invokeIpc("exam:library:import", input); },
  updateExamDocument: function(payload) { return invokeIpc("exam:library:update", payload); },
  refreshExamDocumentMetadata: function(id) { return invokeIpc("exam:library:refreshMetadata", id); },
  openExamDocument: function(id) { return invokeIpc("exam:library:open", id); },
  showExamDocument: function(id) { return invokeIpc("exam:library:show", id); },
  openExamLibraryFolder: function() { return invokeIpc("exam:library:openFolder"); },
  deleteExamDocument: function(payload) { return invokeIpc("exam:library:delete", payload); },

  selectExamResourceFiles: function() { return invokeIpc("exam:resources:pickFiles"); },
  selectExamResourceFolder: function() { return invokeIpc("exam:resources:pickFolder"); },
  selectExamResourceFile: function(role) { return invokeIpc("exam:resources:pickOne", role); },
  scanExamResourceFiles: function(payload) { return invokeIpc("exam:resources:scan", payload); },
  beginExamResourceBatch: function(payload) { return invokeIpc("exam:batches:begin", payload); },
  finishExamResourceBatch: function(payload) { return invokeIpc("exam:batches:finish", payload); },
  importExamResourceSet: function(input) { return invokeIpc("exam:resources:importSet", input); },
  replaceExamResource: function(payload) { return invokeIpc("exam:resources:replace", payload); },
  removeExamResource: function(payload) { return invokeIpc("exam:resources:remove", payload); },
  getExamSets: function() { return invokeIpc("exam:sets:list"); },
  updateExamSet: function(payload) { return invokeIpc("exam:sets:update", payload); },
  deleteExamSet: function(payload) { return invokeIpc("exam:sets:delete", payload); },
  showExamSetInFolder: function(id) { return invokeIpc("exam:sets:showInFolder", id); },
  getExamResourceData: function(payload) { return invokeIpc("exam:sets:resourceData", payload); },
  saveExamReaderState: function(payload) { return invokeIpc("exam:reader:saveState", payload); },

  getExamAnnotations: function(scopeKey) { return invokeIpc("exam:annotations:list", scopeKey); },
  addExamAnnotation: function(payload) { return invokeIpc("exam:annotations:add", payload); },
  updateExamAnnotationGeometry: function(payload) { return invokeIpc("exam:annotations:updateGeometry", payload); },
  deleteExamAnnotation: function(id) { return invokeIpc("exam:annotations:delete", id); },
  pickCollectionPdfs: function() { return invokeIpc("exam:collections:pickPdfs"); },
  pickCollectionPdfFolder: function() { return invokeIpc("exam:collections:pickPdfFolder"); },
  pickCollectionAudio: function() { return invokeIpc("exam:collections:pickAudio"); },
  pickCollectionAudioFiles: function() { return invokeIpc("exam:collections:pickAudioFiles"); },
  analyzeCollectionPdf: function(filePath) { return invokeIpc("exam:collections:analyzePdf", filePath); },
  analyzeCollectionAudio: function(filePath) { return invokeIpc("exam:collections:analyzeAudio", filePath); },
  saveCollectionAudioImport: function(payload) { return invokeIpc("exam:collections:saveAudioImport", payload); },
  saveCollectionPdfImport: function(payload) { return invokeIpc("exam:collections:savePdfImport", payload); },
  getExamCollections: function() { return invokeIpc("exam:collections:list"); },
  reorderExamCollections: function(payload) { return invokeIpc("exam:collections:reorder", payload); },
  getPendingAnalyses: function() { return invokeIpc("exam:collections:pendingAnalysis"); },
  bindPendingAnalysis: function(payload) { return invokeIpc("exam:collections:bindAnalysis", payload); },
  discardPendingAnalysis: function(pendingId) { return invokeIpc("exam:collections:discardPendingAnalysis", pendingId); },
  getExamCollection: function(id) { return invokeIpc("exam:collections:get", id); },
  updateExamCollectionMetadata: function(payload) { return invokeIpc("exam:collections:updateMetadata", payload); },
  importCollectionAudio: function(payload) { return invokeIpc("exam:collections:importAudio", payload); },
  getCollectionAudioData: function(payload) { return invokeIpc("exam:collections:audioData", payload); },
  removeCollectionAudio: function(payload) { return invokeIpc("exam:collections:removeAudio", payload); },
  extractExamSegmentText: function(payload) { return invokeIpc("exam:segments:extractText", payload); },
  createManualExamSegment: function(payload) { return invokeIpc("exam:segments:createManual", payload); },
  updateExamSegment: function(payload) { return invokeIpc("exam:segments:update", payload); },
  deleteExamSegment: function(segmentId) { return invokeIpc("exam:segments:delete", segmentId); },
  readCollectionSourcePdf: function(filePath) { return invokeIpc("exam:collections:readSourcePdf", filePath); },
  showCollectionSource: function(filePath) { return invokeIpc("exam:collections:showSource", filePath); },
  deleteExamCollection: function(collectionId) { return invokeIpc("exam:collections:delete", collectionId); },

  importExamPaper: function(data) { return invokeIpc("exam:importPaper", data); },
  importExamPdf: function(filePath) { return invokeIpc("exam:importPdf", filePath); },
  getExamPapers: function() { return invokeIpc("exam:getPapers"); },
  getExamPaperById: function(id) { return invokeIpc("exam:getPaperById", id); },
  getExamQuestions: function(params) { return invokeIpc("exam:getQuestions", params); },
  getExamQuestionsBySection: function(params) { return invokeIpc("exam:getQuestionsBySection", params); },
  getExamPaperStats: function(paperId) { return invokeIpc("exam:getPaperStats", paperId); },
  deleteExamPaper: function(id) { return invokeIpc("exam:deletePaper", id); },
  getExamQuestionCount: function(sectionType) { return invokeIpc("exam:getQuestionCount", sectionType); },
  getExamSectionCounts: function() { return invokeIpc("exam:getSectionCounts"); },

  saveExamWrongAnswers: function(paperId, wrongs) { return invokeIpc("exam:saveWrongAnswers", paperId, wrongs); },
  getExamWrongAnswers: function(filters) { return invokeIpc("exam:getWrongAnswers", filters); },
  getExamWrongAnswerCount: function(filters) { return invokeIpc("exam:getWrongAnswerCount", filters); },
  deleteExamWrongAnswer: function(id) { return invokeIpc("exam:deleteWrongAnswer", id); },

  saveExamAudio: function(paperId, filePath, fileName) { return invokeIpc("exam:saveAudio", paperId, filePath, fileName); },
  getExamAudio: function(paperId) { return invokeIpc("exam:getAudio", paperId); },
  deleteExamAudio: function(id) { return invokeIpc("exam:deleteAudio", id); },

  addVocabWord: function(word) { return invokeIpc("exam:addVocabWord", word); },
  getVocabWords: function() { return invokeIpc("exam:getVocabWords"); },
  deleteVocabWord: function(id) { return invokeIpc("exam:deleteVocabWord", id); },
  getVocabWordCount: function() { return invokeIpc("exam:getVocabWordCount"); },

  // 阅读文章
  getReadingPassages: function(params) { return invokeIpc("reading:getPassages", params); },
  getReadingTopics: function() { return invokeIpc("reading:getTopics"); },
  getReadingCount: function() { return invokeIpc("reading:getCount"); },
  importReadingPassages: function(passages) { return invokeIpc("reading:import", passages); },
  deleteReadingPassage: function(id) { return invokeIpc("reading:delete", id); },

  // 翻译句子
  getTranslationSentences: function(params) { return invokeIpc("translation:getSentences", params); },
  getTranslationTopics: function() { return invokeIpc("translation:getTopics"); },
  getTranslationCount: function() { return invokeIpc("translation:getCount"); },
  importTranslationSentences: function(sentences) { return invokeIpc("translation:import", sentences); },
  deleteTranslationSentence: function(id) { return invokeIpc("translation:delete", id); },

  // 写作历史
  saveWritingHistory: function(data) { return invokeIpc("writing:save", data); },
  getWritingHistory: function(limit) { return invokeIpc("writing:getHistory", limit); },
  deleteWritingHistory: function(id) { return invokeIpc("writing:deleteHistory", id); },
  getWritingStats: function() { return invokeIpc("writing:getStats"); },

  // 学习提醒
  getReminders: function() { return invokeIpc("reminder:getAll"); },
  addReminder: function(data) { return invokeIpc("reminder:add", data); },
  updateReminder: function(id, data) { return invokeIpc("reminder:update", id, data); },
  toggleReminder: function(id) { return invokeIpc("reminder:toggle", id); },
  deleteReminder: function(id) { return invokeIpc("reminder:delete", id); },

  // 日活统计（本地数据库）
  getActivitySummary: function() { return invokeIpc("activity:getSummary"); },
  clearActivityStats: function() { return invokeIpc("activity:clear"); }
};

contextBridge.exposeInMainWorld("cet4Api", api);
