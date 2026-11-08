const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { resolveCloudEndpoint } = require('./cloud-endpoint.cjs')

const root = process.cwd()
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = pkg.version
const cloudEndpoint = resolveCloudEndpoint(true)
const env = { ...process.env, VOCFLOW_USER_BUILD: '1', VOCFLOW_CLOUD_URL: cloudEndpoint }

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit', windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${path.basename(command)} exited with code ${result.status}`)
}

function walk(directory, output = []) {
  if (!fs.existsSync(directory)) return output
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, item.name)
    if (item.isDirectory()) walk(full, output)
    else output.push(full)
  }
  return output
}

run(process.execPath, [path.join(root, 'scripts', 'build-main.cjs')])
run(process.execPath, [path.join(root, 'scripts', 'build-renderer.cjs')])

const forbidden = ['开发者广告配置', '开发者控制台', 'getAdminCloudMessages', 'postAdminCloudMessage', 'getAdvertisingConfig', 'saveAdvertisingConfig', 'advertising:get', 'advertising:save']
for (const file of [...walk(path.join(root, 'dist')), ...walk(path.join(root, 'dist-electron'))]) {
  if (!/\.(js|cjs|mjs|css|html|json)$/i.test(file)) continue
  const text = fs.readFileSync(file, 'utf8')
  for (const marker of forbidden) if (text.includes(marker)) throw new Error(`User build contains developer marker ${marker}: ${file}`)
}

const unpacked = path.join(root, 'release', `user-unpacked-${version}`)
if (!fs.existsSync(unpacked)) throw new Error(`Missing user unpacked runtime: ${unpacked}`)
const app = path.join(unpacked, 'resources', 'app')
for (const directory of ['dist', 'dist-electron']) {
  fs.cpSync(path.join(root, directory), path.join(app, directory), { recursive: true, force: true })
}
const appPackagePath = path.join(app, 'package.json')
const appPackage = JSON.parse(fs.readFileSync(appPackagePath, 'utf8'))
appPackage.version = version
appPackage.buildEdition = 'user'
fs.writeFileSync(appPackagePath, JSON.stringify(appPackage, null, 2) + '\n', 'utf8')

const stage = path.join(root, 'release', 'user-msix', `offline-stage-${Date.now()}`)
fs.cpSync(unpacked, stage, { recursive: true, force: true })
const assets = path.join(stage, 'Assets')
fs.cpSync(path.join(root, 'scripts', 'appx-assets'), assets, { recursive: true, force: true })
const manifest = `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10" xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10" xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities">
  <Identity Name="com.vocflow.app" Publisher="CN=VocFlow" Version="${version}.0" ProcessorArchitecture="x64" />
  <Properties><DisplayName>VocFlow</DisplayName><PublisherDisplayName>VocFlow</PublisherDisplayName><Description>VocFlow 英语学习与文献研读一体化工具</Description><Logo>Assets\\StoreLogo.png</Logo></Properties>
  <Resources><Resource Language="zh-CN" /><Resource Language="en-US" /></Resources>
  <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0" /></Dependencies>
  <Capabilities><rescap:Capability Name="runFullTrust" /></Capabilities>
  <Applications><Application Id="VocFlow" Executable="VocFlow.exe" EntryPoint="Windows.FullTrustApplication"><uap:VisualElements BackgroundColor="#171412" DisplayName="VocFlow" Square150x150Logo="Assets\\Square150x150Logo.png" Square44x44Logo="Assets\\Square44x44Logo.png" Description="VocFlow 英语学习与文献研读一体化工具" /></Application></Applications>
</Package>
`
fs.writeFileSync(path.join(stage, 'AppxManifest.xml'), manifest, 'utf8')
const makeappx = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits', '10', 'bin', '10.0.26100.0', 'x64', 'makeappx.exe')
if (!fs.existsSync(makeappx)) throw new Error('MakeAppx.exe not found')
const output = path.join(root, 'release', `VocFlow-${version}-x64.msix`)
run(makeappx, ['pack', '/d', stage, '/p', output, '/o'])
const hash = crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex')
fs.writeFileSync(`${output}.sha256`, `${hash}  ${path.basename(output)}\n`, 'utf8')
console.log(`MSIX: ${output}`)
console.log(`SHA256: ${hash}`)
