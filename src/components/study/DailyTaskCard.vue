<script setup lang="ts">
defineProps<{
  title: string
  current: number
  target: number
  unit: string
  icon: string
}>()
</script>

<template>
  <div class="task-card" :class="{ done: current >= target }">
    <div class="task-header">
      <span class="task-icon">{{ icon }}</span>
      <span class="task-title">{{ title }}</span>
      <span class="task-progress">{{ current }}<span class="sep">/</span>{{ target }} {{ unit }}</span>
    </div>
    <div class="progress-track">
      <div
        class="progress-fill"
        :style="{ width: Math.min(100, (current / target) * 100) + '%' }"
      />
    </div>
  </div>
</template>

<style scoped>
.task-card {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  border: 1px solid var(--glass-border);
  box-shadow: var(--shadow-card);
  transition: all var(--transition-fast);
}

.task-card:hover {
  background: var(--bg-card-hover);
  box-shadow: var(--shadow-md);
}

.task-card.done {
  border-color: rgba(107, 203, 119, 0.15);
}

.task-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.task-icon {
  font-size: 16px;
  opacity: 0.8;
}

.task-title {
  font-size: 13px;
  color: var(--text-primary);
  flex: 1;
  font-weight: 500;
}

.task-progress {
  font-size: 12px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.sep {
  color: var(--text-muted);
  opacity: 0.5;
  margin: 0 1px;
}

.task-card.done .task-progress {
  color: var(--success);
}

.progress-track {
  height: 3px;
  background: rgba(44, 36, 32, 0.05);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.task-card.done .progress-fill {
  background: var(--success);
}
</style>
