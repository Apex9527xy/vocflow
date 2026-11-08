export type PdfInkTool = 'select' | 'draw' | 'erase'

export interface PdfInkPoint {
  x: number
  y: number
}

export interface PdfInkStroke {
  id?: number
  pageIndex: number
  points: PdfInkPoint[]
  color: string
  lineWidth: number
}

interface InkPageEntry {
  index: number
  pageNumber: number
  shell: HTMLElement
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  strokes: PdfInkStroke[]
  draft: PdfInkStroke | null
  observer: ResizeObserver
  pointerId: number | null
  erasing: boolean
}

export interface PdfInkManagerOptions {
  onStrokeAdded: (stroke: PdfInkStroke) => Promise<number | undefined>
  onStrokeDeleted: (id: number) => Promise<void>
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function parseGeometry(value: unknown): any {
  if (value && typeof value === 'object') return value
  if (typeof value !== 'string' || !value.trim()) return null
  try { return JSON.parse(value) } catch { return null }
}

export function parsePdfInkRecord(record: any): PdfInkStroke | null {
  if (String(record?.annotation_type || '') !== 'drawing') return null
  const geometry = parseGeometry(record?.geometry_json)
  if (!geometry || !Array.isArray(geometry.points)) return null
  const points: PdfInkPoint[] = []
  for (const point of geometry.points) {
    const x = Array.isArray(point) ? Number(point[0]) : Number(point?.x)
    const y = Array.isArray(point) ? Number(point[1]) : Number(point?.y)
    if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x: clamp01(x), y: clamp01(y) })
  }
  if (!points.length) return null
  const storedIndex = Number(geometry.pageIndex)
  return {
    id: Number(record.id) || undefined,
    pageIndex: Number.isInteger(storedIndex) ? Math.max(0, storedIndex) : Math.max(0, Number(record.page_number || 1) - 1),
    points,
    color: String(geometry.color || record.color || '#ef4444'),
    lineWidth: Math.max(0.5, Number(geometry.lineWidth) || 3)
  }
}

export function serializePdfInkStroke(stroke: PdfInkStroke): Record<string, unknown> {
  return {
    kind: 'pdf-ink',
    version: 1,
    pageIndex: stroke.pageIndex,
    points: stroke.points.map(point => [
      Number(point.x.toFixed(6)),
      Number(point.y.toFixed(6))
    ]),
    color: stroke.color,
    lineWidth: Number(stroke.lineWidth.toFixed(3))
  }
}

function pointForEvent(event: PointerEvent, shell: HTMLElement): PdfInkPoint {
  const rect = shell.getBoundingClientRect()
  return {
    x: clamp01((event.clientX - rect.left) / Math.max(1, rect.width)),
    y: clamp01((event.clientY - rect.top) / Math.max(1, rect.height))
  }
}

function pointToCss(point: PdfInkPoint, width: number, height: number): PdfInkPoint {
  return { x: point.x * width, y: point.y * height }
}

function distanceToSegment(point: PdfInkPoint, start: PdfInkPoint, end: PdfInkPoint): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (!dx && !dy) return Math.hypot(point.x - start.x, point.y - start.y)
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy))
}

function strokeIntersects(stroke: PdfInkStroke, point: PdfInkPoint, tolerance: number, width: number, height: number): boolean {
  if (!stroke.points.length) return false
  const target = pointToCss(point, width, height)
  if (stroke.points.length === 1) {
    const current = pointToCss(stroke.points[0], width, height)
    return Math.hypot(target.x - current.x, target.y - current.y) <= tolerance
  }
  for (let index = 1; index < stroke.points.length; index += 1) {
    const start = pointToCss(stroke.points[index - 1], width, height)
    const end = pointToCss(stroke.points[index], width, height)
    if (distanceToSegment(target, start, end) <= tolerance) return true
  }
  return false
}

export class PdfInkManager {
  private pages = new Map<number, InkPageEntry>()
  private records = new Map<number, PdfInkStroke[]>()
  private options: PdfInkManagerOptions
  private tool: PdfInkTool = 'select'
  private color = '#ef4444'
  private lineWidth = 3
  private eraserSize = 20
  private activePage: number | null = null

  constructor(options: PdfInkManagerOptions) {
    this.options = options
  }

  setRecords(strokes: PdfInkStroke[]): void {
    this.records.clear()
    for (const stroke of strokes) {
      const pageStrokes = this.records.get(stroke.pageIndex) || []
      pageStrokes.push(stroke)
      this.records.set(stroke.pageIndex, pageStrokes)
    }
    for (const entry of this.pages.values()) {
      entry.strokes = this.records.get(entry.index) || []
      if (entry.index === this.activePage) this.redraw(entry)
    }
  }

  registerPage(index: number, shell: HTMLElement, pageNumber: number): void {
    let entry = this.pages.get(index)
    if (entry && entry.shell !== shell) {
      entry.observer.disconnect()
      entry.canvas.remove()
      entry = undefined
    }
    if (!entry) {
      const canvas = document.createElement('canvas')
      canvas.className = 'pdf-ink-canvas'
      canvas.dataset.pdfInkPageIndex = String(index)
      const context = canvas.getContext('2d')
      if (!context) return
      const observer = new ResizeObserver(() => this.resize(entry!))
      entry = {
        index,
        pageNumber,
        shell,
        canvas,
        context,
        strokes: this.records.get(index) || [],
        draft: null,
        observer,
        pointerId: null,
        erasing: false
      }
      this.pages.set(index, entry)
      this.bindPointerEvents(entry)
      observer.observe(shell)
    }
    for (const other of this.pages.values()) {
      if (other !== entry && other.shell === shell) other.canvas.remove()
    }
    entry.pageNumber = pageNumber
    entry.shell = shell
    entry.strokes = this.records.get(index) || []
    if (entry.canvas.parentElement !== shell) shell.appendChild(entry.canvas)
    this.resize(entry)
    if (this.activePage === null) this.activePage = index
    this.applyVisibility()
  }

  resetPages(): void {
    for (const entry of this.pages.values()) {
      entry.observer.disconnect()
      entry.canvas.remove()
    }
    this.pages.clear()
  }

  destroy(): void {
    this.resetPages()
    this.records.clear()
  }

  setTool(tool: PdfInkTool): void {
    this.tool = tool
    for (const entry of this.pages.values()) entry.canvas.style.cursor = tool === 'erase' ? 'cell' : tool === 'draw' ? 'crosshair' : 'text'
    this.applyVisibility()
  }

  setColor(color: string): void { this.color = color }
  setLineWidth(width: number): void { this.lineWidth = Math.max(1, Math.min(24, Number(width) || 3)) }
  setEraserSize(size: number): void { this.eraserSize = Math.max(8, Math.min(64, Number(size) || 20)) }

  setActivePage(index: number): void {
    this.activePage = index
    this.applyVisibility()
    const entry = this.pages.get(index)
    if (entry) this.redraw(entry)
  }

  private applyVisibility(): void {
    for (const entry of this.pages.values()) {
      const active = entry.index === this.activePage
      entry.canvas.style.visibility = active ? 'visible' : 'hidden'
      entry.canvas.style.pointerEvents = active && this.tool !== 'select' ? 'auto' : 'none'
    }
  }

  private bindPointerEvents(entry: InkPageEntry): void {
    entry.canvas.addEventListener('pointerdown', event => this.handlePointerDown(entry, event))
    entry.canvas.addEventListener('pointermove', event => this.handlePointerMove(entry, event))
    entry.canvas.addEventListener('pointerup', event => this.handlePointerUp(entry, event))
    entry.canvas.addEventListener('pointercancel', event => this.handlePointerUp(entry, event))
  }

  private handlePointerDown(entry: InkPageEntry, event: PointerEvent): void {
    if (this.tool === 'select' || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    entry.pointerId = event.pointerId
    entry.erasing = this.tool === 'erase'
    entry.canvas.setPointerCapture(event.pointerId)
    if (entry.erasing) {
      this.eraseAt(entry, event)
      return
    }
    const scale = entry.shell.clientWidth / Math.max(1, Number(entry.shell.dataset.pdfBaseWidth) || entry.shell.clientWidth)
    entry.draft = {
      pageIndex: entry.index,
      points: [pointForEvent(event, entry.shell)],
      color: this.color,
      lineWidth: this.lineWidth / Math.max(0.001, scale)
    }
    this.redraw(entry)
  }

  private handlePointerMove(entry: InkPageEntry, event: PointerEvent): void {
    if (entry.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    if (entry.erasing) {
      this.eraseAt(entry, event)
      return
    }
    if (!entry.draft) return
    const point = pointForEvent(event, entry.shell)
    const previous = entry.draft.points[entry.draft.points.length - 1]
    const dx = (point.x - previous.x) * entry.shell.clientWidth
    const dy = (point.y - previous.y) * entry.shell.clientHeight
    if (Math.hypot(dx, dy) < 1.2) return
    entry.draft.points.push(point)
    this.redraw(entry)
  }

  private handlePointerUp(entry: InkPageEntry, event: PointerEvent): void {
    if (entry.pointerId !== event.pointerId) return
    if (entry.canvas.hasPointerCapture(event.pointerId)) entry.canvas.releasePointerCapture(event.pointerId)
    entry.pointerId = null
    entry.erasing = false
    const draft = entry.draft
    entry.draft = null
    if (!draft || draft.points.length < 2) {
      this.redraw(entry)
      return
    }
    const pageStrokes = this.records.get(entry.index) || []
    pageStrokes.push(draft)
    this.records.set(entry.index, pageStrokes)
    entry.strokes = pageStrokes
    this.redraw(entry)
    void this.options.onStrokeAdded(draft).then(id => {
      if (!id) return
      draft.id = id
      // The user may erase the stroke while the database insert is still in flight.
      if (!(this.records.get(entry.index) || []).includes(draft)) {
        void this.options.onStrokeDeleted(id).catch(error => console.error('删除手绘笔迹失败', error))
      }
    }).catch(error => console.error('保存手绘笔迹失败', error))
  }

  private eraseAt(entry: InkPageEntry, event: PointerEvent): void {
    const point = pointForEvent(event, entry.shell)
    const scale = entry.shell.clientWidth / Math.max(1, Number(entry.shell.dataset.pdfBaseWidth) || entry.shell.clientWidth)
    const removed: PdfInkStroke[] = []
    const survivors = entry.strokes.filter(stroke => {
      const tolerance = this.eraserSize / 2 + stroke.lineWidth * scale / 2
      const intersects = strokeIntersects(stroke, point, tolerance, entry.shell.clientWidth, entry.shell.clientHeight)
      if (intersects) removed.push(stroke)
      return !intersects
    })
    if (!removed.length) return
    entry.strokes = survivors
    this.records.set(entry.index, survivors)
    this.redraw(entry)
    for (const stroke of removed) {
      if (stroke.id) {
        void this.options.onStrokeDeleted(stroke.id).catch(error => console.error('删除手绘笔迹失败', error))
      }
    }
  }

  private resize(entry: InkPageEntry): void {
    const width = Math.max(1, entry.shell.clientWidth)
    const height = Math.max(1, entry.shell.clientHeight)
    const ratio = Math.max(1, window.devicePixelRatio || 1)
    const pixelWidth = Math.max(1, Math.round(width * ratio))
    const pixelHeight = Math.max(1, Math.round(height * ratio))
    if (entry.canvas.width !== pixelWidth) entry.canvas.width = pixelWidth
    if (entry.canvas.height !== pixelHeight) entry.canvas.height = pixelHeight
    entry.canvas.style.width = `${width}px`
    entry.canvas.style.height = `${height}px`
    entry.context.setTransform(ratio, 0, 0, ratio, 0, 0)
    this.redraw(entry)
  }

  private redraw(entry: InkPageEntry): void {
    const width = Math.max(1, entry.shell.clientWidth)
    const height = Math.max(1, entry.shell.clientHeight)
    if (!entry.canvas.width || !entry.canvas.height) return
    entry.context.save()
    entry.context.setTransform(entry.canvas.width / width, 0, 0, entry.canvas.height / height, 0, 0)
    entry.context.clearRect(0, 0, width, height)
    entry.context.lineCap = 'round'
    entry.context.lineJoin = 'round'
    const baseWidth = Math.max(1, Number(entry.shell.dataset.pdfBaseWidth) || width)
    const scale = width / baseWidth
    for (const stroke of entry.strokes) this.drawStroke(entry.context, stroke, width, height, scale)
    if (entry.draft) this.drawStroke(entry.context, entry.draft, width, height, scale)
    entry.context.restore()
  }

  private drawStroke(context: CanvasRenderingContext2D, stroke: PdfInkStroke, width: number, height: number, scale: number): void {
    if (!stroke.points.length) return
    context.strokeStyle = stroke.color
    context.fillStyle = stroke.color
    context.lineWidth = Math.max(1, stroke.lineWidth * scale)
    if (stroke.points.length === 1) {
      const point = pointToCss(stroke.points[0], width, height)
      context.beginPath()
      context.arc(point.x, point.y, context.lineWidth / 2, 0, Math.PI * 2)
      context.fill()
      return
    }
    context.beginPath()
    const first = pointToCss(stroke.points[0], width, height)
    context.moveTo(first.x, first.y)
    for (let index = 1; index < stroke.points.length - 1; index += 1) {
      const current = pointToCss(stroke.points[index], width, height)
      const next = pointToCss(stroke.points[index + 1], width, height)
      context.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2)
    }
    const last = pointToCss(stroke.points[stroke.points.length - 1], width, height)
    context.lineTo(last.x, last.y)
    context.stroke()
  }
}
