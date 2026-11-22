/**
 * Browser exam import service.
 *
 * Ported from electron/ipc/exam-collection.handler.ts. The flow stays the same:
 * pick bytes → parse → dedupe by hash → create/reuse collection + papers +
 * segments → bind analysis to a paper or stash it as pending → bind audio A/B.
 * The only material change: bytes come from the staged browser picker and are
 * persisted to IndexedDB by resource id instead of a managed on-disk path.
 */
import { initExamDb, getExamDb, type DbHandle } from './db'
import { getExamRepository, type ExamCollectionRepository } from './repository'
import { analyzeExamPdf, extractTextInPdfRects, type ExamPdfSemanticAnalysis, type SemanticRangeRect, type SemanticSegment } from './parser'
import { detectMetadata } from './metadata'
import { sha256Hex } from './sha256'
import { putExamFile, getExamFile, deleteExamFile } from './idb'
import { readStagedFileBytes, stagedFileName, stagedMime, unstageFile } from './stage'
import { examSeasonLabel } from '../../lib/examMetadata'

type ExamPaperType = ExamPaperTypeKey
type ExamSeason = ExamSeasonKey
type SegmentContentType = CollectionContentType
type SegmentStatus = CollectionSegmentStatus

const AUDIO_EXTS = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'])

function normalizeYear(value: unknown): number | null {
  const year = Number(value)
  return Number.isInteger(year) && year >= 2000 && year <= 2099 ? year : null
}

function normalizeSeason(value: unknown): ExamSeason {
  return /^(0[1-9]|1[0-2])$/.test(String(value ?? '')) ? String(value) as ExamSeason : 'unknown'
}

function normalizePaperType(value: unknown): ExamPaperType {
  return ['basic-primary', 'basic-junior', 'basic-senior', 'CET4', 'CET6', 'POSTGRAD', 'IELTS', 'TOEFL', 'unknown'].includes(String(value))
    ? (String(value) as ExamPaperType)
    : 'unknown'
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

function analysisFileHint(value: string): boolean {
  return /(?:解析|答案|详解|分析|analysis|answer|solution)/i.test(value)
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

function audioMime(fileName: string): string {
  const extension = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]
  return extension === 'wav' ? 'audio/wav'
    : extension === 'm4a' ? 'audio/mp4'
      : extension === 'aac' ? 'audio/aac'
        : extension === 'ogg' ? 'audio/ogg'
          : extension === 'flac' ? 'audio/flac'
            : 'audio/mpeg'
}

function extOf(fileName: string): string {
  return /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase() || ''
}

async function ensureDb(): Promise<{ db: DbHandle; repo: ExamCollectionRepository }> {
  await initExamDb()
  return { db: getExamDb(), repo: getExamRepository() }
}

async function loadStagedBytes(filePath: string): Promise<ArrayBuffer | null> {
  // Browser path: staged in memory first; fall back to the persisted exam file store.
  const staged = await readStagedFileBytes(filePath)
  if (staged) return staged
  const persisted = await getExamFile(filePath)
  return persisted ? persisted.bytes : null
}

/** Analyze a picked PDF without persisting it yet (dialog preview step). */
export async function analyzePdf(filePath: string): Promise<{ success: boolean; analysis?: ExamPdfSemanticAnalysis; duplicateCollectionId?: number | null; message?: string }> {
  try {
    const bytes = await loadStagedBytes(filePath)
    if (!bytes) return { success: false, message: 'PDF 已不在本地暂存区，请重新选择文件' }
    const fileName = stagedFileName(filePath)
    const analysis = await analyzeExamPdf({ bytes, fileName, filePath })
    const { repo } = await ensureDb()
    const duplicateCollectionId = repo.findCollectionIdByFileHash(analysis.fileHash)
    return { success: true, analysis, duplicateCollectionId }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/** Analyze a picked audio file: metadata + slot detection only (no parse). */
export async function analyzeAudio(filePath: string): Promise<{ success: boolean; audio?: { filePath: string; fileName: string; examType: ExamPaperType; year: number | null; session: ExamSeason; audioSlot: 'A' | 'B' | null; fileSize: number }; message?: string }> {
  try {
    const bytes = await loadStagedBytes(filePath)
    if (!bytes) return { success: false, message: '音频已不在本地暂存区，请重新选择文件' }
    const fileName = stagedFileName(filePath)
    const extension = extOf(fileName)
    if (!AUDIO_EXTS.has(extension)) return { success: false, message: '不支持的音频格式' }
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
        fileSize: bytes.byteLength
      }
    }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/** Save an analyzed PDF: create/reuse collection, insert segments, bind or stash analysis. */
export async function savePdfImport(payload: {
  filePath: string
  metadata: { examType: ExamPaperType; year: number | null; session: ExamSeason; setNo: number | null; audioSlot: 'A' | 'B' | null }
  segments: SemanticSegment[]
  title?: string
}): Promise<{
  success: boolean
  duplicate?: boolean
  duplicateCollectionId?: number
  pendingBinding?: boolean
  pendingId?: number
  bound?: boolean
  paperNo?: number
  collectionId?: number
  collection?: ExamCollectionDetail
  message: string
}> {
  try {
    const { db, repo } = await ensureDb()
    const bytes = await loadStagedBytes(payload.filePath)
    if (!bytes) return { success: false, message: 'PDF 已不在本地暂存区，请重新选择文件' }
    const fileName = stagedFileName(payload.filePath)
    if (extOf(fileName) !== 'pdf') return { success: false, message: '仅支持 PDF 真题文件' }

    // Recompute hash from bytes to match the dedupe path used at analyze time.
    const analysis = await analyzeExamPdf({ bytes, fileName, filePath: payload.filePath })
    const fileHash = analysis.fileHash

    const duplicateCollectionId = repo.findCollectionIdByFileHash(fileHash)
    if (duplicateCollectionId) return { success: false, duplicate: true, duplicateCollectionId, message: '该 PDF 已导入过，已跳过重复文件' }
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
    const forcedAnalysis = analysisFileHint(fileName) && !parsedStrongPaper
    const segments = (forcedAnalysis
      ? rawSegments.map(segment => ({ ...segment, contentType: 'analysis' as const, confidence: Math.max(0.86, segment.confidence) }))
      : rawSegments).map(segment => {
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
    const inferredSetNo = fallbackSetNo || (knownSetNos.length === 1 ? Number(knownSetNos[0]) : null) || extractSetNo(fileName) || extractSetNo(payload.title || '')
    const hasPaperSegments = segments.some(segment => segment.contentType === 'paper')

    // Persist the PDF bytes under the resource id referenced by source_file_path.
    await putExamFile(payload.filePath, bytes, fileName, 'application/pdf')

    if (!hasPaperSegments) {
      let targetCollection = metadataReady ? repo.findByKey(key) : undefined
      if (!targetCollection && examType !== 'unknown' && year != null) {
        const candidates = repo.listCollections().filter(item =>
          item.exam_type === examType && item.year === year && item.segmentCount > 0 && item.id !== duplicateCollectionId
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
        const analysisRecord = repo.ensureAnalysis({
          collectionId: targetCollection.id,
          paperId: targetPaper.id,
          audioSlot: payload.metadata.audioSlot,
          title: `${targetCollection.title} · 卷${targetPaper.paper_no}解析`,
          sourceFilePath: payload.filePath,
          sourceFileHash: fileHash,
          fileName,
          status: 'confirmed'
        })
        repo.insertSegments(segments.map((segment, index) => ({
          collectionId: targetCollection.id,
          paperId: targetPaper.id,
          analysisId: analysisRecord.id,
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
        await db.persist()
        unstageFile(payload.filePath)
        return {
          success: true,
          bound: true,
          collectionId: updated.id,
          paperNo: targetPaper.paper_no,
          collection: repo.getCollection(updated.id) ?? undefined,
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
        fileName,
        examType,
        year,
        session,
        setNo: inferredSetNo,
        fileSize: bytes.byteLength,
        pageCount: Math.max(1, ...segments.map(segment => Number(segment.pageNo) || 1)),
        segmentCount: segments.length,
        payload: { filePath: payload.filePath, title: payload.title, metadata: payload.metadata, segments },
        reason
      })
      await db.persist()
      unstageFile(payload.filePath)
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
      const analysisRecord = repo.ensureAnalysis({
        collectionId: collection.id,
        paperId: analysisPaperId,
        audioSlot: payload.metadata.audioSlot,
        title: `${collection.title}解析`,
        sourceFilePath: payload.filePath,
        sourceFileHash: fileHash,
        fileName,
        status: 'confirmed'
      })
      analysisId = analysisRecord.id
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
    await db.persist()
    unstageFile(payload.filePath)
    return { success: true, collectionId: updated.id, collection: repo.getCollection(updated.id) ?? undefined, message: 'PDF 语义分析结果已保存' }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/** Persist audio bytes and bind to the matching collection's A/B slot. */
export async function saveAudioImport(payload: {
  filePath: string
  metadata: { examType: ExamPaperType; year: number | null; session: ExamSeason; audioSlot: 'A' | 'B' | null }
}): Promise<{ success: boolean; collectionId?: number; audio?: ExamCollectionAudio; duplicate?: boolean; message: string }> {
  try {
    const { db, repo } = await ensureDb()
    const bytes = await loadStagedBytes(payload.filePath)
    if (!bytes) return { success: false, message: '音频已不在本地暂存区，请重新选择文件' }
    const fileName = stagedFileName(payload.filePath)
    const extension = extOf(fileName)
    if (!AUDIO_EXTS.has(extension)) return { success: false, message: '不支持的音频格式' }

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

    const fileHash = await sha256Hex(bytes)
    const duplicate = repo.findAudioByHash(fileHash)
    if (duplicate && duplicate.collection_id !== collection.id) {
      return { success: false, duplicate: true, message: '该音频文件已导入到其他真题合集' }
    }

    await putExamFile(payload.filePath, bytes, fileName, stagedMime(payload.filePath) || audioMime(fileName))
    const old = repo.getAudio(collection.id, slot)
    const audio = repo.upsertAudio({
      collectionId: collection.id,
      slot,
      label: `听力 ${slot}`,
      sourceFilePath: payload.filePath,
      managedFilePath: null,
      fileName,
      fileHash,
      fileSize: bytes.byteLength,
      mimeType: stagedMime(payload.filePath) || audioMime(fileName)
    })
    if (old?.source_file_path) await deleteExamFile(old.source_file_path).catch(() => undefined)
    await db.persist()
    unstageFile(payload.filePath)
    return { success: true, collectionId: collection.id, audio, message: `听力 ${slot} 已自动绑定到合集` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

/** Read persisted exam file bytes (PDF or audio) by resource id. */
export async function readExamFileBytes(resourceId: string): Promise<{ bytes: ArrayBuffer; fileName: string; mime: string } | null> {
  return getExamFile(resourceId)
}

/** Extract text overlapping rects from a persisted/staged PDF. */
export async function extractSegmentText(resourceId: string, pageNo: number, rects: SemanticRangeRect[]): Promise<string> {
  const bytes = await loadStagedBytes(resourceId)
  if (!bytes) throw new Error('原 PDF 文件已不在本地')
  return extractTextInPdfRects({ bytes, pageNo, rects })
}

// --- Collection / pending / audio / segment read-write helpers for the bridge ---

export async function listCollections(): Promise<ExamCollectionSummary[]> {
  await initExamDb()
  return getExamRepository().listCollections()
}

export async function getCollection(id: number): Promise<ExamCollectionDetail | null> {
  await initExamDb()
  return getExamRepository().getCollection(Number(id))
}

export async function listPendingAnalyses(): Promise<PendingAnalysisImport[]> {
  await initExamDb()
  return getExamRepository().listPendingAnalyses()
}

export async function reorderCollections(collectionIds: number[]): Promise<ExamCollectionSummary[]> {
  const { db, repo } = await ensureDb()
  repo.updateCollectionOrder(collectionIds)
  await db.persist()
  return repo.listCollections()
}

export async function bindPendingAnalysis(payload: { pendingId: number; collectionId: number; paperNo: number }): Promise<{ success: boolean; collectionId?: number; paperNo?: number; collection?: ExamCollectionDetail; message: string }> {
  try {
    const { db, repo } = await ensureDb()
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
    await db.persist()
    return { success: true, collectionId: updated.id, paperNo: paper.paper_no, collection: repo.getCollection(updated.id) ?? undefined, message: '解析已绑定到目标试卷' }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

export async function discardPendingAnalysis(pendingId: number): Promise<{ success: boolean; message: string }> {
  const { db, repo } = await ensureDb()
  const pending = repo.getPendingAnalysis(Number(pendingId))
  if (!pending || pending.status !== 'pending') return { success: false, message: '待绑定解析不存在' }
  repo.deletePendingAnalysis(Number(pendingId))
  await db.persist()
  return { success: true, message: '待绑定解析标记已移除，原始 PDF 未删除' }
}

export async function getCollectionAudioData(payload: { collectionId: number; audioSlot: 'A' | 'B' }): Promise<{ success: boolean; audio?: ExamCollectionAudio; data?: Uint8Array; mimeType?: string; message?: string }> {
  const { repo } = await ensureDb()
  const audio = repo.getAudio(payload.collectionId, payload.audioSlot)
  if (!audio) return { success: false, message: '该合集没有对应音频' }
  const record = await getExamFile(audio.source_file_path)
  if (!record) return { success: false, message: '音频文件已失联' }
  return { success: true, audio, data: new Uint8Array(record.bytes), mimeType: record.mime || audio.mime_type || 'audio/mpeg' }
}

export async function removeCollectionAudio(payload: { collectionId: number; audioSlot: 'A' | 'B' }): Promise<{ success: boolean; message: string }> {
  const { db, repo } = await ensureDb()
  const audio = repo.getAudio(payload.collectionId, payload.audioSlot)
  if (!audio) return { success: false, message: '音频不存在' }
  repo.deleteAudio(payload.collectionId, payload.audioSlot)
  await deleteExamFile(audio.source_file_path).catch(() => undefined)
  await db.persist()
  return { success: true, message: '听力音频已移除' }
}

export async function updateCollectionMetadata(payload: {
  collectionId: number
  examType: ExamPaperType
  year: number | null
  session: ExamSeason
  title?: string
}): Promise<{ success: boolean; merged?: boolean; collection?: ExamCollectionDetail; message: string }> {
  try {
    const { db, repo } = await ensureDb()
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
      await db.persist()
      return { success: true, merged: true, collection: repo.getCollection(updated.id) ?? undefined, message: '已合并到同场次合集' }
    }
    const updated = repo.updateCollection(current.id, {
      collectionKey: key, examType, year, session,
      title: payload.title || collectionTitle(examType, year, session), status: 'review_required'
    })
    const recalculated = repo.recalculateStatus(updated.id)
    await db.persist()
    return { success: true, collection: repo.getCollection(recalculated.id) ?? undefined, message: '合集信息已更新' }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

export async function deleteCollection(collectionId: number): Promise<{ success: boolean; message: string }> {
  const { db, repo } = await ensureDb()
  const detail = repo.getCollection(collectionId)
  if (!detail) return { success: false, message: '真题合集不存在' }
  for (const audio of detail.audio) await deleteExamFile(audio.source_file_path).catch(() => undefined)
  for (const source of detail.sourceFiles) await deleteExamFile(source.path).catch(() => undefined)
  repo.deleteCollection(collectionId)
  await db.persist()
  return { success: true, message: '真题合集已删除' }
}

/** Import an audio file directly into an existing collection's explicit slot. */
export async function importCollectionAudio(payload: { collectionId: number; audioSlot: 'A' | 'B'; filePath: string }): Promise<{ success: boolean; audio?: ExamCollectionAudio; duplicate?: boolean; message: string }> {
  try {
    const { db, repo } = await ensureDb()
    const collection = repo.findById(payload.collectionId)
    if (!collection) return { success: false, message: '真题合集不存在' }
    if (!['A', 'B'].includes(payload.audioSlot)) return { success: false, message: '音频槽位只能为 A 或 B' }
    const bytes = await loadStagedBytes(payload.filePath)
    if (!bytes) return { success: false, message: '音频已不在本地暂存区，请重新选择文件' }
    const fileName = stagedFileName(payload.filePath)
    const extension = extOf(fileName)
    if (!AUDIO_EXTS.has(extension)) return { success: false, message: '不支持的音频格式' }
    const fileHash = await sha256Hex(bytes)
    const duplicate = repo.findAudioByHash(fileHash)
    if (duplicate && duplicate.collection_id !== payload.collectionId) {
      return { success: false, duplicate: true, message: '该音频文件已导入到题库' }
    }
    await putExamFile(payload.filePath, bytes, fileName, stagedMime(payload.filePath) || audioMime(fileName))
    const old = repo.getAudio(payload.collectionId, payload.audioSlot)
    const audio = repo.upsertAudio({
      collectionId: payload.collectionId,
      slot: payload.audioSlot,
      label: `听力 ${payload.audioSlot}`,
      sourceFilePath: payload.filePath,
      managedFilePath: null,
      fileName,
      fileHash,
      fileSize: bytes.byteLength,
      mimeType: stagedMime(payload.filePath) || audioMime(fileName)
    })
    if (old?.source_file_path) await deleteExamFile(old.source_file_path).catch(() => undefined)
    await db.persist()
    unstageFile(payload.filePath)
    return { success: true, audio, message: `已导入听力 ${payload.audioSlot}` }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

// --- Manual segment CRUD ---

export async function createManualSegment(payload: {
  collectionId: number
  sourceFilePath: string
  pageNo: number
  rects: SemanticRangeRect[]
  contentType: SegmentContentType
  paperNo?: number | null
  audioSlot?: 'A' | 'B' | null
  text?: string
}): Promise<{ success: boolean; segment?: ExamContentSegmentRecord; collection?: ExamCollectionDetail; message: string }> {
  try {
    const { db, repo } = await ensureDb()
    const collection = repo.findById(payload.collectionId)
    if (!collection) return { success: false, message: '真题合集不存在' }
    const bytes = await loadStagedBytes(payload.sourceFilePath)
    if (!bytes) return { success: false, message: '原 PDF 文件已不在本地' }
    const fileHash = await sha256Hex(bytes)
    const paperNo = payload.paperNo && payload.paperNo >= 1 && payload.paperNo <= 3 ? Number(payload.paperNo) : null
    const paper = paperNo ? repo.ensurePaper(collection.id, paperNo, `卷${paperNo}`) : null
    const text = String(payload.text || '').trim() || await extractTextInPdfRects({ bytes, pageNo: payload.pageNo, rects: payload.rects })
    let analysisId: number | null = null
    if (payload.contentType === 'analysis') {
      const analysis = repo.ensureAnalysis({
        collectionId: collection.id,
        paperId: paper?.id || null,
        audioSlot: payload.audioSlot || null,
        title: `${collection.title}解析`,
        sourceFilePath: payload.sourceFilePath,
        sourceFileHash: fileHash,
        fileName: stagedFileName(payload.sourceFilePath),
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
    await db.persist()
    return { success: true, segment, collection: repo.getCollection(collection.id) ?? undefined, message: '片段已创建' }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

export async function updateSegment(payload: {
  segmentId: number
  contentType?: SegmentContentType
  status?: SegmentStatus
  paperNo?: number | null
  audioSlot?: 'A' | 'B' | null
}): Promise<{ success: boolean; segment?: ExamContentSegmentRecord; collection?: ExamCollectionDetail; message: string }> {
  try {
    const { db, repo } = await ensureDb()
    const row = db.prepare('SELECT * FROM content_segment WHERE id = ?').get(Number(payload.segmentId)) as any
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
    await db.persist()
    return { success: true, segment: existing, collection: repo.getCollection(row.collection_id) ?? undefined, message: '片段已更新' }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

export async function deleteSegment(segmentId: number): Promise<{ success: boolean; message: string }> {
  const { db, repo } = await ensureDb()
  const row = db.prepare('SELECT collection_id FROM content_segment WHERE id = ?').get(Number(segmentId)) as { collection_id: number } | undefined
  if (!row) return { success: false, message: '内容片段不存在' }
  repo.deleteSegment(segmentId)
  repo.recalculateStatus(row.collection_id)
  await db.persist()
  return { success: true, message: '片段已删除' }
}

// --- Annotations ---

export async function listAnnotations(scopeKey: string): Promise<{ success: boolean; annotations: any[]; message?: string }> {
  try {
    const { db } = await ensureDb()
    const annotations = db.prepare('SELECT * FROM exam_annotations WHERE scope_key = ? ORDER BY page_number, id').all(String(scopeKey || ''))
    return { success: true, annotations: annotations || [] }
  } catch (error) {
    return { success: false, annotations: [], message: (error as Error).message }
  }
}

export async function addAnnotation(payload: any): Promise<{ success: boolean; id?: number; annotation?: any; message: string }> {
  try {
    const { db } = await ensureDb()
    const result = db.prepare(
      `INSERT INTO exam_annotations (scope_key, page_number, annotation_type, quote, note, color, geometry_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      String(payload.scopeKey || ''),
      Math.max(1, Number(payload.pageNumber) || 1),
      String(payload.annotationType || 'highlight'),
      String(payload.quote || ''),
      String(payload.note || ''),
      String(payload.color || '#facc15'),
      payload.geometry ? JSON.stringify(payload.geometry) : null
    )
    await db.persist()
    const annotation = db.prepare('SELECT * FROM exam_annotations WHERE id = ?').get(result.lastInsertRowid)
    return { success: true, id: Number(result.lastInsertRowid), annotation, message: '批注已保存' }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

export async function updateAnnotationGeometry(payload: { id: number; geometry: any }): Promise<{ success: boolean; message: string }> {
  try {
    const { db } = await ensureDb()
    db.prepare('UPDATE exam_annotations SET geometry_json = ? WHERE id = ?').run(JSON.stringify(payload.geometry), Number(payload.id))
    await db.persist()
    return { success: true, message: '批注位置已更新' }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}

export async function deleteAnnotation(id: number): Promise<{ success: boolean; message: string }> {
  try {
    const { db } = await ensureDb()
    db.prepare('DELETE FROM exam_annotations WHERE id = ?').run(Number(id))
    await db.persist()
    return { success: true, message: '批注已删除' }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
}


