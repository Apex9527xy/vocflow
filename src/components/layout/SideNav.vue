<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useUiStore } from '../../stores/ui.store'
import NavIcon from './NavIcon.vue'

interface NavItem {
  path: string
  label: string
  icon: string
}

const route = useRoute()
const uiStore = useUiStore()
const brandIconUrl = new URL('icon.png', document.baseURI).href
const mobileQuery = window.matchMedia('(max-width: 720px)')
const isMobile = ref(mobileQuery.matches)
function syncMobileLayout(event: MediaQueryListEvent): void {
  isMobile.value = event.matches
}
onMounted(() => mobileQuery.addEventListener('change', syncMobileLayout))
onUnmounted(() => mobileQuery.removeEventListener('change', syncMobileLayout))
const navOrderKey = 'vocflow-nav-order'

const defaultNavItems: NavItem[] = [
  { path: '/', label: '今日', icon: 'today' },
  { path: '/study', label: '新词', icon: 'study' },
  { path: '/review', label: '复习', icon: 'review' },
  { path: '/wrong-words', label: '错词/收藏', icon: 'wrong' },
  { path: '/search', label: '查词', icon: 'search' },
  { path: '/stats', label: '统计', icon: 'stats' },
  { path: '/plan', label: '计划', icon: 'plan' },
  { path: '/exam', label: '真题', icon: 'exam' },
  { path: '/literature', label: '文献阅读', icon: 'literature' },
  { path: '/focus', label: '专注', icon: 'focus' },


  { path: '/settings', label: '设置', icon: 'settings' }
]

function restoreNavItems(): NavItem[] {
  try {
    const saved = JSON.parse(localStorage.getItem(navOrderKey) || '[]')
    if (!Array.isArray(saved)) return [...defaultNavItems]
    const byPath = new Map(defaultNavItems.map(item => [item.path, item]))
    const restored: NavItem[] = []
    for (const path of saved) {
      const item = byPath.get(String(path))
      if (item && !restored.some(existing => existing.path === item.path)) restored.push(item)
    }
    for (const item of defaultNavItems) {
      if (!restored.some(existing => existing.path === item.path)) restored.push(item)
    }
    return restored
  } catch {
    return [...defaultNavItems]
  }
}

const navItems = ref<NavItem[]>(restoreNavItems())
const draggingPath = ref('')
const dragOverPath = ref('')

function saveNavOrder(): void {
  localStorage.setItem(navOrderKey, JSON.stringify(navItems.value.map(item => item.path)))
}

function handleDragStart(event: DragEvent, item: NavItem): void {
  draggingPath.value = item.path
  dragOverPath.value = ''
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', item.path)
  }
}

function handleDragOver(item: NavItem): void {
  if (draggingPath.value && draggingPath.value !== item.path) dragOverPath.value = item.path
}

function handleDrop(event: DragEvent, target: NavItem): void {
  const sourcePath = draggingPath.value || event.dataTransfer?.getData('text/plain') || ''
  const from = navItems.value.findIndex(item => item.path === sourcePath)
  const to = navItems.value.findIndex(item => item.path === target.path)
  if (from >= 0 && to >= 0 && from !== to) {
    const reordered = [...navItems.value]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    navItems.value = reordered
    saveNavOrder()
  }
  draggingPath.value = ''
  dragOverPath.value = ''
}

function handleDragEnd(): void {
  draggingPath.value = ''
  dragOverPath.value = ''
}

function handleNavClick(event: MouseEvent, item: NavItem): void {
  if (draggingPath.value) {
    event.preventDefault()
    return
  }
}</script>

<template>
  <nav class="sidenav" :class="{ collapsed: uiStore.sidebarCollapsed && !isMobile, mobile: isMobile }">
    <div class="nav-brand">
      <img class="brand-mark" :src="brandIconUrl" alt="VocFlow" />
      <div v-if="!uiStore.sidebarCollapsed || isMobile" class="brand-text">
        <span class="brand-title">VocFlow</span>
        <span class="brand-sub">智能词汇学习</span>
      </div>
    </div>

    <div class="nav-items">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :draggable="!isMobile"
        title="拖动可调整顺序"
        :class="{
          active: item.path === '/exam' ? route.path.startsWith('/exam') : route.path === item.path,
          dragging: draggingPath === item.path,
          'drag-over': dragOverPath === item.path
        }"
        @click="handleNavClick($event, item)"
        @dragstart.stop="handleDragStart($event, item)"
        @dragover.prevent.stop="handleDragOver(item)"
        @dragenter.prevent.stop="handleDragOver(item)"
        @drop.prevent.stop="handleDrop($event, item)"
        @dragend.stop="handleDragEnd"
      >
        <span class="nav-icon"><NavIcon :name="item.icon" /></span>
        <span v-if="!uiStore.sidebarCollapsed || isMobile" class="nav-label">{{ item.label }}</span>
      </router-link>
    </div>

    <div class="nav-footer">
      <button class="collapse-btn" @click="uiStore.toggleSidebar()">
        <span class="collapse-chevron" :class="{ rotated: uiStore.sidebarCollapsed }">‹</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.sidenav {
  width: 200px;
  min-width: 200px;
  height: 100vh;
  background: var(--bg-card);
  border-right: 1px solid var(--glass-border);
  display: flex;
  flex-direction: column;
  padding: 24px 10px 16px;
  transition: width var(--transition-normal), min-width var(--transition-normal);
  position: relative;
}

.sidenav.collapsed {
  width: 56px;
  min-width: 56px;
}

/* Accent left edge */
.sidenav::before {
  content: '';
  position: absolute;
  top: 24px;
  left: 0;
  bottom: 16px;
  width: 2px;
  background: linear-gradient(180deg, var(--accent), transparent 80%);
  opacity: 0.4;
  border-radius: 1px;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 10px 28px;
}

.brand-mark {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  background: var(--gradient-accent);
  border-radius: 8px;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.brand-title {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.5px;
}

.brand-sub {
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 1px;
  margin-top: 1px;
}

.nav-items {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  text-decoration: none;
  font-size: 13px;
  transition: all var(--transition-fast);
  position: relative;
}

.nav-item { cursor: grab; }
.nav-item:active { cursor: grabbing; }
.nav-item.dragging { opacity: 0.35; }
.nav-item.drag-over {
  color: var(--accent);
  background: rgba(217, 119, 6, 0.1);
  box-shadow: inset 0 2px 0 var(--accent);
}
.nav-item:hover {
  color: var(--text-secondary);
  background: rgba(217, 119, 6, 0.04);
}

.nav-item.active {
  color: var(--accent);
  background: rgba(217, 119, 6, 0.06);
  font-weight: 600;
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 16px;
  background: var(--accent);
  border-radius: 1px;
}

.nav-icon {
  font-size: 14px;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
  opacity: 0.6;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-item.active .nav-icon {
  opacity: 1;
}

.nav-label {
  letter-spacing: 0.5px;
  white-space: nowrap;
  font-weight: 500;
}

.nav-footer {
  padding: 8px 10px 0;
  border-top: 1px solid var(--glass-border);
}

.collapse-btn {
  width: 100%;
  padding: 6px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
}

.collapse-btn:hover {
  color: var(--text-secondary);
  background: rgba(217, 119, 6, 0.04);
}

.collapse-chevron {
  font-size: 18px;
  font-weight: 300;
  transition: transform var(--transition-normal);
  display: inline-block;
}

.collapse-chevron.rotated {
  transform: rotate(180deg);
}

@media (max-width: 720px) {
  .sidenav,
  .sidenav.collapsed {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 9000;
    width: 100%;
    min-width: 0;
    height: calc(68px + env(safe-area-inset-bottom));
    padding: 7px 8px calc(7px + env(safe-area-inset-bottom));
    border-right: 0;
    border-top: 1px solid var(--glass-border);
    background: color-mix(in srgb, var(--bg-card) 94%, transparent);
    backdrop-filter: blur(18px);
    box-shadow: 0 -8px 28px rgba(44, 36, 32, 0.08);
  }

  .sidenav::before,
  .nav-brand,
  .nav-footer {
    display: none;
  }

  .nav-items {
    flex-direction: row;
    gap: 4px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    overscroll-behavior-x: contain;
  }

  .nav-items::-webkit-scrollbar {
    display: none;
  }

  .nav-item {
    flex: 0 0 64px;
    min-width: 64px;
    height: 54px;
    padding: 4px 3px;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    border-radius: 10px;
    cursor: pointer;
  }

  .nav-item.active::before {
    left: 50%;
    top: 0;
    width: 24px;
    height: 2px;
    transform: translateX(-50%);
  }

  .nav-icon {
    width: auto;
    font-size: 16px;
    line-height: 1.2;
  }

  .nav-label {
    width: 100%;
    overflow: hidden;
    font-size: 10px;
    line-height: 1.2;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
