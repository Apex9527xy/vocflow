import { app } from 'electron'
import type { IpcMain } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { prepareCloudUpdateEndpoint } from '../cloud/cloud-sync'
import {
  candidateFromManifest as candidateFromManifestCore,
  compareVersions,
  isInstallable as isInstallableCore,
  isPathInside,
  localUpdateSourcesEnabled,
  manifestFromUpdateState,
  isProtectedAppPath as isProtectedAppPathCore,
  normalizeManifest as normalizeManifestCore,
  normalizePayloadDir,
  normalizeSha256,
  normalizeVersion,
  packageVersionFromPayload,
  selectCandidate,
  selectUpdateCandidate,
  validateDownloadUrl as validateDownloadUrlCore,
  validateRedirectUrl as validateRedirectUrlCore,
  type ReleaseEntry,
  type UpdateCandidate,
  type UpdateManifest,
  type UpdateSource
} from './update-core'

interface GitHubReleaseAsset {
  name?: string
  browser_download_url?: string
  digest?: string
}

interface GitHubRelease {
  tag_name?: string
  name?: string
  body?: string
  published_at?: string
  assets?: GitHubReleaseAsset[]
}

interface LocalFeedManifest {
  manifest: UpdateManifest
  baseUrl: string
}

interface UpdateState {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  remoteAvailable: boolean
  publishedAt: string
  downloadUrl: string
  sha256: string
  payloadDir: string
  releaseNotes: ReleaseEntry[]
  source: UpdateSource
}

const USER_BUILD = __VOCFLOW_USER_BUILD__
const DEFAULT_REMOTE_UPDATE_URL = 'https://github.com/Apex9527xy/vocflow/releases/latest/download/update.json'
const REMOTE_UPDATE_URL = USER_BUILD
  ? DEFAULT_REMOTE_UPDATE_URL
  : (process.env.VOCFLOW_UPDATE_URL || DEFAULT_REMOTE_UPDATE_URL)
const GITHUB_REPOSITORY = USER_BUILD
  ? 'Apex9527xy/vocflow'
  : (process.env.VOCFLOW_REPOSITORY || 'Apex9527xy/vocflow')
const GITHUB_LATEST_RELEASE_URL = `https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/latest`
const MAX_UPDATE_BYTES = 1024 * 1024 * 1024

let cachedRemote: { manifest: UpdateManifest; source: Exclude<UpdateSource, 'none'> } | null = null
let cachedAt = 0

function normalizeManifest(value: unknown, baseUrl: string): UpdateManifest | null {
  return normalizeManifestCore(value, baseUrl, USER_BUILD)
}

function isInstallable(manifest: UpdateManifest | null): manifest is UpdateManifest {
  return isInstallableCore(manifest, USER_BUILD)
}

function validateDownloadUrl(value: string): string {
  return validateDownloadUrlCore(value, USER_BUILD)
}

function validateRedirectUrl(value: string): string {
  return validateRedirectUrlCore(value, USER_BUILD)
}

function candidateFromManifest(
  value: unknown,
  source: Exclude<UpdateSource, 'none'>,
  baseUrl: string
): UpdateCandidate | null {
  return candidateFromManifestCore(value, source, baseUrl, USER_BUILD)
}

function isProtectedAppPath(appRoot: string): boolean {
  const windowsStore = Boolean((process as NodeJS.Process & { windowsStore?: boolean }).windowsStore)
  return isProtectedAppPathCore(appRoot, windowsStore)
}

function localManifest(): LocalFeedManifest | null {
  if (!localUpdateSourcesEnabled(USER_BUILD)) return null
  const paths = [
    join(app.getAppPath(), 'update.json'),
    join(app.getAppPath(), 'resources', 'update.json'),
    join(process.resourcesPath, 'update.json')
  ]
  for (const file of paths) {
    if (!existsSync(file)) continue
    try {
      const baseUrl = pathToFileURL(file).href
      const candidate = candidateFromManifest(JSON.parse(readFileSync(file, 'utf8')), 'local', baseUrl)
      if (candidate) return { manifest: candidate.manifest, baseUrl }
    } catch {}
  }
  return null
}

function localFeedManifest(): LocalFeedManifest | null {
  if (!localUpdateSourcesEnabled(USER_BUILD)) return null
  const programData = process.env.PROGRAMDATA || 'C:\\ProgramData'
  const paths = [
    join(dirname(process.execPath), 'updates', 'update.json'),
    join(process.resourcesPath, 'updates', 'update.json'),
    join(process.resourcesPath, 'app', 'updates', 'update.json'),
    join(app.getPath('userData'), 'updates', 'update.json'),
    join(programData, 'VocFlow', 'Updates', 'update.json')
  ]
  const visited = new Set<string>()
  for (const file of paths) {
    const key = resolve(file).toLowerCase()
    if (visited.has(key) || !existsSync(file)) continue
    visited.add(key)
    try {
      const baseUrl = pathToFileURL(file).href
      const candidate = candidateFromManifest(JSON.parse(readFileSync(file, 'utf8')), 'local-feed', baseUrl)
      if (candidate) return { manifest: candidate.manifest, baseUrl }
    } catch {}
  }
  return null
}

async function fetchJson(url: string, timeoutMs = 5000): Promise<unknown | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const separator = url.includes('?') ? '&' : '?'
    const response = await fetch(`${url}${separator}t=${Date.now()}`, {
      headers: {
        Accept: 'application/vnd.github+json, application/json',
        'User-Agent': `VocFlow/${app.getVersion()}`,
        'X-GitHub-Api-Version': '2022-11-28'
      },
      signal: controller.signal,
      cache: 'no-store'
    })
    if (!response.ok) return null
    if (!validateRedirectUrl(response.url || url)) return null
    return JSON.parse(await response.text())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function fetchText(url: string, timeoutMs = 5000): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/plain',
        'User-Agent': `VocFlow/${app.getVersion()}`
      },
      signal: controller.signal,
      cache: 'no-store'
    })
    if (!response.ok) return null
    if (!validateRedirectUrl(response.url || url)) return null
    return await response.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function instructionsToNotes(release: GitHubRelease, version: string): ReleaseEntry[] {
  const items = String(release.body || '')
    .split(/\r?\n/)
    .map(line => line.replace(/^[-*+]\s+/, '').replace(/^#{1,6}\s+/, '').trim())
    .filter(line => line && !line.startsWith('```'))
  if (!items.length) items.push(`鍙戝竷 VocFlow ${version}`)
  return [{
    version,
    date: release.published_at?.slice(0, 10) || '',
    title: release.name || `VocFlow ${version}`,
    items
  }]
}

async function fetchManifest(): Promise<UpdateCandidate | null> {
  const payload = await fetchJson(REMOTE_UPDATE_URL)
  return candidateFromManifest(payload, 'manifest', REMOTE_UPDATE_URL)
}

async function fetchLatestGitHubRelease(): Promise<UpdateCandidate | null> {
  const release = await fetchJson(GITHUB_LATEST_RELEASE_URL) as GitHubRelease | null
  const version = normalizeVersion(release?.tag_name || '')
  if (!release || !version) return null

  const assets = Array.isArray(release.assets) ? release.assets : []
  const expectedName = `VocFlow-${version}-update.zip`
  const zipAsset = assets.find(asset => String(asset.name || '').toLowerCase() === expectedName.toLowerCase())
  if (!zipAsset?.browser_download_url) return null

  let sha256 = normalizeSha256(zipAsset.digest)
  if (!sha256) {
    const expectedChecksumName = `${expectedName}.sha256`
    const checksumAsset = assets.find(asset => String(asset.name || '').toLowerCase() === expectedChecksumName.toLowerCase())
    if (checksumAsset?.browser_download_url) {
      const checksum = await fetchText(checksumAsset.browser_download_url)
      sha256 = normalizeSha256(checksum?.match(/\b[a-f0-9]{64}\b/i)?.[0] || '')
    }
  }

  return candidateFromManifest({
    version,
    publishedAt: release.published_at?.slice(0, 10) || '',
    downloadUrl: zipAsset.browser_download_url,
    sha256,
    payloadDir: 'payload',
    releaseNotes: instructionsToNotes(release, version)
  }, 'github-release', GITHUB_LATEST_RELEASE_URL)
}

async function fetchServerManifest(): Promise<UpdateCandidate | null> {
  try {
    const endpoint = (await prepareCloudUpdateEndpoint()).replace(/\/+$/, '')
    if (!endpoint) return null
    const payload = await fetchJson(`${endpoint}/api/app-update/manifest`, 4000) as { manifest?: unknown } | null
    if (!payload) return null
    return candidateFromManifest(payload.manifest || payload, 'server', `${endpoint}/`)
  } catch {
    return null
  }
}

async function fetchRemoteManifest(force = false): Promise<{
  manifest: UpdateManifest | null
  source: UpdateSource
  available: boolean
}> {
  if (!force && cachedRemote && Date.now() - cachedAt < 60_000) {
    return { manifest: cachedRemote.manifest, source: cachedRemote.source, available: true }
  }

  const [manifest, githubRelease, serverManifest] = await Promise.all([
    fetchManifest(),
    fetchLatestGitHubRelease(),
    fetchServerManifest()
  ])
  const candidates = [manifest, githubRelease, serverManifest].filter((item): item is UpdateCandidate => Boolean(item))
  const selected = selectCandidate(candidates)
  cachedRemote = selected ? { manifest: selected.manifest, source: selected.source } : null
  cachedAt = Date.now()
  return {
    manifest: selected?.manifest || null,
    source: selected?.source || 'none',
    available: candidates.length > 0
  }
}

function mergeReleaseNotes(...groups: Array<ReleaseEntry[] | undefined>): ReleaseEntry[] {
  const merged = new Map<string, ReleaseEntry>()
  for (const note of groups.flatMap(group => group || [])) {
    if (!note?.version) continue
    const version = normalizeVersion(note.version)
    if (!version || merged.has(version)) continue
    merged.set(version, { ...note, version })
  }
  return [...merged.values()].sort((a, b) => compareVersions(b.version, a.version))
}

async function updateState(force = false): Promise<UpdateState> {
  const currentVersion = normalizeVersion(app.getVersion()) || app.getVersion()
  const local = localUpdateSourcesEnabled(USER_BUILD) ? localManifest() : null
  const feed = localUpdateSourcesEnabled(USER_BUILD) ? localFeedManifest() : null
  const remote = await fetchRemoteManifest(force)

  const candidates: UpdateCandidate[] = []
  if (remote.manifest && remote.source !== 'none') {
    candidates.push({ manifest: remote.manifest, source: remote.source })
  }
  if (feed) candidates.push({ manifest: feed.manifest, source: 'local-feed' })
  if (local) candidates.push({ manifest: local.manifest, source: 'local' })

  const viable = candidates.filter(candidate => compareVersions(candidate.manifest.version, currentVersion) >= 0)
  const selected = selectUpdateCandidate(viable, USER_BUILD)
  const latestVersion = selected && compareVersions(selected.manifest.version, currentVersion) > 0
    ? selected.manifest.version
    : currentVersion

  return {
    currentVersion,
    latestVersion,
    hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
    remoteAvailable: remote.available,
    publishedAt: selected?.manifest.publishedAt || '',
    downloadUrl: selected?.manifest.downloadUrl || '',
    sha256: selected?.manifest.sha256 || '',
    payloadDir: selected?.manifest.payloadDir || 'payload',
    releaseNotes: mergeReleaseNotes(
      selected?.manifest.releaseNotes,
      remote.manifest?.releaseNotes,
      feed?.manifest.releaseNotes,
      local?.manifest.releaseNotes
    ),
    source: selected?.source || 'none'
  }
}

function writeUpdaterScript(): string {
  const directory = mkdtempSync(join(tmpdir(), 'vocflow-update-'))
  const scriptPath = join(directory, 'apply-update.ps1')
  const script = `param([int]$TargetPid,[string]$Source,[string]$Destination,[string]$Executable)
$ErrorActionPreference = 'Stop'
$log = Join-Path $env:TEMP 'vocflow-update.log'
function Log-Update([string]$Message) {
  Add-Content -LiteralPath $log -Value ((Get-Date).ToString('s') + ' ' + $Message) -Encoding UTF8
}
Log-Update ("updater started; target pid=" + $TargetPid)
for ($i = 0; $i -lt 180; $i++) {
  if (-not (Get-Process -Id $TargetPid -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 500
}
if (Get-Process -Id $TargetPid -ErrorAction SilentlyContinue) {
  Log-Update 'target process did not exit'
  exit 3
}
Start-Sleep -Milliseconds 800
$sourceApp = Join-Path $Source 'resources\\app'
$destinationApp = Join-Path $Destination 'resources\\app'
$resourcesDir = Split-Path -Parent $destinationApp
$staging = Join-Path $resourcesDir ('.app-update-' + [guid]::NewGuid().ToString('N'))
$backup = Join-Path $resourcesDir ('.app-backup-' + [guid]::NewGuid().ToString('N'))
$originalMoved = $false
$newInstalled = $false
try {
  if (-not (Test-Path -LiteralPath (Join-Path $sourceApp 'package.json'))) { throw 'source package.json missing' }
  if (-not (Test-Path -LiteralPath $resourcesDir)) { throw 'destination resources directory missing' }
  Get-ChildItem -LiteralPath $resourcesDir -Directory -Filter '.app-backup-*' -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -ne $backup } |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  Copy-Item -LiteralPath $sourceApp -Destination $staging -Recurse -Force
  if (Test-Path -LiteralPath $destinationApp) {
    Move-Item -LiteralPath $destinationApp -Destination $backup
    $originalMoved = $true
  }
  Move-Item -LiteralPath $staging -Destination $destinationApp
  $newInstalled = $true
  $exe = Join-Path $Destination $Executable
  if (-not (Test-Path -LiteralPath $exe)) { throw 'application executable missing' }
  Start-Process -FilePath $exe -WorkingDirectory $Destination
  Log-Update 'update installed and application restarted'
  if ($originalMoved) { Remove-Item -LiteralPath $backup -Recurse -Force -ErrorAction SilentlyContinue }
} catch {
  Log-Update ('update failed: ' + $_.Exception.ToString())
  if ($originalMoved) {
    if ($newInstalled -and (Test-Path -LiteralPath $destinationApp)) {
      Remove-Item -LiteralPath $destinationApp -Recurse -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $backup) {
      Move-Item -LiteralPath $backup -Destination $destinationApp -Force
    }
  }
  $exe = Join-Path $Destination $Executable
  if (Test-Path -LiteralPath $exe) {
    Start-Process -FilePath $exe -WorkingDirectory $Destination
  }
  exit 1
}
`
  writeFileSync(scriptPath, `\uFEFF${script}`, 'utf8')
  return scriptPath
}

async function launchUpdater(source: string, destination: string, executable: string): Promise<void> {
  const scriptPath = writeUpdaterScript()
  await new Promise<void>((resolveLaunch, rejectLaunch) => {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-TargetPid', String(process.pid),
      '-Source', source,
      '-Destination', destination,
      '-Executable', executable
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })
    child.once('spawn', () => {
      child.unref()
      resolveLaunch()
    })
    child.once('error', rejectLaunch)
  })
}

export function registerUpdateHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('update:getVersion', () => app.getVersion())

  ipcMain.handle('update:check', async (_event, force?: boolean) => {
    try {
      return await updateState(Boolean(force))
    } catch (error) {
      return {
        currentVersion: app.getVersion(),
        latestVersion: app.getVersion(),
        hasUpdate: false,
        remoteAvailable: false,
        error: (error as Error).message
      }
    }
  })

  ipcMain.handle('update:install', async () => {
    const state = await updateState(true)
    const manifest = normalizeManifest(manifestFromUpdateState(state), REMOTE_UPDATE_URL)
    if (!state.hasUpdate || !isInstallable(manifest)) {
      return { success: false, message: '当前没有通过完整性校验的可用更新。' }
    }
    if (compareVersions(manifest.version, state.currentVersion) <= 0) {
      return { success: false, message: '更新版本无效，已取消安装。' }
    }

    const appRoot = dirname(process.execPath)
    if (isProtectedAppPath(appRoot)) {
      return {
        success: false,
        message: '当前为 Microsoft Store/MSIX 安装，应用目录受系统保护，不能覆盖更新。请通过 Microsoft Store 更新，或安装最新完整安装包。'
      }
    }

    const downloadUrl = validateDownloadUrl(manifest.downloadUrl || '')
    const sha256 = normalizeSha256(manifest.sha256)
    const payloadDir = normalizePayloadDir(manifest.payloadDir)
    if (!downloadUrl || !sha256 || !payloadDir) {
      return { success: false, message: '更新清单缺少必要校验信息，已取消安装。' }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 300_000)
    try {
      let buffer: Buffer
      if (downloadUrl.startsWith('file:')) {
        const file = fileURLToPath(downloadUrl)
        if (!existsSync(file) || !statSync(file).isFile()) throw new Error('本地更新包不存在。')
        if (statSync(file).size > MAX_UPDATE_BYTES) throw new Error('更新包超过允许大小。')
        buffer = readFileSync(file)
      } else {
        const response = await fetch(downloadUrl, {
          headers: {
            Accept: 'application/octet-stream',
            'User-Agent': `VocFlow/${state.currentVersion}`
          },
          signal: controller.signal,
          redirect: 'follow'
        })
        if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`)
        if (!validateRedirectUrl(response.url)) throw new Error('更新下载发生不安全跳转。')
        const contentLength = Number(response.headers.get('content-length') || 0)
        if (contentLength > MAX_UPDATE_BYTES) throw new Error('更新包超过允许大小。')
        buffer = Buffer.from(await response.arrayBuffer())
      }
      if (buffer.length > MAX_UPDATE_BYTES) throw new Error('更新包超过允许大小。')

      const actual = createHash('sha256').update(buffer).digest('hex')
      if (actual !== sha256) throw new Error('更新包 SHA256 校验失败。')

      const directory = mkdtempSync(join(tmpdir(), 'vocflow-download-'))
      const zipPath = join(directory, 'VocFlow-update.zip')
      writeFileSync(zipPath, buffer)
      const extractDir = join(directory, 'extracted')
      const extract = spawnSync('powershell.exe', [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`
      ], { windowsHide: true })
      if (extract.status !== 0) throw new Error('更新包解压失败。')

      const payload = resolve(extractDir, payloadDir)
      if (!isPathInside(extractDir, payload)) throw new Error('更新包目录无效。')
      if (packageVersionFromPayload(payload) !== manifest.version) {
        throw new Error('更新包内应用版本与清单不一致。')
      }
      if (!existsSync(join(payload, 'resources', 'app', 'dist-electron', 'main.js'))) {
        throw new Error('更新包缺少应用主进程文件。')
      }

      await launchUpdater(payload, appRoot, basename(process.execPath))
      setTimeout(() => app.quit(), 900)
      return { success: true, message: '更新已下载并校验，应用即将重启完成安装。' }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    } finally {
      clearTimeout(timer)
    }
  })
}

