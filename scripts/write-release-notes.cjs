const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const notes = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'release-notes.json'), 'utf8'))
const latest = notes[0]
if (!latest) throw new Error('No release notes found')
const lines = [
  `## ${latest.title || `VocFlow ${latest.version}`}`,
  '',
  ...latest.items.map(item => `- ${item}`)
]
const output = path.join(root, 'release', 'RELEASE_NOTES.md')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${lines.join('\n')}\n`, 'utf8')
console.log(output)
