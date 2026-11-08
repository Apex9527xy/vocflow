// The selection engine follows Zotero Reader's character-flow model: every PDF
// page is indexed as ordered character offsets, and a selection is represented as
// per-page [anchorOffset, headOffset) ranges. Annotation rectangles are derived
// from those character runs rather than from PDF.js's full-page DOM sentinel.
export type PdfRectTuple = [number, number, number, number]

export interface PdfTextChar {
  pageIndex: number
  pageNumber: number
  charIndex: number
  node: Text
  nodeOffset: number
  c: string
  rect: PdfRectTuple
  lineId: number
  lineBreakAfter: boolean
  spaceBefore: boolean
  wordStart: number
  wordEnd: number
}

export interface PdfSelectionPoint {
  pageIndex: number
  pageNumber: number
  charIndex: number
  rect: PdfRectTuple
  affinity: 'before' | 'after'
}

export interface PdfSelectionPageRange {
  pageIndex: number
  pageNumber: number
  anchorOffset: number
  headOffset: number
  rects: PdfRectTuple[]
  text: string
}

export interface PdfSelectionResult {
  anchor: PdfSelectionPoint
  head: PdfSelectionPoint
  ranges: PdfSelectionPageRange[]
  text: string
}

interface PdfTextPage {
  shell: HTMLElement
  textLayer: HTMLElement
  pageIndex: number
  pageNumber: number
  revision: string
  chars: PdfTextChar[]
  nodeStarts: Map<Text, number>
  width: number
  height: number
}

interface PdfTextEntry {
  div: HTMLElement
  text: string
  x: number
  y: number
  height: number
  breakBefore: boolean
}

const PAGE_SELECTOR = '[data-annotation-page], [data-exam-annotation-page]'
const TEXT_LAYER_SELECTOR = '.vocflow-pdf-text-layer, .segment-pdf-text-layer'
const WORD_CHARACTER = /[A-Za-z0-9'’\-]/
const pageCache = new WeakMap<HTMLElement, PdfTextPage>()

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function pageShells(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(PAGE_SELECTOR))
}

function pageNumberForShell(shell: HTMLElement): number {
  return Number(shell.dataset.annotationPage || shell.dataset.examAnnotationPage || 1) || 1
}

function pageTextLayer(shell: HTMLElement): HTMLElement | null {
  return shell.querySelector<HTMLElement>(TEXT_LAYER_SELECTOR)
}

function textLayerRevision(layer: HTMLElement): string {
  return layer.dataset.pdfTextRevision || String(layer.childNodes.length)
}

function textNodeAllowed(node: Text): boolean {
  const parent = node.parentElement
  if (!parent || !node.nodeValue) return false
  if (parent.closest('.endOfContent')) return false
  if (parent.closest('[aria-hidden="true"], [hidden], .notranslate')) return false
  const style = window.getComputedStyle(parent)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

function rangeRect(range: Range, fallback: DOMRect | null): PdfRectTuple | null {
  const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0.05 && rect.height > 0.5)
  const rect = rects[0] || range.getBoundingClientRect()
  if (rect.width > 0.05 && rect.height > 0.5) return [rect.left, rect.top, rect.right, rect.bottom]
  if (!fallback || fallback.width <= 0 || fallback.height <= 0) return null
  return [fallback.left, fallback.top, fallback.right, fallback.bottom]
}

function buildPage(shell: HTMLElement, pageIndex: number): PdfTextPage | null {
  const textLayer = pageTextLayer(shell)
  if (!textLayer) return null
  const shellRect = shell.getBoundingClientRect()
  if (!shellRect.width || !shellRect.height) return null
  const chars: PdfTextChar[] = []
  const nodeStarts = new Map<Text, number>()
  const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (!(node instanceof Text) || !textNodeAllowed(node)) continue
    const source = node.nodeValue || ''
    if (!source) continue
    let fallback: DOMRect | null = null
    const parentRect = node.parentElement?.getBoundingClientRect()
    if (parentRect) fallback = parentRect
    nodeStarts.set(node, chars.length)
    for (let offset = 0; offset < source.length;) {
      const character = String.fromCodePoint(source.codePointAt(offset) || 0)
      const range = document.createRange()
      range.setStart(node, offset)
      range.setEnd(node, offset + character.length)
      const clientRect = rangeRect(range, fallback)
      if (clientRect) {
        chars.push({
          pageIndex,
          pageNumber: pageNumberForShell(shell),
          charIndex: chars.length,
          node,
          nodeOffset: offset,
          c: character,
          rect: [
            clientRect[0] - shellRect.left,
            clientRect[1] - shellRect.top,
            clientRect[2] - shellRect.left,
            clientRect[3] - shellRect.top
          ],
          lineId: 0,
          lineBreakAfter: false,
          spaceBefore: false,
          wordStart: chars.length,
          wordEnd: chars.length
        })
      }
      offset += character.length
    }
  }

  if (!chars.length) {
    return {
      shell,
      textLayer,
      pageIndex,
      pageNumber: pageNumberForShell(shell),
      revision: textLayerRevision(textLayer),
      chars,
      nodeStarts,
      width: shellRect.width,
      height: shellRect.height
    }
  }

  let lineId = 0
  let lineTop = chars[0].rect[1]
  let lineBottom = chars[0].rect[3]
  let lastVisible: PdfTextChar | null = null
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]
    const parentLine = char.node.parentElement?.dataset.pdfLine
    const previousParentLine = lastVisible?.node.parentElement?.dataset.pdfLine
    const verticalOverlap = Math.min(lineBottom, char.rect[3]) - Math.max(lineTop, char.rect[1])
    const sameHeight = Math.min(lineBottom - lineTop, char.rect[3] - char.rect[1]) || 1
    const sameParentLine = Boolean(parentLine && previousParentLine && parentLine === previousParentLine)
    const newLine = Boolean(lastVisible && !sameParentLine && verticalOverlap / sameHeight < 0.45)
    if (newLine || !lastVisible) {
      if (lastVisible) lastVisible.lineBreakAfter = true
      lineId += index ? 1 : 0
      lineTop = char.rect[1]
      lineBottom = char.rect[3]
    } else {
      lineTop = Math.min(lineTop, char.rect[1])
      lineBottom = Math.max(lineBottom, char.rect[3])
    }
    char.lineId = lineId
    if (!/\s/.test(char.c) && char.rect[2] - char.rect[0] > 0.05) lastVisible = char
  }

  let wordStart = 0
  let previousWordChar: PdfTextChar | null = null
  let sawWhitespace = false
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]
    const whitespace = /\s/.test(char.c)
    const fontHeight = Math.max(1, char.rect[3] - char.rect[1])
    if (!whitespace && previousWordChar) {
      const sameLine = previousWordChar.lineId === char.lineId
      const gap = char.rect[0] - previousWordChar.rect[2]
      const gapThreshold = Math.max(1.05, Math.min(fontHeight, previousWordChar.rect[3] - previousWordChar.rect[1]) * 0.22)
      const nodeBoundary = char.nodeOffset === 0 && char.node !== previousWordChar.node
      const inferredSpace = Boolean(nodeBoundary && char.node.parentElement?.closest<HTMLElement>('[data-pdf-space-before]'))
      const latinBoundary = /[A-Za-z0-9]/.test(previousWordChar.c) && /[A-Za-z0-9]/.test(char.c)
      // PDF.js includes real spaces as zero-width text nodes. Ignore those that were
      // inserted into the middle of a word, but keep spaces that occupy horizontal width.
      const separatedByWhitespace = sawWhitespace && latinBoundary && gap > 0.65
      char.spaceBefore = sameLine && (separatedByWhitespace || gap > gapThreshold || inferredSpace)
      if (!sameLine) char.spaceBefore = true
    }
    if (whitespace) {
      sawWhitespace = true
      if (previousWordChar) previousWordChar.lineBreakAfter = previousWordChar.lineBreakAfter || char.lineId !== previousWordChar.lineId
      continue
    }
    sawWhitespace = false
    if (!previousWordChar || previousWordChar.lineId !== char.lineId || char.spaceBefore) wordStart = index
    const isWordCharacter = WORD_CHARACTER.test(char.c)
    const previousIsWordCharacter = Boolean(previousWordChar && WORD_CHARACTER.test(previousWordChar.c))
    if (!isWordCharacter || (!previousIsWordCharacter && previousWordChar?.lineId === char.lineId)) wordStart = index
    char.wordStart = wordStart
    for (let cursor = wordStart; cursor <= index; cursor += 1) chars[cursor].wordEnd = index
    previousWordChar = char
  }

  return {
    shell,
    textLayer,
    pageIndex,
    pageNumber: pageNumberForShell(shell),
    revision: textLayerRevision(textLayer),
    chars,
    nodeStarts,
    width: shellRect.width,
    height: shellRect.height
  }
}

function getPage(root: HTMLElement, shell: HTMLElement, pageIndex: number): PdfTextPage | null {
  const textLayer = pageTextLayer(shell)
  if (!textLayer) return null
  const cached = pageCache.get(shell)
  if (cached && cached.textLayer === textLayer && cached.revision === textLayerRevision(textLayer)) return cached
  const page = buildPage(shell, pageIndex)
  if (page) pageCache.set(shell, page)
  return page
}

function allPages(root: HTMLElement): Array<{ shell: HTMLElement; page: PdfTextPage }> {
  const result: Array<{ shell: HTMLElement; page: PdfTextPage }> = []
  pageShells(root).forEach((shell, index) => {
    const page = getPage(root, shell, index)
    if (page?.chars.length) result.push({ shell, page })
  })
  return result
}

function caretAtPoint(x: number, y: number): { node: Text; offset: number } | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (clientX: number, clientY: number) => Range | null
    caretPositionFromPoint?: (clientX: number, clientY: number) => { offsetNode: Node; offset: number } | null
  }
  const range = doc.caretRangeFromPoint?.(x, y)
  if (range?.startContainer instanceof Text) return { node: range.startContainer, offset: range.startOffset }
  const position = doc.caretPositionFromPoint?.(x, y)
  if (position?.offsetNode instanceof Text) return { node: position.offsetNode, offset: position.offset }
  return null
}

function pointFromPageCaret(page: PdfTextPage, caret: { node: Text; offset: number }, affinity: 'before' | 'after'): PdfSelectionPoint | null {
  const start = page.nodeStarts.get(caret.node)
  if (start === undefined) return null
  const offset = clamp(caret.offset, 0, caret.node.nodeValue?.length || 0)
  let index = start + offset
  if (affinity === 'after' && offset > 0) index -= 1
  index = clamp(index, 0, Math.max(0, page.chars.length - 1))
  const char = page.chars[index]
  if (!char) return null
  return { pageIndex: page.pageIndex, pageNumber: page.pageNumber, charIndex: index, rect: char.rect, affinity }
}

function pointFromCaret(root: HTMLElement, caret: { node: Text; offset: number }, affinity: 'before' | 'after'): PdfSelectionPoint | null {
  const shell = caret.node.parentElement?.closest<HTMLElement>(PAGE_SELECTOR)
  if (shell && root.contains(shell)) {
    const pageIndex = pageShells(root).indexOf(shell)
    const page = pageIndex >= 0 ? getPage(root, shell, pageIndex) : null
    const point = page ? pointFromPageCaret(page, caret, affinity) : null
    if (point) return point
  }
  // Fallback for DOM trees that do not expose the page shell through closest().
  for (const { page } of allPages(root)) {
    const point = pointFromPageCaret(page, caret, affinity)
    if (point) return point
  }
  return null
}

function pageDistance(page: PdfTextPage, x: number, y: number): number {
  const rect = page.shell.getBoundingClientRect()
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
  return dx * dx + dy * dy
}

function nearestPointOnPage(page: PdfTextPage, x: number, y: number, affinity: 'before' | 'after'): PdfSelectionPoint | null {
  const shellRect = page.shell.getBoundingClientRect()
  const localX = x - shellRect.left
  const localY = y - shellRect.top
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (const char of page.chars) {
    if (/\s/.test(char.c)) continue
    const centerX = (char.rect[0] + char.rect[2]) / 2
    const centerY = (char.rect[1] + char.rect[3]) / 2
    const horizontal = localX < char.rect[0] ? char.rect[0] - localX : localX > char.rect[2] ? localX - char.rect[2] : 0
    const vertical = localY < char.rect[1] ? char.rect[1] - localY : localY > char.rect[3] ? localY - char.rect[3] : 0
    const distance = vertical * vertical * 12 + horizontal * horizontal + Math.abs(centerY - localY)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = char.charIndex
    }
  }
  const char = page.chars[bestIndex]
  if (!char) return null
  return { pageIndex: page.pageIndex, pageNumber: page.pageNumber, charIndex: bestIndex, rect: char.rect, affinity }
}

function nearestPoint(root: HTMLElement, x: number, y: number, affinity: 'before' | 'after'): PdfSelectionPoint | null {
  let selectedPage: PdfTextPage | null = null
  let selectedDistance = Number.POSITIVE_INFINITY
  for (const { page } of allPages(root)) {
    const distance = pageDistance(page, x, y)
    if (distance < selectedDistance) {
      selectedDistance = distance
      selectedPage = page
    }
  }
  return selectedPage ? nearestPointOnPage(selectedPage, x, y, affinity) : null
}

export function pdfSelectionPointAt(
  root: HTMLElement,
  x: number,
  y: number,
  affinity: 'before' | 'after' = 'before',
  pageIndex?: number
): PdfSelectionPoint | null {
  const caret = caretAtPoint(x, y)
  const caretPoint = caret ? pointFromCaret(root, caret, affinity) : null
  if (pageIndex === undefined) return caretPoint || nearestPoint(root, x, y, affinity)
  if (caretPoint?.pageIndex === pageIndex) return caretPoint
  const page = allPages(root).find(item => item.page.pageIndex === pageIndex)?.page
  return page ? nearestPointOnPage(page, x, y, affinity) : null
}

export function pdfTextAnchorAtPoint(x: number, y: number, root: HTMLElement): PdfSelectionPoint | null {
  return pdfSelectionPointAt(root, x, y, 'before')
}

function pointForPage(page: PdfTextPage, charIndex: number, affinity: 'before' | 'after'): PdfSelectionPoint {
  const index = clamp(charIndex, 0, Math.max(0, page.chars.length - 1))
  return { pageIndex: page.pageIndex, pageNumber: page.pageNumber, charIndex: index, rect: page.chars[index].rect, affinity }
}

function comparePoints(left: PdfSelectionPoint, right: PdfSelectionPoint): number {
  return left.pageIndex - right.pageIndex || left.charIndex - right.charIndex
}

function textForChars(chars: PdfTextChar[]): string {
  let text = ''
  let lastLine = -1
  for (const char of chars) {
    if (/\s/.test(char.c)) continue
    if (text && lastLine >= 0 && lastLine !== char.lineId) text += ' '
    else if (text && char.spaceBefore && !/^[\s,.;:!?)\]}]/.test(char.c)) text += ' '
    text += char.c
    lastLine = char.lineId
  }
  return text
    .replace(/[\u00ad\u200b-\u200d\ufeff]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function rectsForChars(chars: PdfTextChar[]): PdfRectTuple[] {
  const lines = new Map<number, PdfRectTuple>()
  for (const char of chars) {
    if (/\s/.test(char.c)) continue
    const current = lines.get(char.lineId)
    if (!current) {
      lines.set(char.lineId, [...char.rect])
      continue
    }
    current[0] = Math.min(current[0], char.rect[0])
    current[1] = Math.min(current[1], char.rect[1])
    current[2] = Math.max(current[2], char.rect[2])
    current[3] = Math.max(current[3], char.rect[3])
  }
  const rects = [...lines.values()]
    .map(rect => [rect[0] - 0.75, rect[1] - 0.3, rect[2] + 0.75, rect[3] + 0.3] as PdfRectTuple)
    .sort((left, right) => left[1] - right[1] || left[0] - right[0])
  const merged: PdfRectTuple[] = []
  for (const rect of rects) {
    const target = merged.find(item => {
      const overlap = Math.min(item[3], rect[3]) - Math.max(item[1], rect[1])
      const minimumHeight = Math.min(item[3] - item[1], rect[3] - rect[1]) || 1
      return overlap / minimumHeight > 0.5 && rect[0] <= item[2] + 1 && rect[2] >= item[0] - 1
    })
    if (target) {
      target[0] = Math.min(target[0], rect[0])
      target[1] = Math.min(target[1], rect[1])
      target[2] = Math.max(target[2], rect[2])
      target[3] = Math.max(target[3], rect[3])
    } else merged.push(rect)
  }
  return merged
}

// Resolve two character anchors into continuous, page-local ranges. Word mode snaps
// both ends to word boundaries; line rectangles are merged per text line so visual
// markup and persisted annotation geometry share the same source of truth.
export function applyPdfTextSelection(
  anchor: PdfSelectionPoint,
  head: PdfSelectionPoint,
  root: HTMLElement,
  mode: 'chars' | 'words' | 'lines' = 'words'
): PdfSelectionResult | null {
  const pages = allPages(root)
  if (!pages.length) return null
  let from = comparePoints(anchor, head) <= 0 ? anchor : head
  let to = comparePoints(anchor, head) <= 0 ? head : anchor
  const fromPage = pages.find(item => item.page.pageIndex === from.pageIndex)?.page
  const toPage = pages.find(item => item.page.pageIndex === to.pageIndex)?.page
  if (!fromPage || !toPage) return null
  const fromChar = fromPage.chars[from.charIndex]
  const toChar = toPage.chars[to.charIndex]
  if (!fromChar || !toChar) return null
  if (mode === 'words' || mode === 'lines') {
    const startIndex = mode === 'words' ? fromChar.wordStart : fromPage.chars.findIndex(char => char.lineId === fromChar.lineId)
    const endIndex = mode === 'words' ? toChar.wordEnd : [...toPage.chars].reverse().find(char => char.lineId === toChar.lineId)?.charIndex ?? to.charIndex
    from = pointForPage(fromPage, Math.max(0, startIndex), 'before')
    to = pointForPage(toPage, Math.max(0, endIndex), 'after')
  }
  const first = comparePoints(from, to) <= 0 ? from : to
  const last = comparePoints(from, to) <= 0 ? to : from
  const ranges: PdfSelectionPageRange[] = []
  for (const { page } of pages) {
    if (page.pageIndex < first.pageIndex || page.pageIndex > last.pageIndex) continue
    const startOffset = page.pageIndex === first.pageIndex ? first.charIndex : 0
    const endOffset = page.pageIndex === last.pageIndex ? last.charIndex + 1 : page.chars.length
    if (endOffset <= startOffset) continue
    const chars = page.chars.slice(startOffset, endOffset)
    ranges.push({
      pageIndex: page.pageIndex,
      pageNumber: page.pageNumber,
      anchorOffset: startOffset,
      headOffset: endOffset,
      rects: rectsForChars(chars),
      text: textForChars(chars)
    })
  }
  if (!ranges.length) return null
  const startChar = fromPage.chars[first.charIndex]
  const endPage = pages.find(item => item.page.pageIndex === last.pageIndex)?.page || toPage
  const endChar = endPage.chars[last.charIndex]
  if (!startChar || !endChar) return null
  const selection = window.getSelection()
  if (selection) {
    selection.removeAllRanges()
    selection.setBaseAndExtent(startChar.node, startChar.nodeOffset, endChar.node, endChar.nodeOffset + endChar.c.length)
  }
  return {
    anchor: { ...first, affinity: 'before' },
    head: { ...last, affinity: 'after' },
    ranges,
    text: ranges.map(range => range.text).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  }
}

export function pdfSelectionLooksLikeWholePage(result: PdfSelectionResult, root: HTMLElement): boolean {
  if (!result.ranges.length) return false
  const shell = pageShells(root)[result.ranges[0].pageIndex]
  if (!shell) return false
  const page = getPage(root, shell, result.ranges[0].pageIndex)
  if (!page || !page.chars.length) return false
  const pageText = textForChars(page.chars).replace(/\s+/g, '')
  const selectedText = result.text.replace(/\s+/g, '')
  return pageText.length > 80 && selectedText.length >= pageText.length * 0.82
}

export function pdfSelectionClientRect(result: PdfSelectionResult, root: HTMLElement): DOMRect | null {
  const shells = pageShells(root)
  const first = result.ranges[0]
  if (!first) return null
  const shell = shells[first.pageIndex]
  if (!shell) return null
  const shellRect = shell.getBoundingClientRect()
  const firstRect = first.rects[0]
  if (!firstRect) return null
  return new DOMRect(shellRect.left + firstRect[0], shellRect.top + firstRect[1], firstRect[2] - firstRect[0], firstRect[3] - firstRect[1])
}

export function clearPdfTextSelection(): void {
  window.getSelection()?.removeAllRanges()
}

export function markPdfTextLayerReady(layer: HTMLElement): void {
  layer.dataset.pdfTextRevision = `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function annotatePdfTextLayer(container: HTMLElement, items: any[], textDivs: HTMLElement[], page: number): void {
  const entries: PdfTextEntry[] = []
  let divIndex = 0
  let breakBefore = false
  for (const item of items || []) {
    if (item?.str === undefined) continue
    const div = textDivs[divIndex]
    divIndex += 1
    const text = String(item.str || '')
    if (!div || !div.isConnected || !text) {
      breakBefore = Boolean(item?.hasEOL)
      continue
    }
    const transform = Array.isArray(item?.transform) ? item.transform : []
    entries.push({
      div,
      text,
      x: Number(transform[4]) || 0,
      y: Number(transform[5]) || 0,
      height: Math.abs(Number(item?.height)) || Math.abs(Number(transform[3])) || 1,
      breakBefore
    })
    breakBefore = Boolean(item?.hasEOL)
  }

  const lines: PdfTextEntry[][] = []
  for (const entry of entries) {
    const previousLine = lines[lines.length - 1]
    const lineStart = previousLine?.[0]
    const sameLine = Boolean(previousLine && lineStart && !entry.breakBefore &&
      Math.abs(entry.y - lineStart.y) <= Math.max(1, Math.min(entry.height, lineStart.height) * 0.36))
    if (sameLine) previousLine.push(entry)
    else lines.push([entry])
  }

  lines.forEach((line, lineIndex) => {
    const ordered = [...line].sort((left, right) => left.x - right.x)
    const advances: number[] = []
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1]
      const current = ordered[index]
      if (/\s/.test(previous.text) || /\s/.test(current.text)) continue
      const advance = current.x - previous.x
      if (Number.isFinite(advance) && advance > 0) advances.push(advance)
    }
    const heights = ordered.map(entry => entry.height).sort((left, right) => left - right)
    const fontHeight = heights[Math.floor(heights.length / 2)] || 1
    const sortedAdvances = [...advances].sort((left, right) => left - right)
    const medianAdvance = sortedAdvances[Math.floor(sortedAdvances.length / 2)] || 0
    const wordGap = Math.max(1, fontHeight * 0.6, medianAdvance * 1.18)
    const lineId = `${page}:${lineIndex}`
    let wordEntries: PdfTextEntry[] = []
    const flushWord = () => {
      if (!wordEntries.length) return
      const word = wordEntries.map(entry => entry.text).join('')
      for (const entry of wordEntries) entry.div.dataset.pdfWord = word
      wordEntries = []
    }
    ordered.forEach((entry, index) => {
      const previous = index > 0 ? ordered[index - 1] : null
      const advance = previous ? entry.x - previous.x : 0
      const explicitWhitespace = /^\s/.test(entry.text) || Boolean(previous && /\s$/.test(previous.text))
      const punctuationBoundary = Boolean(previous && /[.,;:!?][)]}'"”’]?$/.test(previous.text) && /^[A-Za-z0-9]/.test(entry.text))
      const separated = !previous || entry.breakBefore || explicitWhitespace || punctuationBoundary || advance > wordGap
      entry.div.dataset.pdfLine = lineId
      if (separated) entry.div.dataset.pdfSpaceBefore = '1'
      else delete entry.div.dataset.pdfSpaceBefore
      const isWordCharacter = /^[A-Za-z'’-]+$/.test(entry.text)
      if (!isWordCharacter) {
        flushWord()
        return
      }
      if (separated) flushWord()
      wordEntries.push(entry)
    })
    flushWord()
  })
  container.dataset.pdfTextAnnotated = '1'
  markPdfTextLayerReady(container)
}
