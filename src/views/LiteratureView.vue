<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { LITERATURE_SITES } from '../data/literatureSites'
import LiteratureReader from '../components/LiteratureReader.vue'

const storagePath = ref('')
const selectedSiteId = ref(LITERATURE_SITES[0].id)
const literatureItems = ref<any[]>([])
const loading = ref(false)
const importing = ref(false)
const choosingFolder = ref(false)
const autoScanEnabled = ref(localStorage.getItem('vocflow-literature-auto-scan') === 'true')
const autoScanSaving = ref(false)
const notice = ref('')
const activeItem = ref<any>(null)
const contextMenu = ref<{ visible: boolean; x: number; y: number; item: any | null }>({
  visible: false,
  x: 0,
  y: 0,
  item: null
})
const renameDialog = ref<{ visible: boolean; item: any | null; value: string; error: string; saving: boolean }>({
  visible: false,
  item: null,
  value: '',
  error: '',
  saving: false
})

let removeLiteratureChangedListener: (() => void) | null = null
let autoScanPathTimer: number | null = null
const selectedSite = computed(() => LITERATURE_SITES.find(site => site.id === selectedSiteId.value) || LITERATURE_SITES[0])

function parseCreatedAt(value: unknown): Date {
  const raw = String(value || '')
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T') + (raw.endsWith('Z') ? '' : 'Z')
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? new Date(0) : date
}

const timeGroups = computed(() => {
  const now = Date.now()
  const recent: any[] = []
  const week: any[] = []
  const month: any[] = []
  for (const item of literatureItems.value) {
    const age = Math.max(0, now - parseCreatedAt(item.created_at).getTime())
    if (age < 24 * 60 * 60 * 1000) recent.push(item)
    else if (age < 7 * 24 * 60 * 60 * 1000) week.push(item)
    else month.push(item)
  }
  return [
    { id: 'recent', label: '最近', hint: '24 小时内', items: recent },
    { id: 'week', label: '一周内', hint: '1–7 天', items: week },
    { id: 'month', label: '一月及更早', hint: '超过 7 天', items: month }
  ].filter(group => group.items.length > 0)
})


watch(storagePath, value => {
  if (value) localStorage.setItem('vocflow-literature-path', value)
  if (!autoScanEnabled.value || !value) return
  if (autoScanPathTimer) window.clearTimeout(autoScanPathTimer)
  autoScanPathTimer = window.setTimeout(() => { autoScanPathTimer = null; void applyAutoScanWatch() }, 700)
})

function isDisplayableItem(item: any): boolean {
  const title = String(item?.title || '').trim()
  if (/^(外文期刊导航详情|期刊导航详情)$/i.test(title) && !item?.file_path && !item?.abstract && !item?.authors) return false
  return true
}

function displayTitle(item: any): string {
  return String(item?.title || '').replace(/\s*-\s*(中国知网|CNKI)\s*$/i, '').trim() || '未命名文献'
}

function literatureFileName(item: any): string {
  const path = String(item?.file_path || '').trim()
  const filename = path.split(/[\\/]/).pop() || ''
  return filename || displayTitle(item)
}

function displayAuthors(item: any): string {
  return String(item?.authors || '').trim() || '作者信息未获取'
}

function displayAbstract(item: any): string {
  return String(item?.abstract || '').trim() || '摘要信息未获取'
}

async function refreshLiterature(): Promise<void> {
  loading.value = true
  try {
    const rows = await window.cet4Api.listLiterature()
    literatureItems.value = (Array.isArray(rows) ? rows : []).filter(isDisplayableItem)
  } catch (error) {
    notice.value = (error as Error).message || '文献列表加载失败'
  } finally {
    loading.value = false
  }
}



async function openSelectedSite(): Promise<void> {
  if (!selectedSite.value) return
  const result = await window.cet4Api.openLiteratureUrl(selectedSite.value.url)
  notice.value = result.success ? `已用默认浏览器打开 ${selectedSite.value.name}` : result.message || '默认浏览器打开失败'
  window.setTimeout(() => { notice.value = '' }, 3500)
}

async function chooseStorageFolder(): Promise<void> {
  if (choosingFolder.value) return
  choosingFolder.value = true
  try {
    const result = await window.cet4Api.chooseLiteratureDirectory(storagePath.value)
    if (result.success && result.path) {
      storagePath.value = result.path
      notice.value = 'PDF 导入路径已更新'
      window.setTimeout(() => { notice.value = '' }, 2500)
    }
  } catch (error) {
    notice.value = (error as Error).message || '文件夹选择失败'
  } finally {
    choosingFolder.value = false
  }
}

async function applyAutoScanWatch(): Promise<boolean> {
  const result = await window.cet4Api.setLiteratureAutoImportWatch({ enabled: autoScanEnabled.value, path: storagePath.value })
  if (!result.success) {
    autoScanEnabled.value = false
    localStorage.setItem('vocflow-literature-auto-scan', 'false')
    notice.value = result.message || 'PDF 自动导入启动失败'
    return false
  }
  notice.value = result.message
  window.setTimeout(() => { notice.value = '' }, 3000)
  return true
}

async function toggleAutoScan(): Promise<void> {
  if (!autoScanSaving.value) {
    autoScanSaving.value = true
    autoScanEnabled.value = !autoScanEnabled.value
    localStorage.setItem('vocflow-literature-auto-scan', String(autoScanEnabled.value))
    await applyAutoScanWatch()
    autoScanSaving.value = false
  }
}

async function chooseLocalFile(): Promise<void> {
  if (importing.value) return
  importing.value = true
  notice.value = '正在打开并解析本地文献…'
  try {
    const result = await window.cet4Api.chooseLiteratureFile(storagePath.value)
    if (result.canceled) {
      notice.value = ''
      return
    }
    if (result.success && result.item) {
      await refreshLiterature()
      notice.value = `已添加《${result.item.title}》`
      activeItem.value = result.item
    } else {
      notice.value = result.message || '本地文献导入失败'
    }
  } catch (error) {
    notice.value = (error as Error).message || '本地文献导入失败'
  } finally {
    importing.value = false
    window.setTimeout(() => { notice.value = '' }, 5000)
  }
}


function openReader(item: any): void {
  activeItem.value = item
  contextMenu.value.visible = false
}

async function deleteLiterature(item: any): Promise<void> {
  if (!item) return
  const confirmed = window.confirm(`确定从文献库删除《${item.title}》吗？\n本地文件不会被删除。`)
  if (!confirmed) return
  await window.cet4Api.deleteLiterature(Number(item.id))
  if (activeItem.value?.id === item.id) activeItem.value = null
  await refreshLiterature()
  contextMenu.value.visible = false
}

async function showLiteratureInFolder(item: any): Promise<void> {
  if (!item?.file_path) {
    notice.value = '该文献没有本地文件'
    return
  }
  const result = await window.cet4Api.showLiteratureInFolder(Number(item.id))
  if (!result.success) notice.value = result.message || '无法打开文件所在位置'
  contextMenu.value.visible = false
}

function openRenameDialog(item: any): void {
  contextMenu.value.visible = false
  if (!item?.file_path) {
    notice.value = '该文献没有可重命名的本地文件'
    return
  }
  renameDialog.value = {
    visible: true,
    item,
    value: literatureFileName(item),
    error: '',
    saving: false
  }
}

function closeRenameDialog(): void {
  if (renameDialog.value.saving) return
  renameDialog.value.visible = false
  renameDialog.value.error = ''
}

async function submitRename(): Promise<void> {
  if (!renameDialog.value.item || renameDialog.value.saving) return
  const value = renameDialog.value.value.trim()
  if (!value) {
    renameDialog.value.error = '请输入文件名'
    return
  }
  renameDialog.value.saving = true
  renameDialog.value.error = ''
  try {
    const result = await window.cet4Api.renameLiteratureFile({
      id: Number(renameDialog.value.item.id),
      name: value
    })
    if (!result.success) {
      renameDialog.value.error = result.message || '重命名失败'
      return
    }
    renameDialog.value.visible = false
    await refreshLiterature()
    notice.value = 'PDF 文件已重命名'
    window.setTimeout(() => { notice.value = '' }, 3000)
  } finally {
    renameDialog.value.saving = false
  }
}

function openContextMenu(event: MouseEvent, item: any): void {
  const width = 190
  const height = 174
  contextMenu.value = {
    visible: true,
    x: Math.min(event.clientX, window.innerWidth - width - 8),
    y: Math.min(event.clientY, window.innerHeight - height - 8),
    item
  }
}

function closeContextMenu(): void {
  contextMenu.value.visible = false
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeContextMenu()
}

function handleFocus(): void {
  void refreshLiterature()
}

onMounted(async () => {
  const savedPath = localStorage.getItem('vocflow-literature-path')
  storagePath.value = savedPath || await window.cet4Api.getDefaultLiteraturePath()
  await refreshLiterature()
  window.addEventListener('focus', handleFocus)
  window.addEventListener('click', closeContextMenu)
  window.addEventListener('keydown', handleKeydown)
  removeLiteratureChangedListener = window.cet4Api.onLiteratureChanged(async item => {
    await refreshLiterature()
    notice.value = `文献自动导入完成：《${item?.title || '未命名文献'}》`
    window.setTimeout(() => { notice.value = '' }, 5000)
  })
})

onUnmounted(() => {
  window.removeEventListener('focus', handleFocus)
  window.removeEventListener('click', closeContextMenu)
  window.removeEventListener('keydown', handleKeydown)
  removeLiteratureChangedListener?.()
  removeLiteratureChangedListener = null
  if (autoScanPathTimer) window.clearTimeout(autoScanPathTimer)
  autoScanPathTimer = null
})


</script>

<template>
  <div class="literature-view">
    <div class="page-header">
      <div>
        <h1 class="heading-display">文献阅读</h1>
        <p class="subtitle">从自定义路径导入 PDF 文献，并在应用内完成阅读、查词与摘录</p>
      </div>
      <div class="literature-count">{{ literatureItems.length }} 篇文献</div>
    </div>

    <section class="path-panel">
      <div class="path-label-row">
        <span>自定义路径导入 PDF</span>
        <small>自动扫描该路径及其子文件夹中新出现的 PDF 文件</small>
      </div>
      <div class="path-input-row">
        <input v-model="storagePath" type="text" class="path-input" placeholder="例如 E:\我的文献" />
        <button class="choose-folder-btn" type="button" :disabled="choosingFolder" @click.stop="chooseStorageFolder">
          {{ choosingFolder ? '选择中…' : '选择文件夹' }}
        </button>
        <button class="open-file-btn" type="button" :disabled="importing" @click.stop="chooseLocalFile">
          {{ importing ? '正在解析…' : '打开文件' }}
        </button>
        <button class="auto-scan-toggle" :class="{ active: autoScanEnabled }" type="button" :disabled="autoScanSaving" @click.stop="toggleAutoScan">
          <span class="auto-scan-track"><span class="auto-scan-dot"></span></span>
          {{ autoScanEnabled ? '自动导入新 PDF：开' : '自动导入新 PDF：关' }}
        </button>
      </div>
    </section>

    <section class="site-panel">
      <div class="site-picker-row">
        <select v-model="selectedSiteId" class="site-select" aria-label="选择文献网站">
          <option v-for="site in LITERATURE_SITES" :key="site.id" :value="site.id">{{ site.name }} · {{ site.category }}</option>
        </select>
        <button class="go-btn" type="button" @click.stop="openSelectedSite">前往默认浏览器</button>
      </div>
    </section>

    <div v-if="notice" class="literature-notice">{{ notice }}</div>

    <section class="library-panel">
      <div class="library-heading">
        <div>
          <div class="section-kicker">SAVED LITERATURE</div>
          <h2>文献</h2>
        </div>
        <span>双击左键阅读 · 右键可定位、重命名或删除</span>
      </div>

      <div v-if="loading" class="library-empty">正在加载文献…</div>
      <div v-else-if="!literatureItems.length" class="library-empty">
        <div class="empty-icon">▤</div>
        <strong>还没有保存文献</strong>
        <span>将 PDF 文件放入上方自定义路径，或点击“打开文件”手动导入。</span>
      </div>

      <div v-else class="time-groups">
        <section v-for="group in timeGroups" :key="group.id" class="time-group">
          <div class="time-group-head">
            <strong>{{ group.label }}</strong>
            <span>{{ group.hint }} · {{ group.items.length }} 篇</span>
          </div>
          <div class="literature-grid">
            <article
              v-for="item in group.items"
              :key="item.id"
              class="literature-card"
              data-word-lookup-ignore
              @dblclick="openReader(item)"
              @contextmenu.prevent.stop="openContextMenu($event, item)"
            >
              <h3>{{ literatureFileName(item) }}</h3>
            </article>
          </div>
        </section>
      </div>
    </section>

    <div
      v-if="contextMenu.visible && contextMenu.item"
      class="literature-context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      @click.stop
    >
      <button type="button" @click="openReader(contextMenu.item)">打开文献</button>
      <button type="button" :disabled="!contextMenu.item.file_path" @click="showLiteratureInFolder(contextMenu.item)">打开文件所在位置</button>
      <button type="button" :disabled="!contextMenu.item.file_path" @click="openRenameDialog(contextMenu.item)">重命名</button>
      <button type="button" class="danger" @click="deleteLiterature(contextMenu.item)">删除</button>
    </div>

    <div v-if="renameDialog.visible" class="rename-overlay" @click.self="closeRenameDialog">
      <div class="rename-dialog">
        <h3>重命名 PDF 文件</h3>
        <p>只修改本地文件名，不会改变文献库中的记录。</p>
        <input
          v-model="renameDialog.value"
          class="rename-input"
          type="text"
          autofocus
          @keyup.enter="submitRename"
        />
        <div v-if="renameDialog.error" class="rename-error">{{ renameDialog.error }}</div>
        <div class="rename-actions">
          <button type="button" class="rename-cancel" :disabled="renameDialog.saving" @click="closeRenameDialog">取消</button>
          <button type="button" class="rename-save" :disabled="renameDialog.saving || !renameDialog.value.trim()" @click="submitRename">
            {{ renameDialog.saving ? '正在重命名…' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <LiteratureReader v-if="activeItem" :item="activeItem" @close="activeItem = null" />
  </div>
</template>

<style scoped>
.literature-view { max-width: 1020px; margin: 0 auto; padding-bottom: 40px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 20px; }
.page-header h1 { font-size: 28px; font-weight: 400; color: var(--text-primary); margin-bottom: 3px; }
.subtitle { max-width: 680px; color: var(--text-muted); font-size: 12px; line-height: 1.6; }
.literature-count { padding: 6px 10px; border-radius: 999px; color: var(--accent-dim); background: rgba(217,119,6,.08); font-family: var(--font-mono); font-size: 10px; white-space: nowrap; }

.path-panel, .site-panel, .library-panel {
  margin-bottom: 15px;
  padding: 18px 20px;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
}
.path-panel { width: min(760px, 100%); margin-left: auto; margin-right: auto; }
.path-label-row { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; margin-bottom: 8px; }
.path-label-row span { color: var(--text-primary); font-size: 12px; font-weight: 700; }
.path-label-row small { color: var(--text-muted); font-size: 9px; }
.path-input-row { display: flex; gap: 8px; }
.path-input {
  flex: 1; min-width: 0; padding: 10px 12px;
  border: 1px solid var(--glass-border); border-radius: 9px;
  outline: none; color: var(--text-primary); background: var(--bg-primary);
  font-family: var(--font-mono); font-size: 11px;
}
.path-input:focus { border-color: rgba(217,119,6,.45); }
.choose-folder-btn {
  flex-shrink: 0; padding: 9px 13px; border-radius: 9px;
  color: var(--text-secondary); background: var(--bg-primary);
  border: 1px solid var(--glass-border); font-size: 11px; font-weight: 700;
}
.choose-folder-btn:hover:not(:disabled) { border-color: rgba(217,119,6,.35); color: var(--accent-dim); background: rgba(217,119,6,.05); }
.choose-folder-btn:disabled { opacity: .45; cursor: default; }
.open-file-btn, .go-btn {
  flex-shrink: 0; padding: 9px 15px; border-radius: 9px;
  color: #fff; background: var(--gradient-accent);
  font-size: 11px; font-weight: 700;
}
.open-file-btn:hover, .go-btn:hover { box-shadow: 0 5px 16px var(--accent-glow); }
.open-file-btn:disabled, .go-btn:disabled { opacity: .45; cursor: default; box-shadow: none; }

.auto-scan-toggle { display: inline-flex; align-items: center; gap: 6px; padding: 8px 10px; border: 1px solid var(--glass-border); border-radius: 8px; color: var(--text-muted); background: var(--bg-secondary); font-size: 9px; font-weight: 700; white-space: nowrap; }.auto-scan-toggle.active { color: #047857; border-color: rgba(16,185,129,.22); background: rgba(16,185,129,.08); }.auto-scan-track { position: relative; width: 24px; height: 13px; border-radius: 999px; background: rgba(95,75,60,.22); transition: background .16s ease; }.auto-scan-dot { position: absolute; left: 2px; top: 2px; width: 9px; height: 9px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(44,36,32,.22); transition: transform .16s ease; }.auto-scan-toggle.active .auto-scan-track { background: #10b981; }.auto-scan-toggle.active .auto-scan-dot { transform: translateX(11px); }
.site-picker-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
.site-select {
  width: 100%; min-width: 0; padding: 10px 12px;
  border: 1px solid var(--glass-border); border-radius: 9px;
  outline: none; color: var(--text-primary); background: var(--bg-primary); font-size: 12px;
}
.site-select:focus { border-color: rgba(217,119,6,.45); }
.literature-notice { margin-top: 11px; padding: 8px 10px; border-radius: 8px; color: var(--accent-dim); background: rgba(217,119,6,.06); font-size: 10px; line-height: 1.5; }

.library-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 15px; margin-bottom: 15px; }
.section-kicker { color: var(--accent); font-size: 8px; font-weight: 800; letter-spacing: 1.5px; }
.library-heading h2 { margin-top: 3px; font-family: var(--font-display); font-size: 18px; font-weight: 700; }
.library-heading > span { color: var(--text-muted); font-size: 9px; }
.library-empty { min-height: 150px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; color: var(--text-muted); font-size: 11px; text-align: center; }
.library-empty strong { color: var(--text-secondary); font-size: 13px; }
.empty-icon { color: var(--accent); font-size: 30px; opacity: .45; }
.time-group + .time-group { margin-top: 18px; padding-top: 13px; border-top: 1px dashed var(--glass-border); }
.time-group-head { display: flex; align-items: baseline; gap: 9px; margin-bottom: 8px; }
.time-group-head strong { color: var(--text-primary); font-size: 12px; }
.time-group-head span { color: var(--text-muted); font-size: 9px; }
.literature-grid { display: flex; flex-direction: column; gap: 10px; }
.literature-card {
  width: 100%; min-width: 0; min-height: 0; padding: 16px 18px;
  border: 1px solid var(--glass-border); border-left: 3px solid rgba(217,119,6,.55);
  border-radius: 10px; background: var(--bg-primary); cursor: default;
  transition: border-color var(--transition-fast), background var(--transition-fast);
}
.literature-card:hover { border-color: rgba(217,119,6,.32); background: #fff; }
.literature-card h3 { color: var(--text-primary); font-size: 14px; font-weight: 700; line-height: 1.55; overflow-wrap: anywhere; }

.literature-context-menu {
  position: fixed; z-index: 95000; width: 190px;
  padding: 5px; border: 1px solid var(--glass-border); border-radius: 9px;
  background: var(--bg-card); box-shadow: 0 14px 34px rgba(44,36,32,.2);
}
.literature-context-menu button { width: 100%; padding: 8px 9px; border-radius: 6px; color: var(--text-secondary); background: transparent; text-align: left; font-size: 11px; }
.literature-context-menu button:hover:not(:disabled) { background: rgba(217,119,6,.07); color: var(--accent-dim); }
.literature-context-menu button:disabled { opacity: .35; cursor: default; }
.literature-context-menu button.danger { color: var(--danger); }
.literature-context-menu button.danger:hover { background: rgba(232,107,107,.08); }

.rename-overlay {
  position: fixed; inset: 0; z-index: 97000;
  display: flex; align-items: center; justify-content: center;
  padding: 20px; background: rgba(30, 25, 22, 0.48);
  backdrop-filter: blur(3px);
}
.rename-dialog {
  width: min(420px, 100%); padding: 22px;
  border: 1px solid var(--glass-border); border-radius: 14px;
  background: var(--bg-card); box-shadow: 0 20px 60px rgba(0,0,0,.22);
}
.rename-dialog h3 { color: var(--text-primary); font-size: 16px; }
.rename-dialog p { margin-top: 6px; color: var(--text-muted); font-size: 10px; line-height: 1.6; }
.rename-input {
  width: 100%; margin-top: 15px; padding: 10px 12px;
  border: 1px solid var(--glass-border); border-radius: 9px;
  outline: none; color: var(--text-primary); background: var(--bg-primary); font-size: 12px;
}
.rename-input:focus { border-color: rgba(217,119,6,.45); }
.rename-error { margin-top: 8px; color: var(--danger); font-size: 10px; }
.rename-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.rename-actions button { padding: 8px 14px; border-radius: 8px; font-size: 11px; font-weight: 700; }
.rename-cancel { color: var(--text-secondary); background: var(--bg-primary); border: 1px solid var(--glass-border); }
.rename-save { color: #fff; background: var(--accent); }
.rename-save:disabled { opacity: .45; cursor: default; }

@media (max-width: 620px) {
  .page-header, .library-heading { align-items: flex-start; flex-direction: column; }
  .site-picker-row { grid-template-columns: 1fr; }
  .go-btn { width: 100%; }
  .path-input-row { flex-direction: column; }
  .choose-folder-btn, .open-file-btn { width: 100%; }
}
</style>
