const SERVICE_NAME = 'vocflow-cloud'
const DEFAULT_GITHUB_REPOSITORY = 'Apex9527xy/vocflow'
const DEFAULT_MANIFEST_URL = 'https://github.com/Apex9527xy/vocflow/releases/latest/download/update.json'
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const UPDATE_FILE_PATTERN = /^VocFlow-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)-update\.zip$/

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extra
  }
}

function jsonResponse(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders
    })
  })
}

function normalizeHttpUrl(value) {
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

function normalizeAdConfig(value) {
  const input = value && typeof value === 'object' ? value : {}
  const imageUrl = normalizeHttpUrl(input.imageUrl)
  const targetUrl = normalizeHttpUrl(input.targetUrl)
  const enabled = Boolean(input.enabled) && Boolean(imageUrl) && Boolean(targetUrl)
  return {
    enabled,
    imageUrl: enabled ? imageUrl : '',
    targetUrl: enabled ? targetUrl : '',
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : null,
    updatedBy: String(input.updatedBy || '').slice(0, 160)
  }
}

function adConfigFromEnvironment(env) {
  const raw = String(env?.AD_CONFIG_JSON || '').trim()
  if (!raw) return normalizeAdConfig(null)
  try {
    return normalizeAdConfig(JSON.parse(raw))
  } catch {
    return normalizeAdConfig(null)
  }
}

function repositoryFromEnvironment(env) {
  const value = String(env?.GITHUB_REPOSITORY || DEFAULT_GITHUB_REPOSITORY).trim()
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) ? value : DEFAULT_GITHUB_REPOSITORY
}

function manifestUrlFromEnvironment(env) {
  return normalizeHttpUrl(env?.APP_UPDATE_MANIFEST_URL) || DEFAULT_MANIFEST_URL
}

function normalizeManifest(value, requestUrl) {
  const input = value && typeof value === 'object' ? value : {}
  const version = String(input.version || '').trim()
  const sha256 = String(input.sha256 || '').trim().toLowerCase()
  if (!VERSION_PATTERN.test(version) || !/^[a-f0-9]{64}$/.test(sha256)) return null

  const origin = new URL(requestUrl).origin
  const fileName = `VocFlow-${version}-update.zip`
  const manifest = {
    ...input,
    version,
    sha256,
    payloadDir: String(input.payloadDir || 'payload').trim() || 'payload',
    downloadUrl: `${origin}/api/app-update/download/${encodeURIComponent(fileName)}`
  }
  if (!Array.isArray(manifest.releaseNotes)) manifest.releaseNotes = []
  return manifest
}

async function fetchManifest(request, env) {
  const response = await fetch(manifestUrlFromEnvironment(env), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'VocFlow-API/1.0 (+https://vocflow.cc.cd/)'
    },
    redirect: 'follow',
    cf: { cacheTtl: 60, cacheEverything: true }
  })
  if (!response.ok) {
    return jsonResponse(response.status === 404 ? 404 : 502, {
      success: false,
      message: response.status === 404 ? '尚未发布版本清单' : `GitHub 版本清单请求失败 (${response.status})`
    })
  }
  let payload
  try {
    payload = await response.json()
  } catch {
    return jsonResponse(502, { success: false, message: 'GitHub 版本清单格式无效' })
  }
  const manifest = normalizeManifest(payload, request.url)
  if (!manifest) return jsonResponse(502, { success: false, message: 'GitHub 版本清单缺少有效版本或 SHA256' })
  return jsonResponse(200, { success: true, manifest })
}

async function downloadUpdate(fileName, env) {
  const match = UPDATE_FILE_PATTERN.exec(fileName)
  if (!match) return jsonResponse(400, { success: false, message: '更新包文件名无效' })

  const version = match[1]
  const repository = repositoryFromEnvironment(env)
  const assetUrl = `https://github.com/${repository}/releases/download/v${encodeURIComponent(version)}/${encodeURIComponent(fileName)}`
  const response = await fetch(assetUrl, {
    headers: {
      Accept: 'application/octet-stream',
      'User-Agent': 'VocFlow-API/1.0 (+https://vocflow.cc.cd/)'
    },
    redirect: 'follow'
  })
  if (!response.ok) {
    return jsonResponse(response.status === 404 ? 404 : 502, {
      success: false,
      message: response.status === 404 ? '更新包不存在' : `GitHub 更新包请求失败 (${response.status})`
    })
  }

  const headers = corsHeaders({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Cache-Control': 'public, max-age=300',
    ...(response.headers.get('content-length') ? { 'Content-Length': response.headers.get('content-length') } : {})
  })
  return new Response(response.body, { status: 200, headers })
}

export default {
  async fetch(request, env) {
    const method = String(request.method || 'GET').toUpperCase()
    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() })
    if (!['GET', 'HEAD'].includes(method)) {
      return jsonResponse(405, { success: false, message: '仅支持 GET 和 HEAD' }, { Allow: 'GET, HEAD, OPTIONS' })
    }

    const url = new URL(request.url)
    const route = url.pathname

    if (route === '/health') {
      return jsonResponse(200, {
        ok: true,
        service: SERVICE_NAME,
        accountFeatures: false,
        adConfig: true,
        appUpdate: true,
        time: new Date().toISOString()
      })
    }

    if (route === '/api/ad-config') {
      return jsonResponse(200, { success: true, config: adConfigFromEnvironment(env) })
    }

    if (route === '/api/app-update/manifest') {
      return fetchManifest(request, env)
    }

    if (route.startsWith('/api/app-update/download/')) {
      let fileName
      try {
        fileName = decodeURIComponent(route.slice('/api/app-update/download/'.length))
      } catch {
        return jsonResponse(400, { success: false, message: '更新包文件名编码无效' })
      }
      return downloadUpdate(fileName, env)
    }

    return jsonResponse(404, { success: false, message: '接口不存在' })
  }
}
