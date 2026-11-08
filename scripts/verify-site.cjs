const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const required = [
  'docs/index.html',
  'docs/styles.css',
  'docs/app.js',
  'docs/assets/icon.png',
  'docs/.nojekyll',
  '.github/workflows/pages.yml',
  '.github/workflows/release.yml',
  'server/deploy/README.md',
  'server/deploy/vocflow-cloud.service',
  'server/deploy/nginx-vocflow-api.conf',
  'server/deploy/vocflow-cloud.env.example'
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

for (const relative of required) {
  assert(fs.existsSync(path.join(root, relative)), `Missing site/deployment file: ${relative}`)
}

const html = fs.readFileSync(path.join(root, 'docs/index.html'), 'utf8')
const app = fs.readFileSync(path.join(root, 'docs/app.js'), 'utf8')
const releaseWorkflow = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8')
const pagesWorkflow = fs.readFileSync(path.join(root, '.github/workflows/pages.yml'), 'utf8')

assert(/releases\/latest/.test(html), 'The website must provide a latest-release fallback link.')
assert(app.includes("const repository = 'Apex9527xy/vocflow'") && app.includes('/releases/latest'), 'The website must query the configured GitHub repository.')
assert(app.includes('-Setup\\.exe'), 'The website must identify the Windows installer release asset.')
assert(/VOCFLOW_CLOUD_URL/.test(releaseWorkflow), 'Release workflow must receive VOCFLOW_CLOUD_URL.')
assert(/package:update/.test(releaseWorkflow), 'Release workflow must generate update.json and the update ZIP.')
assert(/actions\/deploy-pages/.test(pagesWorkflow), 'Pages workflow must deploy the static website.')
const readableFiles = [
  ['docs/index.html', html],
  ['docs/app.js', app],
  ['README.md', fs.readFileSync(path.join(root, 'README.md'), 'utf8')],
  ['server/deploy/README.md', fs.readFileSync(path.join(root, 'server/deploy/README.md'), 'utf8')]
]
for (const [name, text] of readableFiles) {
  assert(/[\u4e00-\u9fff]/.test(text), `${name} must contain readable Chinese copy.`)
  assert(!/\?{3,}/.test(text), `${name} contains corrupted Chinese text represented by question marks.`)
  assert(!text.includes('\uFFFD'), `${name} contains Unicode replacement characters.`)
}
assert(/<meta charset="utf-8"/i.test(html) && /<html lang="zh-CN">/i.test(html), 'Website must declare UTF-8 and Chinese language metadata.')
assert(/content: "鉁?/.test(fs.readFileSync(path.join(root, 'docs/styles.css'), 'utf8')), 'Website requirement bullets must use a valid check mark.')

console.log('Online site and deployment configuration verified.')

