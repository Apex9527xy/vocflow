<script setup lang="ts">
import SideNav from './SideNav.vue'
import { useUiStore } from '../../stores/ui.store'

const uiStore = useUiStore()
</script>

<template>
  <div class="app-layout">
    <div class="window-drag-region"></div>
    <SideNav />
    <main class="main-content">
      <div class="content-scroll">
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.window-drag-region {
  position: fixed;
  top: 0;
  left: 0;
  right: 138px;
  height: 30px;
  z-index: 1000;
  -webkit-app-region: drag;
}
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-primary);
}

.main-content {
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* Subtle warm gradient at top */
.main-content::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 180px;
  background: linear-gradient(180deg, rgba(217, 119, 6, 0.02), transparent);
  pointer-events: none;
  z-index: 0;
}

.content-scroll {
  height: 100%;
  overflow-y: auto;
  padding: 32px 40px;
  position: relative;
  z-index: 1;
}
</style>
