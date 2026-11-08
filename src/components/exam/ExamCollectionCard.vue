<script setup lang="ts">
import { examPaperTypeLabel, examSeasonLabel } from '../../lib/examMetadata'
const props = defineProps<{ collection: ExamCollectionSummary; selectionMode?: boolean; selected?: boolean; sorting?: boolean }>()
const emit = defineEmits<{
  (event: 'open', collection: ExamCollectionSummary): void
  (event: 'audio', collection: ExamCollectionSummary, slot: 'A' | 'B'): void
  (event: 'annotate', collection: ExamCollectionSummary): void
  (event: 'edit', collection: ExamCollectionSummary): void
  (event: 'delete', collection: ExamCollectionSummary): void
  (event: 'toggle-select', collection: ExamCollectionSummary): void
}>()

const statusLabel = (value: string) => value === 'ready' ? '资源可用' : value === 'partial' ? '资料不完整' : value === 'review_required' ? '待人工核对' : '已归档'
const hasAudio = (slot: 'A' | 'B') => props.collection.audio.some(item => item.audio_slot === slot && item.status === 'available')
function handleCardClick(): void {
  if (props.sorting) return
  if (props.selectionMode) emit('toggle-select', props.collection)
  else emit('open', props.collection)
}
</script>

<template>
  <article class="collection-card" :class="{ selected, sorting }" @click="handleCardClick">
    <div v-if="sorting" class="drag-handle" title="按住并拖动以调整顺序"><span>⠿</span><small>拖动</small></div>
    <label v-else-if="selectionMode" class="selection-check" @click.stop><input type="checkbox" :checked="selected" @change="$emit('toggle-select', collection)" /></label>
    <div v-else class="package-mark">📦</div>
    <div class="collection-copy">
      <div class="collection-topline">
        <span class="type-chip">{{ examPaperTypeLabel(collection.exam_type) }}</span>
        <span>{{ collection.year || '年份未分类' }}<template v-if="collection.year"> 年</template></span>
        <span>{{ examSeasonLabel(collection.session) }}</span>
        <span class="status-chip" :class="collection.status">{{ statusLabel(collection.status) }}</span>
      </div>
      <h3>{{ collection.title }}</h3>
      <div class="collection-meta">
        <span>卷子 {{ collection.papers.length }}/3</span>
        <span>片段 {{ collection.segmentCount }}</span>
        <span v-if="collection.pendingCount" class="pending">待核对 {{ collection.pendingCount }}</span>
        <span>解析 {{ collection.analyses.length }}</span>
      </div>
    </div>
    <div v-if="!selectionMode && !sorting" class="audio-badges" @click.stop>
      <button v-for="slot in (['A','B'] as const)" :key="slot" :class="{ ready: hasAudio(slot) }" type="button" @click="$emit('audio', collection, slot)">
        <span>🔊</span>{{ slot }}<small>{{ hasAudio(slot) ? '已导入' : '导入' }}</small>
      </button>
    </div>
    <div v-if="!selectionMode && !sorting" class="card-actions" @click.stop>
      <button type="button" @click="$emit('annotate', collection)">标注</button>
      <button type="button" @click="$emit('edit', collection)">编辑</button>
      <button type="button" class="danger" @click="$emit('delete', collection)">删除</button>
    </div>
  </article>
</template>

<style scoped>
.collection-card { display: grid; grid-template-columns: 46px minmax(0,1fr) auto; gap: 12px; align-items: center; padding: 15px 16px; border: 1px solid var(--glass-border); border-left: 3px solid rgba(217,119,6,.55); border-radius: 11px; background: var(--bg-card); box-shadow: var(--shadow-card); cursor: pointer; transition: transform .15s ease, border-color .15s ease; }
.collection-card:hover { transform: translateY(-1px); border-color: rgba(217,119,6,.3); }
.collection-card.selected { border-color: rgba(217,119,6,.55); background: rgba(255,250,241,.98); box-shadow: 0 0 0 2px rgba(217,119,6,.09); }
.drag-handle { width:42px; height:42px; display:grid; place-items:center; align-content:center; gap:1px; border-radius:10px; color:var(--accent); background:rgba(217,119,6,.08); cursor:grab; user-select:none; }.drag-handle:active { cursor:grabbing; }.drag-handle span { font-size:20px; line-height:14px; }.drag-handle small { font-size:7px; font-weight:700; }.collection-card.sorting { cursor:grab; border-left-color:var(--accent); background:linear-gradient(90deg,rgba(217,119,6,.045),var(--bg-card) 42%); }.collection-card.sorting:hover { transform:none; }.selection-check { width:42px; height:42px; display:grid; place-items:center; border-radius:10px; background:rgba(217,119,6,.07); cursor:pointer; }.selection-check input { width:18px; height:18px; accent-color:var(--accent); cursor:pointer; }
.package-mark { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 10px; background: rgba(217,119,6,.07); font-size: 20px; }
.collection-copy { min-width: 0; }
.collection-topline { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; color: var(--text-muted); font-size: 9px; }
.type-chip, .status-chip { padding: 2px 7px; border-radius: 8px; font-weight: 700; }
.type-chip { color: var(--accent); background: rgba(217,119,6,.08); }
.status-chip.ready { color: #047857; background: rgba(16,185,129,.08); }
.status-chip.partial, .status-chip.review_required { color: #b45309; background: rgba(245,158,11,.09); }
.collection-copy h3 { margin-top: 5px; color: var(--text-primary); font-size: 15px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.collection-meta { display: flex; gap: 10px; margin-top: 5px; color: var(--text-muted); font-size: 9px; }
.collection-meta .pending { color: #b45309; font-weight: 700; }
.audio-badges { display: flex; gap: 5px; }
.audio-badges button { width: 56px; padding: 6px 5px; border: 1px dashed var(--glass-border); border-radius: 8px; background: var(--bg-secondary); color: var(--text-muted); font-size: 9px; font-weight: 700; }
.audio-badges button.ready { color: #047857; border-style: solid; border-color: rgba(16,185,129,.2); background: rgba(16,185,129,.05); }
.audio-badges span { display: block; font-size: 13px; }
.audio-badges small { display: block; margin-top: 1px; font-size: 7px; font-weight: 500; }
.card-actions { grid-column: 2 / 4; display: flex; gap: 4px; justify-content: flex-end; }
.card-actions button { padding: 5px 8px; border-radius: 6px; color: var(--text-muted); background: transparent; font-size: 8px; font-weight: 700; }
.card-actions button:hover { color: var(--accent); background: rgba(217,119,6,.05); }
.card-actions button.danger:hover { color: var(--danger); background: rgba(220,38,38,.05); }
@media (max-width: 960px) { .collection-card { grid-template-columns: 40px minmax(0,1fr); } .audio-badges { grid-column: 2; } .card-actions { grid-column: 2; justify-content: flex-start; } }
</style>
