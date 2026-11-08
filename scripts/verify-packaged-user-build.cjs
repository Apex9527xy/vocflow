const fs = require('node:fs')
const path = require('node:path')
const { normalizeCloudEndpoint } = require('./cloud-endpoint.cjs')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readText(file, label) {
  assert(fs.existsSync(file), `缺少${label}：${file}`)
  assert(fs.statSync(file).isFile(), `${label}不是文件：${file}`)
  return fs.readFileSync(file, 'utf8')
}

function readJson(file, label) {
  const text = readText(file, label)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${label}无法解析：${file}`)
  }
}

const ALLOWED_APP_ROOT_ENTRIES = new Set(['dist', 'dist-electron', 'node_modules', 'resources', 'package.json'])
const ALLOWED_APP_RESOURCE_FILES = new Set(['icon.ico', 'icon.png'])
const ALLOWED_IMAGE_FILES = new Set(['dist/assets/icon.png', 'resources/icon.ico', 'resources/icon.png'])
const IMAGE_FILE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.svg', '.ico', '.avif', '.tif', '.tiff', '.heic', '.heif'])
const ALLOWED_WORDBOOK_FILES = new Set([
  'manifest.json',
  'cet4.json',
  'cet4-core.json',
  'cet6.json',
  'ielts.json',
  'kaoyan.json',
  'toefl.json'
])
const FORBIDDEN_DIRECTORY_NAMES = new Set(['examlibrary', 'ttsaudiocache', 'local-cloud', 'userdata', 'backups'])
const FORBIDDEN_FILE_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.odt', '.rtf', '.epub', '.mobi', '.azw3',
  '.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.mp4', '.mkv', '.avi', '.mov',
  '.db', '.sqlite', '.sqlite3', '.bak', '.tmp', '.part', '.log', '.map',
  '.pem', '.key', '.p12', '.pfx', '.crt', '.cer'
])
const FORBIDDEN_FILE_NAMES = new Set(['.env', 'cet4-coach.db', 'vocflow-cloud.json', 'vocflow-service.json', 'startup-ad-cache.json'])

function walkPackageFiles(directory, output = []) {
  if (!fs.existsSync(directory)) return output
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) walkPackageFiles(full, output)
    else if (entry.isFile()) output.push(full)
  }
  return output
}

function relativePath(root, file) {
  return path.relative(root, file).split(path.sep).join('/')
}

function verifyCleanAppPackage(appRoot) {
  const root = path.resolve(appRoot)
  const topLevel = fs.readdirSync(root)
  for (const entry of topLevel) {
    assert(ALLOWED_APP_ROOT_ENTRIES.has(entry), `Unexpected top-level package entry: ${entry}`)
  }

  const files = walkPackageFiles(root)
  for (const file of files) {
    const relative = relativePath(root, file)
    const lowerRelative = relative.toLowerCase()
    const segments = lowerRelative.split('/')
    const extension = path.extname(file).toLowerCase()
    const basename = path.basename(file).toLowerCase()

    for (const segment of segments.slice(0, -1)) {
      assert(!FORBIDDEN_DIRECTORY_NAMES.has(segment), `User-data directory is not allowed in package: ${relative}`)
    }
    assert(!FORBIDDEN_FILE_EXTENSIONS.has(extension), `User-imported or sensitive file is not allowed: ${relative}`)
    assert(!FORBIDDEN_FILE_NAMES.has(basename) && !basename.startsWith('.env.'), `Sensitive configuration file is not allowed: ${relative}`)
    if (IMAGE_FILE_EXTENSIONS.has(extension)) {
      assert(ALLOWED_IMAGE_FILES.has(relative), `Unapproved image asset in package: ${relative}`)
    }
    if (relative.startsWith('resources/')) {
      assert(ALLOWED_APP_RESOURCE_FILES.has(relative.slice('resources/'.length)), `Unexpected file under app resources: ${relative}`)
    }
  }

  return { fileCount: files.length, topLevel: topLevel.sort() }
}

function verifyBundledResources(resourcesRoot) {
  const root = path.resolve(resourcesRoot)
  assert(fs.existsSync(root) && fs.statSync(root).isDirectory(), `Bundled resources directory does not exist: ${root}`)
  const topLevel = fs.readdirSync(root).sort()
  const allowedTopLevel = new Set(['app', 'elevate.exe', 'wordbooks'])
  for (const entry of topLevel) {
    assert(allowedTopLevel.has(entry), `Unexpected bundled resource entry: ${entry}`)
  }

  const wordbooksRoot = path.join(root, 'wordbooks')
  const bundledWordbooks = fs.existsSync(wordbooksRoot)
    ? fs.readdirSync(wordbooksRoot, { withFileTypes: true })
    : []
  for (const entry of bundledWordbooks) {
    assert(entry.isFile() && ALLOWED_WORDBOOK_FILES.has(entry.name), `Unexpected built-in wordbook file: ${entry.name}`)
  }

  return { topLevel, wordbooks: bundledWordbooks.map(entry => entry.name).sort() }
}

function verifyPackagedUserBuild(appRoot, options = {}) {
  const resolvedRoot = path.resolve(appRoot)
  assert(fs.existsSync(resolvedRoot), `用户版应用目录不存在：${resolvedRoot}`)
  assert(fs.statSync(resolvedRoot).isDirectory(), `用户版应用路径不是目录：${resolvedRoot}`)

  const packageJson = readJson(path.join(resolvedRoot, 'package.json'), '应用 package.json')
  assert(/^\d+\.\d+\.\d+$/.test(String(packageJson.version || '')), '应用 package.json 缺少有效版本号')
  assert(packageJson.buildEdition === 'user', '发布包不是普通用户版（buildEdition 必须为 user）')
  if (options.expectedVersion) {
    assert(packageJson.version === options.expectedVersion, `发布包版本 ${packageJson.version} 与预期 ${options.expectedVersion} 不一致`)
  }

  const buildInfo = readJson(path.join(resolvedRoot, 'dist-electron', 'build-info.json'), '构建信息')
  assert(buildInfo.schemaVersion === 1, '构建信息版本不受支持，必须重新执行用户版构建')
  assert(buildInfo.userBuild === true && buildInfo.buildEdition === 'user', '构建信息未标记为普通用户版')
  assert(buildInfo.version === packageJson.version, '构建信息版本与应用 package.json 不一致')
  const endpoint = normalizeCloudEndpoint(buildInfo.cloudEndpoint, true)
  if (options.expectedEndpoint !== undefined && options.expectedEndpoint !== '') {
    const expectedEndpoint = normalizeCloudEndpoint(options.expectedEndpoint, true)
    assert(endpoint === expectedEndpoint, `构建固定云地址 ${endpoint} 与预期 ${expectedEndpoint} 不一致`)
  }

  const mainFile = path.join(resolvedRoot, 'dist-electron', 'main.js')
  const rendererFile = path.join(resolvedRoot, 'dist', 'assets', 'app.js')
  const main = readText(mainFile, '主进程产物')
  const renderer = readText(rendererFile, '渲染进程产物')
  const endpointLiteral = JSON.stringify(endpoint)
  assert(main.includes(endpointLiteral), `主进程产物未写入固定云地址 ${endpoint}`)
  for (const [label, source] of [['主进程', main], ['渲染进程', renderer]]) {
    assert(!source.includes('VOCFLOW_CLOUD_URL'), `${label}产物仍包含运行时云地址读取逻辑`)
    assert(
      !/https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|\[?::1\]?):8787\b/i.test(source),
      `${label}产物仍包含本机 8787 回退地址`
    )
  }

  const localUpdateLeaks = [
    /\bfunction localFeedManifest\s*\(/,
    /\bfunction localManifest\s*\(/,
    /\\ProgramData/,
    /process\.execPath[\s\S]{0,200}?['"`]updates['"`]/
  ]
  assert(!localUpdateLeaks.some(pattern => pattern.test(main)), '用户版主进程仍包含用户可写本地更新源读取逻辑')

  const packageAudit = verifyCleanAppPackage(resolvedRoot)

  return { root: resolvedRoot, packageJson, buildInfo, endpoint, packageAudit }
}

if (require.main === module) {
  const appRoot = process.argv[2] || path.join(process.cwd(), 'release', 'user-nsis', 'win-unpacked', 'resources', 'app')
  const expectedEndpoint = String(process.env.VOCFLOW_CLOUD_URL || '').trim()
  const result = verifyPackagedUserBuild(appRoot, { expectedEndpoint })
  console.log(`Packaged user build verified: ${result.packageJson.version} -> ${result.endpoint}`)
}

module.exports = {
  verifyPackagedUserBuild,
  verifyBundledResources,
  verifyCleanAppPackage
}