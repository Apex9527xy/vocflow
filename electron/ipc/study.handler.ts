import { IpcMain } from 'electron'
import type { DbWrapper } from '../database/wrapper'
import { StudyRecordRepository } from '../database/repositories/study-record.repository'
import { calculateNextReview } from '../lib/spaced-repetition'

export function registerStudyHandlers(ipcMain: IpcMain, db: DbWrapper) {
  const repo = new StudyRecordRepository(db)
  let currentSessionId: number | null = null

  ipcMain.handle('study:updateProgress', (_e, params: {
    wordId: number
    familiarity: number
    correct: boolean
  }) => {
    try {
      const existing = repo.getByWordId(params.wordId) as {
        correct_count: number
        wrong_count: number
        consecutive_correct: number
        interval_days: number
        ease_factor: number
      } | undefined

      const now = new Date().toISOString()
      const correctCount = (existing?.correct_count ?? 0) + (params.correct ? 1 : 0)
      const wrongCount = (existing?.wrong_count ?? 0) + (params.correct ? 0 : 1)
      const consecutiveCorrect = params.correct
        ? (existing?.consecutive_correct ?? 0) + 1
        : 0

      const sm2Result = calculateNextReview({
        quality: params.familiarity,
        interval: existing?.interval_days ?? 0,
        easeFactor: existing?.ease_factor ?? 2.5,
        consecutiveCorrect
      })

      repo.upsert({
        word_id: params.wordId,
        familiarity: params.familiarity,
        correct_count: correctCount,
        wrong_count: wrongCount,
        last_review_at: now,
        next_review_at: sm2Result.nextReviewDate,
        interval_days: sm2Result.interval,
        ease_factor: sm2Result.easeFactor,
        status: sm2Result.status,
        consecutive_correct: consecutiveCorrect
      })

      return { success: true, sm2Result }
    } catch (err) {
      console.error('study:updateProgress error:', err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('study:startSession', (_e, type: string) => {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const result = db.run(
        'INSERT INTO study_sessions (session_date, session_type) VALUES (@date, @type)',
        { '@date': today, '@type': type }
      )
      currentSessionId = result.lastInsertRowid
      return { sessionId: currentSessionId }
    } catch (err) {
      console.error('study:startSession error:', err)
      return { sessionId: null, error: String(err) }
    }
  })

  ipcMain.handle('study:updateSession', (_e, params: {
    wordsStudied: number
    durationSeconds: number
  }) => {
    try {
      if (!currentSessionId) return { success: false }
      db.run(
        'UPDATE study_sessions SET words_studied = @studied, duration_seconds = @duration WHERE id = @id',
        {
          '@studied': params.wordsStudied,
          '@duration': params.durationSeconds,
          '@id': currentSessionId
        }
      )
      return { success: true }
    } catch (err) {
      console.error('study:updateSession error:', err)
      return { success: false, error: String(err) }
    }
  })
}
