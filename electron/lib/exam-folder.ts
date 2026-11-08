import { readdirSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { extname, join } from 'node:path'

export const EXAM_FOLDER_LIMIT = 500

export function collectPdfFiles(root: string, limit = EXAM_FOLDER_LIMIT): { paths: string[]; truncated: boolean } {
  const paths: string[] = []
  const stack = [root]
  let truncated = false
  while (stack.length > 0) {
    const current = stack.pop()!
    let entries: Dirent[]
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    entries.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN', { numeric: true }))
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (entry.isFile() && extname(entry.name).toLowerCase() === '.pdf') {
        if (paths.length >= limit) {
          truncated = true
          return { paths, truncated }
        }
        paths.push(fullPath)
      }
    }
  }
  return { paths, truncated }
}


export const EXAM_RESOURCE_FILE_LIMIT = 2000
export const EXAM_TEXT_EXTENSIONS = new Set(['.pdf', '.txt', '.md'])
export const EXAM_AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'])
export const EXAM_RESOURCE_EXTENSIONS = new Set([
  ...EXAM_TEXT_EXTENSIONS,
  ...EXAM_AUDIO_EXTENSIONS
])

export function collectExamResourceFiles(root: string, limit = EXAM_RESOURCE_FILE_LIMIT): { paths: string[]; truncated: boolean } {
  const paths: string[] = []
  const stack = [root]
  let truncated = false
  while (stack.length > 0) {
    const current = stack.pop()!
    let entries: Dirent[]
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    entries.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN', { numeric: true }))
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (entry.isFile() && EXAM_RESOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        if (paths.length >= limit) {
          truncated = true
          return { paths, truncated }
        }
        paths.push(fullPath)
      }
    }
  }
  return { paths, truncated }
}

const COLLECTION_AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'])

export function collectCollectionImportFiles(root: string, limit = EXAM_FOLDER_LIMIT): { paths: string[]; truncated: boolean } {
  const paths: string[] = []
  const stack = [root]
  let truncated = false
  while (stack.length > 0) {
    const current = stack.pop()!
    let entries: Dirent[]
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    entries.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN', { numeric: true }))
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      const extension = extname(entry.name).toLowerCase()
      if (!entry.isFile() || (extension !== '.pdf' && !COLLECTION_AUDIO_EXTENSIONS.has(extension))) continue
      if (paths.length >= limit) {
        truncated = true
        return { paths, truncated }
      }
      paths.push(fullPath)
    }
  }
  return { paths, truncated }
}
