const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const root = process.cwd()
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = pkg.version
const updatePath = path.join(root, 'update.json')
let update = {}
try {
  update = JSON.parse(fs.readFileSync(updatePath, 'utf8').replace(/^\uFEFF/, ''))
} catch {
  update = { releaseNotes: [] }
}
const zipName = `VocFlow-${version}-update.zip`
const zipPath = path.join(root, 'release', zipName)
if (!fs.existsSync(zipPath)) throw new Error(`Update ZIP not found: ${zipPath}`)
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex')
update.version = version
update.sha256 = sha256
update.downloadUrl = `https://github.com/Apex9527xy/vocflow/releases/download/v${version}/${zipName}`
update.payloadDir = update.payloadDir || 'payload'
const serialized = JSON.stringify(update, null, 2) + '\n'
const targets = [
  path.join(root, 'release', 'updates'),
  path.join(root, 'server', 'data', 'updates')
]
for (const directory of targets) {
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'update.json'), serialized, 'utf8')
  fs.copyFileSync(zipPath, path.join(directory, zipName))
  fs.writeFileSync(path.join(directory, `${zipName}.sha256`), `${sha256}  ${zipName}\n`, 'utf8')
}
fs.writeFileSync(updatePath, serialized, 'utf8')
fs.writeFileSync(path.join(root, 'resources', 'update.json'), serialized, 'utf8')
fs.writeFileSync(path.join(root, 'release', 'update.json'), serialized, 'utf8')
console.log(`Published ${version} update feed to local deployment directories.`)
console.log(`Release asset URL: ${update.downloadUrl}`)
console.log(`SHA256: ${sha256}`)

