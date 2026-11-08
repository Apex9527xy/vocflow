const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { resolveCloudEndpoint } = require('./cloud-endpoint.cjs')
const { verifyPackagedUserBuild } = require('./verify-packaged-user-build.cjs')

const root = process.cwd()
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = pkg.version
const cloudEndpoint = resolveCloudEndpoint(true)
const tag = String(process.argv[2] || `v${version}`).trim()
const expectedTag = `v${version}`

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function requireAsset(relativePath) {
  const file = path.join(root, relativePath)
  assert(fs.existsSync(file), `Missing release asset: ${relativePath}`)
  const stat = fs.statSync(file)
  assert(stat.isFile(), `Release asset is not a file: ${relativePath}`)
  assert(stat.size > 0, `Release asset is empty: ${relativePath}`)
  return file
}

function verifyChecksum(assetPath) {
  const checksumPath = requireAsset(`${assetPath}.sha256`)
  const expected = fs.readFileSync(checksumPath, 'utf8').match(/\b[a-f0-9]{64}\b/i)?.[0]?.toLowerCase() || ''
  assert(expected, `Invalid checksum file: ${assetPath}.sha256`)
  const actual = sha256(requireAsset(assetPath))
  assert(actual === expected, `Checksum mismatch: ${assetPath}`)
  return actual
}

function expandArchive(archive, destination) {
  fs.mkdirSync(destination, { recursive: true })
  const script = `$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath '${archive.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true
  })
  if (result.error) throw result.error
  assert(result.status === 0, `Failed to extract ${archive}`)
}

assert(tag === expectedTag, `Release tag ${tag} does not match package version ${version}`)

const setup = `release/user-nsis/VocFlow-${version}-Setup.exe`
const updateZip = `release/VocFlow-${version}-update.zip`
const portableZip = `release/VocFlow-${version}-win-x64.zip`
verifyChecksum(setup)
const updateHash = verifyChecksum(updateZip)
verifyChecksum(portableZip)
requireAsset('release/RELEASE_NOTES.md')

const manifestPath = requireAsset('release/update.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const expectedUrl = `https://github.com/Apex9527xy/vocflow/releases/download/${expectedTag}/VocFlow-${version}-update.zip`
assert(manifest.version === version, `Manifest version ${manifest.version} does not match ${version}`)
assert(manifest.downloadUrl === expectedUrl, `Manifest downloadUrl must be ${expectedUrl}`)
assert(manifest.sha256 === updateHash, 'Manifest SHA256 does not match the update ZIP')
assert(manifest.payloadDir === 'payload', 'Manifest payloadDir must be payload')
assert(Array.isArray(manifest.releaseNotes) && manifest.releaseNotes.length > 0, 'Manifest releaseNotes are missing')

const resourceManifest = JSON.parse(fs.readFileSync(path.join(root, 'resources', 'update.json'), 'utf8'))
assert(JSON.stringify(resourceManifest) === JSON.stringify(manifest), 'resources/update.json is out of sync with release/update.json')

const tempRoot = path.join(root, `.tmp-release-assets-${process.pid}`)
const rootPrefix = path.resolve(root) + path.sep
const resolvedTempRoot = path.resolve(tempRoot)
assert(resolvedTempRoot.startsWith(rootPrefix), 'Refusing to use a release-verification directory outside the workspace')
assert(path.basename(resolvedTempRoot).startsWith('.tmp-release-assets-'), 'Unexpected release-verification directory name')
try {
  if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true })
  expandArchive(path.join(root, updateZip), path.join(tempRoot, 'update'))
  verifyPackagedUserBuild(path.join(tempRoot, 'update', 'payload', 'resources', 'app'), {
    expectedVersion: version,
    expectedEndpoint: cloudEndpoint
  })
  expandArchive(path.join(root, portableZip), path.join(tempRoot, 'portable'))
  verifyPackagedUserBuild(path.join(tempRoot, 'portable', 'resources', 'app'), {
    expectedVersion: version,
    expectedEndpoint: cloudEndpoint
  })
} finally {
  if (fs.existsSync(tempRoot)) {
    assert(path.resolve(tempRoot).startsWith(rootPrefix), 'Refusing to clean a directory outside the workspace')
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

console.log(`Release assets verified for ${expectedTag}`)
console.log(`Fixed cloud endpoint: ${cloudEndpoint}`)
console.log(`Setup: ${setup}`)
console.log(`Update SHA256: ${updateHash}`)
