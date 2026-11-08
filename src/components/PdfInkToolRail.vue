<script setup lang="ts">
import type { PdfInkTool } from '../lib/pdf-ink'

const props = defineProps<{
  tool: PdfInkTool
  color: string
  lineWidth: number
  eraserSize: number
}>()

const emit = defineEmits<{
  (event: 'tool', value: PdfInkTool): void
  (event: 'color', value: string): void
  (event: 'line-width', value: number): void
  (event: 'eraser-size', value: number): void
}>()

const colors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#111827']
</script>

<template>
  <aside class="pdf-ink-tool-rail" data-word-lookup-ignore data-no-sentence-lookup @pointerdown.stop @click.stop>
    <button type="button" :class="{ active: props.tool === 'draw' }" title="自由画笔" @click="emit('tool', props.tool === 'draw' ? 'select' : 'draw')">
      <span class="tool-icon">✎</span><small>画笔</small>
    </button>
    <button type="button" :class="{ active: props.tool === 'erase' }" title="橡皮擦：碰到整条笔迹即删除" @click="emit('tool', props.tool === 'erase' ? 'select' : 'erase')">
      <span class="eraser-icon"></span><small>橡皮</small>
    </button>
    <div class="rail-divider"></div>
    <label class="color-control" title="画笔颜色">
      <span :style="{ background: props.color }"></span>
      <small>颜色</small>
      <input type="color" :value="props.color" @input="emit('color', ($event.target as HTMLInputElement).value)" />
    </label>
    <div class="color-presets">
      <button v-for="preset in colors" :key="preset" type="button" :style="{ background: preset }" :class="{ active: props.color === preset }" :title="preset" @click="emit('color', preset)"></button>
    </div>
    <label v-if="props.tool === 'draw'" class="size-control">
      <span>线宽 {{ Math.round(props.lineWidth) }}</span>
      <input type="range" min="1" max="16" step="1" :value="props.lineWidth" @input="emit('line-width', Number(($event.target as HTMLInputElement).value))" />
    </label>
    <label v-if="props.tool === 'erase'" class="size-control">
      <span>橡皮 {{ Math.round(props.eraserSize) }}</span>
      <input type="range" min="8" max="64" step="2" :value="props.eraserSize" @input="emit('eraser-size', Number(($event.target as HTMLInputElement).value))" />
    </label>
  </aside>
</template>

<style scoped>
.pdf-ink-tool-rail {
  position: fixed;
  z-index: 100020;
  top: 50%;
  left: 8px;
  width: 52px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 6px;
  border: 1px solid rgba(61, 51, 45, .14);
  border-radius: 13px;
  background: rgba(255, 252, 247, .97);
  box-shadow: 0 12px 35px rgba(35, 28, 23, .2);
  transform: translateY(-50%);
  backdrop-filter: blur(12px);
}
.pdf-ink-tool-rail > button {
  min-height: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: #6f6259;
  background: transparent;
  cursor: pointer;
}
.pdf-ink-tool-rail > button:hover,
.pdf-ink-tool-rail > button.active { color: #fff; background: var(--accent); }
.tool-icon { font-size: 17px; line-height: 1; }
.pdf-ink-tool-rail small { font-size: 7px; line-height: 1.1; }
.eraser-icon { position: relative; width: 17px; height: 10px; border: 2px solid currentColor; border-radius: 3px; transform: rotate(-35deg); }
.eraser-icon::after { content: ''; position: absolute; left: 5px; top: -2px; width: 4px; height: 10px; border-left: 1px solid currentColor; opacity: .65; }
.rail-divider { height: 1px; margin: 2px 3px; background: rgba(61, 51, 45, .1); }
.color-control { position: relative; min-height: 36px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; overflow: hidden; border-radius: 8px; cursor: pointer; }
.color-control input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
.color-control > span { width: 20px; height: 13px; border: 1px solid rgba(44, 36, 32, .2); border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.55); }
.color-presets { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; padding: 1px; }
.color-presets button { width: 18px; height: 18px; padding: 0; border: 1px solid rgba(44,36,32,.16); border-radius: 50%; cursor: pointer; }
.color-presets button.active { outline: 2px solid rgba(61,51,45,.55); outline-offset: 1px; }
.size-control { display: flex; flex-direction: column; gap: 2px; padding: 4px 1px; color: #6f6259; font-size: 7px; text-align: center; }
.size-control input { width: 100%; accent-color: var(--accent); cursor: pointer; }
</style>
