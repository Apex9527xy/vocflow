const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const net = require('node:net')

const PORT = Number(process.env.PORT || process.env.VOCFLOW_CLOUD_PORT || 8787)
const HOST = process.env.VOCFLOW_CLOUD_HOST || '127.0.0.1'
const DATA_DIR = path.resolve(process.env.VOCFLOW_CLOUD_DATA_DIR || path.join(__dirname, 'data'))
const DATA_FILE = path.resolve(process.env.VOCFLOW_CLOUD_DATA_FILE || path.join(DATA_DIR, 'vocflow-cloud.json'))
const UPDATE_DIR = path.resolve(process.env.VOCFLOW_UPDATE_DIR || path.join(DATA_DIR, 'updates'))
const PUBLIC_URL = normalizePublicUrl(process.env.VOCFLOW_PUBLIC_URL)

const EMPTY_AD_CONFIG = Object.freeze({
  enabled: false,
  imageUrl: '',
  targetUrl: '',
  updatedAt: null,
  updatedBy: ''
})

function normalizePublicUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '')
  if (!raw) return ''
  let parsed
  try { parsed = new URL(raw) } catch { throw new Error('VOCFLOW_PUBLIC_URL 格式无效') }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('VOCFLOW_PUBLIC_URL 必须是纯 HTTPS 站点根地址')
  }
  if (net.isIP(parsed.hostname) || isLoopbackHost(parsed.hostname)) {
    throw new Error('VOCFLOW_PUBLIC_URL 必须使用可签发证书的域名')
  }
  return raw
}

function isLoopbackHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host.startsWith('127.')
}

function ensureDirectories() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.mkdirSync(UPDATE_DIR, { recursive: true })
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`
  try {
    fs.writeFileSync(temporary, JSON.stringify(payload, null, 2), 'utf8')
    fs.renameSync(temporary, filePath)
  } catch (error) {
    try { fs.unlinkSync(temporary) } catch {}
    throw error
  }
}

function normalizeUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return ''
    return parsed.href
  } catch {
    return ''
  }
}

function normalizeAdConfig(input) {
  const value = input && typeof input === 'object' ? input : {}
  return {
    enabled: Boolean(value.enabled),
    imageUrl: normalizeUrl(value.imageUrl),
    targetUrl: normalizeUrl(value.targetUrl),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
    updatedBy: String(value.updatedBy || '').slice(0, 160)
  }
}

function readAdConfig() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const initial = { schemaVersion: 2, adConfig: { ...EMPTY_AD_CONFIG } }
      writeJsonAtomic(DATA_FILE, initial)
      return initial.adConfig
    }
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    return normalizeAdConfig(parsed?.adConfig)
  } catch (error) {
    console.warn('读取公告配置失败，暂时返回关闭状态:', error.message)
    return { ...EMPTY_AD_CONFIG }
  }
}

function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  })
  res.end(body)
}

function publicOrigin(req) {
  if (PUBLIC_URL) return PUBLIC_URL
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim()
  const protocol = forwardedProto === 'https' ? 'https' : 'http'
  const host = forwardedHost || String(req.headers.host || `localhost:${PORT}`)
  return `${protocol}://${host}`
}

function updateFileName(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const name = /^[a-z][a-z0-9+.-]*:/i.test(raw)
      ? decodeURIComponent(new URL(raw).pathname.split('/').pop() || '')
      : decodeURIComponent(raw)
    return name && path.basename(name) === name && /\.zip$/i.test(name) ? name : ''
  } catch {
    return ''
  }
}

function readManifest() {
  const manifestFile = path.join(UPDATE_DIR, 'update.json')
  if (!fs.existsSync(manifestFile)) return { error: { status: 404, message: '尚未发布版本清单' } }
  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  } catch (error) {
    return { error: { status: 500, message: `版本清单读取失败: ${error.message}` } }
  }
  const version = String(manifest?.version || '').trim().replace(/^v/i, '')
  if (!/^\d+\.\d+\.\d+$/.test(version)) return { error: { status: 400, message: '更新清单版本号无效' } }
  const sha256 = String(manifest?.sha256 || '').trim().toLowerCase().replace(/^sha256:/i, '')
  if (!/^[a-f0-9]{64}$/.test(sha256)) return { error: { status: 400, message: '更新清单缺少有效 SHA256' } }
  const payloadDir = String(manifest?.payloadDir || 'payload').trim().replace(/\\/g, '/')
  const payloadParts = payloadDir.split('/')
  if (!payloadDir || payloadDir.startsWith('/') || /^[a-z]:/i.test(payloadDir) || payloadParts.some(part => !part || part === '.' || part === '..')) {
    return { error: { status: 400, message: '更新清单 payloadDir 无效' } }
  }
  return { manifest, version, sha256, payloadDir }
}

function resolveDownload(req, manifest, version) {
  const expectedName = `VocFlow-${version}-update.zip`
  const rawDownloadUrl = String(manifest.downloadUrl || '').trim()
  if (/^[a-z][a-z0-9+.-]*:/i.test(rawDownloadUrl)) {
    let parsed
    try { parsed = new URL(rawDownloadUrl) } catch { return { error: '下载地址格式无效' } }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || updateFileName(rawDownloadUrl) !== expectedName) {
      return { error: '下载地址必须是文件名正确的完整 HTTPS 地址' }
    }
    return { downloadUrl: rawDownloadUrl }
  }
  const requestedName = updateFileName(rawDownloadUrl || expectedName)
  if (requestedName !== expectedName) return { error: `更新包文件名必须是 ${expectedName}` }
  const packageFile = path.join(UPDATE_DIR, requestedName)
  if (!fs.existsSync(packageFile)) return { error: '更新清单存在，但更新包尚未上传', status: 404 }
  return { downloadUrl: `${publicOrigin(req)}/api/app-update/download/${encodeURIComponent(requestedName)}` }
}

async function handle(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS'
    })
    return res.end()
  }
  if (req.method !== 'GET') return json(res, 405, { success: false, message: '仅支持 GET' })

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const route = url.pathname

  if (route === '/health') {
    return json(res, 200, {
      ok: true,
      service: 'vocflow-cloud',
      accountFeatures: false,
      adConfig: true,
      appUpdate: true,
      time: new Date().toISOString()
    })
  }

  if (route === '/api/ad-config') {
    return json(res, 200, { success: true, config: readAdConfig() })
  }

  if (route === '/api/app-update/manifest') {
    const result = readManifest()
    if (result.error) return json(res, result.error.status, { success: false, message: result.error.message })
    const download = resolveDownload(req, result.manifest, result.version)
    if (download.error) return json(res, download.status || 400, { success: false, message: download.error })
    return json(res, 200, {
      success: true,
      manifest: {
        ...result.manifest,
        version: result.version,
        sha256: result.sha256,
        payloadDir: result.payloadDir,
        downloadUrl: download.downloadUrl
      }
    })
  }

  if (route.startsWith('/api/app-update/download/')) {
    let fileName = ''
    try { fileName = decodeURIComponent(route.slice('/api/app-update/download/'.length)) } catch {}
    if (!fileName || path.basename(fileName) !== fileName || !/\.zip$/i.test(fileName)) {
      return json(res, 400, { success: false, message: '更新包文件名无效' })
    }
    const filePath = path.join(UPDATE_DIR, fileName)
    if (!fs.existsSync(filePath)) return json(res, 404, { success: false, message: '更新包不存在' })
    const stat = fs.statSync(filePath)
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff'
    })
    return fs.createReadStream(filePath).pipe(res)
  }

  return json(res, 404, { success: false, message: '接口不存在' })
}

ensureDirectories()
readAdConfig()

const server = http.createServer((req, res) => {
  handle(req, res).catch(error => {
    console.error(`${req.method} ${req.url}:`, error)
    if (!res.headersSent) json(res, 500, { success: false, message: '服务器内部错误' })
    else res.end()
  })
})

server.listen(PORT, HOST, () => {
  console.log(`VocFlow API listening on http://${HOST}:${PORT}`)
  console.log(`Data file: ${DATA_FILE}`)
  console.log(`Update directory: ${UPDATE_DIR}`)
})

let shuttingDown = false
function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`收到 ${signal}，正在关闭服务`)
  const force = setTimeout(() => process.exit(0), 5000)
  force.unref()
  server.close(() => process.exit(0))
}
process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
