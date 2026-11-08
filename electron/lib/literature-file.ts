import * as pdfjsLib from 'pdfjs-dist'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'

const require = createRequire(import.meta.url)
const workerPath = require.resolve('pdfjs-dist/build/pdf.worker.mjs')
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').trim()
}

export function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

export function extractHtmlText(html: string): string {
  return cleanText(decodeHtml(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/h[1-6]|\/li)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )).replace(/\n{3,}/g, '\n\n')
}

export interface WebLiteratureMetadata {
  title: string
  authors: string
  year: string
  source: string
  doi: string
  abstract: string
  volume: string
  issue: string
  pages: string
  issn: string
  publisher: string
  itemType: string
  language: string
  citation: string
  contentText: string
  pdfCandidates: string[]
}

function parseHtmlAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const match of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attributes[match[1].toLowerCase()] = decodeHtml(match[3] ?? match[4] ?? match[5] ?? '')
  }
  return attributes
}

function metaMap(html: string): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = parseHtmlAttributes(match[0])
    const key = String(attributes.name || attributes.property || attributes['http-equiv'] || '').toLowerCase()
    const value = String(attributes.content || '').trim()
    if (!key || !value) continue
    const values = map.get(key) || []
    if (!values.includes(value)) values.push(value)
    map.set(key, values)
  }
  return map
}

function firstMetaValue(map: Map<string, string[]>, names: string[]): string {
  for (const name of names) {
    const value = map.get(name.toLowerCase())?.[0]
    if (value) return String(value).trim()
  }
  return ''
}

function firstJsonLdArticle(html: string): any | null {
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1].trim())
      const roots = Array.isArray(parsed) ? parsed : [parsed, ...(Array.isArray(parsed?.['@graph']) ? parsed['@graph'] : [])]
      const article = roots.find(value => {
        const types = Array.isArray(value?.['@type']) ? value['@type'] : [value?.['@type']]
        return types.some(type => /Article|Paper|Report/i.test(String(type || '')))
      })
      if (article) return article
    } catch {}
  }
  return null
}

function cleanWebTitle(value: string): string {
  return cleanText(decodeHtml(String(value || '').replace(/<[^>]+>/g, ' ')))
    .replace(/\s*[-_|]\s*(中国知网|CNKI|Google Scholar|百度学术).*$/i, '')
    .trim()
}

function authorsFromJsonLd(value: any): string {
  const rows = Array.isArray(value?.author) ? value.author : value?.author ? [value.author] : []
  return rows.map((item: any) => cleanText(item?.name || item)).filter(Boolean).join('; ')
}

function resolveCandidate(raw: string, baseUrl: string): string {
  try { return new URL(decodeHtml(raw), baseUrl).href } catch { return '' }
}

export function extractWebLiteratureMetadata(html: string, url: string): WebLiteratureMetadata {
  const meta = metaMap(html)
  const ld = firstJsonLdArticle(html)
  const title = cleanWebTitle(
    firstMetaValue(meta, ['citation_title', 'dc.title', 'dcterms.title', 'og:title'])
    || ld?.headline || ld?.name
    || html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    || ''
  )
  const authors = firstMetaValue(meta, ['citation_author', 'dc.creator', 'dcterms.creator'])
    || authorsFromJsonLd(ld)
  const dateText = firstMetaValue(meta, ['citation_publication_date', 'citation_date', 'dc.date', 'dcterms.issued']) || String(ld?.datePublished || '')
  const year = dateText.match(/(?:19|20)\d{2}/)?.[0] || ''
  const source = firstMetaValue(meta, ['citation_journal_title', 'citation_conference_title', 'prism.publicationName', 'dc.source'])
    || cleanText(ld?.isPartOf?.name || ld?.publisher?.name || ld?.publisher || '')
  const doi = firstMetaValue(meta, ['citation_doi', 'dc.identifier.doi', 'dc.identifier'])
    || String(typeof ld?.identifier === 'string' ? ld.identifier : '')
  const abstract = firstMetaValue(meta, ['citation_abstract', 'dc.description', 'description', 'og:description'])
    || cleanText(ld?.abstract || ld?.description || '')
  const volume = firstMetaValue(meta, ['citation_volume', 'prism.volume']) || String(ld?.isPartOf?.volumeNumber || '')
  const issue = firstMetaValue(meta, ['citation_issue', 'prism.issueIdentifier']) || String(ld?.isPartOf?.issueNumber || '')
  const pages = firstMetaValue(meta, ['citation_firstpage', 'citation_lastpage', 'prism.startingPage']) || String(ld?.pagination || '')
  const issn = firstMetaValue(meta, ['citation_issn', 'prism.issn', 'prism.eissn'])
  const publisher = firstMetaValue(meta, ['citation_publisher', 'dc.publisher']) || cleanText(ld?.publisher?.name || ld?.publisher || '')
  const candidates: Array<{ url: string; score: number }> = []
  const addCandidate = (value: string, score: number) => {
    const resolved = resolveCandidate(value, url)
    if (!/^https?:/i.test(resolved)) return
    const existing = candidates.find(item => item.url === resolved)
    if (existing) existing.score = Math.max(existing.score, score)
    else candidates.push({ url: resolved, score })
  }
  for (const value of meta.get('citation_pdf_url') || []) addCandidate(value, 300)
  if (/\.pdf(?:$|[?#])/i.test(url)) addCandidate(url, 400)
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attributes = parseHtmlAttributes(match[1])
    const href = attributes.href || attributes['data-href'] || attributes['data-url'] || ''
    const label = cleanText(decodeHtml(match[2].replace(/<[^>]+>/g, ' ')))
    const signature = `${attributes.id || ''} ${attributes.class || ''} ${attributes['aria-label'] || ''}`.toLowerCase()
    if (!href && !signature) continue
    let score = 0
    if (/pdf|全文|下载|download|full.?text/i.test(label)) score += 70
    if (/pdfdown|btn-dlpdf|pdf-download|download/i.test(signature)) score += 100
    if (/\.pdf(?:$|[?#])/i.test(href)) score += 30
    if (score > 0 && href && !/^javascript:/i.test(href)) addCandidate(href, score)
  }
  const citation = [authors, year ? `(${year})` : '', title, source].filter(Boolean).join('. ')
  return {
    title,
    authors,
    year,
    source,
    doi,
    abstract,
    volume,
    issue,
    pages,
    issn,
    publisher,
    itemType: /journal/i.test(String(ld?.['@type'] || '')) ? 'journalArticle' : 'webpage',
    language: firstMetaValue(meta, ['citation_language', 'dc.language']) || 'zh-CN',
    citation,
    contentText: extractHtmlText(html),
    pdfCandidates: candidates.sort((left, right) => right.score - left.score).map(item => item.url)
  }
}

export async function extractPdfInfo(filePath: string, maxPages = Number.POSITIVE_INFINITY): Promise<{
  title: string
  authors: string
  year: string
  contentText: string
  pageCount: number
  doi: string
  embeddedTitle: string
}> {
  const buffer = readFileSync(filePath)
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true })
  const pdf = await loadingTask.promise
  const metadata = await pdf.getMetadata().catch(() => null) as any
  const info = metadata?.info || {}
  const pages: string[] = []
  const pageLimit = Math.max(1, Math.min(pdf.numPages, Number.isFinite(maxPages) ? Math.floor(maxPages) : pdf.numPages))
  for (let number = 1; number <= pageLimit; number += 1) {
    const page = await pdf.getPage(number)
    const textContent = await page.getTextContent()
    const pageText = textContent.items.map((item: any) => item.str || '').join(' ').replace(/\s+/g, ' ').trim()
    if (pageText) pages.push(pageText)
  }
  const fallbackTitle = basename(filePath, extname(filePath)).replace(/[_]+/g, ' ').trim()
  const contentText = pages.join('\n\n')
  return {
    title: cleanText(info.Title) || fallbackTitle || '未命名文献',
    authors: cleanText(info.Author),
    year: cleanText(info.CreationDate).match(/(?:D:)?((?:19|20)\d{2})/)?.[1] || contentText.match(/(?:19|20)\d{2}/)?.[0] || '',
    contentText,
    pageCount: pdf.numPages,
    embeddedTitle: cleanText(info.Title),
    doi: contentText.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i)?.[0] || ''
  }
}

export function extractLocalText(filePath: string): string {
  const extension = extname(filePath).toLowerCase()
  const raw = readFileSync(filePath, 'utf8')
  if (extension === '.html' || extension === '.htm') return extractHtmlText(raw)
  return cleanText(raw)
}
