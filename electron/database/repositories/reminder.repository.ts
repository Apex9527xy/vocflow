import type { DbWrapper } from '../wrapper'

export interface StudyReminder {
  id: number
  reminder_type: string
  hour: number
  minute: number
  message: string | null
  enabled: number
}

export class ReminderRepository {
  constructor(private db: DbWrapper) {}

  getReminders(): StudyReminder[] {
    return this.db.prepare('SELECT * FROM study_reminders ORDER BY hour, minute').all() as StudyReminder[]
  }

  getEnabledReminders(): StudyReminder[] {
    return this.db.prepare(
      'SELECT * FROM study_reminders WHERE enabled = 1 ORDER BY hour, minute'
    ).all() as StudyReminder[]
  }

  addReminder(data: {
    reminder_type?: string
    hour: number
    minute: number
    message?: string
  }): number {
    const result = this.db.run(
      `INSERT INTO study_reminders (reminder_type, hour, minute, message, enabled)
       VALUES (@type, @hour, @minute, @message, 1)`,
      {
        '@type': data.reminder_type ?? 'daily',
        '@hour': data.hour,
        '@minute': data.minute,
        '@message': data.message ?? null
      }
    )
    return result.lastInsertRowid
  }

  updateReminder(id: number, data: { hour?: number; minute?: number; message?: string; enabled?: number }): boolean {
    const fields: string[] = []
    const params: Record<string, unknown> = { '@id': id }

    if (data.hour !== undefined) { fields.push('hour = @hour'); params['@hour'] = data.hour }
    if (data.minute !== undefined) { fields.push('minute = @minute'); params['@minute'] = data.minute }
    if (data.message !== undefined) { fields.push('message = @message'); params['@message'] = data.message }
    if (data.enabled !== undefined) { fields.push('enabled = @enabled'); params['@enabled'] = data.enabled }

    if (fields.length === 0) return false

    const result = this.db.run(
      `UPDATE study_reminders SET ${fields.join(', ')} WHERE id = @id`,
      params
    )
    return result.changes > 0
  }

  toggleReminder(id: number): boolean {
    const result = this.db.run(
      'UPDATE study_reminders SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END WHERE id = @id',
      { '@id': id }
    )
    return result.changes > 0
  }

  deleteReminder(id: number): boolean {
    const result = this.db.run('DELETE FROM study_reminders WHERE id = @id', { '@id': id })
    return result.changes > 0
  }

  // 初始化默认提醒（如果没有的话）
  ensureDefaultReminders(): void {
    const count = this.db.prepare('SELECT COUNT(*) as c FROM study_reminders').get() as { c: number }
    if (count.c === 0) {
      this.addReminder({ hour: 8, minute: 0, message: '早上好！新的一天从背单词开始。' })
      this.addReminder({ hour: 12, minute: 30, message: '午休时间，复习几个单词吧。' })
      this.addReminder({ hour: 21, minute: 0, message: '睡前复习一下今天学的单词，有助于记忆巩固。' })
    }
  }
}
