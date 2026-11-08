import type { DbWrapper } from '../wrapper'

export interface DailyActivityPoint {
  date: string
  label: string
  active: number
}

export interface ActivitySummary {
  totalActiveDays: number
  totalLaunches: number
  last7Days: DailyActivityPoint[]
}

function localDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export class ActivityRepository {
  constructor(private db: DbWrapper) {}

  recordLaunch(at = new Date()): void {
    const date = localDateKey(at)
    const timestamp = at.toISOString()
    this.db.prepare(`
      INSERT INTO activity_daily (activity_date, launch_count, first_opened_at, last_opened_at)
      VALUES (?, 1, ?, ?)
      ON CONFLICT(activity_date) DO UPDATE SET
        launch_count = activity_daily.launch_count + 1,
        last_opened_at = excluded.last_opened_at
    `).run(date, timestamp, timestamp)
  }

  getSummary(): ActivitySummary {
    const totals = this.db.prepare(`
      SELECT COUNT(*) AS active_days, COALESCE(SUM(launch_count), 0) AS launches
      FROM activity_daily
    `).get() as { active_days?: number; launches?: number } | undefined
    const rows = this.db.prepare(`
      SELECT activity_date, launch_count FROM activity_daily
      WHERE activity_date >= ?
      ORDER BY activity_date ASC
    `).all(localDateKey(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000))) as Array<{ activity_date: string; launch_count: number }>
    const byDate = new Map(rows.map(row => [String(row.activity_date), Number(row.launch_count || 0)]))
    const last7Days: DailyActivityPoint[] = []
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date()
      date.setHours(12, 0, 0, 0)
      date.setDate(date.getDate() - offset)
      const key = localDateKey(date)
      last7Days.push({
        date: key,
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        active: byDate.has(key) ? 1 : 0
      })
    }
    return {
      totalActiveDays: Number(totals?.active_days || 0),
      totalLaunches: Number(totals?.launches || 0),
      last7Days
    }
  }

  clear(): void {
    this.db.prepare('DELETE FROM activity_daily').run()
  }
}