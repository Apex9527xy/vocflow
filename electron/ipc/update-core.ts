import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export interface ReleaseEntry {
  version: string
  date?: string
  title?: string
  items?: string[]
}

export interface UpdateManifest {
  version: string
  publishedAt?: string
  downloadUrl?: string
  sha256?: string
  payloadDir?: string
  releaseNotes?: ReleaseEntry[]
}

export type UpdateSource = 'manifest' | 'github-release' | 'server' | 'local-feed' | 'local' | 'none'

export interface UpdateCandidate {
  manifest: UpdateManifest
  source: Exclude<UpdateSource, 'none'>
}

export const SHA256_PATTERN = /^[a-f0-9]{64}$/i
export const SOURCE_RANK: Record<Exclude<UpdateSource, 'none'>, number> = {
  manifest: 5,
  'github-release': 4,
  server: 3,
  'local-feed': 2,
  local: 1
}

export function normalizeVersion(value: string): string {
  const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9a-z.-]+)?$/i)
  if (!match) return ''
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`
}

export function compareVersions(left: string, right: string): number {
  const a = normalizeVersion(left).split('.').map(Number)
  const b = normalizeVersion(right).split('.').map(Number)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const av = Number.isFinite(a[index]) ? a[index] : 0
    const bv = Number.isFinite(b[index]) ? b[index] : 0
    if (av !== bv) return av > bv ? 1 : -1
  }
  return 0
}

export function isLoopbackHost(hostname: string): boolean {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  return host === 'localhost'
    || host.endsWith('.localhost')
    || host === '::1'
    || host === '::'
    || host === '0.0.0.0'
    || host.startsWith('127.')
    || host.startsWith('::ffff:127.')
}

export function normalizeSha256(value: unknown): string {
  const normalized = String(value || '').trim().replace(/^sha256:/i, '')
  return SHA256_PATTERN.test(normalized) ? normalized.toLowerCase() : ''
}

export function normalizePayloadDir(value: unknown): string | null {
  const raw = String(value || 'payload').trim().replace(/\\/g, '/')
  if (!raw || raw.startsWith('/') || /^[a-z]:/i.test(raw) || raw.includes('\0')) return null
  const parts = raw.split('/')
  if (parts.some(part => !part || part === '.' || part === '..')) return null
  return parts.join('/')
}

function isZipUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const pathname = url.protocol === 'file:' ? fileURLToPath(url) : decodeURIComponent(url.pathname)
    return /\.zip$/i.test(pathname)
  } catch {
    return false
  }
}

export function validateDownloadUrl(value: string, userBuild: boolean): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return ''
  }
  if (url.username || url.password) return ''
  if (userBuild) {
    if (url.protocol !== 'https:' || isLoopbackHost(url.hostname)) return ''
    return isZipUrl(url.href) ? url.href : ''
  }
  if (url.protocol === 'file:') {
    return url.hostname && url.hostname !== 'localhost' ? '' : (isZipUrl(url.href) ? url.href : '')
  }
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    return isZipUrl(url.href) ? url.href : ''
  }
  return ''
}

export function validateRedirectUrl(value: string, userBuild: boolean): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return ''
  }
  if (url.username || url.password) return ''
  if (userBuild) {
    return url.protocol === 'https:' && !isLoopbackHost(url.hostname) ? url.href : ''
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
}

function resolveDownloadUrl(value: string, baseUrl: string, userBuild: boolean): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return validateDownloadUrl(raw, userBuild)
  if (isAbsolute(raw)) return userBuild ? '' : validateDownloadUrl(pathToFileURL(raw).href, userBuild)
  try {
    return validateDownloadUrl(new URL(raw, baseUrl).href, userBuild)
  } catch {
    return ''
  }
}

export function normalizeManifest(value: unknown, baseUrl: string, userBuild: boolean): UpdateManifest | null {
  if (!value || typeof value !== 'object') return null
  const input = value as UpdateManifest
  const version = normalizeVersion(input.version)
  const payloadDir = normalizePayloadDir(input.payloadDir)
  if (!version || !payloadDir) return null
  return {
    version,
    publishedAt: typeof input.publishedAt === 'string' ? input.publishedAt : '',
    downloadUrl: resolveDownloadUrl(String(input.downloadUrl || ''), baseUrl, userBuild),
    sha256: normalizeSha256(input.sha256),
    payloadDir,
    releaseNotes: Array.isArray(input.releaseNotes) ? input.releaseNotes : undefined
  }
}

export function isInstallable(manifest: UpdateManifest | null, userBuild: boolean): manifest is UpdateManifest {
  return Boolean(
    manifest
    && normalizeVersion(manifest.version)
    && validateDownloadUrl(manifest.downloadUrl || '', userBuild)
    && normalizeSha256(manifest.sha256)
    && normalizePayloadDir(manifest.payloadDir)
  )
}

export function candidateFromManifest(
  value: unknown,
  source: Exclude<UpdateSource, 'none'>,
  baseUrl: string,
  userBuild: boolean
): UpdateCandidate | null {
  const manifest = normalizeManifest(value, baseUrl, userBuild)
  if (!isInstallable(manifest, userBuild)) return null
  const downloadUrl = validateDownloadUrl(manifest.downloadUrl || '', userBuild)
  if (!downloadUrl) return null
  if (downloadUrl.startsWith('file:')) {
    try {
      const file = fileURLToPath(downloadUrl)
      if (!existsSync(file) || !statSync(file).isFile()) return null
    } catch {
      return null
    }
  }
  return {
    manifest: {
      ...manifest,
      downloadUrl,
      sha256: normalizeSha256(manifest.sha256),
      payloadDir: normalizePayloadDir(manifest.payloadDir) || 'payload'
    },
    source
  }
}

export function manifestFromUpdateState(state: {
  latestVersion: string
  publishedAt?: string
  downloadUrl?: string
  sha256?: string
  payloadDir?: string
  releaseNotes?: ReleaseEntry[]
}): UpdateManifest {
  return {
    version: state.latestVersion,
    publishedAt: state.publishedAt || '',
    downloadUrl: state.downloadUrl || '',
    sha256: state.sha256 || '',
    payloadDir: state.payloadDir || 'payload',
    releaseNotes: state.releaseNotes
  }
}

export function localUpdateSourcesEnabled(userBuild: boolean): boolean {
  return !userBuild
}

export function selectCandidate(candidates: UpdateCandidate[]): UpdateCandidate | null {
  return [...candidates].sort((left, right) => {
    const versionOrder = compareVersions(right.manifest.version, left.manifest.version)
    if (versionOrder) return versionOrder
    return SOURCE_RANK[right.source] - SOURCE_RANK[left.source]
  })[0] || null
}

export function selectUpdateCandidate(candidates: UpdateCandidate[], userBuild: boolean): UpdateCandidate | null {
  const allowed = userBuild
    ? candidates.filter(candidate => candidate.source !== 'local' && candidate.source !== 'local-feed')
    : candidates
  const installable = allowed.filter(candidate => isInstallable(candidate.manifest, userBuild))
  return selectCandidate(installable)
}

export function isPathInside(root: string, child: string): boolean {
  const normalizedRoot = resolve(root)
  const normalizedChild = resolve(child)
  return normalizedChild.startsWith(`${normalizedRoot}${sep}`)
}

export function isProtectedAppPath(appRoot: string, windowsStore = false): boolean {
  const normalized = resolve(appRoot).replace(/\//g, '\\').toLowerCase()
  return windowsStore || normalized.includes('\\windowsapps\\') || normalized.endsWith('\\windowsapps')
}

export function packageVersionFromPayload(payload: string): string {
  const packageJson = join(payload, 'resources', 'app', 'package.json')
  if (!existsSync(packageJson)) throw new Error('更新包结构不完整：缺少应用 package.json。')
  let parsed: { version?: string }
  try {
    parsed = JSON.parse(readFileSync(packageJson, 'utf8'))
  } catch {
    throw new Error('更新包内的 package.json 无法解析。')
  }
  return normalizeVersion(String(parsed.version || ''))
}