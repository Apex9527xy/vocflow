import { computed, ref, type Ref } from 'vue'

const MIN_ZOOM = 0.55
const MAX_ZOOM = 2.4

interface DragState {
  pointerId: number
  startX: number
  startY: number
  panX: number
  panY: number
}

export function useLookupViewport(
  card: Ref<HTMLElement | null>,
  canvas: Ref<HTMLElement | null>
) {
  const zoom = ref(1)
  const panX = ref(0)
  const panY = ref(0)
  const panning = ref(false)
  let drag: DragState | null = null

  const transformStyle = computed(() => ({
    transform: `translate3d(${panX.value}px, ${panY.value}px, 0) scale(${zoom.value})`,
    transformOrigin: '0 0'
  }))
  const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`)

  function clampPan(): void {
    const viewport = card.value
    const content = canvas.value
    if (!viewport || !content) return
    const contentWidth = content.offsetWidth * zoom.value
    const contentHeight = content.offsetHeight * zoom.value
    const extraX = Math.max(0, contentWidth - viewport.clientWidth)
    const extraY = Math.max(0, contentHeight - viewport.clientHeight)
    const slack = 36
    panX.value = Math.min(slack + extraX, Math.max(-extraX - slack, panX.value))
    panY.value = Math.min(slack + extraY, Math.max(-extraY - slack, panY.value))
  }

  function reset(): void {
    zoom.value = 1
    panX.value = 0
    panY.value = 0
    panning.value = false
    drag = null
  }

  function handleWheel(event: WheelEvent): void {
    const content = canvas.value
    if (!content) return
    event.preventDefault()
    event.stopPropagation()
    const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 18
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? Math.max(1, content.clientHeight)
        : 1
    content.scrollTop += event.deltaY * multiplier
  }

  function handlePanStart(event: PointerEvent): void {
    if (event.button !== 1) return
    event.preventDefault()
    event.stopPropagation()
    panning.value = true
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: panX.value,
      panY: panY.value
    }
    const target = event.currentTarget as HTMLElement | null
    target?.setPointerCapture?.(event.pointerId)
  }

  function handlePanMove(event: PointerEvent): void {
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    panX.value = drag.panX + event.clientX - drag.startX
    panY.value = drag.panY + event.clientY - drag.startY
    clampPan()
  }

  function handlePanEnd(event: PointerEvent): void {
    if (!drag || drag.pointerId !== event.pointerId) return
    const target = event.currentTarget as HTMLElement | null
    if (target?.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture(event.pointerId)
    }
    drag = null
    panning.value = false
  }

  return {
    zoom,
    panning,
    transformStyle,
    zoomLabel,
    reset,
    handleWheel,
    handlePanStart,
    handlePanMove,
    handlePanEnd
  }
}
