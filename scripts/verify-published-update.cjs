const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_FEED_URL = 'https://github.com/Apex9527xy/vocflow/releases/latest/download/update.json'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function expectedDownloadUrl(tag, version) {
  return `https://github.com/Apex9527xy/vocflow/releases/download/${tag}/VocFlow-${version}-update.zip`
}

function validatePublishedManifest(manifest, expected) {
  assert(manifest && typeof manifest === 'object', '公开更新清单不是有效 JSON 对象')
  assert(String(manifest.version || '') === expected.version, `公开更新清单版本 ${manifest.version || '(空)'} 与预期 ${expected.version} 不一致`)
  const expectedUrl = expected.downloadUrl || expectedDownloadUrl(expected.tag, expected.version)
  assert(manifest.downloadUrl === expectedUrl, `公开更新清单 downloadUrl 与预期不一致：${manifest.downloadUrl || '(空)'}`)
  const sha256 = String(manifest.sha256 || '').trim().toLowerCase()
  assert(/^[a-f0-9]{64}$/.test(sha256), '公开更新清单缺少有效 SHA256')
  assert(sha256 === expected.sha256.toLowerCase(), '公开更新清单 SHA256 与本地发布资产不一致')
  assert(Array.isArray(manifest.releaseNotes) && manifest.releaseNotes.length > 0, '公开更新清单缺少发布说明')
  return manifest
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function verifyPublishedUpdate(options) {
  const tag = String(options.tag || '').trim()
  const version = String(options.version || '').trim()
  const feedUrl = String(options.feedUrl || DEFAULT_FEED_URL).trim()
  const sha256 = String(options.sha256 || '').trim().toLowerCase()
  const attempts = Math.max(1, Number(options.attempts || 12))
  const delayMs = Math.max(0, Number(options.delayMs ?? 5000))
  const fetchImpl = options.fetchImpl || fetch
  const downloadUrl = expectedDownloadUrl(tag, version)

  assert(tag === `v${version}`, `发布标签 ${tag || '(空)'} 与版本 ${version} 不一致`)
  assert(/^https:\/\//i.test(feedUrl), '公开更新清单地址必须使用 HTTPS')
  assert(/^[a-f0-9]{64}$/.test(sha256), '本地发布清单缺少有效 SHA256')

  let lastMessage = ''
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(feedUrl, {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
          'User-Agent': 'VocFlow-release-verifier/1.0'
        }
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const manifest = await response.json()
      validatePublishedManifest(manifest, { tag, version, sha256, downloadUrl })
      return manifest
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : String(error)
      if (attempt < attempts) await sleep(delayMs)
    }
  }
  throw new Error(`公开更新清单在 ${attempts} 次检查后仍不可用或内容不正确：${lastMessage}`)
}

async function main() {
  const root = process.cwd()
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8').replace(/^\uFEFF/, ''))
  const tag = String(process.argv[2] || `v${pkg.version}`).trim()
  const localManifestPath = path.join(root, 'release', 'update.json')
  assert(fs.existsSync(localManifestPath), '缺少 release/update.json，不能验证已发布更新清单')
  const localManifest = JSON.parse(fs.readFileSync(localManifestPath, 'utf8').replace(/^\uFEFF/, ''))
  const manifest = await verifyPublishedUpdate({
    tag,
    version: pkg.version,
    sha256: localManifest.sha256,
    feedUrl: DEFAULT_FEED_URL
  })
  console.log(`Published update feed verified: v${manifest.version}`)
  console.log(`Download URL: ${manifest.downloadUrl}`)
  console.log(`SHA256: ${manifest.sha256}`)
}

module.exports = {
  DEFAULT_FEED_URL,
  expectedDownloadUrl,
  validatePublishedManifest,
  verifyPublishedUpdate
}

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
