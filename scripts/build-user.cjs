const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { resolveCloudEndpoint } = require('./cloud-endpoint.cjs')
const { verifyPackagedUserBuild, verifyBundledResources } = require('./verify-packaged-user-build.cjs')
const { verifyWindowsIcons } = require('./verify-windows-icons.cjs')

const root = process.cwd()
const cloudEndpoint = resolveCloudEndpoint(true)
const target = String(process.argv[2] || '').toLowerCase()
if (!['nsis', 'msix', 'dir'].includes(target)) {
  console.error('Usage: node scripts/build-user.cjs <nsis|msix|dir>')
  process.exit(2)
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const userEnv = {
  ...process.env,
  VOCFLOW_USER_BUILD: '1',
  VOCFLOW_CLOUD_URL: cloudEndpoint
}
const forbidden = [
  '开发者广告配置',
  '开发者控制台',
  'cloud:adminMessages:list',
  'cloud:adminMessages:post',
  'advertising:get',
  'advertising:save',
  'getAdminCloudMessages',
  'postAdminCloudMessage',
  'saveAdvertisingConfig'
]

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: userEnv,
    stdio: 'inherit',
    windowsHide: true,
    ...options
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${path.basename(command)} exited with code ${result.status}`)
}

function walkFiles(directory, output = []) {
  if (!fs.existsSync(directory)) return output
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) walkFiles(full, output)
    else output.push(full)
  }
  return output
}

function assertProductionBindings() {
  const mainBundle = fs.readFileSync(path.join(root, 'dist-electron', 'main.js'), 'utf8')
  const rendererBundle = fs.readFileSync(path.join(root, 'dist', 'assets', 'app.js'), 'utf8')
  const buildInfoPath = path.join(root, 'dist-electron', 'build-info.json')
  if (!fs.existsSync(buildInfoPath)) throw new Error('正式构建缺少 dist-electron/build-info.json')
  const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'))
  if (buildInfo.version !== pkg.version) throw new Error('正式构建信息版本与 package.json 不一致')
  if (buildInfo.userBuild !== true || buildInfo.buildEdition !== 'user') throw new Error('正式构建信息未标记为用户版')
  if (buildInfo.cloudEndpoint !== cloudEndpoint) throw new Error('正式构建信息中的云地址与构建参数不一致')
  const expectedEndpoint = JSON.stringify(cloudEndpoint)
  if (!mainBundle.includes(expectedEndpoint)) {
    throw new Error(`正式构建的主进程产物未写入固定云服务地址 ${cloudEndpoint}`)
  }
  for (const [label, source] of [['main', mainBundle], ['renderer', rendererBundle]]) {
    if (source.includes('VOCFLOW_CLOUD_URL')) {
      throw new Error(`正式构建的 ${label} 产物仍包含运行时云地址读取逻辑`)
    }
    if (/https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|\[?::1\]?):8787\b/i.test(source)) {
      throw new Error(`正式构建的 ${label} 产物仍包含本机 8787 回退地址`)
    }
  }
  const localUpdateSourceLeaks = [
    /\bfunction localFeedManifest\s*\(/,
    /\bfunction localManifest\s*\(/,
    /\\ProgramData/,
    /process\.execPath[\s\S]{0,200}?['"`]updates['"`]/
  ]
  if (localUpdateSourceLeaks.some(pattern => pattern.test(mainBundle))) {
    throw new Error('正式构建仍包含用户可写本地更新源读取逻辑')
  }  console.log(`Production binding verification passed: ${cloudEndpoint}`)
}

function assertUserBuild() {
  const files = [...walkFiles(path.join(root, 'dist')), ...walkFiles(path.join(root, 'dist-electron'))]
  for (const file of files) {
    if (!/\.(js|cjs|mjs|css|html|json)$/i.test(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    for (const marker of forbidden) {
      if (text.includes(marker)) throw new Error(`普通用户构建仍包含开发者能力标记「${marker}」: ${file}`)
    }
  }
  console.log(`User-build verification passed: ${files.length} renderer/main files scanned.`)
}

function verifyPackagedBuild(source) {
  const result = verifyPackagedUserBuild(source, {
    expectedVersion: pkg.version,
    expectedEndpoint: cloudEndpoint
  })
  console.log(`Packaged user build verified: ${result.packageJson.version} -> ${result.endpoint}`)
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function writeChecksum(file) {
  const hash = sha256(file)
  fs.writeFileSync(`${file}.sha256`, `${hash}  ${path.basename(file)}\n`, 'utf8')
  console.log(`SHA256 ${path.basename(file)}: ${hash}`)
}

function findLatest(directory, extension) {
  return walkFiles(directory)
    .filter(file => file.toLowerCase().endsWith(extension))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null
}

function findMakeAppx() {
  const explicit = [
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits', '10', 'bin', '10.0.26100.0', 'x64', 'makeappx.exe')
  ]
  for (const candidate of explicit) if (fs.existsSync(candidate)) return candidate
  const kits = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits', '10', 'bin')
  if (!fs.existsSync(kits)) return null
  const versions = fs.readdirSync(kits).sort().reverse()
  for (const version of versions) {
    const candidate = path.join(kits, version, 'x64', 'makeappx.exe')
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

run(process.execPath, [path.join(root, 'scripts', 'verify-cloud-endpoint.cjs')])
run(process.execPath, [path.join(root, 'scripts', 'build-main.cjs')])
run(process.execPath, [path.join(root, 'scripts', 'build-renderer.cjs')])
assertProductionBindings()
assertUserBuild()

const builderCli = require.resolve('electron-builder/cli.js')
if (target === 'nsis') {
  run(process.execPath, [builderCli, '--config', path.join(root, 'scripts', 'electron-builder.user-nsis.yml'), '--win', 'nsis', '--x64', '--publish', 'never'])
  verifyPackagedBuild(path.join(root, 'release', 'user-nsis', 'win-unpacked', 'resources', 'app'))
  const bundled = verifyBundledResources(path.join(root, 'release', 'user-nsis', 'win-unpacked', 'resources'))
  console.log(`Bundled resources verified: ${bundled.topLevel.join(', ')}`)
  const artifact = path.join(root, 'release', 'user-nsis', `VocFlow-${pkg.version}-Setup.exe`)
  if (!fs.existsSync(artifact)) throw new Error(`NSIS artifact was not generated: ${artifact}`)
  const iconAudit = verifyWindowsIcons({
    iconPng: path.join(root, 'resources', 'icon.png'),
    iconIco: path.join(root, 'resources', 'icon.ico'),
    appExe: path.join(root, 'release', 'user-nsis', 'win-unpacked', 'VocFlow.exe'),
    installerExe: artifact
  })
  console.log(`Windows icon verification passed: ${iconAudit.iconHash}`)
  writeChecksum(artifact)
  console.log(`NSIS installer: ${artifact}`)
} else if (target === 'msix') {
  run(process.execPath, [builderCli, '--config', path.join(root, 'scripts', 'electron-builder.user-msix.yml'), '--win', 'appx', '--x64', '--publish', 'never'])
  const appx = findLatest(path.join(root, 'release', 'user-msix'), '.appx')
  if (!appx) throw new Error('APPX artifact was not generated')
  const makeappx = findMakeAppx()
  if (!makeappx) throw new Error('MakeAppx.exe was not found')
  const outputDir = path.join(root, 'release', 'user-msix')
  const msix = path.join(outputDir, `VocFlow-${pkg.version}-x64.msix`)
  if (fs.existsSync(msix)) fs.rmSync(msix, { force: true })
  const stage = path.join(outputDir, `.msix-stage-${Date.now()}`)
  fs.mkdirSync(stage, { recursive: true })
  run(makeappx, ['unpack', '/p', appx, '/d', stage, '/o'])
  verifyPackagedBuild(path.join(stage, 'resources', 'app'))
  run(makeappx, ['pack', '/d', stage, '/p', msix, '/o'])
  fs.rmSync(stage, { recursive: true, force: true })
  writeChecksum(msix)
  console.log(`MSIX package: ${msix}`)
} else {
  run(process.execPath, [builderCli, '--config', path.join(root, 'scripts', 'electron-builder.user-nsis.yml'), '--win', 'dir', '--x64', '--publish', 'never'])
  verifyPackagedBuild(path.join(root, 'release', 'user-nsis', 'win-unpacked', 'resources', 'app'))
}

console.log('User edition build completed.')
