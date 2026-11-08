import { app, BrowserWindow, dialog, ipcMain, screen, shell } from 'electron'
import type { IpcMain, OpenDialogOptions, Session, WebContents } from 'electron'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import type { DbWrapper } from '../database/wrapper'
import { LiteratureRepository } from '../database/repositories/literature.repository'
import { extractLocalText, extractPdfInfo, extractWebLiteratureMetadata } from '../lib/literature-file'
import { saveDatabase } from '../database/connection'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'

interface CaptureSessionState {
  storagePath: string
}

function defaultLiteraturePath(): string {
  return join(app.getPath('documents'), 'VocFlow文献')
}

function ensureStoragePath(customPath?: string): string {
  const directory = resolve(String(customPath || '').trim() || defaultLiteraturePath())
  mkdirSync(directory, { recursive: true })
  return directory
}

function safeFilename(value: string, fallback = '文献.pdf'): string {
  const cleaned = String(value || '')
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 140)
  return cleaned || fallback
}

function uniquePath(directory: string, filename: string): string {
  const extension = extname(filename)
  const stem = basename(filename, extension)
  let candidate = join(directory, filename)
  let index = 1
  while (existsSync(candidate)) {
    candidate = join(directory, `${stem} (${index})${extension}`)
    index += 1
  }
  return candidate
}

function copyToStorage(sourcePath: string, storagePath: string): string {
  const directory = ensureStoragePath(storagePath)
  const source = resolve(sourcePath)
  if (dirname(source).toLowerCase() === directory.toLowerCase()) return source
  const target = uniquePath(directory, safeFilename(basename(source), '文献.pdf'))
  copyFileSync(source, target)
  return target
}

async function downloadPdf(url: string, storagePath: string, session: Session, referrer = '', preferredTitle = ''): Promise<string> {
  const parsed = new URL(url)
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('不支持的下载地址')
  const headers: Record<string, string> = {
    Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.5',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7'
  }
  if (/^https?:/i.test(referrer)) headers.Referer = referrer
  const response = await session.fetch(parsed.href, {
    credentials: 'include',
    headers
  })
  if (!response.ok) throw new Error(`PDF 下载失败：HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length < 5 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('当前页面没有返回可保存的 PDF 文件')
  }
  if (buffer.length > 180 * 1024 * 1024) throw new Error('PDF 文件超过 180MB，已取消保存')
  const disposition = response.headers.get('content-disposition') || ''
  const dispositionName = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i)?.[1]
  const urlName = decodeURIComponent(basename(parsed.pathname)) || '文献.pdf'
  const titleName = String(preferredTitle || '').trim().replace(/\.pdf$/i, '')
  let filename = titleName ? safeFilename(titleName + '.pdf', '文献.pdf') : safeFilename(dispositionName ? decodeURIComponent(dispositionName) : urlName, '文献.pdf')
  if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf'
  const target = uniquePath(ensureStoragePath(storagePath), filename)
  writeFileSync(target, buffer)
  return target
}

function normalizedIdentity(value: string): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '')
}

function identitySimilarity(left: string, right: string): number {
  const a = normalizedIdentity(left)
  const b = normalizedIdentity(right)
  if (!a || !b) return 0
  if (a.includes(b) || b.includes(a)) return 1
  const size = Math.min(a.length, b.length) >= 8 ? 3 : 2
  const grams = (value: string) => {
    const set = new Set<string>()
    for (let index = 0; index <= value.length - size; index++) set.add(value.slice(index, index + size))
    return set
  }
  const ga = grams(a)
  const gb = grams(b)
  let intersection = 0
  for (const item of ga) if (gb.has(item)) intersection++
  return intersection / Math.max(1, Math.min(ga.size, gb.size))
}

async function pdfMatchesExpectedTitle(filePath: string, expectedTitle: string): Promise<{ matches: boolean; reason: string }> {
  const expected = String(expectedTitle || '').trim()
  if (expected.length < 4) return { matches: true, reason: '' }
  try {
    const info = await extractPdfInfo(filePath, 1)
    const evidence = `${info.embeddedTitle || ''} ${String(info.contentText || '').slice(0, 5000)}`
    const normalizedEvidence = normalizedIdentity(evidence)
    const normalizedExpected = normalizedIdentity(expected)
    if (!normalizedEvidence) return { matches: true, reason: 'PDF 无可用文字，无法进一步校验标题' }
    if (normalizedEvidence.includes(normalizedExpected) || identitySimilarity(evidence, expected) >= 0.24) {
      return { matches: true, reason: '' }
    }
    const embedded = String(info.embeddedTitle || '').trim()
    if (embedded && identitySimilarity(embedded, expected) < 0.12 && !normalizedEvidence.includes(normalizedExpected)) {
      return { matches: false, reason: `下载到的 PDF 标题为“${embedded}”，与当前文献“${expected}”不一致` }
    }
    return { matches: true, reason: '' }
  } catch {
    return { matches: true, reason: 'PDF 元信息读取失败，保留文件' }
  }
}

async function tryDownloadCandidates(
  candidates: string[],
  storagePath: string,
  session: Session,
  referrer: string,
  preferredTitle = '',
  expectedIdentityTitle = ''
): Promise<string> {
  const errors: string[] = []
  for (const candidate of [...new Set(candidates.filter(Boolean))]) {
    let downloaded = ''
    try {
      downloaded = await downloadPdf(candidate, storagePath, session, referrer, preferredTitle)
      const identity = await pdfMatchesExpectedTitle(downloaded, expectedIdentityTitle)
      if (!identity.matches) {
        try { unlinkSync(downloaded) } catch {}
        errors.push(identity.reason)
        continue
      }
      return downloaded
    } catch (error) {
      if (downloaded) { try { unlinkSync(downloaded) } catch {} }
      errors.push((error as Error).message)
    }
  }
  throw new Error(errors[0] || '没有找到可下载的 PDF 地址')
}

async function triggerDownloadFromPage(
  webContents: WebContents,
  selectors: string[],
  storagePath: string,
  title: string
): Promise<string> {
  if (!selectors.length) throw new Error('页面没有可点击的 PDF 下载入口')
  const errors: string[] = []
  for (const selector of [...new Set(selectors.filter(Boolean))]) {
    try {
      return await clickSelectorAndWaitForDownload(webContents, selector, storagePath, title)
    } catch (error) {
      errors.push((error as Error).message)
    }
  }
  throw new Error(errors[0] || '已找到 PDF 按钮，但页面没有触发有效下载')
}

async function clickSelectorAndWaitForDownload(
  webContents: WebContents,
  selector: string,
  storagePath: string,
  title: string
): Promise<string> {
  const directory = ensureStoragePath(storagePath)
  let target = uniquePath(directory, safeFilename(`${title || '文献'}.pdf`, '文献.pdf'))
  if (!target.toLowerCase().endsWith('.pdf')) target += '.pdf'
  const session = webContents.session
  let started = false
  let settled = false
  let triggerTimer: NodeJS.Timeout | null = null
  let transferTimer: NodeJS.Timeout | null = null
  let onWillDownload: ((_event: any, item: any) => void) | null = null

  return new Promise<string>((resolve, reject) => {
    const cleanup = () => {
      if (triggerTimer) clearTimeout(triggerTimer)
      if (transferTimer) clearTimeout(transferTimer)
      triggerTimer = null
      transferTimer = null
      if (onWillDownload) session.removeListener('will-download', onWillDownload)
      onWillDownload = null
    }
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve(target)
    }
    onWillDownload = (_event: any, item: any) => {
      const filename = String(item.getFilename() || '')
      const mimeType = String(item.getMimeType() || '')
      const urlChain = Array.isArray(item.getURLChain?.()) ? item.getURLChain() : [item.getURL?.() || '']
      if (!/\.pdf$/i.test(filename) && !/pdf/i.test(mimeType) && !urlChain.some((url: string) => /\.pdf(?:$|[?#])/i.test(url))) {
        item.cancel()
        return
      }
      started = true
      if (triggerTimer) clearTimeout(triggerTimer)
      triggerTimer = null
      item.setSavePath(target)
      transferTimer = setTimeout(() => {
        try { item.cancel() } catch {}
        finish(new Error('PDF 已开始下载，但传输超时'))
      }, 90000)
      item.once('done', (_doneEvent: any, state: string) => {
        if (state === 'completed' && existsSync(target) && statSync(target).size > 5) finish()
        else finish(new Error(`PDF 下载未完成：${state || 'unknown'}`))
      })
    }
    session.on('will-download', onWillDownload)
    triggerTimer = setTimeout(() => {
      if (!started) finish(new Error('点击 PDF 按钮后未触发下载，可能需要登录、机构权限或完成验证码'))
    }, 30000)

    void (async () => {
      const result = await webContents.executeJavaScript(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return { clicked: false, href: '', text: '' };
        const href = element.getAttribute('href') || element.getAttribute('data-href') || element.getAttribute('data-url') || '';
        const text = String(element.innerText || element.textContent || element.getAttribute('title') || '').trim();
        element.scrollIntoView({ block: 'center' });
        element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 1, clientY: 1 }));
        element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 1, clientY: 1 }));
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 1, clientY: 1 }));
        element.click();
        return { clicked: true, href, text };
      })()`)
      if (!result?.clicked) finish(new Error('PDF 下载按钮已失效，请刷新页面后重试'))
      if (!started && result?.href && /^https?:/i.test(result.href)) {
        setTimeout(() => {
          if (!started) {
            try { webContents.downloadURL(result.href) } catch {}
          }
        }, 900)
      }
    })().catch(error => finish(new Error(`执行下载按钮失败：${(error as Error).message}`)))
  })
}

interface BrowserCapturePayload {
  token?: string
  pageUrl?: string
  title?: string
  authors?: string
  year?: string
  source?: string
  doi?: string
  abstract?: string
  volume?: string
  issue?: string
  pages?: string
  issn?: string
  publisher?: string
  citation?: string
  contentText?: string
  storagePath?: string
}

function browserCaptureToken(): string {
  return randomBytes(18).toString('hex')
}

function writeBridgeCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Private-Network', 'true')
}

function readBridgeBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', chunk => {
      size += chunk.length
      if (size > 2 * 1024 * 1024) {
        reject(new Error('抓取数据过大'))
        req.destroy()
      } else chunks.push(Buffer.from(chunk))
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function browserCaptureItem(repo: LiteratureRepository, payload: BrowserCapturePayload, filePath: string, pdfInfo: Awaited<ReturnType<typeof extractPdfInfo>> | null): any {
  const title = String(payload.title || pdfInfo?.title || '未命名文献').trim()
  const authors = String(payload.authors || pdfInfo?.authors || '').trim()
  const year = String(payload.year || pdfInfo?.year || '').trim()
  const source = String(payload.source || '浏览器保存').trim()
  const citation = String(payload.citation || [authors, year ? `(${year})` : '', title, source].filter(Boolean).join('. ')).trim()
  return repo.create({
    title,
    authors,
    year,
    source,
    sourceUrl: String(payload.pageUrl || '').trim(),
    doi: String(payload.doi || pdfInfo?.doi || '').trim(),
    abstract: String(payload.abstract || '').slice(0, 20000),
    contentText: String(payload.contentText || pdfInfo?.contentText || '').slice(0, 300000),
    filePath,
    fileType: filePath ? 'pdf' : 'web',
    metadata: {
      capturedFromBrowserBookmarklet: true,
      citation,
      volume: String(payload.volume || '').trim(),
      issue: String(payload.issue || '').trim(),
      pages: String(payload.pages || '').trim(),
      issn: String(payload.issn || '').trim(),
      publisher: String(payload.publisher || '').trim(),
      pageCount: pdfInfo?.pageCount || null
    }
  })
}

function watchBrowserDownload(repo: LiteratureRepository, payload: BrowserCapturePayload): void {
  const expectedTitle = String(payload.title || '').trim()
  const storagePath = ensureStoragePath(payload.storagePath)
  const downloadsPath = app.getPath('downloads')
  const startedAt = Date.now()
  const baseline = new Map<string, number>()
  try {
    for (const name of readdirSync(downloadsPath)) {
      if (!/\.pdf$/i.test(name)) continue
      try { baseline.set(join(downloadsPath, name), statSync(join(downloadsPath, name)).mtimeMs) } catch {}
    }
  } catch {}
  let stableCandidate = ''
  let stableSize = 0
  let stableTicks = 0
  let ticks = 0
  const timer = setInterval(async () => {
    ticks += 1
    let files: string[] = []
    try {
      files = readdirSync(downloadsPath).filter(name => /\.pdf$/i.test(name)).map(name => join(downloadsPath, name))
    } catch {}
    const fresh = files.filter(file => {
      try {
        const stat = statSync(file)
        const previousMtime = baseline.get(file)
        return stat.size > 5 && (previousMtime == null ? stat.mtimeMs >= startedAt - 1500 : stat.mtimeMs > previousMtime + 400)
      } catch { return false }
    }).sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)
    const candidate = fresh[0] || ''
    if (candidate) {
      try {
        const size = statSync(candidate).size
        if (candidate === stableCandidate && size === stableSize) stableTicks += 1
        else { stableCandidate = candidate; stableSize = size; stableTicks = 1 }
      } catch {}
    }
    if (stableCandidate && stableTicks >= 2) {
      clearInterval(timer)
      try {
        const info = await extractPdfInfo(stableCandidate, 5)
        const titleCheck = expectedTitle ? identitySimilarity(`${info.embeddedTitle} ${info.contentText.slice(0, 5000)}`, expectedTitle) : 1
        if (expectedTitle && titleCheck < 0.1 && info.embeddedTitle) {
          // Likely an unrelated simultaneous download. Keep watching for another PDF.
          stableCandidate = ''
          stableSize = 0
          stableTicks = 0
          return
        }
        const copied = copyToStorage(stableCandidate, storagePath)
        const item = browserCaptureItem(repo, payload, copied, info)
        saveDatabase()
        notifyLiteratureChanged(item)
      } catch (error) {
        console.warn('浏览器下载 PDF 自动入库失败:', error)
      }
      return
    }
    if (ticks >= 120) {
      clearInterval(timer)
      if (expectedTitle) {
        const item = browserCaptureItem(repo, payload, '', null)
        saveDatabase()
        notifyLiteratureChanged(item)
      }
    }
  }, 1000)
}

export function startLiteratureCaptureBridge(repo: LiteratureRepository, token: string, port: number): void {
  const server = createServer(async (req, res) => {
    writeBridgeCors(res)
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Private-Network': 'true' })
      res.end()
      return
    }
    if (req.method !== 'POST' || !req.url?.startsWith('/capture')) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ success: false, message: '接口不存在' }))
      return
    }
    try {
      const body = JSON.parse(await readBridgeBody(req)) as BrowserCapturePayload
      if (body.token !== token) throw new Error('VocFlow 抓取令牌无效，请重新生成浏览器保存按钮')
      if (!body.title || !body.pageUrl) throw new Error('网页没有识别到标题或网址')
      watchBrowserDownload(repo, body)
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ success: true, message: '已接收文献信息，正在等待浏览器下载 PDF' }))
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ success: false, message: (error as Error).message }))
    }
  })
  server.on('error', error => console.warn('VocFlow 浏览器抓取桥接服务启动失败:', error))
  server.listen(port, '127.0.0.1')
}

function notifyLiteratureChanged(item: any): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.getURL().includes('http')) continue
    window.webContents.send('literature:changed', item)
  }
}

function injectCaptureToolbar(window: BrowserWindow): void {
  const script = `(function(){
    if (document.getElementById('vocflow-capture-toolbar')) return;
    const bar = document.createElement('div');
    bar.id = 'vocflow-capture-toolbar';
    bar.style.cssText = 'position:fixed;top:16px;right:18px;z-index:2147483647;display:flex;align-items:center;gap:8px;padding:9px 10px;border:1px solid rgba(217,119,6,.35);border-radius:12px;background:rgba(255,252,247,.96);box-shadow:0 10px 30px rgba(0,0,0,.18);font-family:Microsoft YaHei,Arial,sans-serif;font-size:12px;color:#3d332d;backdrop-filter:blur(10px)';
    const label = document.createElement('span');
    label.textContent = 'VocFlow 文献抓取';
    label.style.cssText = 'font-weight:700;color:#b45309;padding:0 4px;white-space:nowrap';
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = '抓取并保存';
    save.style.cssText = 'border:0;border-radius:8px;padding:8px 12px;background:#d97706;color:#fff;font-weight:700;cursor:pointer;font-size:12px';
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = '‹ 返回上一页';
    back.style.cssText = 'border:1px solid rgba(61,51,45,.16);border-radius:8px;padding:8px 10px;background:#fff;color:#5d5149;cursor:pointer;font-size:12px';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '关闭';
    close.style.cssText = 'border:1px solid rgba(61,51,45,.16);border-radius:8px;padding:8px 10px;background:#fff;color:#5d5149;cursor:pointer;font-size:12px';
    const status = document.createElement('span');
    status.style.cssText = 'max-width:230px;color:#75675d;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    save.addEventListener('click', async function(){
      if (save.disabled) return;
      save.disabled = true;
      save.style.opacity = '0.6';
      save.textContent = '正在抓取…';
      status.textContent = '';
      try {
        const result = await window.vocflowCapture.captureCurrent();
        if (result && result.success) {
          save.textContent = '已保存';
          status.textContent = result.item?.file_path ? '文献与 PDF 已保存' : '文献信息已保存';
        } else {
          save.textContent = '重新抓取';
          save.disabled = false;
          save.style.opacity = '1';
          status.textContent = result?.message || '抓取失败';
        }
      } catch (error) {
        save.textContent = '重新抓取';
        save.disabled = false;
        save.style.opacity = '1';
        status.textContent = String(error?.message || error || '抓取失败');
      }
    });
    const refreshHistoryState = async function(){
      try {
        const state = await window.vocflowCapture.historyState();
        back.disabled = !state?.canGoBack;
        back.style.opacity = state?.canGoBack ? '1' : '0.4';
        back.style.cursor = state?.canGoBack ? 'pointer' : 'default';
      } catch {}
    };
    back.addEventListener('click', async function(){
      if (back.disabled) return;
      status.textContent = '';
      try {
        const result = await window.vocflowCapture.goBack();
        if (!result?.success) status.textContent = result?.message || '无法返回上一页';
      } catch (error) {
        status.textContent = String(error?.message || error || '无法返回上一页');
      }
      window.setTimeout(refreshHistoryState, 80);
    });
    close.addEventListener('click', function(){ window.vocflowCapture.closeWindow(); });
    bar.appendChild(label);
    bar.appendChild(back);
    bar.appendChild(save);
    bar.appendChild(close);
    bar.appendChild(status);
    document.documentElement.appendChild(bar);
    void refreshHistoryState();
    window.addEventListener('pageshow', refreshHistoryState);
  })();`
  window.webContents.executeJavaScript(script).catch(() => {})
}

async function importLocalLiterature(
  repo: LiteratureRepository,
  sourcePath: string,
  storagePath: string
): Promise<any> {
  const extension = extname(sourcePath).toLowerCase()
  if (!['.pdf', '.html', '.htm', '.txt', '.md'].includes(extension)) {
    throw new Error('目前支持 PDF、HTML、TXT 和 Markdown 文件')
  }
  if (statSync(sourcePath).size > 220 * 1024 * 1024) throw new Error('文件超过 220MB')
  const copied = copyToStorage(sourcePath, storagePath)
  if (extension === '.pdf') {
    const info = await extractPdfInfo(copied)
    return repo.create({
      title: info.title,
      authors: info.authors,
      year: info.year,
      source: '本地文件',
      abstract: info.contentText.slice(0, 1200),
      contentText: info.contentText,
      filePath: copied,
      fileType: 'pdf',
      metadata: { importedFrom: sourcePath, pageCount: info.pageCount }
    })
  }
  const contentText = extractLocalText(copied)
  const fallbackTitle = basename(copied, extension)
  return repo.create({
    title: fallbackTitle,
    source: '本地文件',
    abstract: contentText.slice(0, 1200),
    contentText,
    filePath: copied,
    fileType: extension.replace('.', ''),
    metadata: { importedFrom: sourcePath }
  })
}

async function saveCapturedLiterature(
  repo: LiteratureRepository,
  session: Session,
  webContents: WebContents,
  storagePath: string,
  payload: any
): Promise<{ item: any; pdfError: string }> {
  let filePath = ''
  let pdfError = ''
  const sourceUrl = String(webContents.getURL() || payload?.sourceUrl || '')
  const candidates = [
    ...(Array.isArray(payload?.pdfCandidates) ? payload.pdfCandidates : []),
    payload?.pdfUrl
  ].map(value => String(value || '').trim()).filter(Boolean)
  let sourceHost = ''
  try { sourceHost = new URL(sourceUrl).hostname } catch { sourceHost = '' }
  const urlFileName = (() => {
    try { return decodeURIComponent(basename(new URL(sourceUrl).pathname)).replace(/\.pdf$/i, '').trim() } catch { return '' }
  })()
  const cleanPayloadTitle = String(payload?.title || '').trim()
  const genericTitle = !cleanPayloadTitle || cleanPayloadTitle === sourceHost || /^(?:中国知网|CNKI|网页抓取|PDF)$/i.test(cleanPayloadTitle)
  const preferredTitle = genericTitle ? (urlFileName || cleanPayloadTitle) : cleanPayloadTitle
  const expectedIdentityTitle = genericTitle ? '' : cleanPayloadTitle
  if (candidates.length) {
    try {
      filePath = await tryDownloadCandidates(candidates, storagePath, session, sourceUrl, preferredTitle, expectedIdentityTitle)
    } catch (error) {
      pdfError = (error as Error).message
    }
  }
  if (!filePath && Array.isArray(payload?.downloadSelectors) && payload.downloadSelectors.length) {
    try {
      const clickedFile = await triggerDownloadFromPage(webContents, payload.downloadSelectors, storagePath, preferredTitle || '文献')
      const identity = await pdfMatchesExpectedTitle(clickedFile, expectedIdentityTitle)
      if (identity.matches) {
        filePath = clickedFile
      } else {
        try { unlinkSync(clickedFile) } catch {}
        pdfError = identity.reason
      }
    } catch (error) {
      const clickError = (error as Error).message
      pdfError = [pdfError, clickError].filter(Boolean).join('；')
    }
  }

  let source = String(payload?.source || '').trim()
  if (!source || source === '网页抓取' || source === sourceHost) source = sourceHost || 'PDF 文件'
  const isCnki = /(^|\.)cnki\.net$/i.test(sourceHost)
  if (isCnki && !filePath) {
    throw new Error(pdfError
      ? `未能下载知网 PDF：${pdfError}。请先在抓取窗口中完成知网登录、机构授权或验证码，再点击“重新抓取”。`
      : '未能从知网页面识别到 PDF 下载入口。请打开具体论文详情页，并确认页面显示“PDF下载”按钮且当前账号有全文权限。')
  }

  const selectedText = String(payload?.selectedText || '').trim()
  const pageText = String(payload?.contentText || '').trim()
  const contentText = selectedText && !pageText.includes(selectedText)
    ? `${selectedText}\n\n${pageText}`
    : pageText
  let pdfInfo: Awaited<ReturnType<typeof extractPdfInfo>> | null = null
  if (filePath) {
    try { pdfInfo = await extractPdfInfo(filePath, 3) } catch {}
  }
  const finalTitle = (!genericTitle ? cleanPayloadTitle : '') || pdfInfo?.title || preferredTitle || source || '未命名文献'
  const finalAuthors = String(payload?.authors || '').trim() || pdfInfo?.authors || ''
  const finalYear = String(payload?.year || '').trim() || pdfInfo?.year || ''
  const finalDoi = String(payload?.doi || '').trim() || pdfInfo?.doi || ''
  const suppliedCitation = String(payload?.citation || '').trim()
  const finalCitation = suppliedCitation || [finalAuthors, finalYear ? `(${finalYear})` : '', finalTitle, source].filter(Boolean).join('. ')
  const item = repo.create({
    title: finalTitle,
    authors: finalAuthors,
    year: finalYear,
    source,
    sourceUrl,
    doi: finalDoi,
    abstract: String(payload?.abstract || '').trim(),
    contentText,
    filePath,
    fileType: filePath ? 'pdf' : 'web',
    metadata: {
      contentType: payload?.contentType || '',
      capturedAt: payload?.capturedAt || new Date().toISOString(),
      pdfUrl: candidates[0] || '',
      pdfCandidates: candidates,
      pdfError,
      citation: finalCitation,
      volume: String(payload?.volume || '').trim(),
      issue: String(payload?.issue || '').trim(),
      pages: String(payload?.pages || '').trim(),
      issn: String(payload?.issn || '').trim(),
      publisher: String(payload?.publisher || '').trim(),
      itemType: String(payload?.itemType || '').trim(),
      language: String(payload?.language || '').trim()
    }
  })
  return { item, pdfError }
}
function listPdfFilesRecursive(root: string): string[] {
  const output: string[] = []
  const visit = (directory: string) => {
    let entries: any[]
    try { entries = readdirSync(directory, { withFileTypes: true }) as any } catch { return }
    for (const entry of entries) {
      const fullPath = join(directory, String(entry.name))
      if (entry.isDirectory()) visit(fullPath)
      else if (entry.isFile() && /\.pdf$/i.test(String(entry.name))) output.push(fullPath)
    }
  }
  visit(root)
  return output
}

export function registerLiteratureHandlers(ipcMain: IpcMain, db: DbWrapper): void {
  const repo = new LiteratureRepository(db)
  const captureSessions = new Map<number, CaptureSessionState>()
  let autoImportTimer: NodeJS.Timeout | null = null
  let autoImportRoot = ''
  const stopAutoImportWatch = () => {
    if (autoImportTimer) clearInterval(autoImportTimer)
    autoImportTimer = null
    autoImportRoot = ''
  }
  const startAutoImportWatch = (folderPath: string): { success: boolean; message: string; count?: number } => {
    stopAutoImportWatch()
    const root = resolve(folderPath)
    if (!existsSync(root) || !statSync(root).isDirectory()) return { success: false, message: 'PDF 自动导入路径不存在' }
    autoImportRoot = root
    const initialFiles = listPdfFilesRecursive(root)
    const baseline = new Map<string, number>()
    for (const file of initialFiles) {
      try { baseline.set(file, statSync(file).mtimeMs) } catch {}
    }
    const knownPaths = new Set((repo.list() as any[]).map(item => String(item.file_path || '').toLowerCase()).filter(Boolean))
    const pending = new Map<string, { size: number; ticks: number }>()
    autoImportTimer = setInterval(async () => {
      const currentFiles = listPdfFilesRecursive(autoImportRoot)
      for (const file of currentFiles) {
        const key = file.toLowerCase()
        if (knownPaths.has(key)) continue
        let stat: ReturnType<typeof statSync>
        try { stat = statSync(file) } catch { continue }
        const initialMtime = baseline.get(file)
        if (initialMtime != null && stat.mtimeMs <= initialMtime + 300) continue
        const previous = pending.get(file)
        if (previous && previous.size === stat.size) {
          previous.ticks += 1
          if (previous.ticks < 2) continue
          try {
            const item = await importLocalLiterature(repo, file, autoImportRoot)
            knownPaths.add(key)
            knownPaths.add(String(item.file_path || '').toLowerCase())
            baseline.set(file, stat.mtimeMs)
            saveDatabase()
            notifyLiteratureChanged(item)
          } catch (error) {
            console.warn(`自动导入 PDF 失败 ${file}:`, error)
            baseline.set(file, stat.mtimeMs)
          }
          pending.delete(file)
        } else {
          pending.set(file, { size: stat.size, ticks: 1 })
        }
      }
      for (const file of [...pending.keys()]) if (!currentFiles.includes(file)) pending.delete(file)
    }, 1400)
    return { success: true, message: `正在监听新 PDF，目录中已有 ${initialFiles.length} 个 PDF`, count: initialFiles.length }
  }
  ipcMain.handle('literature:setAutoImportWatch', (_event, payload: { enabled: boolean; path: string }) => {
    try {
      if (!payload?.enabled) {
        stopAutoImportWatch()
        return { success: true, message: 'PDF 自动导入已关闭' }
      }
      return startAutoImportWatch(String(payload.path || ''))
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('literature:getDefaultPath', () => defaultLiteraturePath())
  ipcMain.handle('literature:chooseDirectory', async (event, currentPath?: string) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    const options: OpenDialogOptions = {
      title: '选择文献保存文件夹',
      defaultPath: String(currentPath || '').trim() || defaultLiteraturePath(),
      properties: ['openDirectory', 'createDirectory']
    }
    const selection = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (selection.canceled || !selection.filePaths[0]) return { success: false, canceled: true }
    const path = ensureStoragePath(selection.filePaths[0])
    return { success: true, path }
  })

  ipcMain.handle('literature:list', () => repo.list())
  ipcMain.handle('literature:get', (_event, id: number) => repo.get(id))
  ipcMain.handle('literature:touch', (_event, id: number) => {
    repo.touch(id)
    saveDatabase()
    return { success: true }
  })

  ipcMain.handle('literature:captureHistoryState', (event) => ({
    success: true,
    canGoBack: Boolean(event.sender.navigationHistory?.canGoBack())
  }))

  ipcMain.handle('literature:captureGoBack', (event) => {
    const history = event.sender.navigationHistory
    if (!history?.canGoBack()) return { success: false, message: '已经是历史记录的第一页' }
    history.goBack()
    return { success: true }
  })

  ipcMain.handle('literature:closeCapture', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
    return { success: true }
  })

  ipcMain.handle('literature:saveCapture', async (event, payload: any) => {
    const captureWindow = BrowserWindow.fromWebContents(event.sender)
    try {
      const storagePath = captureSessions.get(event.sender.id)?.storagePath || defaultLiteraturePath()
      const result = await saveCapturedLiterature(repo, event.sender.session, event.sender, storagePath, payload)
      saveDatabase()
      notifyLiteratureChanged(result.item)
      if (captureWindow && !captureWindow.isDestroyed()) {
        const details = result.item.file_path
          ? `文献及 PDF 已保存到：\n${result.item.file_path}`
          : result.pdfError
            ? `文献信息已保存，但 PDF 未下载成功：\n${result.pdfError}`
            : '文献信息与网页正文已保存。'
        const answer = await dialog.showMessageBox(captureWindow, {
          type: 'question',
          title: '文献已保存',
          message: `《${result.item.title}》已保存`,
          detail: `${details}\n\n是否退出抓取窗口？`,
          buttons: ['退出窗口', '继续浏览'],
          defaultId: 0,
          cancelId: 1,
          noLink: true
        })
        if (answer.response === 0) captureWindow.close()
      }
      return { success: true, item: result.item }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('literature:chooseFile', async (event, storagePath?: string) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    const options: OpenDialogOptions = {
      title: '打开要加入文献库的本地文献',
      properties: ['openFile'],
      filters: [
        { name: '文献文件', extensions: ['pdf', 'html', 'htm', 'txt', 'md'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    }
    const selection = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (selection.canceled || !selection.filePaths[0]) return { success: false, canceled: true }
    try {
      const item = await importLocalLiterature(repo, selection.filePaths[0], ensureStoragePath(storagePath))
      saveDatabase()
      notifyLiteratureChanged(item)
      return { success: true, item }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('literature:importPath', async (_event, payload: { path: string; storagePath?: string }) => {
    try {
      const item = await importLocalLiterature(repo, String(payload?.path || ''), ensureStoragePath(payload?.storagePath))
      saveDatabase()
      notifyLiteratureChanged(item)
      return { success: true, item }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('literature:delete', (_event, id: number) => {
    const result = repo.remove(id)
    if (result.success) saveDatabase()
    return result
  })

  ipcMain.handle('literature:showInFolder', (_event, id: number) => {
    const item = repo.get(id) as any
    if (!item?.file_path || !existsSync(item.file_path)) {
      return { success: false, message: '文献文件不存在' }
    }
    shell.showItemInFolder(item.file_path)
    return { success: true }
  })

  ipcMain.handle('literature:renameFile', (_event, payload: { id: number; name: string }) => {
    try {
      const item = repo.get(Number(payload?.id)) as any
      if (!item?.file_path || !existsSync(item.file_path)) throw new Error('文献文件不存在')
      const currentPath = resolve(item.file_path)
      const currentExtension = extname(currentPath)
      let requestedName = safeFilename(String(payload?.name || '').trim(), basename(currentPath))
      if (!extname(requestedName) && currentExtension) requestedName += currentExtension
      if (extname(requestedName).toLowerCase() !== currentExtension.toLowerCase()) {
        throw new Error(`重命名时必须保留原扩展名 ${currentExtension}`)
      }
      const targetPath = join(dirname(currentPath), requestedName)
      if (resolve(targetPath).toLowerCase() === currentPath.toLowerCase()) {
        return { success: true, item }
      }
      if (existsSync(targetPath)) throw new Error('同名文件已存在，请换一个名称')
      renameSync(currentPath, targetPath)
      const updated = repo.updateFilePath(Number(item.id), targetPath)
      saveDatabase()
      notifyLiteratureChanged(updated)
      return { success: true, item: updated }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('literature:readFile', (_event, id: number) => {
    const item = repo.get(id) as any
    if (!item?.file_path || !existsSync(item.file_path)) throw new Error('文献文件不存在')
    if (extname(item.file_path).toLowerCase() !== '.pdf') throw new Error('当前阅读器只直接渲染 PDF 文件')
    return new Uint8Array(readFileSync(item.file_path))
  })

  ipcMain.handle('literature:openUrl', async (_event, url: string) => {
    if (!/^https?:\/\//i.test(url)) return { success: false, message: '链接无效' }
    await shell.openExternal(url)
    return { success: true }
  })

  ipcMain.handle('literature:getAnnotations', (_event, itemId: number) => repo.listAnnotations(itemId))
  ipcMain.handle('literature:addAnnotation', (_event, input: any) => {
    const annotation = repo.addAnnotation(input)
    saveDatabase()
    return { success: true, annotation }
  })
  ipcMain.handle('literature:updateAnnotationGeometry', (_event, payload: { id: number; geometry: any }) => {
    try {
      const annotation = repo.updateAnnotationGeometry(Number(payload.id), payload.geometry)
      saveDatabase()
      return { success: Boolean(annotation), annotation }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })
  ipcMain.handle('literature:deleteAnnotation', (_event, id: number) => {
    const result = repo.deleteAnnotation(id)
    if (result.success) saveDatabase()
    return result
  })
}
