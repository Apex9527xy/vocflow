const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { zipDirectory, unzipToDir, listZipEntries } = require('./zip-utils.cjs')
const { resolveCloudEndpoint } = require('./cloud-endpoint.cjs')
const { verifyPackagedUserBuild } = require('./verify-packaged-user-build.cjs')

const root = process.cwd()
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const cloudEndpoint = resolveCloudEndpoint(true)
const source = path.join(root, 'release', 'user-nsis', 'win-unpacked', 'resources', 'app')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertSafeWorkspaceTemp(target, expectedName) {
  const rootPrefix = path.resolve(root) + path.sep
  const resolved = path.resolve(target)
  assert(resolved.startsWith(rootPrefix), `Refusing to modify a path outside the workspace: ${resolved}`)
  assert(path.basename(resolved).startsWith(expectedName), `Unexpected temporary path: ${resolved}`)
}

function removeWorkspaceTemp(target, expectedName) {
  if (!fs.existsSync(target)) return
  assertSafeWorkspaceTemp(target, expectedName)
  fs.rmSync(target, { recursive: true, force: true })
}

assert(fs.existsSync(source), `Packaged user app not found: ${source}. Run node scripts/build-user.cjs nsis first.`)
const verified = verifyPackagedUserBuild(source, {
  expectedVersion: pkg.version,
  expectedEndpoint: cloudEndpoint
})

const releaseDir = path.join(root, 'release')
const stagingRoot = path.join(root, '.update-package')
const payloadRoot = path.join(stagingRoot, 'payload')
const staging = path.join(payloadRoot, 'resources', 'app')
const zipPath = path.join(releaseDir, `VocFlow-${pkg.version}-update.zip`)
const checksumPath = `${zipPath}.sha256`
const verifyRoot = path.join(root, '.update-package-verify')

fs.mkdirSync(releaseDir, { recursive: true })
removeWorkspaceTemp(stagingRoot, '.update-package')
removeWorkspaceTemp(verifyRoot, '.update-package')
if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true })
if (fs.existsSync(checksumPath)) fs.rmSync(checksumPath, { force: true })

try {
  fs.mkdirSync(path.dirname(staging), { recursive: true })
  fs.cpSync(source, staging, { recursive: true })

  const entryCount = zipDirectory(payloadRoot, zipPath)
  assert(entryCount > 0, 'Update ZIP has no files')
  assert(fs.existsSync(zipPath) && fs.statSync(zipPath).size > 0, 'Update ZIP was not generated or is empty')

  const entries = listZipEntries(zipPath)
  console.log(`Update ZIP entries: ${entries.length}; first: ${entries[0]?.name || '(none)'}`)
  const extracted = unzipToDir(zipPath, verifyRoot)
  console.log(`Extracted files: ${extracted}; verifyRoot exists: ${fs.existsSync(verifyRoot)}`)
  if (fs.existsSync(verifyRoot)) {
    const probe = []
    const walk = (d, depth) => {
      if (depth > 2) return
      for (const n of fs.readdirSync(d)) {
        probe.push(path.relative(verifyRoot, path.join(d, n)))
        if (fs.statSync(path.join(d, n)).isDirectory()) walk(path.join(d, n), depth + 1)
      }
    }
    walk(verifyRoot, 0)
    console.log(`Verify tree (depth<=2): ${probe.slice(0, 30).join(' | ')}`)
  }
  verifyPackagedUserBuild(path.join(verifyRoot, 'payload', 'resources', 'app'), {
    expectedVersion: pkg.version,
    expectedEndpoint: cloudEndpoint
  })
} finally {
  removeWorkspaceTemp(stagingRoot, '.update-package')
  removeWorkspaceTemp(verifyRoot, '.update-package')
}

const hash = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex')
assert(/^[a-f0-9]{64}$/.test(hash), 'Generated update package has an invalid SHA256')
fs.writeFileSync(checksumPath, `${hash}  ${path.basename(zipPath)}\n`, 'utf8')

const notesPath = path.join(root, 'src', 'data', 'release-notes.json')
const notes = JSON.parse(fs.readFileSync(notesPath, 'utf8'))
assert(Array.isArray(notes) && notes.length > 0, 'Release notes are missing')
assert(String(notes[0].version || '') === pkg.version, `Latest release notes version ${notes[0].version || '(empty)'} does not match ${pkg.version}`)

const updatePath = path.join(root, 'update.json')
function readJsonIfValid(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    return {}
  }
}
const update = fs.existsSync(updatePath) ? readJsonIfValid(updatePath) : {}
update.version = pkg.version
update.publishedAt = new Date().toISOString().slice(0, 10)
update.downloadUrl = `https://github.com/Apex9527xy/vocflow/releases/download/v${pkg.version}/VocFlow-${pkg.version}-update.zip`
update.sha256 = hash
update.payloadDir = 'payload'
update.releaseNotes = notes
const serialized = JSON.stringify(update, null, 2) + '\n'
fs.writeFileSync(updatePath, serialized, 'utf8')
fs.writeFileSync(path.join(root, 'resources', 'update.json'), serialized, 'utf8')
fs.writeFileSync(path.join(releaseDir, 'update.json'), serialized, 'utf8')

console.log(`Packaged app source: ${source}`)
console.log(`Fixed cloud endpoint: ${verified.endpoint}`)
console.log(`Update package: ${zipPath}`)
console.log(`Checksum file: ${checksumPath}`)
console.log(`SHA256: ${hash}`)
console.log(`Next: create tag v${pkg.version}, push it, and let the release workflow publish the assets.`)
