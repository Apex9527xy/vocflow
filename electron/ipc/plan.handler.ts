import { IpcMain } from 'electron'
import type { DbWrapper } from '../database/wrapper'
import { DailyPlanRepository } from '../database/repositories/daily-plan.repository'

export function registerPlanHandlers(ipcMain: IpcMain, db: DbWrapper) {
  const repo = new DailyPlanRepository(db)

  ipcMain.handle('plan:getToday', () => {
    try { return repo.getToday() }
    catch (err) { console.error('plan:getToday error:', err); return null }
  })

  ipcMain.handle('plan:complete', () => {
    try { repo.complete(); return { success: true } }
    catch (err) { console.error('plan:complete error:', err); return { success: false, error: String(err) } }
  })

  ipcMain.handle('settings:save', (_e, settings: { newWordsTarget: number; reviewWordsTarget: number; listeningMinutes: number; readingMinutes: number }) => {
    try {
      const plan = repo.updateTodayTargets(settings)
      return { success: true, plan }
    } catch (err) {
      console.error('settings:save error:', err)
      return { success: false, error: String(err) }
    }
  })
}
