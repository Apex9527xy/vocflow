import { IpcMain } from 'electron'
import type { DbWrapper } from '../database/wrapper'
import { ContentRepository } from '../database/repositories/content.repository'

export function registerContentHandlers(ipcMain: IpcMain, db: DbWrapper) {
  const repo = new ContentRepository(db)

  // ===== 阅读文章 =====

  ipcMain.handle('reading:getPassages', (_e, params: { topic?: string; limit?: number }) => {
    try {
      return repo.getReadingPassages(params.topic, params.limit ?? 50)
    } catch (err) {
      console.error('reading:getPassages error:', err)
      return []
    }
  })

  ipcMain.handle('reading:getTopics', () => {
    try {
      return repo.getReadingTopics()
    } catch (err) {
      console.error('reading:getTopics error:', err)
      return []
    }
  })

  ipcMain.handle('reading:getCount', () => {
    try {
      return repo.getReadingCount()
    } catch (err) {
      console.error('reading:getCount error:', err)
      return 0
    }
  })

  ipcMain.handle('reading:import', (_e, passages: any[]) => {
    try {
      if (!Array.isArray(passages) || passages.length === 0) {
        return { success: false, message: '无效的数据', added: 0 }
      }
      const valid = passages.filter(p => p.title && p.content)
      if (valid.length === 0) return { success: false, message: '没有有效的文章数据', added: 0 }
      const count = repo.insertReadingPassages(valid)
      return { success: true, message: `成功导入 ${count} 篇文章`, added: count }
    } catch (err) {
      console.error('reading:import error:', err)
      return { success: false, message: '导入失败: ' + (err as Error).message, added: 0 }
    }
  })

  ipcMain.handle('reading:delete', (_e, id: number) => {
    try {
      return { success: repo.deleteReadingPassage(id) }
    } catch (err) {
      console.error('reading:delete error:', err)
      return { success: false }
    }
  })

  // ===== 翻译句子 =====

  ipcMain.handle('translation:getSentences', (_e, params: { topic?: string; limit?: number }) => {
    try {
      const rows = repo.getTranslationSentences(params.topic, params.limit ?? 50)
      // 解析 JSON 字段
      return rows.map(r => ({
        ...r,
        keywords_en: r.keywords_en ? JSON.parse(r.keywords_en) : [],
        keywords_cn: r.keywords_cn ? JSON.parse(r.keywords_cn) : []
      }))
    } catch (err) {
      console.error('translation:getSentences error:', err)
      return []
    }
  })

  ipcMain.handle('translation:getTopics', () => {
    try {
      return repo.getTranslationTopics()
    } catch (err) {
      console.error('translation:getTopics error:', err)
      return []
    }
  })

  ipcMain.handle('translation:getCount', () => {
    try {
      return repo.getTranslationCount()
    } catch (err) {
      console.error('translation:getCount error:', err)
      return 0
    }
  })

  ipcMain.handle('translation:import', (_e, sentences: any[]) => {
    try {
      if (!Array.isArray(sentences) || sentences.length === 0) {
        return { success: false, message: '无效的数据', added: 0 }
      }
      const valid = sentences.filter(s => s.en && s.cn)
      if (valid.length === 0) return { success: false, message: '没有有效的句子数据', added: 0 }
      const count = repo.insertTranslationSentences(valid)
      return { success: true, message: `成功导入 ${count} 条句子`, added: count }
    } catch (err) {
      console.error('translation:import error:', err)
      return { success: false, message: '导入失败: ' + (err as Error).message, added: 0 }
    }
  })

  ipcMain.handle('translation:delete', (_e, id: number) => {
    try {
      return { success: repo.deleteTranslationSentence(id) }
    } catch (err) {
      console.error('translation:delete error:', err)
      return { success: false }
    }
  })
}
