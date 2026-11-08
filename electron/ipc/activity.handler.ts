import type { IpcMain } from 'electron'
import type { DbWrapper } from '../database/wrapper'
import { ActivityRepository } from '../database/repositories/activity.repository'
import { saveDatabase } from '../database/connection'

export function recordStartupActivity(db: DbWrapper): void {
  try {
    new ActivityRepository(db).recordLaunch()
    saveDatabase()
  } catch (error) {
    console.error('记录启动日活失败:', error)
  }
}

export function registerActivityHandlers(ipcMain: IpcMain, db: DbWrapper) {
  const repository = new ActivityRepository(db)

  ipcMain.handle('activity:getSummary', () => {
    try {
      return { success: true, summary: repository.getSummary() }
    } catch (error) {
      console.error('activity:getSummary error:', error)
      return { success: false, message: '读取日活统计失败', summary: null }
    }
  })

  ipcMain.handle('activity:clear', () => {
    try {
      repository.clear()
      saveDatabase()
      return { success: true }
    } catch (error) {
      console.error('activity:clear error:', error)
      return { success: false, message: '清空日活统计失败' }
    }
  })
}