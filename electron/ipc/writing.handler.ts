import { IpcMain } from 'electron'
import type { DbWrapper } from '../database/wrapper'
import { WritingRepository } from '../database/repositories/writing.repository'

export function registerWritingHandlers(ipcMain: IpcMain, db: DbWrapper) {
  const repo = new WritingRepository(db)

  ipcMain.handle('writing:save', (_e, data: {
    topic: string
    prompt?: string
    essay_text: string
    word_count: number
    total_score: number
    keyword_score: number
    structure_score: number
    length_score: number
    feedback?: string[]
  }) => {
    try {
      const id = repo.saveEssay(data)
      return { success: true, id }
    } catch (err) {
      console.error('writing:save error:', err)
      return { success: false, id: 0 }
    }
  })

  ipcMain.handle('writing:getHistory', (_e, limit?: number) => {
    try {
      return repo.getHistory(limit ?? 20)
    } catch (err) {
      console.error('writing:getHistory error:', err)
      return []
    }
  })

  ipcMain.handle('writing:deleteHistory', (_e, id: number) => {
    try {
      return { success: repo.deleteHistory(id) }
    } catch (err) {
      console.error('writing:deleteHistory error:', err)
      return { success: false }
    }
  })

  ipcMain.handle('writing:getStats', () => {
    try {
      return {
        count: repo.getHistoryCount(),
        avgScore: Math.round(repo.getAverageScore())
      }
    } catch (err) {
      console.error('writing:getStats error:', err)
      return { count: 0, avgScore: 0 }
    }
  })
}
