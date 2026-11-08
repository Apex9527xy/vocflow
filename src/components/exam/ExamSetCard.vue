<script setup lang="ts">
import { examPaperTypeLabel, examSeasonLabel } from '../../lib/examMetadata'
const props = defineProps<{ set: ExamSetRecord }>()
defineEmits<{
  (event: 'open', set: ExamSetRecord): void
  (event: 'replace-audio', set: ExamSetRecord): void
  (event: 'replace-analysis', set: ExamSetRecord): void
  (event: 'remove-audio', set: ExamSetRecord): void
  (event: 'remove-analysis', set: ExamSetRecord): void
  (event: 'edit', set: ExamSetRecord): void
  (event: 'delete', set: ExamSetRecord): void
  (event: 'locate', set: ExamSetRecord): void
}>()

const statusText = (status: string) => ({ complete: '资源完整', text_only: '仅真题文本', missing_audio: '缺音频', missing_analysis: '缺解析', incomplete: '资源不完整' }[status] || '资源不完整')
</script>

<template>
  <article class="set-card" @click="$emit('open', set)">
    <div class="set-topline">
      <span class="type-dot"></span>
      <span class="type-label">{{ examPaperTypeLabel(set.paper_type) }}</span>
      <span class="set-year">{{ set.year || '未分类' }}<template v-if="set.year"> 年</template></span>
      <span class="set-season">{{ examSeasonLabel(set.season) }}</span>
      <span v-if="set.set_no" class="set-number">第 {{ set.set_no }} 套</span>
      <span class="completion" :class="set.resource_status">{{ statusText(set.resource_status) }}</span>
    </div>

    <div class="set-main">
      <div class="set-title-wrap">
        <h3>{{ set.title }}</h3>
        <p>{{ set.resources.text?.file_name || '缺少真题文本' }}</p>
      </div>
      <button class="read-btn" type="button" @click.stop="$emit('open', set)">开始阅读 <span>→</span></button>
    </div>

    <div class="resource-strip" @click.stop>
      <button class="resource-chip text-chip" type="button" :disabled="!set.resources.text" @click="$emit('open', set)">
        <span>T</span>
        <strong>真题文本</strong>
        <i>{{ set.resources.text ? '可阅读' : '缺失' }}</i>
      </button>
      <div class="resource-chip-group">
        <button class="resource-chip" :class="{ available: set.resources.audio }" type="button" @click="$emit('replace-audio', set)">
          <span>♪</span>
          <strong>配套音频</strong>
          <i>{{ set.resources.audio ? '点击替换' : '点击补充' }}</i>
        </button>
        <button v-if="set.resources.audio" class="mini-remove" type="button" title="移除音频" @click="$emit('remove-audio', set)">×</button>
      </div>
      <div class="resource-chip-group">
        <button class="resource-chip" :class="{ available: set.resources.analysis }" type="button" @click="$emit('replace-analysis', set)">
          <span>⇄</span>
          <strong>真题解析</strong>
          <i>{{ set.resources.analysis ? '点击替换' : '点击补充' }}</i>
        </button>
        <button v-if="set.resources.analysis" class="mini-remove" type="button" title="移除解析" @click="$emit('remove-analysis', set)">×</button>
      </div>
      <div class="card-menu-actions">
        <button type="button" @click="$emit('edit', set)">编辑</button>
        <button type="button" @click="$emit('locate', set)">定位</button>
        <button type="button" class="danger" @click="$emit('delete', set)">删除</button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.set-card { padding: 15px 16px 13px; border-radius: 11px; border: 1px solid var(--glass-border); background: var(--bg-card); box-shadow: var(--shadow-card); cursor: pointer; transition: border-color .16s ease, transform .16s ease, background .16s ease; }
.set-card:hover { transform: translateY(-1px); border-color: rgba(217,119,6,.26); background: #fffdf9; }
.set-topline { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; color: var(--text-muted); font-size: 9px; }
.type-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
.type-label { color: var(--accent-dim); font-weight: 750; }
.set-year { color: var(--text-secondary); font-family: var(--font-mono); font-weight: 700; }
.set-season, .set-number { padding: 2px 6px; border-radius: 7px; background: var(--bg-secondary); border: 1px solid var(--glass-border); }
.completion { margin-left: auto; padding: 2px 7px; border-radius: 8px; font-weight: 700; }
.completion.complete { color: #047857; background: rgba(16,185,129,.08); }
.completion.text_only, .completion.missing_audio, .completion.missing_analysis, .completion.incomplete { color: #b45309; background: rgba(245,158,11,.08); }
.set-main { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 9px; }
.set-title-wrap { min-width: 0; }
.set-title-wrap h3 { color: var(--text-primary); font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.set-title-wrap p { margin-top: 3px; color: var(--text-muted); font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.read-btn { flex-shrink: 0; padding: 8px 12px; border-radius: 8px; color: #fff; background: linear-gradient(135deg, #d97706, #b45309); font-size: 10px; font-weight: 700; }
.read-btn span { margin-left: 4px; }
.resource-strip { display: flex; align-items: center; gap: 6px; margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--glass-border); flex-wrap: wrap; }
.resource-chip-group { display: flex; align-items: center; gap: 2px; }
.resource-chip { min-width: 105px; padding: 6px 8px; border: 1px solid var(--glass-border); border-radius: 7px; background: var(--bg-secondary); display: grid; grid-template-columns: 18px minmax(0, 1fr); grid-template-rows: auto auto; text-align: left; color: var(--text-muted); }
.resource-chip > span { grid-row: 1 / 3; display: flex; align-items: center; justify-content: center; font-family: var(--font-mono); font-weight: 700; color: var(--text-muted); }
.resource-chip strong { font-size: 9px; color: var(--text-secondary); white-space: nowrap; }
.resource-chip i { font-style: normal; font-size: 8px; color: var(--text-muted); opacity: .72; }
.resource-chip.available { color: var(--accent); background: rgba(217,119,6,.045); border-color: rgba(217,119,6,.13); }
.resource-chip.available > span, .resource-chip.available strong { color: var(--accent-dim); }
.text-chip:disabled { opacity: .45; cursor: default; }
.mini-remove { width: 18px; height: 24px; border-radius: 5px; color: var(--text-muted); background: transparent; font-size: 12px; }
.mini-remove:hover { color: var(--danger); background: rgba(220,38,38,.06); }
.card-menu-actions { margin-left: auto; display: flex; gap: 3px; }
.card-menu-actions button { padding: 5px 7px; border-radius: 6px; color: var(--text-muted); background: transparent; font-size: 8px; }
.card-menu-actions button:hover { color: var(--accent); background: rgba(217,119,6,.06); }
.card-menu-actions button.danger:hover { color: var(--danger); background: rgba(220,38,38,.05); }
@media (max-width: 980px) { .set-main { align-items: flex-start; } .card-menu-actions { margin-left: 0; } .resource-chip { min-width: 96px; } }
</style>
