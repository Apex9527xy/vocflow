<script setup lang="ts">
defineProps<{ days: number }>()
</script>

<template>
  <div class="streak" :class="{ active: days > 0 }">
    <span class="flame">🔥</span>
    <span class="count">{{ days }}</span>
    <span class="label">天</span>
  </div>
</template>

<style scoped>
.streak {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 14px;
  background: rgba(240, 168, 96, 0.06);
  border: 1px solid rgba(240, 168, 96, 0.1);
  border-radius: 20px;
  font-size: 13px;
  color: var(--warning);
}

.streak.active {
  background: rgba(240, 168, 96, 0.1);
  border-color: rgba(240, 168, 96, 0.2);
}

.flame {
  font-size: 14px;
}

.count {
  font-weight: 700;
  font-size: 15px;
  font-family: var(--font-mono);
}

.label {
  font-size: 12px;
  opacity: 0.7;
}
</style>
