import { IpcMain } from 'electron'
import type { DbWrapper } from '../database/wrapper'
import { WordRepository } from '../database/repositories/word.repository'
import { saveDatabase } from '../database/connection'

export function registerWordHandlers(ipcMain: IpcMain, db: DbWrapper) {
  const repo = new WordRepository(db)

  ipcMain.handle('words:get', (_e, params: { limit: number; offset: number; level?: string }) => {
    try {
      console.log('words:get 调用，参数:', params)
      const result = repo.getWords(params.limit, params.offset, params.level)
      console.log('words:get 返回:', result.length, '个单词')
      return result
    }
    catch (err) {
      console.error('words:get error:', err)
      return []
    }
  })

  ipcMain.handle('words:getDictionary', () => {
    try {
      return repo.getDictionaryEntries()
    } catch (err) {
      console.error('words:getDictionary error:', err)
      return []
    }
  })

  ipcMain.handle('words:getBooks', () => {
    try {
      return repo.getWordBooks()
    } catch (err) {
      console.error('words:getBooks error:', err)
      return []
    }
  })

  ipcMain.handle('words:setBookEnabled', (_e, params: { slug: string; enabled: boolean }) => {
    try {
      const result = repo.setWordBookEnabled(params.slug, Boolean(params.enabled))
      if (result.success) saveDatabase()
      return result
    } catch (err) {
      console.error('words:setBookEnabled error:', err)
      return { success: false }
    }
  })

  ipcMain.handle('words:deleteCustomBook', (_e, slug: string) => {
    try {
      const result = repo.deleteCustomWordbook(String(slug || ''))
      if (result.success) saveDatabase()
      return result
    } catch (err) {
      console.error('words:deleteCustomBook error:', err)
      return { success: false, message: '删除词书失败: ' + (err as Error).message }
    }
  })

  ipcMain.handle('words:getEnabledCount', () => {
    try {
      return repo.countEnabled()
    } catch (err) {
      console.error('words:getEnabledCount error:', err)
      return 0
    }
  })
  ipcMain.handle('words:getById', (_e, id: number) => {
    try {
      console.log('words:getById 调用，id:', id)
      return repo.getById(id)
    }
    catch (err) {
      console.error('words:getById error:', err)
      return null
    }
  })

  ipcMain.handle('words:getNew', (_e, limit: number) => {
    try {
      console.log('words:getNew 调用，limit:', limit)
      const result = repo.getNewWords(limit)
      console.log('words:getNew 返回:', result.length, '个新词')
      if (result.length > 0) {
        console.log('前3个新词:', result.slice(0, 3).map((w: any) => w.word))
      }
      return result
    }
    catch (err) {
      console.error('words:getNew error:', err)
      console.error('错误堆栈:', (err as Error).stack)
      return []
    }
  })

  ipcMain.handle('words:search', (_e, query: string) => {
    try {
      if (!query || query.trim().length === 0) return []
      return repo.searchWords(query.trim(), 30)
    } catch (err) {
      console.error('words:search error:', err)
      return []
    }
  })

  ipcMain.handle('words:importWordbook', (_e, words: any[]) => {
    try {
      if (!Array.isArray(words) || words.length === 0) return { success: false, message: '无效的词库数据', added: 0 }
      // 验证数据格式
      const valid = words.filter(w => w.word && w.meaning_cn)
      if (valid.length === 0) return { success: false, message: '没有有效的单词数据', added: 0 }
      repo.insertWords(valid)
      saveDatabase()
      return { success: true, message: `成功导入 ${valid.length} 个单词`, added: valid.length }
    } catch (err) {
      console.error('words:importWordbook error:', err)
      return { success: false, message: '导入失败: ' + (err as Error).message, added: 0 }
    }
  })

  ipcMain.handle('words:importCustomBook', (_e, payload: {
    name?: string
    stage?: string
    description?: string
    sourceFile?: string
    words?: Array<Record<string, unknown>>
  }) => {
    try {
      if (!payload || !Array.isArray(payload.words) || payload.words.length === 0) {
        return { success: false, message: '词书内容为空', added: 0 }
      }
      const result = repo.importCustomWordbook({
        name: payload.name,
        stage: payload.stage,
        description: payload.description,
        sourceFile: payload.sourceFile,
        words: payload.words
      })
      if (result.success) saveDatabase()
      return result
    } catch (err) {
      console.error('words:importCustomBook error:', err)
      return { success: false, message: '导入失败: ' + (err as Error).message, added: 0 }
    }
  })

  ipcMain.handle('words:getYesterdayWords', (_e, limit: number) => {
    try {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const dateStr = yesterday.toISOString().slice(0, 10)
      return repo.getWordsByDate(dateStr, limit ?? 10)
    } catch (err) {
      console.error('words:getYesterdayWords error:', err)
      return []
    }
  })

  ipcMain.handle('lookupHistory:get', (_e, limit: number) => {
    try { return repo.getLookupHistory(limit ?? 30) }
    catch (err) { console.error('lookupHistory:get error:', err); return [] }
  })

  ipcMain.handle('lookupHistory:record', (_e, entry: any) => {
    try { repo.recordLookup(entry); return { success: true } }
    catch (err) { console.error('lookupHistory:record error:', err); return { success: false } }
  })

  ipcMain.handle('lookupHistory:delete', (_e, id: number) => {
    try { return repo.deleteLookupHistory(id) }
    catch (err) { console.error('lookupHistory:delete error:', err); return { success: false } }
  })

  ipcMain.handle('lookupHistory:clear', () => {
    try { return repo.clearLookupHistory() }
    catch (err) { console.error('lookupHistory:clear error:', err); return { success: false } }
  })
  ipcMain.handle('words:getWordCount', () => {
    try {
      return repo.countAll()
    } catch (err) {
      console.error('words:getWordCount error:', err)
      return 0
    }
  })

  ipcMain.handle('words:getReview', (_e, limit: number) => {
    try {
      console.log('words:getReview 调用，limit:', limit)
      const result = repo.getReviewWords(limit)
      console.log('words:getReview 返回:', result.length, '个复习词')
      return result
    }
    catch (err) {
      console.error('words:getReview error:', err)
      console.error('错误堆栈:', (err as Error).stack)
      return []
    }
  })
}
