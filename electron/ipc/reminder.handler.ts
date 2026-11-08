import { IpcMain, Notification, BrowserWindow } from 'electron'
import type { DbWrapper } from '../database/wrapper'
import { ReminderRepository } from '../database/repositories/reminder.repository'

let reminderTimers: Map<number, ReturnType<typeof setTimeout>> = new Map()

export function registerReminderHandlers(ipcMain: IpcMain, db: DbWrapper) {
  const repo = new ReminderRepository(db)

  // 初始化默认提醒
  repo.ensureDefaultReminders()

  // 启动提醒调度
  scheduleReminders(repo)

  ipcMain.handle('reminder:getAll', () => {
    try {
      return repo.getReminders()
    } catch (err) {
      console.error('reminder:getAll error:', err)
      return []
    }
  })

  ipcMain.handle('reminder:add', (_e, data: { hour: number; minute: number; message?: string }) => {
    try {
      const id = repo.addReminder(data)
      scheduleReminders(repo)
      return { success: true, id }
    } catch (err) {
      console.error('reminder:add error:', err)
      return { success: false, id: 0 }
    }
  })

  ipcMain.handle('reminder:update', (_e, id: number, data: { hour?: number; minute?: number; message?: string; enabled?: number }) => {
    try {
      const ok = repo.updateReminder(id, data)
      scheduleReminders(repo)
      return { success: ok }
    } catch (err) {
      console.error('reminder:update error:', err)
      return { success: false }
    }
  })

  ipcMain.handle('reminder:toggle', (_e, id: number) => {
    try {
      const ok = repo.toggleReminder(id)
      scheduleReminders(repo)
      return { success: ok }
    } catch (err) {
      console.error('reminder:toggle error:', err)
      return { success: false }
    }
  })

  ipcMain.handle('reminder:delete', (_e, id: number) => {
    try {
      const ok = repo.deleteReminder(id)
      scheduleReminders(repo)
      return { success: ok }
    } catch (err) {
      console.error('reminder:delete error:', err)
      return { success: false }
    }
  })
}

function scheduleReminders(repo: ReminderRepository) {
  // 清除所有现有定时器
  for (const timer of reminderTimers.values()) {
    clearTimeout(timer)
  }
  reminderTimers.clear()

  const reminders = repo.getEnabledReminders()
  const now = new Date()

  for (const r of reminders) {
    const target = new Date()
    target.setHours(r.hour, r.minute, 0, 0)

    // 如果目标时间已过，设为明天
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1)
    }

    const delay = target.getTime() - now.getTime()

    const timer = setTimeout(() => {
      const notification = new Notification({
        title: 'VocFlow',
        body: r.message || '该学习了！坚持每天背单词。',
        silent: false
      })
      notification.show()

      // 通知渲染进程
      const win = BrowserWindow.getAllWindows()[0]
      if (win && !win.isDestroyed()) {
        win.webContents.send('reminder:fired', { id: r.id, message: r.message })
      }

      // 重新调度明天的提醒
      scheduleReminders(repo)
    }, delay)

    reminderTimers.set(r.id, timer)
  }

  console.log(`已调度 ${reminders.length} 个学习提醒`)
}
