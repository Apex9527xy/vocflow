import { IpcMain, dialog, BrowserWindow, app, shell } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync } from 'fs'
import { createHash } from 'node:crypto'
import { basename, extname, isAbsolute, join, relative, resolve } from 'path'
import type { DbWrapper } from '../database/wrapper'
import { ExamRepository } from '../database/repositories/exam.repository'
import type { ImportPaperData } from '../database/repositories/exam.repository'
import { ExamImportRepository } from '../database/repositories/exam-import.repository'
import { detectOcrMetadata, examSeasonFolder, inspectExamPdf, isExamPaperType, normalizeExamSeason, type ExamDetectionSource, type ExamPaperType, type ExamSeason } from '../lib/exam-import'
import { collectPdfFiles, EXAM_FOLDER_LIMIT } from '../lib/exam-folder'
import { parseExamPdf } from '../lib/pdf-parser'


function examLibraryRoot(): string {
  return join(app.getPath('userData'), 'ExamLibrary')
}

function safeSegment(value: string, fallback: string): string {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
  return cleaned || fallback
}

function normalizeYear(value: unknown): number | null {
  const year = Number(value)
  return Number.isInteger(year) && year >= 2000 && year <= 2099 ? year : null
}

function normalizeSeason(value: unknown): ExamSeason {
  return normalizeExamSeason(value)
}

function normalizePaperType(value: unknown): ExamPaperType {
  return isExamPaperType(value) ? value : 'unknown'
}

function seasonFolder(season: ExamSeason | null): string {
  return examSeasonFolder(season || 'unknown')
}

function yearFolder(year: number | null): string {
  return year ? String(year) : '未分类'
}

function isPathInside(parent: string, child: string): boolean {
  const relativePath = relative(resolve(parent), resolve(child))
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

function uniqueDestination(directory: string, fileName: string): string {
  const extension = extname(fileName)
  const stem = basename(fileName, extension)
  let candidate = join(directory, fileName)
  let index = 2
  while (existsSync(candidate)) {
    candidate = join(directory, `${stem} (${index})${extension}`)
    index += 1
  }
  return candidate
}

async function showExamOpenDialog(options: Electron.OpenDialogOptions) {
  const win = BrowserWindow.getFocusedWindow()
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options)
}

export function registerExamHandlers(ipcMain: IpcMain, db: DbWrapper) {
  const repo = new ExamRepository(db)
  const importRepo = new ExamImportRepository(db)

  ipcMain.handle('exam:selectPdfs', async () => {
    try {
      const result = await showExamOpenDialog({
        title: '批量选择真题 PDF',
        filters: [{ name: 'PDF 真题', extensions: ['pdf'] }],
        properties: ['openFile', 'multiSelections']
      })
      return { success: true, canceled: result.canceled, filePaths: result.filePaths }
    } catch (error) {
      return { success: false, canceled: true, filePaths: [], message: (error as Error).message }
    }
  })

  ipcMain.handle('exam:selectFolder', async () => {
    try {
      const result = await showExamOpenDialog({
        title: '选择包含真题 PDF 的文件夹',
        properties: ['openDirectory']
      })
      if (result.canceled || !result.filePaths[0]) return { success: true, canceled: true, filePaths: [], truncated: false }
      const scanned = collectPdfFiles(result.filePaths[0])
      return {
        success: true,
        canceled: false,
        filePaths: scanned.paths,
        truncated: scanned.truncated,
        message: scanned.truncated ? `文件过多，本次仅加入前 ${EXAM_FOLDER_LIMIT} 份 PDF` : ''
      }
    } catch (error) {
      return { success: false, canceled: true, filePaths: [], truncated: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('exam:inspectPdf', async (_event, filePath: string) => {
    try {
      const inspection = await inspectExamPdf(filePath)
      const duplicate = importRepo.findByHash(inspection.fileHash)
      return {
        success: true,
        inspection: {
          ...inspection,
          duplicate: duplicate ? { id: duplicate.id, title: duplicate.title, year: duplicate.year, season: duplicate.season } : null
        }
      }
    } catch (error) {
      return { success: false, message: (error as Error).message, filePath }
    }
  })

  ipcMain.handle('exam:detectOcrMetadata', (_event, payload: { fileName: string; text: string }) => {
    try {
      return { success: true, metadata: detectOcrMetadata(payload.fileName, payload.text) }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('exam:readPdf', (_event, filePath: string) => {
    try {
      return { success: true, data: readFileSync(filePath) }
    } catch (error) {
      return { success: false, message: (error as Error).message, data: null }
    }
  })

  ipcMain.handle('exam:library:list', () => {
    try {
      return {
        success: true,
        documents: importRepo.listDocuments(),
        stats: importRepo.getStats(),
        storagePath: examLibraryRoot()
      }
    } catch (error) {
      return { success: false, documents: [], stats: null, storagePath: examLibraryRoot(), message: (error as Error).message }
    }
  })

  ipcMain.handle('exam:library:import', (_event, input: {
    title: string
    fileName: string
    sourcePath: string
    fileHash: string
    fileSize: number
    pageCount: number
    year: number | null
    season: ExamSeason
    paperType: ExamPaperType
    detectionSource: ExamDetectionSource
    textExcerpt: string
    remark: string
  }) => {
    let destination = ''
    try {
      if (!input?.sourcePath || extname(input.sourcePath).toLowerCase() !== '.pdf') {
        return { success: false, message: '不是有效的 PDF 文件' }
      }
      if (!existsSync(input.sourcePath)) return { success: false, message: '原始 PDF 文件已不存在' }
      const currentHash = createHash('sha256').update(readFileSync(input.sourcePath)).digest('hex')
      if (currentHash !== input.fileHash) return { success: false, message: '文件在导入前发生了变化，请重新识别' }
      const duplicate = importRepo.findByHash(currentHash)
      if (duplicate) return { success: false, duplicate: true, message: '这份 PDF 已在真题库中', document: duplicate }

      const root = examLibraryRoot()
      const year = normalizeYear(input.year)
      const season = normalizeSeason(input.season)
      const paperType = normalizePaperType(input.paperType)
      const directory = join(root, yearFolder(year), seasonFolder(season))
      mkdirSync(directory, { recursive: true })
      const safeName = safeSegment(input.fileName, `真题-${Date.now()}.pdf`)
      const finalName = safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`
      destination = uniqueDestination(directory, finalName)
      copyFileSync(input.sourcePath, destination)
      const document = importRepo.insertDocument({
        title: safeSegment(input.title, basename(destination, '.pdf')),
        fileName: basename(destination),
        filePath: destination,
        sourcePath: input.sourcePath,
        fileHash: currentHash,
        fileSize: statSync(destination).size,
        pageCount: Math.max(0, Math.min(10000, Number(input.pageCount) || 0)),
        year,
        season,
        paperType,
        detectionSource: input.detectionSource,
        textExcerpt: input.textExcerpt || '',
        remark: input.remark || '',
        libraryRoot: root
      })
      return { success: true, message: '导入成功', document }
    } catch (error) {
      if (destination && existsSync(destination)) {
        try { unlinkSync(destination) } catch {}
      }
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('exam:library:update', (_event, payload: {
    id: number
    title?: string
    year?: number | null
    season?: ExamSeason
    paperType?: ExamPaperType
    remark?: string
  }) => {
    let movedFrom = ''
    let movedTo = ''
    try {
      const current = importRepo.getDocumentById(payload.id)
      if (!current?.file_path || !existsSync(current.file_path)) return { success: false, message: '真题文件不存在' }
      const root = current.library_root || examLibraryRoot()
      const year = payload.year === undefined ? current.year : normalizeYear(payload.year)
      const season = payload.season === undefined ? normalizeSeason(current.season) : normalizeSeason(payload.season)
      const nextDirectory = join(root, yearFolder(year), seasonFolder(season))
      mkdirSync(nextDirectory, { recursive: true })
      const currentPath = resolve(current.file_path)
      const intendedPath = resolve(nextDirectory, basename(current.file_path))
      let nextPath = currentPath
      if (currentPath !== intendedPath || !isPathInside(root, currentPath)) {
        nextPath = uniqueDestination(nextDirectory, basename(current.file_path))
        if (statSync(current.file_path).isFile()) {
          renameSync(current.file_path, nextPath)
          movedFrom = current.file_path
          movedTo = nextPath
        }
      }
      const document = importRepo.updateDocument(payload.id, {
        title: payload.title,
        year,
        season,
        paperType: payload.paperType === undefined ? normalizePaperType(current.paper_type) : normalizePaperType(payload.paperType),
        remark: payload.remark,
        filePath: nextPath
      })
      return { success: true, document }
    } catch (error) {
      if (movedFrom && movedTo && existsSync(movedTo) && !existsSync(movedFrom)) {
        try { renameSync(movedTo, movedFrom) } catch {}
      }
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('exam:library:refreshMetadata', async (_event, id: number) => {
    try {
      const current = importRepo.getDocumentById(id)
      if (!current?.file_path || !existsSync(current.file_path)) return { success: false, message: '真题文件不存在' }
      const inspection = await inspectExamPdf(current.file_path)
      const document = importRepo.updateDetection(id, {
        year: inspection.year,
        season: inspection.season,
        paperType: inspection.paperType,
        detectionSource: inspection.detectionSource,
        textExcerpt: inspection.textExcerpt
      })
      return { success: true, document, needsOcr: inspection.needsOcr }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('exam:library:open', async (_event, id: number) => {
    try {
      const document = importRepo.getDocumentById(id)
      if (!document?.file_path || !existsSync(document.file_path)) return { success: false, message: 'PDF 文件不存在' }
      const error = await shell.openPath(document.file_path)
      if (error) return { success: false, message: error }
      importRepo.touchOpened(id)
      return { success: true }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('exam:library:show', (_event, id: number) => {
    try {
      const document = importRepo.getDocumentById(id)
      if (!document?.file_path || !existsSync(document.file_path)) return { success: false, message: 'PDF 文件不存在' }
      shell.showItemInFolder(document.file_path)
      return { success: true }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('exam:library:openFolder', async () => {
    try {
      const root = examLibraryRoot()
      mkdirSync(root, { recursive: true })
      const error = await shell.openPath(root)
      return error ? { success: false, message: error } : { success: true }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('exam:library:delete', (_event, payload: { id: number; deleteFile?: boolean }) => {
    try {
      const document = importRepo.getDocumentById(payload.id)
      if (!document) return { success: false, message: '真题记录不存在' }
      if (payload.deleteFile && document.file_path && existsSync(document.file_path)) {
        const root = document.library_root || examLibraryRoot()
        if (!isPathInside(root, document.file_path)) return { success: false, message: '拒绝删除真题库目录之外的文件' }
        unlinkSync(document.file_path)
      }
      importRepo.deleteDocument(payload.id)
      return { success: true }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('exam:importPaper', (_e, data: ImportPaperData) => {
    try {
      if (!data.title || !data.questions || data.questions.length === 0) {
        return { success: false, message: '无效的试卷数据', paperId: 0, questionCount: 0 }
      }
      const result = repo.importPaper(data)
      return { success: true, message: `成功导入 ${result.questionCount} 道题目`, ...result }
    } catch (err) {
      console.error('exam:importPaper error:', err)
      return { success: false, message: '导入失败: ' + (err as Error).message, paperId: 0, questionCount: 0 }
    }
  })

  ipcMain.handle('exam:importPdf', async (_e, filePath: string) => {
    try {
      console.log('exam:importPdf - 开始导入:', filePath)
      const buffer = readFileSync(filePath)
      console.log('exam:importPdf - 文件读取成功, 大小:', buffer.length)
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      console.log('exam:importPdf - 开始解析 PDF...')
      const parsed = await parseExamPdf(arrayBuffer)
      console.log('exam:importPdf - PDF 解析完成, sections:', parsed.sections.length)

      if (parsed.sections.length === 0) {
        return { success: false, message: '未能从 PDF 中识别出题目，请检查文件格式', paperId: 0, questionCount: 0, parsed: null }
      }

      const totalQuestions = parsed.sections.reduce((sum, s) => sum + s.questions.length, 0)

      // 转换为导入格式
      const allQuestions = parsed.sections.flatMap(s => s.questions)
      const importData: ImportPaperData = {
        title: parsed.title,
        questions: allQuestions
      }

      const result = repo.importPaper(importData)
      return {
        success: true,
        message: `成功导入 ${result.questionCount} 道题目（${parsed.sections.map(s => s.label + ' ' + s.questions.length + '题').join('、')}）`,
        ...result,
        parsed: {
          title: parsed.title,
          sections: parsed.sections.map(s => ({ type: s.type, label: s.label, count: s.questions.length }))
        }
      }
    } catch (err) {
      console.error('exam:importPdf error:', err)
      console.error('exam:importPdf stack:', (err as Error).stack)
      return { success: false, message: 'PDF 导入失败: ' + (err as Error).message, paperId: 0, questionCount: 0, parsed: null }
    }
  })

  ipcMain.handle('exam:getPapers', () => {
    try {
      return repo.getAllPapers()
    } catch (err) {
      console.error('exam:getPapers error:', err)
      return []
    }
  })

  ipcMain.handle('exam:getPaperById', (_e, id: number) => {
    try {
      return repo.getPaperById(id)
    } catch (err) {
      console.error('exam:getPaperById error:', err)
      return null
    }
  })

  ipcMain.handle('exam:getQuestions', (_e, params: { paperId: number; sectionType?: string }) => {
    try {
      return repo.getQuestionsByPaper(params.paperId, params.sectionType)
    } catch (err) {
      console.error('exam:getQuestions error:', err)
      return []
    }
  })

  ipcMain.handle('exam:getQuestionsBySection', (_e, params: { sectionType: string; limit?: number }) => {
    try {
      return repo.getQuestionsBySection(params.sectionType, params.limit ?? 50)
    } catch (err) {
      console.error('exam:getQuestionsBySection error:', err)
      return []
    }
  })

  ipcMain.handle('exam:getPaperStats', (_e, paperId: number) => {
    try {
      return repo.getPaperStats(paperId)
    } catch (err) {
      console.error('exam:getPaperStats error:', err)
      return []
    }
  })

  ipcMain.handle('exam:deletePaper', (_e, id: number) => {
    try {
      repo.deletePaper(id)
      return { success: true }
    } catch (err) {
      console.error('exam:deletePaper error:', err)
      return { success: false }
    }
  })

  ipcMain.handle('exam:getSectionCounts', () => {
    try {
      return repo.getSectionCounts()
    } catch (err) {
      console.error('exam:getSectionCounts error:', err)
      return []
    }
  })

  ipcMain.handle('exam:getQuestionCount', (_e, sectionType?: string) => {
    try {
      return repo.getQuestionCount(sectionType)
    } catch (err) {
      console.error('exam:getQuestionCount error:', err)
      return 0
    }
  })

  // 错题
  ipcMain.handle('exam:saveWrongAnswers', (_e, paperId: number, wrongs: any[]) => {
    try {
      repo.saveWrongAnswers(paperId, wrongs)
      return { success: true }
    } catch (err) {
      console.error('exam:saveWrongAnswers error:', err)
      return { success: false }
    }
  })

  ipcMain.handle('exam:getWrongAnswers', (_e, filters?: { paperId?: number; sectionType?: string }) => {
    try {
      return repo.getWrongAnswers(filters)
    } catch (err) {
      console.error('exam:getWrongAnswers error:', err)
      return []
    }
  })

  ipcMain.handle('exam:getWrongAnswerCount', (_e, filters?: { paperId?: number; sectionType?: string }) => {
    try {
      return repo.getWrongAnswerCount(filters)
    } catch (err) {
      console.error('exam:getWrongAnswerCount error:', err)
      return 0
    }
  })

  ipcMain.handle('exam:deleteWrongAnswer', (_e, id: number) => {
    try {
      repo.deleteWrongAnswer(id)
      return { success: true }
    } catch (err) {
      console.error('exam:deleteWrongAnswer error:', err)
      return { success: false }
    }
  })

  // 听力音频
  ipcMain.handle('exam:saveAudio', (_e, paperId: number, filePath: string, fileName: string) => {
    try {
      repo.saveAudio(paperId, filePath, fileName)
      return { success: true }
    } catch (err) {
      console.error('exam:saveAudio error:', err)
      return { success: false }
    }
  })

  ipcMain.handle('exam:getAudio', (_e, paperId: number) => {
    try {
      return repo.getAudio(paperId)
    } catch (err) {
      console.error('exam:getAudio error:', err)
      return []
    }
  })

  ipcMain.handle('exam:deleteAudio', (_e, id: number) => {
    try {
      repo.deleteAudio(id)
      return { success: true }
    } catch (err) {
      console.error('exam:deleteAudio error:', err)
      return { success: false }
    }
  })

  // 生词本
  ipcMain.handle('exam:addVocabWord', (_e, word: any) => {
    try {
      repo.addVocabWord(word)
      return { success: true }
    } catch (err) {
      console.error('exam:addVocabWord error:', err)
      return { success: false }
    }
  })

  ipcMain.handle('exam:getVocabWords', () => {
    try {
      return repo.getVocabWords()
    } catch (err) {
      console.error('exam:getVocabWords error:', err)
      return []
    }
  })

  ipcMain.handle('exam:deleteVocabWord', (_e, id: number) => {
    try {
      repo.deleteVocabWord(id)
      return { success: true }
    } catch (err) {
      console.error('exam:deleteVocabWord error:', err)
      return { success: false }
    }
  })

  ipcMain.handle('exam:getVocabWordCount', () => {
    try {
      return repo.getVocabWordCount()
    } catch (err) {
      console.error('exam:getVocabWordCount error:', err)
      return 0
    }
  })

  ipcMain.handle('dialog:openFile', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { canceled: true, filePaths: [] }
    const result = await dialog.showOpenDialog(win, {
      title: '选择 PDF 真题文件',
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
      properties: ['openFile']
    })
    return { canceled: result.canceled, filePaths: result.filePaths }
  })

  ipcMain.handle('dialog:openAudioFile', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { canceled: true, filePaths: [] }
    const result = await dialog.showOpenDialog(win, {
      title: '选择听力音频文件',
      filters: [{ name: '音频文件', extensions: ['mp3', 'wav', 'm4a', 'ogg'] }],
      properties: ['openFile']
    })
    return { canceled: result.canceled, filePaths: result.filePaths }
  })
}
