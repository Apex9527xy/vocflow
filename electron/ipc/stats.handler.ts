import { IpcMain } from 'electron'
import type { DbWrapper } from '../database/wrapper'
import { StatsRepository } from '../database/repositories/stats.repository'
import { StudyRecordRepository } from '../database/repositories/study-record.repository'

export function registerStatsHandlers(ipcMain: IpcMain, db: DbWrapper) {
  const statsRepo = new StatsRepository(db)
  const studyRepo = new StudyRecordRepository(db)

  ipcMain.handle('stats:dashboard', () => {
    try { return statsRepo.getDashboard() }
    catch (err) { console.error('stats:dashboard error:', err); return null }
  })

  ipcMain.handle('stats:heatmap', () => {
    try { return statsRepo.getHeatmap() }
    catch (err) { console.error('stats:heatmap error:', err); return [] }
  })

  ipcMain.handle('stats:weakWords', (_e, limit: number) => {
    try { return studyRepo.getWeakWords(limit) }
    catch (err) { console.error('stats:weakWords error:', err); return [] }
  })

  ipcMain.handle('stats:analysis', () => {
    try { return statsRepo.getSkillAnalysis() }
    catch (err) { console.error('stats:analysis error:', err); return [] }
  })

  ipcMain.handle('stats:efficiency', (_e, days: number) => {
    try { return statsRepo.getEfficiencyTrend(days ?? 14) }
    catch (err) { console.error('stats:efficiency error:', err); return [] }
  })

  ipcMain.handle('data:export', () => {
    try {
      const words = db.prepare('SELECT * FROM words').all()
      const learning = db.prepare('SELECT * FROM word_learning').all()
      const sessions = db.prepare('SELECT * FROM study_sessions').all()
      const dailyStats = db.prepare('SELECT * FROM daily_stats').all()
      const plans = db.prepare('SELECT * FROM daily_plans').all()
      return { words, learning, sessions, dailyStats, plans, exportDate: new Date().toISOString() }
    } catch (err) {
      console.error('data:export error:', err)
      return null
    }
  })

  ipcMain.handle('data:resetProgress', () => {
    try {
      db.run('DELETE FROM word_learning')
      db.run('DELETE FROM study_sessions')
      db.run('DELETE FROM daily_stats')
      db.run('DELETE FROM daily_plans')
      return { success: true }
    } catch (err) {
      console.error('data:resetProgress error:', err)
      return { success: false }
    }
  })

  ipcMain.handle('stats:memoryDistribution', () => {
    try { return statsRepo.getMemoryDistribution() }
    catch (err) { console.error('stats:memoryDistribution error:', err); return [] }
  })

  ipcMain.handle('stats:recordPomodoro', () => {
    try {
      const today = new Date().toISOString().slice(0, 10)
      db.run(
        `INSERT INTO study_sessions (session_date, session_type, duration_seconds, pomodoro_count)
         VALUES (@date, @type, @duration, @count)`,
        { '@date': today, '@type': 'pomodoro', '@duration': 25 * 60, '@count': 1 }
      )
      db.run(
        `INSERT INTO daily_stats (stat_date, total_study_minutes)
         VALUES (@date, @minutes)
         ON CONFLICT(stat_date) DO UPDATE SET
           total_study_minutes = total_study_minutes + @minutes`,
        { '@date': today, '@minutes': 25 }
      )
      return { success: true }
    } catch (err) {
      console.error('stats:recordPomodoro error:', err)
      return { success: false }
    }
  })
}
