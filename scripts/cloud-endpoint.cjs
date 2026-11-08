const net = require('node:net')

const LOCAL_ENDPOINT = 'http://127.0.0.1:8787'
const RESERVED_EXAMPLE_DOMAINS = new Set(['example.com', 'example.net', 'example.org'])
const RESERVED_TLDS = new Set(['example', 'test', 'invalid', 'localhost'])
const PLACEHOLDER_MARKERS = ['your-domain', 'yourdomain', 'replace-me', 'replace_me', 'changeme']

function isLoopbackHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
    || host === '::' || host === '0.0.0.0' || host.startsWith('127.')
    || host.startsWith('::ffff:127.')
}

function isPlaceholderHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '')
  if (!host) return true
  if (RESERVED_EXAMPLE_DOMAINS.has(host) || host.endsWith('.example.com')) return true
  const labels = host.split('.')
  if (labels.length < 2 || RESERVED_TLDS.has(labels[labels.length - 1])) return true
  return PLACEHOLDER_MARKERS.some(marker => host.includes(marker))
}

function normalizeCloudEndpoint(value, userBuild = false) {
  const raw = String(value || '').trim().replace(/\/+$/, '')
  if (!raw) {
    throw new Error(
      userBuild
        ? '正式用户构建缺少 VOCFLOW_CLOUD_URL。请先配置固定的 HTTPS 云服务地址。'
        : '云端服务地址不能为空'
    )
  }

  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`云端服务地址格式无效: ${raw}`)
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('云端服务地址必须使用 http 或 https')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('云端服务地址不能包含账号密码、查询参数或锚点')
  }
  if (userBuild && url.protocol !== 'https:') {
    throw new Error('正式用户构建的云端服务地址必须使用 HTTPS')
  }
  if (userBuild && isLoopbackHost(url.hostname)) {
    throw new Error('正式用户构建不能使用本机或回环云端地址')
  }
  if (userBuild && net.isIP(url.hostname)) {
    throw new Error('正式用户构建必须使用可签发证书的域名，不能直接使用 IP 地址')
  }
  if (userBuild && isPlaceholderHost(url.hostname)) {
    throw new Error('正式用户构建不能使用示例、保留或占位域名')
  }

  return raw
}

function resolveCloudEndpoint(userBuild = false) {
  const configured = String(process.env.VOCFLOW_CLOUD_URL || '').trim()
  if (userBuild && !configured) return normalizeCloudEndpoint('', true)
  return normalizeCloudEndpoint(configured || LOCAL_ENDPOINT, userBuild)
}

module.exports = {
  LOCAL_ENDPOINT,
  isLoopbackHost,
  isPlaceholderHost,
  normalizeCloudEndpoint,
  resolveCloudEndpoint
}