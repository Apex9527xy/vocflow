const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const packagePath = path.join(root, 'package.json')
const notesPath = path.join(root, 'src', 'data', 'release-notes.json')
const updatePath = path.join(root, 'update.json')
const resourceUpdatePath = path.join(root, 'resources', 'update.json')

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
}

const releaseType = process.argv[2] || 'patch'
if (!['patch', 'minor', 'major'].includes(releaseType)) {
  console.error('Usage: node scripts/bump-version.cjs [patch|minor|major] "更新内容1" "更新内容2"')
  process.exit(1)
}

const pkg = readJson(packagePath)
const parts = String(pkg.version).split('.').map(Number)
if (parts.length !== 3 || parts.some(Number.isNaN)) throw new Error(`Invalid version: ${pkg.version}`)
if (releaseType === 'major') { parts[0] += 1; parts[1] = 0; parts[2] = 0 }
else if (releaseType === 'minor') { parts[1] += 1; parts[2] = 0 }
else { parts[2] += 1 }
const version = parts.join('.')
const localDate = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
const items = process.argv.slice(3).filter(Boolean)
if (!items.length) items.push('常规优化与问题修复')

const entry = { version, date: localDate, title: `VocFlow ${version}`, items }
pkg.version = version
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')

const notes = readJson(notesPath)
notes.unshift(entry)
fs.writeFileSync(notesPath, JSON.stringify(notes, null, 2) + '\n', 'utf8')

const update = fs.existsSync(updatePath) ? readJson(updatePath) : {}
update.version = version
update.publishedAt = localDate
update.downloadUrl = `https://github.com/Apex9527xy/vocflow/releases/download/v${version}/VocFlow-${version}-update.zip`
update.sha256 = ''
update.payloadDir = 'payload'
update.releaseNotes = notes
fs.writeFileSync(updatePath, JSON.stringify(update, null, 2) + '\n', 'utf8')
fs.writeFileSync(resourceUpdatePath, JSON.stringify(update, null, 2) + '\n', 'utf8')
console.log(`Version bumped to ${version}. Release notes and manifests generated.`)
