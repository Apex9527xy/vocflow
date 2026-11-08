<script setup lang="ts">
defineProps<{
  category: string
  label: string
  description: string
  mark: string
  count: number
  complete: number
  active: boolean
}>()

defineEmits<{ (event: 'select', category: string): void }>()
</script>

<template>
  <button class="category-card" :class="{ active }" type="button" @click="$emit('select', category)">
    <span class="category-mark">{{ mark }}</span>
    <span class="category-copy">
      <strong>{{ label }}</strong>
      <small>{{ description }}</small>
    </span>
    <span class="category-count">
      <b>{{ count }}</b>
      <small>{{ complete }} 套完整</small>
    </span>
  </button>
</template>

<style scoped>
.category-card {
  min-width: 0;
  min-height: 92px;
  padding: 14px 15px;
  border-radius: 12px;
  border: 1px solid var(--glass-border);
  background: color-mix(in srgb, var(--bg-card) 95%, transparent);
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  text-align: left;
  color: var(--text-secondary);
  box-shadow: var(--shadow-card);
  transition: transform .16s ease, border-color .16s ease, background .16s ease;
}
.category-card:hover { transform: translateY(-2px); border-color: rgba(217,119,6,.22); background: var(--bg-card); }
.category-card.active { border-color: rgba(217,119,6,.42); background: linear-gradient(145deg, rgba(217,119,6,.09), var(--bg-card) 72%); box-shadow: 0 10px 24px rgba(180,83,9,.09); }
.category-mark { width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; border-radius: 10px; color: var(--accent); background: rgba(217,119,6,.08); border: 1px solid rgba(217,119,6,.13); font-family: var(--font-display); font-size: 17px; font-weight: 700; }
.category-copy { min-width: 0; display: flex; flex-direction: column; }
.category-copy strong { color: var(--text-primary); font-size: 13px; font-weight: 700; white-space: nowrap; }
.category-copy small { margin-top: 3px; overflow: hidden; color: var(--text-muted); font-size: 9px; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
.category-count { text-align: right; display: flex; flex-direction: column; align-items: flex-end; }
.category-count b { color: var(--text-primary); font-family: var(--font-mono); font-size: 17px; line-height: 1; }
.category-count small { margin-top: 4px; color: var(--text-muted); font-size: 8px; white-space: nowrap; }
@media (max-width: 1040px) { .category-card { grid-template-columns: 34px minmax(0, 1fr); } .category-count { grid-column: 2; flex-direction: row; align-items: baseline; gap: 5px; } }
</style>
