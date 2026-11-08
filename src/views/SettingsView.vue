<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import releaseNotesData from '../data/release-notes.json'
import ActivityStatsCard from '../components/settings/ActivityStatsCard.vue'

const newWordsTarget = ref(20)
const reviewWordsTarget = ref(30)
const listeningMinutes = ref(10)
const readingMinutes = ref(10)
const saved = ref(false)
const wordCount = ref(0)
const enabledWordCount = ref(0)
const wordBooks = ref<any[]>([])
const appVersion = ref('1.0.0')
const updateInfo = ref<any>(null)
const checkingUpdate = ref(false)
const installingUpdate = ref(false)
const updateMessage = ref('')

// 学习提醒
const reminders = ref<any[]>([])
const newHour = ref(8)
const newMinute = ref(0)
const newMessage = ref('')
const showAddReminder = ref(false)

// 导入相关
const importStatus = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const importMessage = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const releaseNotes = computed<any[]>(() => {
  const remoteNotes = updateInfo.value?.releaseNotes
  return Array.isArray(remoteNotes) && remoteNotes.length ? remoteNotes : releaseNotesData
})
const hasUpdate = computed(() => Boolean(updateInfo.value?.hasUpdate))
const visibleWordBooks = computed(() => wordBooks.value.filter(book => book.slug !== 'roots' && !String(book.name || '').includes('单词密码')))
let updatePollId: number | undefined

async function refreshUpdate(force = false) {
  checkingUpdate.value = true
  updateMessage.value = ''
  try {
    appVersion.value = await window.cet4Api.getAppVersion()
    updateInfo.value = await window.cet4Api.checkForUpdate(force)
    if (updateInfo.value?.hasUpdate) {
      updateMessage.value = `发现新版本 ${updateInfo.value.latestVersion}`
    } else if (updateInfo.value?.error) {
      updateMessage.value = `检查更新失败：${updateInfo.value.error}`
    } else if (updateInfo.value?.source === 'local') {
      updateMessage.value = '当前已是最新版本（本地开发更新源）'
    } else if (updateInfo.value?.source === 'none') {
      updateMessage.value = '无法连接更新服务器，请检查网络或稍后重试'
    } else {
      updateMessage.value = '当前已是最新版本'
    }
  } catch {
    updateMessage.value = '检查更新失败，请稍后重试'
  } finally {
    checkingUpdate.value = false
  }
}

async function handleUpdateButton() {
  if (installingUpdate.value) return
  if (!hasUpdate.value) {
    await refreshUpdate(true)
    return
  }
  installingUpdate.value = true
  updateMessage.value = '正在下载并安装更新…'
  try {
    const result = await window.cet4Api.installUpdate()
    if (!result.success) {
      updateMessage.value = result.message || '更新失败'
      installingUpdate.value = false
    }
  } catch {
    updateMessage.value = '更新失败，请稍后重试'
    installingUpdate.value = false
  }
}

// 数据管理
const showResetConfirm = ref(false)
const exportStatus = ref<'idle' | 'loading' | 'done'>('idle')

onMounted(async () => {
  const s = localStorage.getItem('cet4-settings')
  if (s) {
    const d = JSON.parse(s)
    newWordsTarget.value = d.newWordsTarget ?? 20
    reviewWordsTarget.value = d.reviewWordsTarget ?? 30
    listeningMinutes.value = d.listeningMinutes ?? 10
    readingMinutes.value = d.readingMinutes ?? 10
  }
  const plan = await window.cet4Api.getTodayPlan().catch(() => null)
  if (plan) {
    newWordsTarget.value = plan.new_words_target ?? newWordsTarget.value
    reviewWordsTarget.value = plan.review_words_target ?? reviewWordsTarget.value
    listeningMinutes.value = plan.listening_minutes ?? listeningMinutes.value
    readingMinutes.value = plan.reading_minutes ?? readingMinutes.value
  }
  await refreshWordbookState()
  reminders.value = await window.cet4Api.getReminders()
  appVersion.value = await window.cet4Api.getAppVersion()
  void refreshUpdate(false)
  updatePollId = window.setInterval(() => void refreshUpdate(false), 10 * 60 * 1000)
})

async function refreshWordbookState() {
  const [count, enabledCount, books] = await Promise.all([
    window.cet4Api.getWordCount(),
    window.cet4Api.getEnabledWordCount(),
    window.cet4Api.getWordBooks()
  ])
  wordCount.value = count
  enabledWordCount.value = enabledCount
  wordBooks.value = (Array.isArray(books) ? books : []).filter(
    (book: any) => book.slug !== 'roots' && !String(book.name || '').includes('单词密码')
  )
}
onUnmounted(() => {
  if (updatePollId) window.clearInterval(updatePollId)
})

async function toggleWordBook(book: any) {
  const enabled = !Boolean(book.enabled)
  await window.cet4Api.setWordBookEnabled({ slug: book.slug, enabled })
  book.enabled = enabled ? 1 : 0
  enabledWordCount.value = await window.cet4Api.getEnabledWordCount()
}

async function deleteWordBook(book: any) {
  if (!String(book?.slug || '').startsWith('custom-')) return
  const confirmed = window.confirm(`确定删除自定义词书「${book.name}」吗？\n只会删除词书及其词条关联，不会删除其他内置词书。`)
  if (!confirmed) return
  importStatus.value = 'loading'
  importMessage.value = `正在删除「${book.name}」…`
  try {
    const result = await window.cet4Api.deleteCustomWordbook(String(book.slug))
    importStatus.value = result.success ? 'success' : 'error'
    importMessage.value = result.message
    if (result.success) await refreshWordbookState()
  } catch (error) {
    importStatus.value = 'error'
    importMessage.value = (error as Error).message || '删除词书失败'
  } finally {
    window.setTimeout(() => {
      if (importStatus.value !== 'loading') {
        importStatus.value = 'idle'
        importMessage.value = ''
      }
    }, 2600)
  }
}

async function saveSettings() {
  const settings = {
    newWordsTarget: newWordsTarget.value,
    reviewWordsTarget: reviewWordsTarget.value,
    listeningMinutes: listeningMinutes.value,
    readingMinutes: readingMinutes.value
  }
  localStorage.setItem('cet4-settings', JSON.stringify(settings))
  // 同步到主进程，更新今天的每日计划
  await window.cet4Api.saveSettings(settings)
  saved.value = true
  setTimeout(() => saved.value = false, 2000)
}

function deriveBookName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || '我的自定义词书'
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      row.push(cell.trim())
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell.trim())
      if (row.some(value => value)) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  row.push(cell.trim())
  if (row.some(value => value)) rows.push(row)
  return rows
}

function parsePlainWordLines(text: string): any[] {
  const words: any[] = []
  for (const sourceLine of text.split(/\r?\n/)) {
    const line = sourceLine.trim()
    if (!line || line.startsWith('#')) continue
    let word = ''
    let meaning = ''
    if (line.includes('\t')) {
      const index = line.indexOf('\t')
      word = line.slice(0, index).trim()
      meaning = line.slice(index + 1).trim()
    } else if (line.includes(',') || line.includes(';')) {
      const index = Math.min(...[line.indexOf(','), line.indexOf(';')].filter(value => value >= 0))
      word = line.slice(0, index).trim()
      meaning = line.slice(index + 1).trim()
    } else {
      const match = line.match(/^([A-Za-z][A-Za-z'’\-]*)\s+(.+)$/)
      if (match) {
        word = match[1]
        meaning = match[2]
      }
    }
    if (word && meaning) words.push({ word, meaning_cn: meaning })
  }
  return words
}

function parseDelimitedWords(text: string): any[] {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'))
  if (!lines.length) return []
  const header = parseCsvRows(lines[0])[0]?.map(cell => cell.toLowerCase().replace(/\s+/g, '_')) || []
  const findColumn = (aliases: string[]) => header.findIndex(cell => aliases.includes(cell))
  const wordIndex = findColumn(['word', 'term', 'english', '单词'])
  const meaningIndex = findColumn(['meaning_cn', 'meaning', 'translation', 'cn', '释义', '中文释义'])
  if (wordIndex < 0 || meaningIndex < 0) return parsePlainWordLines(text)

  const phoneticIndex = findColumn(['phonetic_us', 'phonetic', '音标'])
  const posIndex = findColumn(['pos', '词性'])
  const exampleIndex = findColumn(['example_sentence', 'example', '例句'])
  const tagsIndex = findColumn(['tags', '标签'])
  const rows = parseCsvRows(lines.slice(1).join('\n'))
  return rows.map(row => ({
    word: row[wordIndex] || '',
    meaning_cn: row[meaningIndex] || '',
    phonetic_us: phoneticIndex >= 0 ? row[phoneticIndex] || '' : '',
    pos: posIndex >= 0 ? row[posIndex] || '' : '',
    example_sentence: exampleIndex >= 0 ? row[exampleIndex] || '' : '',
    tags: tagsIndex >= 0 ? row[tagsIndex] || '' : ''
  })).filter(item => item.word && item.meaning_cn)
}

async function parseWordbookFile(file: File): Promise<{ name: string; stage: string; description: string; words: any[] }> {
  const text = (await file.text()).replace(/^\uFEFF/, '').trim()
  const fallbackName = deriveBookName(file.name)
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  let parsed: any = null
  if (extension === 'json' || text.startsWith('[') || text.startsWith('{')) {
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error('JSON 文件格式不正确')
    }
  }

  let words: any[] = []
  let name = fallbackName
  let stage = '自定义'
  let description = `从 ${file.name} 导入的自定义资料`
  if (Array.isArray(parsed)) {
    words = parsed
  } else if (parsed && typeof parsed === 'object') {
    words = Array.isArray(parsed.words) ? parsed.words : []
    name = String(parsed.name || parsed.title || fallbackName).trim()
    stage = String(parsed.stage || parsed.level || '自定义').trim()
    description = String(parsed.description || description).trim()
  } else {
    words = parseDelimitedWords(text)
  }

  if (words.length && words.every(item => typeof item === 'string')) {
    words = parsePlainWordLines(words.join('\n'))
  }
  words = words.map((item: any) => ({
    word: String(item?.word ?? item?.term ?? item?.english ?? '').trim(),
    meaning_cn: String(item?.meaning_cn ?? item?.meaning ?? item?.translation ?? item?.cn ?? '').trim(),
    phonetic_us: String(item?.phonetic_us ?? item?.phonetic ?? '').trim(),
    pos: String(item?.pos ?? '').trim(),
    example_sentence: String(item?.example_sentence ?? item?.example ?? '').trim(),
    tags: Array.isArray(item?.tags) ? item.tags.join(',') : String(item?.tags ?? '').trim()
  })).filter(item => item.word && item.meaning_cn)

  if (!words.length) {
    throw new Error('未识别到单词和中文释义，请使用 JSON、CSV 或 TXT 格式')
  }
  return { name, stage, description, words }
}

function triggerImport() {
  fileInput.value?.click()
}

async function handleFileImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  importStatus.value = 'loading'
  importMessage.value = `正在解析「${file.name}」…`
  try {
    const parsed = await parseWordbookFile(file)
    const result = await window.cet4Api.importCustomWordbook({
      ...parsed,
      sourceFile: file.name
    })
    if (result.success) {
      importStatus.value = 'success'
      importMessage.value = result.message
      await refreshWordbookState()
    } else {
      importStatus.value = 'error'
      importMessage.value = result.message
    }
  } catch (err: any) {
    importStatus.value = 'error'
    importMessage.value = err?.message || '文件解析失败'
  }

  input.value = ''
  window.setTimeout(() => {
    if (importStatus.value !== 'loading') {
      importStatus.value = 'idle'
      importMessage.value = ''
    }
  }, 7000)
}
async function exportData() {
  exportStatus.value = 'loading'
  try {
    const data = await window.cet4Api.exportData()
    if (!data) throw new Error('导出失败')

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vocflow-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    exportStatus.value = 'done'
    setTimeout(() => exportStatus.value = 'idle', 2000)
  } catch {
    exportStatus.value = 'idle'
  }
}

async function resetProgress() {
  const result = await window.cet4Api.resetProgress()
  if (result.success) {
    showResetConfirm.value = false
    alert('学习进度已重置，词库数据保留。')
  }
}

async function loadReminders() {
  reminders.value = await window.cet4Api.getReminders()
  appVersion.value = await window.cet4Api.getAppVersion()
  void refreshUpdate(false)
}

async function addReminder() {
  await window.cet4Api.addReminder({
    hour: newHour.value,
    minute: newMinute.value,
    message: newMessage.value || undefined
  })
  newMessage.value = ''
  showAddReminder.value = false
  await loadReminders()
}

async function toggleReminder(id: number) {
  await window.cet4Api.toggleReminder(id)
  await loadReminders()
}

async function deleteReminder(id: number) {
  await window.cet4Api.deleteReminder(id)
  await loadReminders()
}

function formatTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}
</script>

<template>
  <div class="settings-view">
    <div class="page-header">
      <h1 class="heading-display">设置</h1>
      <p class="subtitle">自定义学习目标 · 管理词库和数据</p>
    </div>

    <!-- 学习目标 -->
    <div class="card">
      <div class="card-title">每日学习目标</div>
      <div class="group">
        <label class="label">每日新学单词</label>
        <div class="control">
          <input type="range" v-model.number="newWordsTarget" min="5" max="50" step="5" class="slider" />
          <span class="val">{{ newWordsTarget }} 个</span>
        </div>
      </div>

      <div class="group">
        <label class="label">每日复习单词</label>
        <div class="control">
          <input type="range" v-model.number="reviewWordsTarget" min="10" max="60" step="5" class="slider" />
          <span class="val">{{ reviewWordsTarget }} 个</span>
        </div>
      </div>

      <div class="group">
        <label class="label">每日听力训练</label>
        <div class="control">
          <input type="range" v-model.number="listeningMinutes" min="5" max="30" step="5" class="slider" />
          <span class="val">{{ listeningMinutes }} 分钟</span>
        </div>
      </div>

      <div class="group">
        <label class="label">每日阅读训练</label>
        <div class="control">
          <input type="range" v-model.number="readingMinutes" min="5" max="30" step="5" class="slider" />
          <span class="val">{{ readingMinutes }} 分钟</span>
        </div>
      </div>

      <button class="btn" :class="{ saved }" @click="saveSettings">{{ saved ? '✓ 已保存' : '保存设置' }}</button>
    </div>

    <!-- 词汇阶段与词书 -->
    <div class="card wordbook-card">
      <div class="wordbook-card-header">
        <div class="card-title wordbook-title">词汇阶段与词书</div>
        <button class="wordbook-import-btn" type="button" :disabled="importStatus === 'loading'" @click="triggerImport">
          <span>{{ importStatus === 'loading' ? '…' : '+' }}</span>
          {{ importStatus === 'loading' ? '导入中' : '导入词书' }}
        </button>
        <input ref="fileInput" class="wordbook-file-input" type="file" accept=".json,.csv,.txt" @change="handleFileImport" />
      </div>
      <p class="wordbook-intro">每本书独立开关。只有开启的词书会进入“新词学习”和“到期复习”，可按当前备考阶段组合使用。也支持导入自己的 JSON、CSV 或 TXT 词书。</p>
      <div v-if="importMessage" class="import-msg wordbook-import-msg" :class="importStatus">
        {{ importMessage }}
      </div>

      <div class="wordbook-list">
        <div v-for="book in visibleWordBooks" :key="book.slug" class="wordbook-item" :class="{ enabled: Boolean(book.enabled) }">
          <div class="wordbook-badge">{{ book.short_name || book.stage }}</div>
          <div class="wordbook-info">
            <div class="wordbook-name-row">
              <strong>{{ book.name }}</strong>
              <span>{{ book.stage }}</span>
            </div>
            <p>{{ book.description }}</p>
          </div>
          <div class="wordbook-actions">
            <span class="wordbook-count">{{ Number(book.actual_count ?? book.word_count) }} 词</span>
            <button v-if="String(book.slug).startsWith('custom-')" class="wordbook-delete" type="button" title="删除这个导入词书" @click.stop="deleteWordBook(book)">删除</button>
            <label class="wordbook-switch" :class="{ on: Boolean(book.enabled) }" :title="book.enabled ? '关闭该词书' : '开启该词书'">
              <input type="checkbox" :checked="Boolean(book.enabled)" @change="toggleWordBook(book)" />
              <span class="switch-track"><span class="switch-thumb"></span></span>
            </label>
          </div>
        </div>
      </div>

      <div class="wordbook-summary">
        <span>全部词书去重后共 {{ wordCount }} 词</span>
        <span>当前开启 {{ enabledWordCount }} 词</span>
      </div>
    </div>

    <!-- 词库导入格式 -->
    <div class="card">
      <div class="card-title">词库导入格式</div>
      <div class="info-row">
        <span class="info-label">当前词库</span>
        <span class="info-value">{{ wordCount }} 个单词</span>
      </div>

      <div class="format-hint">
        <div class="hint-title">JSON 推荐格式（可自定义词书名称和阶段）</div>
        <pre class="hint-code">{
  "name": "我的考研补充词",
  "stage": "自定义",
  "words": [
    {
      "word": "abandon",
      "meaning_cn": "放弃",
      "phonetic_us": "/əˈbændən/",
      "pos": "v.",
      "example_sentence": "He abandoned his plan."
    }
  ]
}</pre>
        <div class="hint-title hint-title-secondary">CSV / TXT 简单格式</div>
        <pre class="hint-code">word,meaning_cn,phonetic_us,pos
abandon,放弃,/əˈbændən/,v.
benefit,益处,/ˈbenɪfɪt/,n.</pre>
      </div>
    </div>
    <!-- 数据管理 -->
    <div class="card">
      <div class="card-title">数据管理</div>
      <div class="data-actions">
        <button class="btn secondary" @click="exportData">
          {{ exportStatus === 'loading' ? '导出中...' : exportStatus === 'done' ? '✓ 已导出' : '导出学习数据' }}
        </button>
        <button class="btn danger" @click="showResetConfirm = true">重置学习进度</button>
      </div>
      <p class="data-note">导出数据包含：词库、学习记录、每日统计、学习计划。所有学习数据仅保存在本机。</p>
    </div>

    <!-- 日活统计（独立模块） -->
    <ActivityStatsCard />

    <!-- 学习提醒 -->
    <div class="card">
      <div class="card-title">学习提醒</div>
      <p class="data-note" style="margin-bottom: 14px;">设置每日学习提醒，到时间会弹出系统通知。</p>

      <div class="reminder-list">
        <div v-for="r in reminders" :key="r.id" class="reminder-item" :class="{ disabled: !r.enabled }">
          <div class="reminder-time">{{ formatTime(r.hour, r.minute) }}</div>
          <div class="reminder-msg">{{ r.message || '该学习了' }}</div>
          <div class="reminder-actions">
            <button class="toggle-btn" :class="{ on: r.enabled }" @click="toggleReminder(r.id)">
              {{ r.enabled ? '开启' : '关闭' }}
            </button>
            <button class="delete-btn" @click="deleteReminder(r.id)">×</button>
          </div>
        </div>
      </div>

      <div v-if="showAddReminder" class="add-reminder-form">
        <div class="time-inputs">
          <select v-model.number="newHour" class="time-select">
            <option v-for="h in 24" :key="h-1" :value="h-1">{{ String(h-1).padStart(2, '0') }}</option>
          </select>
          <span class="time-sep">:</span>
          <select v-model.number="newMinute" class="time-select">
            <option v-for="m in [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]" :key="m" :value="m">{{ String(m).padStart(2, '0') }}</option>
          </select>
        </div>
        <input v-model="newMessage" type="text" placeholder="提醒内容（可选）" class="reminder-input" />
        <div class="form-actions">
          <button class="btn secondary" @click="showAddReminder = false">取消</button>
          <button class="btn" @click="addReminder">添加</button>
        </div>
      </div>
      <button v-else class="btn secondary" style="margin-top: 10px;" @click="showAddReminder = true">+ 添加提醒</button>
    </div>

    <!-- 重置确认弹窗 -->
    <div v-if="showResetConfirm" class="modal-overlay" @click.self="showResetConfirm = false">
      <div class="modal">
        <h3>确认重置</h3>
        <p>此操作将清除所有学习进度（学习记录、统计数据、每日计划），但保留词库数据。此操作不可撤销。</p>
        <div class="modal-actions">
          <button class="btn secondary" @click="showResetConfirm = false">取消</button>
          <button class="btn danger" @click="resetProgress">确认重置</button>
        </div>
      </div>
    </div>

    <!-- 软件更新 -->
    <div class="card update-card">
      <div class="update-card-header">
        <div>
          <div class="card-title update-title">软件更新</div>
          <div class="update-current">当前版本 <strong>v{{ appVersion }}</strong></div>
        </div>
        <span v-if="hasUpdate" class="update-available">可更新至 v{{ updateInfo?.latestVersion }}</span>
      </div>

      <div class="update-controls">
        <button
          class="update-btn"
          :class="{ available: hasUpdate, installing: installingUpdate }"
          :disabled="checkingUpdate || installingUpdate"
          @click="handleUpdateButton"
        >
          <span v-if="hasUpdate" class="update-dot"></span>
          {{
            installingUpdate
              ? '正在安装…'
              : checkingUpdate
                ? '正在检查…'
                : hasUpdate
                  ? `更新到 v${updateInfo?.latestVersion}`
                  : '检查更新'
          }}
        </button>
        <span class="update-message">{{ updateMessage }}</span>
      </div>

      <div class="update-log-window">
        <div class="update-log-heading">更新日志</div>
        <div v-for="(note, noteIndex) in releaseNotes" :key="`${note.version}-${noteIndex}`" class="release-note">
          <div class="release-note-head">
            <strong>{{ note.title || `VocFlow ${note.version}` }}</strong>
            <span>{{ note.date }}</span>
          </div>
          <ul>
            <li v-for="item in note.items" :key="item">{{ item }}</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 关于 -->
    <div class="card about">
      <h3>VocFlow</h3>
      <p class="ver">版本 {{ appVersion }}</p>
      <p>VocFlow 是一款从 CET4 备考需求拓展而来、面向英语学习与文献研读的一体化工具软件，支持一年级-高三/四六级 / 考研 / 雅思托福真题管理、PDF 文献阅读、背单词、音频导入播放、可导入真题资源自动分类，一站式完成刷题、听力训练、长难句分析、单词记忆、外文文献研读。</p>
    </div>

  </div>
</template>

<style scoped>
.settings-view { max-width: 560px; margin: 0 auto; }

.page-header { margin-bottom: 24px; }
.page-header h1 { font-size: 26px; font-weight: 400; color: var(--text-primary); margin-bottom: 2px; }
.subtitle { font-size: 13px; color: var(--text-muted); }

.card {
  background: var(--bg-card); border-radius: var(--radius-lg);
  padding: 24px 28px; border: 1px solid var(--glass-border);
  margin-bottom: 14px; box-shadow: var(--shadow-card);
}

.card-title {
  font-size: 13px; font-weight: 600; color: var(--text-primary);
  margin-bottom: 18px; text-transform: uppercase; letter-spacing: 1.5px;
}

.wordbook-card { padding-bottom: 18px; }
.wordbook-card-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 18px; }
.wordbook-title { margin-bottom: 0; }
.wordbook-import-btn {
  display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
  padding: 7px 11px; border: 1px solid rgba(217, 119, 6, 0.24); border-radius: 9px;
  color: var(--accent-dim); background: rgba(217, 119, 6, 0.07);
  font-size: 11px; font-weight: 700;
}
.wordbook-import-btn span { font-size: 15px; line-height: 1; }
.wordbook-import-btn:hover:not(:disabled) { border-color: var(--accent); background: rgba(217, 119, 6, 0.13); }
.wordbook-import-btn:disabled { opacity: 0.55; cursor: default; }
.wordbook-file-input { display: none; }
.wordbook-import-msg { margin: -4px 0 12px; }
.wordbook-intro {
  margin: -7px 0 14px;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.6;
}
.wordbook-list { display: grid; gap: 7px; }
.wordbook-item {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  padding: 10px;
  border: 1px solid var(--glass-border);
  border-radius: 11px;
  background: var(--bg-primary);
  transition: border-color var(--transition-fast), background var(--transition-fast);
}
.wordbook-item.enabled { border-color: rgba(217, 119, 6, 0.3); background: rgba(217, 119, 6, 0.035); }
.wordbook-badge {
  width: 42px; height: 42px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-secondary); background: var(--bg-secondary);
  font-size: 11px; font-weight: 700; letter-spacing: 0.5px;
}
.wordbook-item.enabled .wordbook-badge { color: #fff; background: var(--gradient-accent); }
.wordbook-info { min-width: 0; }
.wordbook-name-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.wordbook-name-row strong { color: var(--text-primary); font-size: 12px; }
.wordbook-name-row span {
  padding: 2px 5px; border-radius: 4px; color: var(--accent-dim);
  background: rgba(217, 119, 6, 0.08); font-size: 8px; font-weight: 600;
}
.wordbook-info p { margin-top: 3px; color: var(--text-muted); font-size: 10px; line-height: 1.45; }
.wordbook-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.wordbook-count { color: var(--text-muted); font-family: var(--font-mono); font-size: 9px; white-space: nowrap; }
.wordbook-delete { padding: 4px 7px; border: 1px solid rgba(220,38,38,.16); border-radius: 6px; color: #b91c1c; background: rgba(220,38,38,.04); font-size: 8px; font-weight: 700; }
.wordbook-delete:hover { border-color: rgba(220,38,38,.34); background: rgba(220,38,38,.08); }
.wordbook-switch { display: inline-flex; cursor: pointer; user-select: none; }
.wordbook-switch input { position: absolute; opacity: 0; pointer-events: none; }
.switch-track {
  position: relative; width: 34px; height: 19px; border-radius: 999px;
  background: rgba(44, 36, 32, 0.14); border: 1px solid rgba(44, 36, 32, 0.08);
  transition: background var(--transition-fast);
}
.switch-thumb {
  position: absolute; top: 2px; left: 2px; width: 13px; height: 13px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 3px rgba(44, 36, 32, 0.2);
  transition: transform var(--transition-fast);
}
.wordbook-switch.on .switch-track { background: var(--accent); border-color: var(--accent); }
.wordbook-switch.on .switch-thumb { transform: translateX(15px); }
.wordbook-summary {
  display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap;
  margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--glass-border);
  color: var(--text-muted); font-size: 10px;
}
@media (max-width: 520px) {
  .wordbook-item { grid-template-columns: 38px minmax(0, 1fr); }
  .wordbook-actions { grid-column: 1 / -1; flex-direction: row; justify-content: flex-end; }
}

.group { margin-bottom: 22px; }
.group:last-of-type { margin-bottom: 26px; }

.label { display: block; font-size: 13px; font-weight: 500; color: var(--text-primary); margin-bottom: 10px; }

.control { display: flex; align-items: center; gap: 14px; }

.slider {
  flex: 1; height: 4px; -webkit-appearance: none; appearance: none;
  background: rgba(44, 36, 32, 0.06); border-radius: 2px; outline: none;
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%;
  background: var(--accent); cursor: pointer;
  box-shadow: 0 0 8px var(--accent-glow);
}

.val { font-size: 13px; color: var(--accent); font-family: var(--font-mono); min-width: 56px; text-align: right; font-weight: 600; }

.btn {
  width: 100%; padding: 12px; border-radius: var(--radius-md);
  font-size: 14px; font-weight: 600;
  background: var(--accent); color: var(--bg-primary);
}
.btn:hover { background: var(--accent-light); box-shadow: 0 4px 16px var(--accent-glow); }
.btn.saved { background: var(--success); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }

.btn.secondary {
  background: var(--bg-primary); color: var(--text-primary);
  border: 1px solid var(--glass-border);
}
.btn.secondary:hover { background: var(--bg-card-hover); }

.btn.danger {
  background: rgba(232, 107, 107, 0.08); color: var(--danger);
  border: 1px solid rgba(232, 107, 107, 0.12);
}
.btn.danger:hover { background: rgba(232, 107, 107, 0.15); }

.info-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.03);
  margin-bottom: 16px;
}
.info-label { font-size: 13px; color: var(--text-muted); }
.info-value { font-size: 14px; color: var(--accent); font-family: var(--font-mono); font-weight: 600; }

.import-area { margin-bottom: 16px; }
.import-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }
.import-desc { font-size: 12px; color: var(--text-muted); margin-bottom: 12px; line-height: 1.6; }

.import-msg {
  margin-top: 10px; padding: 10px 14px; border-radius: var(--radius-sm);
  font-size: 12px; line-height: 1.5;
}
.import-msg.success { background: rgba(107, 203, 119, 0.06); color: var(--success); border: 1px solid rgba(107, 203, 119, 0.12); }
.import-msg.error { background: rgba(232, 107, 107, 0.06); color: var(--danger); border: 1px solid rgba(232, 107, 107, 0.12); }
.import-msg.loading { background: rgba(217, 119, 6, 0.06); color: var(--accent); border: 1px solid rgba(217, 119, 6, 0.12); }

.format-hint {
  background: var(--bg-primary); border-radius: var(--radius-md);
  padding: 14px; border: 1px solid var(--glass-border);
}
.hint-title { font-size: 11px; color: var(--text-muted); margin-bottom: 8px; letter-spacing: 0.5px; }
.hint-title-secondary { margin-top: 14px; }
.hint-code {
  font-size: 11px; color: var(--text-muted); line-height: 1.6;
  font-family: var(--font-mono); white-space: pre-wrap; margin: 0;
}

.data-actions { display: flex; gap: 10px; margin-bottom: 12px; }
.data-actions .btn { flex: 1; }
.data-note { font-size: 11px; color: var(--text-muted); line-height: 1.6; }

/* 弹窗 */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center; z-index: 100;
}
.modal {
  background: var(--bg-card); border-radius: var(--radius-lg);
  padding: 28px; max-width: 400px; width: 90%;
  border: 1px solid var(--glass-border); box-shadow: 0 16px 64px rgba(0,0,0,0.4);
}
.modal h3 { font-size: 16px; color: var(--text-primary); margin-bottom: 12px; }
.modal p { font-size: 13px; color: var(--text-secondary); line-height: 1.7; margin-bottom: 20px; }
.modal-actions { display: flex; gap: 10px; }
.modal-actions .btn { flex: 1; }

.update-card { position: relative; }
.update-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.update-title { margin-bottom: 5px; }
.update-current { color: var(--text-muted); font-size: 11px; }
.update-current strong { color: var(--accent); font-family: var(--font-mono); font-size: 14px; }
.update-available { padding: 3px 7px; border-radius: 999px; color: #fff; background: var(--danger); font-size: 9px; font-weight: 700; }
.update-controls { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
.update-btn {
  position: relative; width: auto; min-width: 132px; padding: 9px 16px;
  border: 1px solid rgba(217, 119, 6, 0.2); border-radius: 9px;
  color: var(--accent-dim); background: rgba(217, 119, 6, 0.06);
  font-size: 12px; font-weight: 700;
}
.update-btn:hover:not(:disabled) { border-color: var(--accent); background: rgba(217, 119, 6, 0.12); }
.update-btn.available { color: #fff; background: var(--gradient-accent); border-color: transparent; }
.update-btn.installing { opacity: 0.7; }
.update-btn:disabled { cursor: default; }
.update-dot {
  position: absolute; top: -4px; right: -4px; width: 10px; height: 10px;
  border: 2px solid var(--bg-card); border-radius: 50%; background: #ef4444;
  box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.25);
}
.update-message { color: var(--text-muted); font-size: 10px; line-height: 1.4; }
.update-log-window {
  width: min(100%, 390px); max-height: 330px; overflow-y: auto;
  margin: 14px 0 0 auto; padding: 12px 14px;
  border: 1px solid var(--glass-border); border-radius: 12px;
  background: var(--bg-primary);
}
.update-log-heading { margin-bottom: 9px; color: var(--text-muted); font-size: 9px; font-weight: 700; letter-spacing: 1.2px; }
.release-note + .release-note { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--glass-border); }
.release-note-head { display: flex; justify-content: space-between; gap: 8px; }
.release-note-head strong { color: var(--text-primary); font-size: 11px; }
.release-note-head span { color: var(--text-muted); font-family: var(--font-mono); font-size: 9px; white-space: nowrap; }
.release-note ul { margin: 7px 0 0; padding-left: 16px; color: var(--text-secondary); font-size: 10px; line-height: 1.65; }

.about h3 { font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
.about .ver { font-size: 11px; color: var(--accent); font-family: var(--font-mono); margin-bottom: 8px; }
.about p { font-size: 12px; color: var(--text-muted); line-height: 1.7; }

/* 提醒 */
.reminder-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.reminder-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; border-radius: var(--radius-md);
  background: var(--bg-primary); border: 1px solid var(--glass-border);
  transition: opacity var(--transition-fast);
}
.reminder-item.disabled { opacity: 0.5; }
.reminder-time { font-size: 18px; font-weight: 700; color: var(--accent); font-family: var(--font-mono); min-width: 56px; }
.reminder-msg { flex: 1; font-size: 13px; color: var(--text-secondary); }
.reminder-actions { display: flex; align-items: center; gap: 6px; }
.toggle-btn {
  padding: 3px 10px; border-radius: var(--radius-sm); font-size: 10px; font-weight: 600;
  background: rgba(255,255,255,0.04); color: var(--text-muted); border: 1px solid var(--glass-border);
}
.toggle-btn.on { background: rgba(107, 203, 119, 0.08); color: var(--success); border-color: rgba(107, 203, 119, 0.15); }
.delete-btn {
  width: 24px; height: 24px; border-radius: 50%; font-size: 14px;
  background: transparent; color: var(--text-muted); border: 1px solid var(--glass-border);
  display: flex; align-items: center; justify-content: center;
}
.delete-btn:hover { color: var(--danger); border-color: rgba(232, 107, 107, 0.2); }

.add-reminder-form {
  padding: 14px; background: var(--bg-primary); border-radius: var(--radius-md);
  border: 1px solid var(--glass-border); margin-top: 10px;
}
.time-inputs { display: flex; align-items: center; gap: 4px; margin-bottom: 10px; }
.time-select {
  padding: 6px 10px; border-radius: var(--radius-sm); font-size: 14px;
  background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--glass-border);
  font-family: var(--font-mono); font-weight: 600;
}
.time-sep { font-size: 16px; color: var(--text-muted); font-weight: 700; }
.reminder-input {
  width: 100%; padding: 8px 12px; border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border); background: var(--bg-card);
  color: var(--text-primary); font-size: 13px; margin-bottom: 10px;
}
.reminder-input::placeholder { color: var(--text-muted); }
.form-actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
