<script setup lang="ts">
import { ref, computed } from 'vue'
import { MORPHOLOGY_CATALOG } from '../data/morphology'

const searchQuery = ref('')

const roots = MORPHOLOGY_CATALOG.roots.map(rule => ({
  root: rule.forms.join(' / '),
  forms: rule.forms,
  meaning: rule.meaning
}))

const prefixes = MORPHOLOGY_CATALOG.prefixes.map(rule => ({
  prefix: rule.forms.map(form => `${form}-`).join(' / '),
  forms: rule.forms,
  meaning: rule.meaning
}))

const suffixes = MORPHOLOGY_CATALOG.suffixes.map(rule => ({
  suffix: rule.forms.map(form => `-${form}`).join(' / '),
  forms: rule.forms,
  meaning: rule.meaning
}))

const normalizedQuery = computed(() => searchQuery.value.trim().toLowerCase())

const filteredRoots = computed(() => {
  const q = normalizedQuery.value
  if (!q) return roots
  return roots.filter(item => item.root.toLowerCase().includes(q) || item.meaning.toLowerCase().includes(q))
})

const filteredPrefixes = computed(() => {
  const q = normalizedQuery.value
  if (!q) return prefixes
  return prefixes.filter(item => item.prefix.toLowerCase().includes(q) || item.meaning.toLowerCase().includes(q))
})

const filteredSuffixes = computed(() => {
  const q = normalizedQuery.value
  if (!q) return suffixes
  return suffixes.filter(item => item.suffix.toLowerCase().includes(q) || item.meaning.toLowerCase().includes(q))
})
</script>

<template>
  <div class="roots-view">
    <div class="page-header">
      <h1 class="heading-display">词根词缀</h1>
      <p class="subtitle">依据《单词密码：词根+词缀》扩充 · 批量记忆单词</p>
    </div>

    <div class="search-box">
      <input v-model="searchQuery" type="text" placeholder="搜索词根、单词或含义…" class="search-input" />
    </div>

    <section class="roots-section">
      <div class="section-label">词根 ({{ filteredRoots.length }})</div>
      <div class="roots-grid dense-grid">
        <div v-for="item in filteredRoots" :key="item.root" class="root-card compact-card">
          <div class="root-main">
            <span class="root-text">{{ item.root }}</span>
            <span class="root-meaning">{{ item.meaning }}</span>
          </div>
        </div>
      </div>
    </section>

    <section class="prefixes-section">
      <div class="section-label">前缀 ({{ filteredPrefixes.length }})</div>
      <div class="prefixes-grid dense-grid">
        <div v-for="item in filteredPrefixes" :key="item.prefix" class="prefix-card compact-card">
          <div class="prefix-text">{{ item.prefix }}</div>
          <div class="prefix-meaning">{{ item.meaning }}</div>
        </div>
      </div>
    </section>

    <section class="suffixes-section">
      <div class="section-label">后缀 ({{ filteredSuffixes.length }})</div>
      <div class="prefixes-grid dense-grid">
        <div v-for="item in filteredSuffixes" :key="item.suffix" class="prefix-card compact-card">
          <div class="prefix-text">{{ item.suffix }}</div>
          <div class="prefix-meaning">{{ item.meaning }}</div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.roots-view { max-width: 880px; margin: 0 auto; }

.page-header { margin-bottom: 24px; }
.page-header h1 { font-size: 26px; font-weight: 400; color: var(--text-primary); margin-bottom: 2px; }
.subtitle { font-size: 13px; color: var(--text-muted); }

.search-box { margin-bottom: 28px; }

.search-input {
  width: 100%; padding: 12px 18px; border-radius: var(--radius-md);
  border: 1px solid var(--glass-border); background: var(--bg-card);
  color: var(--text-primary); font-size: 14px; outline: none;
  transition: border-color var(--transition-fast);
}
.search-input:focus { border-color: var(--accent); }
.search-input::placeholder { color: var(--text-muted); }

.section-label {
  font-size: 11px; color: var(--text-muted); text-transform: uppercase;
  letter-spacing: 2px; font-weight: 600; margin-bottom: 14px;
}

.roots-section { margin-bottom: 30px; }
.dense-grid { grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 4px; }
.compact-card { padding: 9px 11px; cursor: default; }
.compact-card:hover { background: var(--bg-card); }
.compact-card .root-main { flex-wrap: wrap; gap: 5px 9px; }
.compact-card .root-text, .compact-card .prefix-text { font-size: 13px; margin-bottom: 0; }
.compact-card .root-meaning, .compact-card .prefix-meaning { font-size: 11px; margin-bottom: 0; line-height: 1.45; }
.suffixes-section { margin-bottom: 36px; }

.roots-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 6px;
}

.root-card {
  background: var(--bg-card); border-radius: var(--radius-md);
  padding: 16px 18px; border: 1px solid var(--glass-border);
  cursor: pointer; transition: all var(--transition-fast);
}
.root-card:hover { background: var(--bg-card-hover); }
.root-card.active {
  border-color: var(--accent); grid-row: span 2;
  background: rgba(217, 119, 6, 0.03);
}

.root-main { display: flex; align-items: baseline; gap: 10px; }
.root-text { font-size: 16px; font-weight: 700; color: var(--accent); font-family: var(--font-mono); }
.root-meaning { font-size: 13px; color: var(--text-secondary); }

.root-words {
  margin-top: 12px; padding-top: 12px;
  border-top: 1px solid var(--glass-border);
}
.root-word { font-size: 12px; color: var(--text-muted); padding: 3px 0; }

.prefixes-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 6px;
}

.prefix-card {
  background: var(--bg-card); border-radius: var(--radius-md);
  padding: 18px; border: 1px solid var(--glass-border);
  transition: all var(--transition-fast);
}
.prefix-card:hover { background: var(--bg-card-hover); }

.prefix-text { font-size: 16px; font-weight: 700; color: var(--accent); font-family: var(--font-mono); margin-bottom: 4px; }
.prefix-meaning { font-size: 13px; color: var(--text-secondary); margin-bottom: 12px; }

.prefix-examples { display: flex; flex-wrap: wrap; gap: 6px; }

.example-tag {
  font-size: 11px; padding: 3px 10px; border-radius: 4px;
  background: rgba(44, 36, 32, 0.04); color: var(--text-muted);
  border: 1px solid var(--glass-border);
}
</style>
