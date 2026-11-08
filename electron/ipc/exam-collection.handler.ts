import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { IpcMain } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import type { DbWrapper } from '../database/wrapper'
import { ExamCollectionRepository } from '../database/repositories/exam-collection.repository'
import { detectMetadata, examSeasonLabel, isExamPaperType, normalizeExamSeason, type ExamPaperType, type ExamSeason } from '../lib/exam-import'
import { analyzeExamPdf, extractTextInPdfRects, type ExamPdfSemanticAnalysis, type SemanticRangeRect, type SemanticSegment, type SegmentContentType, type SegmentStatus } from '../lib/exam-semantic-parser'
import { saveDatabase } from '../database/connection'
import { collectCollectionImportFiles } from '../lib/exam-folder'

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

function canonicalKey(examType: ExamPaperType, year: number | null, session: ExamSeason): string {
  return `${examType}:${year ?? 'unknown'}:${session}`
}

function collectionTitle(examType: ExamPaperType, year: number | null, session: ExamSeason): string {
  const typeLabel: Record<string, string> = {
    'basic-primary': '小学',
    'basic-junior': '初中',
    'basic-senior': '高中',
    CET4: '四级',
    CET6: '六级',
    POSTGRAD: '考研英语',
    IELTS: '雅思',
    TOEFL: '托福',
    unknown: '未识别'
  }
  return `${year || '年份未分类'} ${examSeasonLabel(session)} ${typeLabel[examType] || '真题'}合集`
}

function safeSegment(value: string, fallback: string): string {
  const text = String(value || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '')
  return text || fallback
}

function audioMime(filePath: string): string {
  const extension = extname(filePath).toLowerCase()
  return extension === '.wav' ? 'audio/wav'
    : extension === '.m4a' ? 'audio/mp4'
      : extension === '.aac' ? 'audio/aac'
        : extension === '.ogg' ? 'audio/ogg'
          : extension === '.flac' ? 'audio/flac'
            : 'audio/mpeg'
}

function hashFile(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function isPathInside(parent: string, child: string): boolean {
  const path = relative(resolve(parent), resolve(child))
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

async function showOpenDialog(options: Electron.OpenDialogOptions) {
  const window = BrowserWindow.getFocusedWindow()
  return window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options)
}

function analysisFileHint(value: string): boolean {
  return /(?:解析|答案|详解|分析|analysis|answer|solution)/i.test(basename(value))
}

function audioSlotFromName(value: string): 'A' | 'B' | null {
  const text = String(value || '')
  const contextual = text.match(/(?:听力(?:音频)?|音频|录音|audio|listening)[\s_-]*([AB])|([AB])[\s_-]*(?:听力(?:音频)?|音频|录音|audio|listening)/i)
  const standalone = text.match(/(?:^|[\s_\-（(【\[])([AB])(?=$|[\s_\-）)】\]])/i)
  const slot = contextual?.[1] || contextual?.[2] || standalone?.[1]
  return slot ? slot.toUpperCase() as 'A' | 'B' : null
}

function extractSetNo(value: string): number | null {
  const text = String(value || '').normalize('NFKC')
  const digit = text.match(/(?:第\s*([1-6])\s*套|卷\s*([1-6])|set\s*([1-6]))/i)
  if (digit) return Number(digit[1] || digit[2] || digit[3])
  const contextual = text.match(/(?:解析|答案|详解|分析|听力(?:音频)?|真题|试题|试卷)[^0-9]{0,10}([1-6])\s*(?:套|卷|$)/i)
  if (contextual) return Number(contextual[1])
  const chinese = text.match(/第\s*([一二三四五六])\s*套|卷\s*([一二三四五六])/)
  if (!chinese) return null
  const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }
  return map[chinese[1] || chinese[2]] || null
}

function uniqueFile(directory: string, fileName: string): string {
  const extension = extname(fileName)
  const stem = basename(fileName, extension)
  let candidate = join(directory, fileName)
  let index = 2
  while (existsSync(candidate)) {
    candidate = join(directory, `${stem} (${index})${extension}`)
    index++
  }
  return candidate
}

function repairLegacyAnalysisCollections(repo: ExamCollectionRepository): number {
  let repaired = 0
  for (const summary of repo.listCollections()) {
    const detail = repo.getCollection(summary.id)
    if (!detail || !detail.segments.length || detail.analyses.length) continue
    const sourcePaths = [...new Set(detail.segments.map(segment => segment.source_file_path).filter(Boolean))]
    if (sourcePaths.length !== 1 || !analysisFileHint(sourcePaths[0])) continue
    if (detail.segments.some(segment => segment.content_type === 'analysis')) continue
    const fileName = basename(sourcePaths[0])
    // 文件名明确表示“真题 + 答案/解析”时属于混合文档，不能把整个合集删除后转成待绑定解析。
    const explicitCombined = /(?:真题|试卷|试题).{0,10}(?:\+|＋|&|与|及|含|附|带).{0,10}(?:答案|解析|详解)|(?:答案|解析|详解).{0,10}(?:\+|＋|&|与|及).{0,10}(?:真题|试卷|试题)/i.test(fileName)
    if (explicitCombined) continue
    const fileMeta = detectMetadata(fileName)
    const examType = fileMeta.paperType !== 'unknown' ? fileMeta.paperType : detail.exam_type
    const year = fileMeta.year ?? detail.year
    const session = fileMeta.season !== 'unknown' ? fileMeta.season : detail.session
    const setNo = extractSetNo(fileName) || detail.papers[0]?.paper_no || null
    let target = examType !== 'unknown' && year != null && session !== 'unknown'
      ? repo.findByKey(canonicalKey(examType, year, session))
      : undefined
    if (!target) {
      const candidates = repo.listCollections().filter(item =>
        item.id !== detail.id && item.exam_type === examType && item.year === year &&
        (session === 'unknown' || item.session === session) &&
        item.segmentCount > 0 && !analysisFileHint(item.title)
      )
      if (candidates.length === 1) target = repo.findById(candidates[0].id)
    }
    const targetDetail = target ? repo.getCollection(target.id) : null
    const targetPaperNo = setNo || (targetDetail?.papers.length === 1 ? targetDetail.papers[0].paper_no : null)
    const targetPaper = target && targetPaperNo ? repo.getPaper(target.id, targetPaperNo) : null
    const hasPaperContent = Boolean(targetPaper && targetDetail?.segments.some(segment =>
      segment.paper_id === targetPaper.id && segment.content_type === 'paper' && ['auto_confirmed', 'confirmed'].includes(segment.status)
    ))
    const convertedSegments = detail.segments.map(segment => ({
      contentType: 'analysis' as const,
      pageNo: segment.page_no,
      rangeInfo: segment.range_info,
      textExcerpt: segment.text_excerpt || '',
      confidence: Math.max(0.86, segment.confidence || 0),
      status: 'auto_confirmed' as const,
      segmentOrder: segment.segment_order,
      setNo,
      audioSlot: segment.audio_slot
    }))
    if (target && targetPaper && hasPaperContent) {
      const analysis = repo.ensureAnalysis({
        collectionId: target.id,
        paperId: targetPaper.id,
        audioSlot: null,
        title: `${target.title} · 卷${targetPaper.paper_no}解析`,
        sourceFilePath: sourcePaths[0],
        sourceFileHash: detail.segments[0].source_file_hash,
        fileName,
        status: 'confirmed'
      })
      for (const segment of detail.segments) {
        repo.updateSegment(segment.id, {
          paperId: targetPaper.id,
          analysisId: analysis.id,
          contentType: 'analysis',
          confidence: Math.max(0.86, segment.confidence || 0),
          status: 'auto_confirmed',
          manualOverride: false
        })
      }
      repo.mergeCollections(detail.id, target.id)
      repo.recalculateStatus(target.id)
    } else {
      repo.createPendingAnalysis({
        sourceFilePath: sourcePaths[0],
        sourceFileHash: detail.segments[0].source_file_hash,
        fileName,
        examType,
        year,
        session,
        setNo,
        fileSize: existsSync(sourcePaths[0]) ? statSync(sourcePaths[0]).size : 0,
        pageCount: Math.max(1, ...detail.segments.map(segment => segment.page_no)),
        segmentCount: convertedSegments.length,
        payload: {
          filePath: sourcePaths[0],
          title: detail.title,
          metadata: { examType, year, session, setNo, audioSlot: null },
          segments: convertedSegments
        },
        reason: targetPaper
          ? '对应套号卷子尚未导入真题正文'
          : '未找到同考试类型、年份、场次和套号的真题卷子'
      })
      repo.deleteCollection(detail.id)
    }
    repaired += 1
  }
  return repaired
}

function repairCollectionMetadataFromFilenames(repo: ExamCollectionRepository): number {
  let repaired = 0
  for (const summary of [...repo.listCollections()]) {
    const detail = repo.getCollection(summary.id)
    if (!detail) continue
    const scores = new Map<string, { examType: ExamPaperType; year: number; session: ExamSeason; count: number }>()
    for (const source of detail.sourceFiles) {
      if (extname(source.fileName || source.path).toLowerCase() !== '.pdf') continue
      const meta = detectMetadata(source.fileName || basename(source.path))
      if (meta.paperType === 'unknown' || meta.year == null) continue
      const key = canonicalKey(meta.paperType, meta.year, meta.season)
      const current = scores.get(key) || { examType: meta.paperType, year: meta.year, session: meta.season, count: 0 }
      current.count += 1
      scores.set(key, current)
    }
    const best = [...scores.values()].sort((left, right) => right.count - left.count)[0]
    if (!best) continue
    if (detail.exam_type === best.examType && detail.year === best.year && detail.session === best.session) continue
    const key = canonicalKey(best.examType, best.year, best.session)
    const existing = repo.findByKey(key)
    if (existing && existing.id !== detail.id) {
      repo.mergeCollections(detail.id, existing.id)
    } else {
      repo.updateCollection(detail.id, { collectionKey: key, examType: best.examType, year: best.year, session: best.session })
      repo.recalculateStatus(detail.id)
    }
    repaired += 1
  }
  return repaired
}

function repairAnalysisBindingsFromFilenames(repo: ExamCollectionRepository, db: DbWrapper): number {
  let repaired = 0
  const analyses = db.prepare('SELECT * FROM collection_analysis ORDER BY id').all() as Array<{
    id: number
    collection_id: number
    paper_id: number | null
    file_name: string | null
    source_file_path: string
  }>
  for (const analysis of analyses) {
    const fileName = analysis.file_name || basename(analysis.source_file_path)
    const meta = detectMetadata(fileName)
    if (meta.paperType === 'unknown' || meta.year == null || meta.season === 'unknown') continue
    const target = repo.findByKey(canonicalKey(meta.paperType, meta.year, meta.season))
    if (!target) continue
    const currentPaper = analysis.paper_id
      ? db.prepare('SELECT paper_no FROM collection_paper WHERE id = ?').get(analysis.paper_id) as { paper_no: number } | undefined
      : undefined
    const targetDetail = repo.getCollection(target.id)
    const paperNo = extractSetNo(fileName) || currentPaper?.paper_no || (targetDetail?.papers.length === 1 ? targetDetail.papers[0].paper_no : null)
    if (!paperNo || paperNo < 1 || paperNo > 3) continue
    const paper = repo.ensurePaper(target.id, paperNo, `卷${paperNo}`)
    if (analysis.collection_id === target.id && analysis.paper_id === paper.id) continue
    const duplicate = db.prepare(
      'SELECT id FROM collection_analysis WHERE collection_id = ? AND source_file_hash = (SELECT source_file_hash FROM collection_analysis WHERE id = ?) AND paper_id = ? AND id != ? LIMIT 1'
    ).get(target.id, analysis.id, paper.id, analysis.id) as { id: number } | undefined
    if (duplicate) {
      db.prepare('UPDATE content_segment SET analysis_id = ?, collection_id = ?, paper_id = ? WHERE analysis_id = ?').run(duplicate.id, target.id, paper.id, analysis.id)
      db.prepare('DELETE FROM collection_analysis WHERE id = ?').run(analysis.id)
    } else {
      db.prepare(
        "UPDATE collection_analysis SET collection_id = ?, paper_id = ?, title = ?, status = CASE WHEN status = 'missing' THEN 'confirmed' ELSE status END, updated_at = datetime('now') WHERE id = ?"
      ).run(target.id, paper.id, `${target.title} · 卷${paper.paper_no}解析`, analysis.id)
      db.prepare('UPDATE content_segment SET collection_id = ?, paper_id = ? WHERE analysis_id = ?').run(target.id, paper.id, analysis.id)
    }
    repaired += 1
  }
  return repaired
}

function repairAudioBindingsFromFilenames(repo: ExamCollectionRepository, db: DbWrapper): number {
  let repaired = 0
  const audios = db.prepare('SELECT * FROM collection_audio ORDER BY id').all() as Array<{
    id: number
    collection_id: number
    audio_slot: 'A' | 'B'
    file_name: string
  }>
  for (const audio of audios) {
    const meta = detectMetadata(audio.file_name)
    if (meta.paperType === 'unknown' || meta.year == null || meta.season === 'unknown') continue
    const target = repo.findByKey(canonicalKey(meta.paperType, meta.year, meta.season))
    if (!target || target.id === audio.collection_id) continue
    if (repo.getAudio(target.id, audio.audio_slot)) continue
    db.prepare("UPDATE collection_audio SET collection_id = ?, updated_at = datetime('now') WHERE id = ?").run(target.id, audio.id)
    repaired += 1
  }
  return repaired
}

function repairMisclassifiedAnalysisSegments(repo: ExamCollectionRepository): number {
  let repaired = 0
  for (const summary of repo.listCollections()) {
    const detail = repo.getCollection(summary.id)
    if (!detail?.segments.length) continue
    const sourcePaths = [...new Set(detail.segments.map(segment => segment.source_file_path).filter(Boolean))]
    for (const sourcePath of sourcePaths) {
      if (!/(?:解析|详解|分析|analysis|solution)/i.test(basename(sourcePath))) continue
      const fileName = basename(sourcePath)
      const explicitCombined = /(?:真题|试卷|试题).{0,10}(?:\+|＋|&|与|及|含|附).{0,10}(?:答案|解析|详解)|(?:答案|解析|详解).{0,10}(?:\+|＋|&|与|及).{0,10}(?:真题|试卷|试题)/i.test(fileName)
      if (explicitCombined) continue
      const sourceSegments = detail.segments.filter(segment => segment.source_file_path === sourcePath)
      if (!sourceSegments.length || sourceSegments.some(segment => segment.content_type === 'analysis')) continue
      if (sourceSegments.some(segment => !['paper', 'answer', 'listening_script'].includes(segment.content_type))) continue
      const setNo = extractSetNo(fileName)
      const targetPaper = setNo
        ? detail.papers.find(paper => paper.paper_no === setNo)
        : detail.papers.length === 1 ? detail.papers[0] : null
      if (!targetPaper) continue
      const analysis = repo.ensureAnalysis({
        collectionId: detail.id,
        paperId: targetPaper.id,
        audioSlot: null,
        title: `${detail.title} · 卷${targetPaper.paper_no}解析`,
        sourceFilePath: sourcePath,
        sourceFileHash: sourceSegments[0].source_file_hash,
        fileName,
        status: 'confirmed'
      })
      for (const segment of sourceSegments) {
        repo.updateSegment(segment.id, {
          paperId: targetPaper.id,
          analysisId: analysis.id,
          contentType: 'analysis',
          confidence: Math.max(0.9, segment.confidence || 0),
          status: 'auto_confirmed',
          manualOverride: false
        })
      }
      repaired += 1
    }
    if (repaired > 0) repo.recalculateStatus(detail.id)
  }
  return repaired
}

/**
 * 自动收敛旧版本遗留的待核对片段。
 * 只处理系统生成的片段，绝不覆盖用户手动修正过的角色；
 * answer/listening_script 统一并入 analysis，与当前阅读器数据模型保持一致。
 */
/**
 * 旧版本可能先把解析保存成独立合集，重启后才转为待绑定。
 * 当目标真题卷后来已经存在时，启动过程应自动完成绑定，而不是让用户再次手工处理。
 */
function repairResolvablePendingAnalyses(repo: ExamCollectionRepository): number {
  let repaired = 0
  for (const pending of repo.listPendingAnalyses()) {
    const fileName = pending.file_name || basename(pending.source_file_path)
    const fileMeta = detectMetadata(fileName)
    const examType = pending.exam_type !== 'unknown' ? pending.exam_type : fileMeta.paperType
    const year = pending.year ?? fileMeta.year
    const session = pending.session !== 'unknown' ? pending.session : fileMeta.season
    if (examType === 'unknown' || year == null || session === 'unknown') continue
    const collection = repo.findByKey(canonicalKey(examType, year, session))
    if (!collection) continue
    const detail = repo.getCollection(collection.id)
    if (!detail) continue
    const setNo = pending.set_no || extractSetNo(fileName)
    const paper = setNo
      ? detail.papers.find(item => item.paper_no === setNo)
      : detail.papers.length === 1 ? detail.papers[0] : undefined
    if (!paper) continue
    const hasPaperContent = detail.segments.some(segment =>
      segment.paper_id === paper.id && segment.content_type === 'paper' && ['auto_confirmed', 'confirmed'].includes(segment.status)
    )
    if (!hasPaperContent) continue
    const payload = pending.payload || {}
    const sourceSegments = Array.isArray(payload.segments) ? payload.segments : []
    if (!sourceSegments.length) continue
    const analysis = repo.ensureAnalysis({
      collectionId: collection.id,
      paperId: paper.id,
      audioSlot: payload.metadata?.audioSlot || null,
      title: collection.title + ' · 卷' + paper.paper_no + '解析',
      sourceFilePath: pending.source_file_path,
      sourceFileHash: pending.source_file_hash,
      fileName,
      status: 'confirmed'
    })
    repo.insertSegments(sourceSegments.map((segment: any, index: number) => ({
      collectionId: collection.id,
      paperId: paper.id,
      analysisId: analysis.id,
      audioSlot: segment.audioSlot || payload.metadata?.audioSlot || null,
      sourceFilePath: pending.source_file_path,
      sourceFileHash: pending.source_file_hash,
      pageNo: Math.max(1, Number(segment.pageNo) || 1),
      rangeInfo: segment.rangeInfo,
      contentType: 'analysis' as const,
      textExcerpt: segment.textExcerpt || '',
      segmentOrder: index + 1,
      confidence: Math.max(0.86, Number(segment.confidence) || 0),
      status: segment.status === 'confirmed' ? 'confirmed' as const : 'auto_confirmed' as const,
      manualOverride: segment.status === 'confirmed'
    })))
    repo.markPendingAnalysisBound(pending.id)
    repo.recalculateStatus(collection.id)
    repaired += 1
  }
  return repaired
}

function repairAutomaticSegmentConfirmation(repo: ExamCollectionRepository, db: DbWrapper): number {
  const rows = db.prepare(
    `SELECT id, collection_id, content_type, confidence, status, manual_override, source_file_path
     FROM content_segment
     WHERE status = 'pending_review' OR content_type IN ('answer', 'listening_script')`
  ).all() as Array<{
    id: number
    collection_id: number
    content_type: SegmentContentType
    confidence: number
    status: SegmentStatus
    manual_override: number
    source_file_path: string
  }>
  const allowedRoles = new Set<SegmentContentType>(['paper', 'analysis', 'answer', 'listening_script'])
  const repairedCollections = new Set<number>()
  let repaired = 0

  for (const row of rows) {
    // 手动修正优先，迁移只负责清理系统和历史自动识别的结果。
    if (Number(row.manual_override) === 1) continue
    const fileName = basename(row.source_file_path || '')
    const explicitCombined = /(?:真题|试卷|试题).{0,10}(?:\+|＋|&|与|及|含|附).{0,10}(?:答案|解析|详解)|(?:答案|解析|详解).{0,10}(?:\+|＋|&|与|及).{0,10}(?:真题|试卷|试题)/i.test(fileName)
    let contentType = allowedRoles.has(row.content_type) ? row.content_type : 'paper'

    if (row.status === 'pending_review' && analysisFileHint(fileName) && !explicitCombined) {
      contentType = 'analysis'
    }
    if (contentType === 'answer' || contentType === 'listening_script') contentType = 'analysis'

    const confidence = Math.max(0.8, Number(row.confidence) || 0)
    if (contentType === row.content_type && row.status === 'auto_confirmed' && confidence === row.confidence) continue
    repo.updateSegment(row.id, {
      contentType,
      confidence,
      status: 'auto_confirmed',
      manualOverride: false
    })
    repairedCollections.add(row.collection_id)
    repaired += 1
  }

  for (const collectionId of repairedCollections) repo.recalculateStatus(collectionId)
  return repaired
}

export function registerExamCollectionHandlers(ipcMainRef: IpcMain, db: DbWrapper): void {
  const repo = new ExamCollectionRepository(db)
  try {
    const repairedMetadata = repairCollectionMetadataFromFilenames(repo)
    const repairedCollections = repairLegacyAnalysisCollections(repo)
    const repairedAnalysisBindings = repairAnalysisBindingsFromFilenames(repo, db)
    const repairedAudioBindings = repairAudioBindingsFromFilenames(repo, db)
    const repairedPendingAnalyses = repairResolvablePendingAnalyses(repo)
    const repairedSegments = repairMisclassifiedAnalysisSegments(repo)
    const repairedSegmentRoles = repairAutomaticSegmentConfirmation(repo, db)
    if (repairedMetadata > 0 || repairedCollections > 0 || repairedAnalysisBindings > 0 || repairedAudioBindings > 0 || repairedPendingAnalyses > 0 || repairedSegments > 0 || repairedSegmentRoles > 0) saveDatabase()
  } catch (error) {
    console.warn('旧解析合集自动修复失败:', error)
  }

  ipcMainRef.handle('exam:annotations:list', (_event, scopeKey: string) => {
    try {
      return { success: true, annotations: db.prepare('SELECT * FROM exam_annotations WHERE scope_key = ? ORDER BY page_number, id').all(String(scopeKey || '')) }
    } catch (error) { return { success: false, annotations: [], message: (error as Error).message } }
  })

  ipcMainRef.handle('exam:annotations:add', (_event, payload: any) => {
    try {
      const result = db.prepare(
        `INSERT INTO exam_annotations (scope_key, page_number, annotation_type, quote, note, color, geometry_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(String(payload.scopeKey || ''), Math.max(1, Number(payload.pageNumber) || 1), String(payload.annotationType || 'highlight'), String(payload.quote || ''), String(payload.note || ''), String(payload.color || '#facc15'), payload.geometry ? JSON.stringify(payload.geometry) : null)
      saveDatabase()
      return { success: true, id: result.lastInsertRowid, annotation: db.prepare('SELECT * FROM exam_annotations WHERE id = ?').get(result.lastInsertRowid) }
    } catch (error) { return { success: false, message: (error as Error).message } }
  })

  ipcMainRef.handle('exam:annotations:updateGeometry', (_event, payload: { id: number; geometry: any }) => {
    try {
      db.prepare('UPDATE exam_annotations SET geometry_json = ? WHERE id = ?').run(JSON.stringify(payload.geometry), Number(payload.id))
      saveDatabase()
      return { success: true }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })
  ipcMainRef.handle('exam:annotations:delete', (_event, id: number) => {
    try { db.prepare('DELETE FROM exam_annotations WHERE id = ?').run(id); saveDatabase(); return { success: true } }
    catch (error) { return { success: false, message: (error as Error).message } }
  })

  ipcMainRef.handle('exam:collections:pickPdfs', async () => {
    const result = await showOpenDialog({
      title: '批量选择真题 PDF 与听力音频',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '真题与听力资源', extensions: ['pdf', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'] }]
    })
    return { success: true, canceled: result.canceled, filePaths: result.filePaths }
  })

  ipcMainRef.handle('exam:collections:pickPdfFolder', async () => {
    const result = await showOpenDialog({
      title: '选择包含真题 PDF 和听力音频的文件夹',
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return { success: true, canceled: true, folderPath: '', filePaths: [], warnings: [], truncated: false }
    const folderPath = result.filePaths[0]
    const scanned = collectCollectionImportFiles(folderPath)
    return {
      success: true,
      canceled: false,
      folderPath,
      filePaths: scanned.paths,
      warnings: [],
      truncated: scanned.truncated,
      message: scanned.paths.length
        ? `已找到 ${scanned.paths.length} 个真题或听力文件${scanned.truncated ? '（已达到单次 500 个文件上限）' : ''}`
        : '该文件夹及其子文件夹中没有 PDF 或听力音频文件'
    }
  })

  ipcMainRef.handle('exam:collections:pickAudio', async () => {
    const result = await showOpenDialog({
      title: '选择合集音频',
      properties: ['openFile'],
      filters: [{ name: '音频文件', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'] }]
    })
    return { success: true, canceled: result.canceled, filePath: result.filePaths[0] || '' }
  })

  ipcMainRef.handle('exam:collections:list', () => {
    try {
      return { success: true, collections: repo.listCollections() }
    } catch (error) {
      return { success: false, collections: [], message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:collections:reorder', (_event, payload: { collectionIds: number[] }) => {
    try {
      const collectionIds = Array.isArray(payload?.collectionIds) ? payload.collectionIds : []
      if (!collectionIds.length) return { success: false, message: '排序列表为空' }
      repo.updateCollectionOrder(collectionIds)
      saveDatabase()
      return { success: true, collections: repo.listCollections(), message: '真题顺序已保存' }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:collections:get', (_event, id: number) => {
    try {
      const collection = repo.getCollection(id)
      return collection ? { success: true, collection } : { success: false, message: '真题合集不存在' }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:collections:pendingAnalysis', () => {
    try {
      return { success: true, pending: repo.listPendingAnalyses() }
    } catch (error) {
      return { success: false, pending: [], message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:collections:bindAnalysis', (_event, payload: { pendingId: number; collectionId: number; paperNo: number }) => {
    try {
      const pending = repo.getPendingAnalysis(Number(payload.pendingId))
      if (!pending || pending.status !== 'pending') return { success: false, message: '待绑定解析不存在或已处理' }
      const collection = repo.findById(Number(payload.collectionId))
      if (!collection) return { success: false, message: '目标真题合集不存在' }
      const paperNo = Number(payload.paperNo)
      const paper = repo.getPaper(collection.id, paperNo)
      if (!paper) return { success: false, message: `目标合集没有第 ${paperNo} 套卷子` }
      const detail = repo.getCollection(collection.id)
      const hasPaperContent = detail?.segments.some(segment =>
        segment.paper_id === paper.id && segment.content_type === 'paper' && ['auto_confirmed', 'confirmed'].includes(segment.status)
      )
      if (!hasPaperContent) return { success: false, message: `第 ${paperNo} 套卷子尚未导入真题正文，不能绑定解析` }
      const importPayload = pending.payload || {}
      const segments = Array.isArray(importPayload.segments) ? importPayload.segments : []
      if (!segments.length) return { success: false, message: '待绑定解析中没有可恢复的内容片段' }
      const analysis = repo.ensureAnalysis({
        collectionId: collection.id,
        paperId: paper.id,
        audioSlot: importPayload.metadata?.audioSlot || null,
        title: `${collection.title} · 卷${paper.paper_no}解析`,
        sourceFilePath: pending.source_file_path,
        sourceFileHash: pending.source_file_hash,
        fileName: pending.file_name,
        status: segments.every((segment: any) => segment.status !== 'pending_review') ? 'confirmed' : 'pending_review'
      })
      repo.insertSegments(segments.map((segment: any, index: number) => ({
        collectionId: collection.id,
        paperId: paper.id,
        analysisId: analysis.id,
        audioSlot: segment.audioSlot || importPayload.metadata?.audioSlot || null,
        sourceFilePath: pending.source_file_path,
        sourceFileHash: pending.source_file_hash,
        pageNo: Math.max(1, Number(segment.pageNo) || 1),
        rangeInfo: segment.rangeInfo,
        contentType: 'analysis' as const,
        textExcerpt: segment.textExcerpt || '',
        segmentOrder: index + 1,
        confidence: Math.max(0, Math.min(1, Number(segment.confidence) || 0.86)),
        status: segment.status || 'auto_confirmed',
        manualOverride: segment.status === 'confirmed'
      })))
      repo.markPendingAnalysisBound(pending.id)
      const updated = repo.recalculateStatus(collection.id)
      saveDatabase()
      return { success: true, collectionId: updated.id, paperNo: paper.paper_no, collection: repo.getCollection(updated.id), message: '解析已绑定到目标试卷' }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:collections:discardPendingAnalysis', (_event, pendingId: number) => {
    try {
      const pending = repo.getPendingAnalysis(Number(pendingId))
      if (!pending || pending.status !== 'pending') return { success: false, message: '待绑定解析不存在' }
      repo.deletePendingAnalysis(Number(pendingId))
      saveDatabase()
      return { success: true, message: '待绑定解析标记已移除，原始 PDF 未删除' }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:collections:analyzePdf', async (_event, filePath: string) => {
    try {
      const analysis = await analyzeExamPdf(filePath)
      const duplicateCollectionId = repo.findCollectionIdByFileHash(analysis.fileHash)
      return { success: true, analysis, duplicateCollectionId }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:collections:analyzeAudio', (_event, filePath: string) => {
    try {
      if (!existsSync(filePath) || extname(filePath).toLowerCase() === '.pdf') return { success: false, message: '音频文件不存在或格式无效' }
      const extension = extname(filePath).toLowerCase()
      if (!['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'].includes(extension)) return { success: false, message: '不支持的音频格式' }
      const fileName = basename(filePath)
      const metadata = detectMetadata(fileName)
      return {
        success: true,
        audio: {
          filePath,
          fileName,
          examType: metadata.paperType,
          year: metadata.year,
          session: metadata.season,
          audioSlot: audioSlotFromName(fileName),
          fileSize: statSync(filePath).size
        }
      }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:collections:savePdfImport', (_event, payload: {
    filePath: string
    metadata: { examType: ExamPaperType; year: number | null; session: ExamSeason; setNo: number | null; audioSlot: 'A' | 'B' | null }
    segments: SemanticSegment[]
    title?: string
  }) => {
    try {
      if (!payload?.filePath || extname(payload.filePath).toLowerCase() !== '.pdf' || !existsSync(payload.filePath)) {
        return { success: false, message: 'PDF 文件不存在或格式无效' }
      }
      const fileHash = hashFile(payload.filePath)
      const duplicateCollectionId = repo.findCollectionIdByFileHash(fileHash)
      if (duplicateCollectionId) return { success: false, duplicate: true, collectionId: duplicateCollectionId, message: '该 PDF 已导入过，已跳过重复文件' }
      const existingPending = repo.findPendingAnalysisByHash(fileHash)
      if (existingPending) return { success: false, pendingBinding: true, pendingId: existingPending.id, message: '该解析 PDF 已在待绑定列表中' }

      const examType = normalizePaperType(payload.metadata.examType)
      const year = normalizeYear(payload.metadata.year)
      const session = normalizeSeason(payload.metadata.session)
      const metadataSetNo = Number(payload.metadata.setNo)
      const fallbackSetNo = metadataSetNo >= 1 && metadataSetNo <= 3 ? metadataSetNo : null
      const metadataReady = examType !== 'unknown' && year != null && session !== 'unknown'
      const key = metadataReady ? canonicalKey(examType, year, session) : `PENDING:${fileHash.slice(0, 12)}`
      const rawSegments = Array.isArray(payload.segments) ? payload.segments : []
      if (!rawSegments.length) return { success: false, message: '没有可保存的内容片段' }
      const parsedStrongPaper = rawSegments.some(segment => segment.contentType === 'paper' && segment.confidence >= 0.8)
      const forcedAnalysis = analysisFileHint(payload.filePath) && !parsedStrongPaper
      const segments = (forcedAnalysis
        ? rawSegments.map(segment => ({ ...segment, contentType: 'analysis' as const, confidence: Math.max(0.86, segment.confidence) }))
        : rawSegments).map(segment => {
          // 最终保存边界统一收敛角色状态：分析器只能自动确认或由用户手动修正，
          // 不再把 pending_review 写入数据库，从而消除逐片段人工确认流程。
          const userConfirmed = segment.status === 'confirmed'
          const contentType = segment.contentType === 'answer' || segment.contentType === 'listening_script'
            ? 'analysis' as const
            : segment.contentType
          return {
            ...segment,
            contentType,
            confidence: userConfirmed ? 1 : Math.max(0.8, Number(segment.confidence) || 0),
            status: userConfirmed ? 'confirmed' as const : 'auto_confirmed' as const
          }
        })
      const knownSetNos = [...new Set(segments.map(segment => segment.setNo).filter(value => value != null && value >= 1 && value <= 3))]
      if (segments.some(segment => segment.setNo != null && segment.setNo > 3)) return { success: false, message: '一个合集最多支持 3 套卷子' }
      const inferredSetNo = fallbackSetNo || (knownSetNos.length === 1 ? Number(knownSetNos[0]) : null) || extractSetNo(payload.filePath) || extractSetNo(payload.title || '')
      const hasPaperSegments = segments.some(segment => segment.contentType === 'paper')

      if (!hasPaperSegments) {
        let targetCollection = metadataReady ? repo.findByKey(key) : undefined
        if (!targetCollection && examType !== 'unknown' && year != null) {
          const candidates = repo.listCollections().filter(item =>
            item.exam_type === examType && item.year === year &&
            item.segmentCount > 0 && item.id !== duplicateCollectionId
          )
          if (candidates.length === 1) targetCollection = repo.findById(candidates[0].id)
        }
        const targetDetail = targetCollection ? repo.getCollection(targetCollection.id) : null
        const targetPaperNo = inferredSetNo || (targetDetail?.papers.length === 1 ? targetDetail.papers[0].paper_no : null)
        const targetPaper = targetCollection && targetPaperNo ? repo.getPaper(targetCollection.id, targetPaperNo) : null
        const hasPaperContent = Boolean(targetPaper && targetDetail?.segments.some(segment =>
          segment.paper_id === targetPaper.id && segment.content_type === 'paper' && ['auto_confirmed', 'confirmed'].includes(segment.status)
        ))

        if (targetCollection && targetPaper && hasPaperContent) {
          const analysisStatus = 'confirmed' as const
          const analysis = repo.ensureAnalysis({
            collectionId: targetCollection.id,
            paperId: targetPaper.id,
            audioSlot: payload.metadata.audioSlot,
            title: `${targetCollection.title} · 卷${targetPaper.paper_no}解析`,
            sourceFilePath: payload.filePath,
            sourceFileHash: fileHash,
            fileName: basename(payload.filePath),
            status: analysisStatus
          })
          repo.insertSegments(segments.map((segment, index) => ({
            collectionId: targetCollection!.id,
            paperId: targetPaper.id,
            analysisId: analysis.id,
            audioSlot: segment.audioSlot || payload.metadata.audioSlot,
            sourceFilePath: payload.filePath,
            sourceFileHash: fileHash,
            pageNo: Math.max(1, Number(segment.pageNo) || 1),
            rangeInfo: segment.rangeInfo,
            contentType: 'analysis' as const,
            textExcerpt: segment.textExcerpt || '',
            segmentOrder: index + 1,
            confidence: Math.max(0, Math.min(1, Number(segment.confidence) || 0)),
            status: segment.status || 'auto_confirmed',
            manualOverride: segment.status === 'confirmed'
          })))
          const updated = repo.recalculateStatus(targetCollection.id)
          saveDatabase()
          return {
            success: true,
            bound: true,
            collectionId: updated.id,
            paperNo: targetPaper.paper_no,
            collection: repo.getCollection(updated.id),
            message: `解析已绑定到 ${targetCollection.title} 卷${targetPaper.paper_no}`
          }
        }

        const reason = !metadataReady
          ? '解析 PDF 的考试类型、年份或场次不完整'
          : !targetCollection
            ? '未找到同考试类型、年份和场次的真题合集'
            : !targetPaper
              ? `未找到第 ${inferredSetNo || '?'} 套卷子，无法确定绑定目标`
              : '对应套号卷子尚未导入真题正文'
        const pending = repo.createPendingAnalysis({
          sourceFilePath: payload.filePath,
          sourceFileHash: fileHash,
          fileName: basename(payload.filePath),
          examType,
          year,
          session,
          setNo: inferredSetNo,
          fileSize: statSync(payload.filePath).size,
          pageCount: Math.max(1, ...segments.map(segment => Number(segment.pageNo) || 1)),
          segmentCount: segments.length,
          payload: { filePath: payload.filePath, title: payload.title, metadata: payload.metadata, segments },
          reason
        })
        saveDatabase()
        return {
          success: false,
          pendingBinding: true,
          pendingId: pending.id,
          message: `${reason}，解析已标记为待绑定，不会创建独立合集`
        }
      }

      let collection = repo.findByKey(key)
      if (!collection) {
        collection = repo.createCollection({
          collectionKey: key,
          examType,
          year,
          session,
          title: payload.title || collectionTitle(examType, year, session),
          status: 'review_required'
        })
      }

      const defaultPaperNo = inferredSetNo || (knownSetNos.length === 1 ? Number(knownSetNos[0]) : 1)
      const paperMap = new Map<number, number>()
      const ensurePaperId = (paperNo: number): number => {
        if (!paperMap.has(paperNo)) paperMap.set(paperNo, repo.ensurePaper(collection!.id, paperNo, `卷${paperNo}`).id)
        return paperMap.get(paperNo)!
      }

      const prepared = segments.map((segment, index) => {
        const segmentSetNo = segment.setNo && segment.setNo >= 1 && segment.setNo <= 3 ? segment.setNo : null
        let paperNo: number | null = segmentSetNo || (knownSetNos.length === 1 ? Number(knownSetNos[0]) : null)
        if (paperNo == null && knownSetNos.length <= 1) paperNo = defaultPaperNo
        const paperId = paperNo ? ensurePaperId(paperNo) : null
        return { ...segment, paperId, paperNo, order: index + 1 }
      })

      let analysisId: number | null = null
      const analysisSegments = prepared.filter(segment => segment.contentType === 'analysis')
      if (analysisSegments.length) {
        const analysisPaperId = analysisSegments.find(segment => segment.paperId)?.paperId || null
        const analysisStatus = 'confirmed' as const
        const analysis = repo.ensureAnalysis({
          collectionId: collection.id,
          paperId: analysisPaperId,
          audioSlot: payload.metadata.audioSlot,
          title: `${collection.title}解析`,
          sourceFilePath: payload.filePath,
          sourceFileHash: fileHash,
          fileName: basename(payload.filePath),
          status: analysisStatus
        })
        analysisId = analysis.id
      }

      repo.insertSegments(prepared.map(segment => ({
        collectionId: collection!.id,
        paperId: segment.paperId,
        analysisId: segment.contentType === 'analysis' ? analysisId : null,
        audioSlot: segment.audioSlot || payload.metadata.audioSlot,
        sourceFilePath: payload.filePath,
        sourceFileHash: fileHash,
        pageNo: Math.max(1, Number(segment.pageNo) || 1),
        rangeInfo: segment.rangeInfo,
        contentType: segment.contentType,
        textExcerpt: segment.textExcerpt || '',
        segmentOrder: segment.order,
        confidence: Math.max(0, Math.min(1, Number(segment.confidence) || 0)),
        status: segment.status || 'pending_review',
        manualOverride: segment.status === 'confirmed'
      })))

      for (const paperNo of paperMap.keys()) repo.markPaperReady(collection.id, paperNo)
      const updated = repo.recalculateStatus(collection.id)
      saveDatabase()
      return { success: true, collectionId: updated.id, collection: repo.getCollection(updated.id), message: 'PDF 语义分析结果已保存' }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:collections:saveAudioImport', (_event, payload: {
    filePath: string
    metadata: { examType: ExamPaperType; year: number | null; session: ExamSeason; audioSlot: 'A' | 'B' | null }
  }) => {
    let managedPath = ''
    try {
      if (!payload?.filePath || !existsSync(payload.filePath) || !statSync(payload.filePath).isFile()) return { success: false, message: '音频文件不存在' }
      const extension = extname(payload.filePath).toLowerCase()
      if (!['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'].includes(extension)) return { success: false, message: '不支持的音频格式' }
      const examType = normalizePaperType(payload.metadata?.examType)
      const year = normalizeYear(payload.metadata?.year)
      const session = normalizeSeason(payload.metadata?.session)
      if (examType === 'unknown' || year == null || session === 'unknown') {
        return { success: false, message: '听力音频的考试类型、年份或场次不完整，无法自动绑定合集' }
      }
      const collection = repo.findByKey(canonicalKey(examType, year, session))
      if (!collection) return { success: false, message: '未找到对应的真题合集，请先导入真题 PDF' }
      let slot = payload.metadata?.audioSlot === 'A' || payload.metadata?.audioSlot === 'B' ? payload.metadata.audioSlot : null
      if (!slot) {
        if (!repo.getAudio(collection.id, 'A')) slot = 'A'
        else if (!repo.getAudio(collection.id, 'B')) slot = 'B'
        else return { success: false, message: '该合集已有听力 A 和 B，请先移除或手动替换' }
      }
      const fileHash = hashFile(payload.filePath)
      const duplicate = repo.findAudioByHash(fileHash)
      if (duplicate && duplicate.collection_id !== collection.id) {
        return { success: false, duplicate: true, message: '该音频文件已导入到其他真题合集' }
      }
      const root = join(app.getPath('userData'), 'ExamLibrary', 'CollectionAudio', String(collection.id))
      mkdirSync(root, { recursive: true })
      managedPath = uniqueFile(root, `${slot}-${safeSegment(basename(payload.filePath), `audio${extension}`)}`)
      copyFileSync(payload.filePath, managedPath)
      const old = repo.getAudio(collection.id, slot)
      const audio = repo.upsertAudio({
        collectionId: collection.id,
        slot,
        label: `听力 ${slot}`,
        sourceFilePath: payload.filePath,
        managedFilePath: managedPath,
        fileName: basename(payload.filePath),
        fileHash,
        fileSize: statSync(managedPath).size,
        mimeType: audioMime(payload.filePath)
      })
      if (old?.managed_file_path && old.managed_file_path !== managedPath && existsSync(old.managed_file_path) && isPathInside(app.getPath('userData'), old.managed_file_path)) {
        try { unlinkSync(old.managed_file_path) } catch {}
      }
      saveDatabase()
      return { success: true, collectionId: collection.id, audio, message: `听力 ${slot} 已自动绑定到合集` }
    } catch (error) {
      if (managedPath && existsSync(managedPath)) { try { unlinkSync(managedPath) } catch {} }
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:collections:pickAudioFiles', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择听力 A/B 音频',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '音频文件', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'] }]
    })
    return { success: true, canceled: result.canceled, filePaths: result.filePaths }
  })

  ipcMainRef.handle('exam:collections:importAudio', (_event, payload: { collectionId: number; audioSlot: 'A' | 'B'; filePath: string }) => {
    let managedPath = ''
    try {
      const collection = repo.findById(payload.collectionId)
      if (!collection) return { success: false, message: '真题合集不存在' }
      if (!['A', 'B'].includes(payload.audioSlot)) return { success: false, message: '音频槽位只能为 A 或 B' }
      if (!existsSync(payload.filePath) || !statSync(payload.filePath).isFile()) return { success: false, message: '音频文件不存在' }
      const extension = extname(payload.filePath).toLowerCase()
      if (!['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'].includes(extension)) return { success: false, message: '不支持的音频格式' }
      const fileHash = hashFile(payload.filePath)
      const duplicate = repo.findAudioByHash(fileHash)
      if (duplicate && duplicate.collection_id !== payload.collectionId) {
        return { success: false, duplicate: true, message: '该音频文件已导入到题库' }
      }
      const root = join(app.getPath('userData'), 'ExamLibrary', 'CollectionAudio', String(payload.collectionId))
      mkdirSync(root, { recursive: true })
      managedPath = uniqueFile(root, `${payload.audioSlot}-${safeSegment(basename(payload.filePath), `audio${extension}`)}`)
      copyFileSync(payload.filePath, managedPath)
      const old = repo.getAudio(payload.collectionId, payload.audioSlot)
      const audio = repo.upsertAudio({
        collectionId: payload.collectionId,
        slot: payload.audioSlot,
        label: `听力 ${payload.audioSlot}`,
        sourceFilePath: payload.filePath,
        managedFilePath: managedPath,
        fileName: basename(payload.filePath),
        fileHash,
        fileSize: statSync(managedPath).size,
        mimeType: audioMime(payload.filePath)
      })
      if (old?.managed_file_path && old.managed_file_path !== managedPath && existsSync(old.managed_file_path) && isPathInside(app.getPath('userData'), old.managed_file_path)) {
        try { unlinkSync(old.managed_file_path) } catch {}
      }
      saveDatabase()
      return { success: true, audio, message: `已导入听力 ${payload.audioSlot}` }
    } catch (error) {
      if (managedPath && existsSync(managedPath)) { try { unlinkSync(managedPath) } catch {} }
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:collections:audioData', (_event, payload: { collectionId: number; audioSlot: 'A' | 'B' }) => {
    try {
      const audio = repo.getAudio(payload.collectionId, payload.audioSlot)
      if (!audio) return { success: false, message: '该合集没有对应音频' }
      const filePath = audio.managed_file_path && existsSync(audio.managed_file_path) ? audio.managed_file_path : audio.source_file_path
      if (!existsSync(filePath)) return { success: false, message: '音频文件已失联' }
      return { success: true, audio, data: readFileSync(filePath), mimeType: audio.mime_type || audioMime(filePath) }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:collections:removeAudio', (_event, payload: { collectionId: number; audioSlot: 'A' | 'B' }) => {
    try {
      const audio = repo.getAudio(payload.collectionId, payload.audioSlot)
      if (!audio) return { success: false, message: '音频不存在' }
      repo.deleteAudio(payload.collectionId, payload.audioSlot)
      if (audio.managed_file_path && existsSync(audio.managed_file_path) && isPathInside(app.getPath('userData'), audio.managed_file_path)) {
        try { unlinkSync(audio.managed_file_path) } catch {}
      }
      saveDatabase()
      return { success: true }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:collections:updateMetadata', (_event, payload: {
    collectionId: number
    examType: ExamPaperType
    year: number | null
    session: ExamSeason
    title?: string
  }) => {
    try {
      const current = repo.findById(payload.collectionId)
      if (!current) return { success: false, message: '真题合集不存在' }
      const examType = normalizePaperType(payload.examType)
      const year = normalizeYear(payload.year)
      const session = normalizeSeason(payload.session)
      const metadataReady = examType !== 'unknown' && year != null && session !== 'unknown'
      const key = metadataReady ? canonicalKey(examType, year, session) : current.collection_key
      const target = repo.findByKey(key)
      if (metadataReady && target && target.id !== current.id) {
        repo.mergeCollections(current.id, target.id)
        repo.updateCollection(target.id, { examType, year, session, title: payload.title || collectionTitle(examType, year, session), status: 'review_required' })
        const updated = repo.recalculateStatus(target.id)
        saveDatabase()
        return { success: true, merged: true, collection: repo.getCollection(updated.id) }
      }
      const updated = repo.updateCollection(current.id, {
        collectionKey: key, examType, year, session,
        title: payload.title || collectionTitle(examType, year, session), status: 'review_required'
      })
      const recalculated = repo.recalculateStatus(updated.id)
      saveDatabase()
      return { success: true, collection: repo.getCollection(recalculated.id) }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:segments:extractText', async (_event, payload: { filePath: string; pageNo: number; rects: SemanticRangeRect[] }) => {
    try {
      if (!existsSync(payload.filePath)) return { success: false, message: '原 PDF 文件不存在' }
      const text = await extractTextInPdfRects(payload.filePath, Number(payload.pageNo), payload.rects || [])
      return { success: true, text }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:segments:createManual', async (_event, payload: {
    collectionId: number
    sourceFilePath: string
    pageNo: number
    rects: SemanticRangeRect[]
    contentType: SegmentContentType
    paperNo?: number | null
    audioSlot?: 'A' | 'B' | null
    text?: string
  }) => {
    try {
      const collection = repo.findById(payload.collectionId)
      if (!collection) return { success: false, message: '真题合集不存在' }
      if (!existsSync(payload.sourceFilePath) || extname(payload.sourceFilePath).toLowerCase() !== '.pdf') return { success: false, message: '原 PDF 文件不存在' }
      const fileHash = hashFile(payload.sourceFilePath)
      const paperNo = payload.paperNo && payload.paperNo >= 1 && payload.paperNo <= 3 ? Number(payload.paperNo) : null
      const paper = paperNo ? repo.ensurePaper(collection.id, paperNo, `卷${paperNo}`) : null
      const text = String(payload.text || '').trim() || await extractTextInPdfRects(payload.sourceFilePath, payload.pageNo, payload.rects)
      let analysisId: number | null = null
      if (payload.contentType === 'analysis') {
        const analysis = repo.ensureAnalysis({
          collectionId: collection.id,
          paperId: paper?.id || null,
          audioSlot: payload.audioSlot || null,
          title: `${collection.title}解析`,
          sourceFilePath: payload.sourceFilePath,
          sourceFileHash: fileHash,
          fileName: basename(payload.sourceFilePath),
          status: 'confirmed'
        })
        analysisId = analysis.id
      }
      const segment = repo.insertSegment({
        collectionId: collection.id,
        paperId: paper?.id || null,
        analysisId,
        audioSlot: payload.audioSlot || null,
        sourceFilePath: payload.sourceFilePath,
        sourceFileHash: fileHash,
        pageNo: Math.max(1, Number(payload.pageNo) || 1),
        rangeInfo: {
          coordinateSpace: 'normalized-0-1', source: 'manual_rect',
          textStart: 0, textEnd: text.length, rects: payload.rects,
          lineCount: text ? text.split(/\n/).length : 0
        },
        contentType: payload.contentType,
        textExcerpt: text,
        segmentOrder: Date.now(),
        confidence: 1,
        status: 'confirmed',
        manualOverride: true
      })
      if (paperNo) repo.markPaperReady(collection.id, paperNo)
      repo.recalculateStatus(collection.id)
      saveDatabase()
      return { success: true, segment, collection: repo.getCollection(collection.id) }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:segments:update', (_event, payload: {
    segmentId: number
    contentType?: SegmentContentType
    status?: SegmentStatus
    paperNo?: number | null
    audioSlot?: 'A' | 'B' | null
  }) => {
    try {
      const row = db.prepare('SELECT * FROM content_segment WHERE id = ?').get(payload.segmentId) as any
      if (!row) return { success: false, message: '内容片段不存在' }
      const paperNo = payload.paperNo && payload.paperNo >= 1 && payload.paperNo <= 3 ? Number(payload.paperNo) : null
      const paper = paperNo ? repo.ensurePaper(row.collection_id, paperNo, `卷${paperNo}`) : null
      const existing = repo.updateSegment(payload.segmentId, {
        contentType: payload.contentType,
        status: payload.status,
        audioSlot: payload.audioSlot,
        paperId: paper?.id,
        manualOverride: payload.status === 'confirmed'
      })
      repo.recalculateStatus(row.collection_id)
      saveDatabase()
      return { success: true, segment: existing, collection: repo.getCollection(row.collection_id) }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:segments:delete', (_event, segmentId: number) => {
    try {
      const row = db.prepare('SELECT collection_id FROM content_segment WHERE id = ?').get(segmentId) as { collection_id: number } | undefined
      if (!row) return { success: false, message: '内容片段不存在' }
      repo.deleteSegment(segmentId)
      repo.recalculateStatus(row.collection_id)
      saveDatabase()
      return { success: true }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:collections:readSourcePdf', (_event, filePath: string) => {
    try {
      if (!existsSync(filePath)) return { success: false, message: '原 PDF 文件不存在' }
      return { success: true, data: readFileSync(filePath) }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:collections:showSource', (_event, filePath: string) => {
    try {
      if (!existsSync(filePath)) return { success: false, message: '原文件不存在' }
      shell.showItemInFolder(filePath)
      return { success: true }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMainRef.handle('exam:collections:delete', (_event, collectionId: number) => {
    try {
      const detail = repo.getCollection(collectionId)
      if (!detail) return { success: false, message: '真题合集不存在' }
      for (const audio of detail.audio) {
        if (audio.managed_file_path && existsSync(audio.managed_file_path) && isPathInside(app.getPath('userData'), audio.managed_file_path)) {
          try { unlinkSync(audio.managed_file_path) } catch {}
        }
      }
      repo.deleteCollection(collectionId)
      saveDatabase()
      return { success: true }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })
}
