<script setup lang="ts">
import { computed } from 'vue'
import type { SentenceTreeClauseNode } from '../data/sentenceTree'

const props = withDefaults(defineProps<{ node: SentenceTreeClauseNode; depth?: number }>(), { depth: 0 })

const phrases = computed(() => {
  const result: Array<{ label: string; text: string; cls: string }> = [
    { label: props.node.subject.label, text: props.node.subject.text, cls: 'subject' },
    { label: props.node.predicate.label, text: props.node.predicate.text, cls: 'predicate' }
  ]
  if (props.node.object) result.push({ label: props.node.object.label, text: props.node.object.text, cls: 'object' })
  if (props.node.indirectObject) result.push({ label: props.node.indirectObject.label, text: props.node.indirectObject.text, cls: 'object' })
  if (props.node.directObject) result.push({ label: props.node.directObject.label, text: props.node.directObject.text, cls: 'object' })
  if (props.node.predicative) result.push({ label: props.node.predicative.label, text: props.node.predicative.text, cls: 'predicative' })
  if (props.node.objectComplement) result.push({ label: props.node.objectComplement.label, text: props.node.objectComplement.text, cls: 'complement' })
  if (props.node.adverbial) result.push({ label: props.node.adverbial.label, text: props.node.adverbial.text, cls: 'adverbial' })
  return result.filter(item => item.text)
})
</script>

<template>
  <details class="tree-branch" :class="{ main: props.node.type === '主句', invalid: !props.node.valid }" :open="props.depth === 0">
    <summary class="tree-branch-summary">
      <span class="tree-type">{{ props.node.type }}</span>
      <span class="tree-pattern">{{ props.node.pattern }}</span>
      <span v-if="props.node.guideWord" class="tree-guide">引导词 {{ props.node.guideWord }}</span>
      <span v-else-if="props.node.type !== '主句'" class="tree-guide omitted">引导词省略</span>
      <span v-if="props.node.subtype && props.node.subtype !== props.node.type" class="tree-subtype">{{ props.node.subtype }}</span>
      <span class="tree-toggle-hint">点击折叠 / 展开</span>
    </summary>
    <div class="tree-branch-body">
      <div class="tree-components">
        <span v-for="item in phrases" :key="`${item.cls}-${item.label}-${item.text}`" class="tree-component" :class="item.cls">
          <b>{{ item.label }}</b>{{ item.text }}
        </span>
      </div>
      <div v-if="props.node.modifiers?.length" class="tree-modifiers">
        <span v-for="(modifier, index) in props.node.modifiers" :key="`${modifier.text}-${index}`">
          <b>{{ modifier.text }}</b> → {{ modifier.target }}：{{ modifier.relation }}
        </span>
      </div>
      <div v-if="props.node.validationErrors.length" class="tree-errors">
        <span v-for="error in props.node.validationErrors" :key="error">{{ error }}</span>
      </div>
    </div>
    <div v-if="props.node.children.length" class="tree-children">
      <SentenceTreeBranch v-for="child in props.node.children" :key="child.id" :node="child" :depth="props.depth + 1" />
    </div>
  </details>
</template>

<style scoped>
.tree-branch { position:relative; margin-top:8px; border:1px solid rgba(61,51,45,.1); border-radius:9px; background:rgba(255,255,255,.7); }
.tree-branch.main { border:1px solid rgba(217,119,6,.3); border-left:4px solid var(--accent); background:linear-gradient(180deg,rgba(255,248,231,.96),rgba(255,255,255,.82)); box-shadow:0 5px 18px rgba(120,75,20,.08); }
.tree-branch.invalid { border-color:rgba(220,38,38,.28); }
.tree-branch-summary { display:flex; align-items:center; flex-wrap:wrap; gap:5px; padding:9px 10px; cursor:pointer; list-style:none; }
.tree-branch-summary::-webkit-details-marker { display:none; }
.tree-branch-summary::before { content:'▸'; color:var(--accent); font-size:10px; transition:transform .15s; }
.tree-branch[open] > .tree-branch-summary::before { transform:rotate(90deg); }
.tree-type { padding:2px 6px; border-radius:5px; color:#fff; background:var(--accent); font-size:8px; font-weight:800; }
.tree-branch.main .tree-type { background:#c2410c; }
.tree-pattern { padding:2px 6px; border-radius:5px; color:#1d4ed8; background:rgba(59,130,246,.1); font-family:var(--font-mono); font-size:8px; font-weight:800; }
.tree-guide,.tree-subtype { color:var(--text-muted); font-size:8px; }
.tree-guide.omitted { color:#b45309; }
.tree-toggle-hint { margin-left:auto; color:#a89a8e; font-size:7px; }
.tree-branch-body { padding:0 10px 9px 22px; }
.tree-components { display:flex; flex-wrap:wrap; gap:5px; }
.tree-component { display:inline-flex; align-items:center; gap:4px; padding:5px 7px; border-radius:6px; color:var(--text-secondary); background:rgba(61,51,45,.04); font-size:9px; line-height:1.4; }
.tree-component b { color:var(--text-muted); font-size:7px; letter-spacing:.2px; }
.tree-component.subject { color:#1d4ed8; background:rgba(96,165,250,.13); }
.tree-component.predicate { color:#a34f06; background:rgba(251,191,36,.17); }
.tree-component.object { color:#047857; background:rgba(52,211,153,.13); }
.tree-component.predicative { color:#7c3aed; background:rgba(167,139,250,.14); }
.tree-component.complement { color:#9f1239; background:rgba(251,113,133,.12); }
.tree-component.adverbial { color:#5b21b6; background:rgba(139,92,246,.1); }
.tree-modifiers,.tree-errors { display:flex; flex-direction:column; gap:4px; margin-top:6px; font-size:8px; line-height:1.5; }
.tree-modifiers span { color:#0f766e; }
.tree-errors span { color:#b91c1c; background:rgba(220,38,38,.05); padding:4px 6px; border-radius:5px; }
.tree-children { position:relative; margin:0 9px 9px 21px; padding-left:12px; border-left:1px dashed rgba(217,119,6,.32); }
</style>
