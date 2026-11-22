/**
 * In-memory staging area for files picked through the browser file dialog.
 *
 * The desktop flow passes native file paths to the main process; the browser
 * has no paths, so the import dialog collects picked Files here under an opaque
 * id that stands in for `filePath`. The save step pulls the bytes back out,
 * persists them to the exam IndexedDB store, then drops the staged reference.
 */

interface StagedExamFile {
  bytes: ArrayBuffer
  fileName: string
  mime: string
}

const staged = new Map<string, StagedExamFile>()

function resourceId(fileName: string, index: number): string {
  // Keep the real file name in the opaque id so the shared import dialog can
  // derive the display name and extension without a bridge round-trip.
  const safe = fileName.replace(/[^a-zA-Z0-9._\-一-龥]/g, '_')
  return `exam-file-${Date.now().toString(36)}-${index.toString(36)}-${Math.random().toString(36).slice(2, 8)}-${safe}`
}

function extensionOf(fileName: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName)
  return match ? match[1].toLowerCase() : ''
}

function mimeFor(fileName: string): string {
  const ext = extensionOf(fileName)
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'wav') return 'audio/wav'
  if (ext === 'm4a') return 'audio/mp4'
  if (ext === 'aac') return 'audio/aac'
  if (ext === 'ogg') return 'audio/ogg'
  if (ext === 'flac') return 'audio/flac'
  return 'audio/mpeg'
}

/** Stage picked files and return opaque ids that mimic desktop filePaths. */
export function stageExamFiles(files: File[]): string[] {
  return files.map((file, index) => {
    const id = resourceId(file.name, index)
    // The File's internal ArrayBuffer is captured lazily at stage time is not
    // possible synchronously; callers read bytes via stagedFileBytes after the
    // picker resolves. Store the File reference, resolve on first read.
    staged.set(id, { bytes: new ArrayBuffer(0), fileName: file.name, mime: mimeFor(file.name) })
    ;(staged.get(id) as StagedExamFile & { file?: File }).file = file
    return id
  })
}

export async function readStagedFileBytes(id: string): Promise<ArrayBuffer | null> {
  const record = staged.get(id) as (StagedExamFile & { file?: File }) | undefined
  if (!record) return null
  if (record.file) {
    record.bytes = await record.file.arrayBuffer()
    delete record.file
  }
  if (record.bytes.byteLength === 0) return record.bytes
  // Return an independent copy: pdf.js detaches the ArrayBuffer it consumes,
  // and the save step re-reads the same staged record afterwards.
  return record.bytes.slice(0)
}

export function stagedFileName(id: string): string {
  return staged.get(id)?.fileName || id
}

export function stagedMime(id: string): string {
  return staged.get(id)?.mime || ''
}

export function unstageFile(id: string): void {
  staged.delete(id)
}
