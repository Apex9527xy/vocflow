import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { IpcMain } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, unlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import type { DbWrapper } from '../database/wrapper'
import { ExamResourceRepository } from '../database/repositories/exam-resource.repository'
import type { ExamPaperType, ExamSeason } from '../lib/exam-import'
import { examSeasonFolder, inspectExamPdf, isExamPaperType, normalizeExamSeason } from '../lib/exam-import'
import { collectExamResourceFiles, EXAM_TEXT_EXTENSIONS } from '../lib/exam-folder'
import {
  fingerprintResources,
  scanExamResourceFiles,
  type ExamResourceCandidate,
  type ExamResourceRole
} from '../lib/exam-resource-import'
import { saveDatabase } from '../database/connection'

const EXAM_LIBRARY_FOLDER = 'ExamLibrary'

function examLibraryRoot(): string {
  return join(app.getPath('userData'), EXAM_LIBRARY_FOLDER)
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

function yearFolder(year: number | null): string {
  return year ? String(year) : '未分类'
}

function seasonFolder(season: ExamSeason): string {
  return examSeasonFolder(season)
}

function categoryFolder(type: ExamPaperType): string {
  const labels: Record<ExamPaperType, string> = {
    'basic-primary': '小学',
    'basic-junior': '初中',
    'basic-senior': '高中',
    CET4: '四级',
    CET6: '六级',
    POSTGRAD: '考研英语',
    IELTS: '雅思',
    TOEFL: '托福',
    unknown: '未分类'
  }
  return labels[type]
}

function isPathInside(parent: string, child: string): boolean {
  const path = relative(resolve(parent), resolve(child))
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

function uniqueFileDestination(directory: string, fileName: string): string {
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

function uniqueDirectory(parent: string, name: string): string {
  let candidate = join(parent, name)
  let index = 2
  while (existsSync(candidate)) {
    candidate = join(parent, `${name} (${index})`)
    index += 1
  }
  return candidate
}

function mimeForFile(filePath: string): string {
  const extension = extname(filePath).toLowerCase()
  if (extension === '.pdf') return 'application/pdf'
  if (extension === '.txt') return 'text/plain'
  if (extension === '.md') return 'text/markdown'
  if (extension === '.mp3') return 'audio/mpeg'
  if (extension === '.wav') return 'audio/wav'
  if (extension === '.m4a') return 'audio/mp4'
  if (extension === '.aac') return 'audio/aac'
  if (extension === '.ogg') return 'audio/ogg'
  if (extension === '.flac') return 'audio/flac'
  return 'application/octet-stream'
}

function rolePrefix(role: ExamResourceRole): string {
  return role === 'text' ? 'text' : role === 'audio' ? 'audio' : 'analysis'
}

function expectedExtensions(role: ExamResourceRole): Set<string> {
  if (role === 'audio') return new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'])
  return EXAM_TEXT_EXTENSIONS
}

function hashFile(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function resourceSetName(title: string, setNo: number | null): string {
  const suffix = setNo ? `-第${setNo}套` : ''
  return safeSegment(`${title}${suffix}`, `真题-${Date.now()}`)
}

function copyResource(filePath: string, folder: string, role: ExamResourceRole): { fileName: string; filePath: string; fileHash: string; fileSize: number; mimeType: string } {
  const originalName = basename(filePath)
  const destination = uniqueFileDestination(folder, `${rolePrefix(role)}-${safeSegment(originalName, `resource${extname(originalName)}`)}`)
  copyFileSync(filePath, destination)
  return {
    fileName: originalName,
    filePath: destination,
    fileHash: hashFile(destination),
    fileSize: statSync(destination).size,
    mimeType: mimeForFile(destination)
  }
}

function candidateById(files: ExamResourceCandidate[], id: string): ExamResourceCandidate | null {
  return files.find(file => file.id === id) || null
}

async function showOpenDialog(options: Electron.OpenDialogOptions) {
  const win = BrowserWindow.getFocusedWindow()
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options)
}

export function registerExamResourceHandlers(ipcMainRef: IpcMain, db: DbWrapper): void {
  const repo = new ExamResourceRepository(db)

  ipcMainRef.handle('exam:resources:pickFiles', async () => {
    const result = await showOpenDialog({
      title: '选择真题文本、音频和解析文件',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '真题资源', extensions: ['pdf', 'txt', 'md', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    return { success: true, canceled: result.canceled, filePaths: result.filePaths }
  })

  ipcMainRef.handle('exam:resources:pickFolder', async () => {
    const result = await showOpenDialog({ title: '选择真题资源根文件夹', properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return { success: true, canceled: true, filePaths: [], rootPath: '', truncated: false }
    const scanned = collectExamResourceFiles(result.filePaths[0])
    return {
      success: true,
      canceled: false,
      filePaths: scanned.paths,
      rootPath: result.filePaths[0],
      truncated: scanned.truncated,
      message: scanned.truncated ? '文件较多，本次仅扫描前 2000 个支持的文件' : ''
    }
  })

  ipcMainRef.handle('exam:resources:pickOne', async (_event, role: ExamResourceRole) => {
    const audio = role === 'audio'
    const result = await showOpenDialog({
      title: audio ? '选择配套音频' : '选择真题解析文件',
      properties: ['openFile'],
      filters: audio
        ? [{ name: '音频文件', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'] }]
        : [{ name: '解析文件', extensions: ['pdf', 'txt', 'md'] }]
    })
    return { success: true, canceled: result.canceled, filePath: result.filePaths[0] || '' }
  })

  ipcMainRef.handle('exam:resources:scan', async (_event, payload: { filePaths: string[]; rootPath?: string }) => {
    try {
      return { success: true, result: await scanExamResourceFiles(payload.filePaths || [], payload.rootPath || '') }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:sets:list', () => ({ success: true, sets: repo.listSets(), stats: repo.getStats(), storagePath: examLibraryRoot() }))

  ipcMainRef.handle('exam:batches:begin', (_event, payload: { rootPath?: string; importMode?: string; totalSets?: number }) => {
    try {
      const id = repo.createBatch(payload.rootPath || '', payload.importMode || 'folder', Number(payload.totalSets || 0))
      saveDatabase()
      return { success: true, batchId: id }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:batches:finish', (_event, payload: { batchId: number; imported: number; skipped: number; failed: number; details?: unknown }) => {
    try {
      repo.finishBatch(payload.batchId, payload)
      saveDatabase()
      return { success: true }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:resources:importSet', (_event, input: {
    batchId?: number | null
    title: string
    paperType: ExamPaperType
    year: number | null
    season: ExamSeason
    setNo: number | null
    remark?: string
    text: ExamResourceCandidate
    audio?: ExamResourceCandidate | null
    analysis?: ExamResourceCandidate | null
  }) => {
    let folder = ''
    let createdSetId = 0
    try {
      if (!input?.text?.path || !existsSync(input.text.path)) return { success: false, message: '缺少真题文本文件' }
      const paperType = normalizePaperType(input.paperType)
      const year = normalizeYear(input.year)
      const season = normalizeSeason(input.season)
      const setNo = input.setNo == null ? null : Number(input.setNo)
      const candidates = [input.text, input.audio, input.analysis].filter(Boolean) as ExamResourceCandidate[]
      for (const candidate of candidates) {
        const extension = extname(candidate.path).toLowerCase()
        if (!expectedExtensions(candidate.role).has(extension)) return { success: false, message: `${candidate.fileName} 与资源类型不匹配` }
        if (!existsSync(candidate.path)) return { success: false, message: `${candidate.fileName} 已不存在` }
        const actualHash = hashFile(candidate.path)
        if (actualHash !== candidate.fileHash) return { success: false, message: `${candidate.fileName} 在扫描后发生变化，请重新扫描` }
      }
      const fingerprint = fingerprintResources(candidates.map(candidate => ({ role: candidate.role, fileHash: candidate.fileHash })))
      const duplicate = repo.findByFingerprint(fingerprint)
      if (duplicate) return { success: false, duplicate: true, message: `题库已有相同资源集：${duplicate.title}`, set: duplicate }

      const root = examLibraryRoot()
      const parent = join(root, categoryFolder(paperType), yearFolder(year), seasonFolder(season))
      mkdirSync(parent, { recursive: true })
      folder = uniqueDirectory(parent, resourceSetName(input.title, setNo))
      mkdirSync(folder, { recursive: true })

      const copied: Record<ExamResourceRole, ReturnType<typeof copyResource> & { candidate: ExamResourceCandidate } | null> = {
        text: null, audio: null, analysis: null
      }
      for (const candidate of candidates) {
        const result = copyResource(candidate.path, folder, candidate.role)
        copied[candidate.role] = { ...result, candidate }
      }
      if (!copied.text) throw new Error('真题文本复制失败')

      const set = repo.createSet({
        title: input.title,
        paperType,
        year,
        season,
        setNo,
        remark: input.remark || '',
        importBatchId: input.batchId ?? null
      })
      createdSetId = set.id
      for (const role of ['text', 'audio', 'analysis'] as ExamResourceRole[]) {
        const item = copied[role]
        if (!item) continue
        const extension = extname(item.filePath).toLowerCase()
        const text = EXAM_TEXT_EXTENSIONS.has(extension) && extension !== '.pdf'
          ? readFileSync(item.filePath, 'utf8').slice(0, 500000)
          : null
        repo.upsertResource(set.id, {
          role,
          fileName: item.fileName,
          filePath: item.filePath,
          fileHash: item.fileHash,
          fileSize: item.fileSize,
          mimeType: item.mimeType,
          pageCount: item.candidate.pageCount ?? null,
          extractedText: text
        })
      }
      const completed = repo.recalculate(set.id)
      saveDatabase()
      return { success: true, set: completed, message: '真题资源集导入成功' }
    } catch (error) {
      if (createdSetId) {
        try { repo.deleteSet(createdSetId) } catch {}
      }
      if (folder && existsSync(folder) && isPathInside(examLibraryRoot(), folder)) {
        try { rmSync(folder, { recursive: true, force: true }) } catch {}
      }
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:resources:replace', async (_event, payload: { paperId: number; role: ExamResourceRole; filePath: string }) => {
    let copiedPath = ''
    try {
      const set = repo.getSet(payload.paperId)
      if (!set) return { success: false, message: '真题资源集不存在' }
      if (!existsSync(payload.filePath) || !statSync(payload.filePath).isFile()) return { success: false, message: '资源文件不存在' }
      const extension = extname(payload.filePath).toLowerCase()
      if (!expectedExtensions(payload.role).has(extension)) return { success: false, message: '文件类型与资源角色不匹配' }
      const existingText = set.resources.text?.file_path
      const anyResource = set.resources.text || set.resources.audio || set.resources.analysis
      if (!anyResource?.file_path) return { success: false, message: '无法确定资源集目录' }
      const folder = dirname(existingText || anyResource.file_path)
      mkdirSync(folder, { recursive: true })
      const copied = copyResource(payload.filePath, folder, payload.role)
      copiedPath = copied.filePath
      let pageCount: number | null = null
      if (extension === '.pdf') {
        try { pageCount = (await inspectExamPdf(copied.filePath)).pageCount } catch {}
      }
      const extractedText = EXAM_TEXT_EXTENSIONS.has(extension) && extension !== '.pdf'
        ? readFileSync(copied.filePath, 'utf8').slice(0, 500000)
        : null
      const oldPath = set.resources[payload.role]?.file_path || ''
      repo.upsertResource(set.id, {
        role: payload.role,
        fileName: copied.fileName,
        filePath: copied.filePath,
        fileHash: copied.fileHash,
        fileSize: copied.fileSize,
        mimeType: copied.mimeType,
        pageCount,
        extractedText
      })
      const completed = repo.recalculate(set.id)
      if (oldPath && oldPath !== copied.filePath && existsSync(oldPath) && isPathInside(folder, oldPath)) {
        try { unlinkSync(oldPath) } catch {}
      }
      saveDatabase()
      return { success: true, set: completed, message: '资源已更新' }
    } catch (error) {
      if (copiedPath && existsSync(copiedPath)) { try { unlinkSync(copiedPath) } catch {} }
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:resources:remove', (_event, payload: { paperId: number; role: ExamResourceRole }) => {
    try {
      if (payload.role === 'text') return { success: false, message: '真题文本是资源集主体，不能单独删除' }
      const resource = repo.getResource(payload.paperId, payload.role)
      if (!resource) return { success: false, message: '资源不存在' }
      repo.removeResource(payload.paperId, payload.role)
      const set = repo.recalculate(payload.paperId)
      if (resource.file_path && existsSync(resource.file_path) && isPathInside(examLibraryRoot(), resource.file_path)) {
        try { unlinkSync(resource.file_path) } catch {}
      }
      saveDatabase()
      return { success: true, set }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:sets:update', (_event, payload: {
    id: number
    title?: string
    paperType?: ExamPaperType
    year?: number | null
    season?: ExamSeason
    setNo?: number | null
    variant?: string
    remark?: string
  }) => {
    try {
      const current = repo.getSet(payload.id)
      if (!current) return { success: false, message: '真题资源集不存在' }
      const updated = repo.updateMetadata(payload.id, {
        title: payload.title,
        paperType: payload.paperType === undefined ? current.paper_type ?? 'unknown' : normalizePaperType(payload.paperType),
        year: payload.year === undefined ? current.year : normalizeYear(payload.year),
        season: payload.season === undefined ? current.season ?? 'unknown' : normalizeSeason(payload.season),
        setNo: payload.setNo === undefined ? current.set_no : (payload.setNo == null ? null : Number(payload.setNo)),
        variant: payload.variant,
        remark: payload.remark
      })
      saveDatabase()
      return { success: true, set: updated }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:sets:delete', (_event, payload: { id: number; deleteFiles?: boolean }) => {
    try {
      const set = repo.getSet(payload.id)
      if (!set) return { success: false, message: '真题资源集不存在' }
      const textPath = set.resources.text?.file_path
      if (payload.deleteFiles && textPath && existsSync(textPath)) {
        const folder = dirname(textPath)
        if (isPathInside(examLibraryRoot(), folder)) rmSync(folder, { recursive: true, force: true })
      }
      repo.deleteSet(payload.id)
      saveDatabase()
      return { success: true }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:sets:showInFolder', (_event, id: number) => {
    try {
      const set = repo.getSet(id)
      const path = set?.resources.text?.file_path || set?.resources.audio?.file_path || set?.resources.analysis?.file_path
      if (!path || !existsSync(path)) return { success: false, message: '本地资源文件不存在' }
      shell.showItemInFolder(path)
      return { success: true }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:sets:resourceData', (_event, payload: { paperId: number; role: ExamResourceRole }) => {
    try {
      const resource = repo.getResource(payload.paperId, payload.role)
      if (!resource || !existsSync(resource.file_path)) return { success: false, message: '资源文件不存在' }
      const kind = resource.mime_type === 'application/pdf'
        ? 'pdf'
        : resource.mime_type?.startsWith('audio/') ? 'audio'
          : 'text'
      const data = kind === 'text'
        ? resource.extracted_text || readFileSync(resource.file_path, 'utf8')
        : readFileSync(resource.file_path)
      return {
        success: true,
        resource,
        kind,
        mimeType: resource.mime_type,
        data
      }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:reader:saveState', (_event, payload: { paperId: number; mode: 'single' | 'compare'; position?: unknown }) => {
    try {
      repo.updateReaderState(payload.paperId, payload.mode === 'compare' ? 'compare' : 'single', payload.position)
      saveDatabase()
      return { success: true }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:library:openFolderV2', async () => {
    try {
      const root = examLibraryRoot()
      mkdirSync(root, { recursive: true })
      const error = await shell.openPath(root)
      return error ? { success: false, message: error } : { success: true }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })
}
