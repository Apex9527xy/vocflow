const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = process.cwd()
const sourceFile = path.join(root, 'electron', 'ipc', 'update-core.ts')
const tempDir = path.join(root, '.tmp-update-core-test-' + process.pid + '-' + Date.now())
const compiledFile = path.join(tempDir, 'update-core.cjs')
const sha256 = 'a'.repeat(64)
const baseUrl = 'https://github.com/Apex9527xy/vocflow/releases/latest/download/update.json'

function assertSafeTempDirectory(directory) {
  const resolvedRoot = path.resolve(root) + path.sep
  const resolvedDirectory = path.resolve(directory)
  assert(resolvedDirectory.startsWith(resolvedRoot), 'Refusing to clean a directory outside the workspace')
  assert(path.basename(resolvedDirectory).startsWith('.tmp-update-core-test-'), 'Unexpected temp directory name')
}

try {
  const source = fs.readFileSync(sourceFile, 'utf8')
  const compiled = ts.transpileModule(source, {
    fileName: sourceFile,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      esModuleInterop: true,
      sourceMap: false
    }
  })
  const errors = (compiled.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error)
  assert.equal(errors.length, 0, errors.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'))
  fs.mkdirSync(tempDir, { recursive: true })
  fs.writeFileSync(compiledFile, compiled.outputText, 'utf8')
  const core = require(compiledFile)
  const cloudEndpoint = require(path.join(root, 'scripts', 'cloud-endpoint.cjs'))

  assert.throws(() => cloudEndpoint.normalizeCloudEndpoint('', true), /缺少 VOCFLOW_CLOUD_URL/)
  assert.throws(() => cloudEndpoint.normalizeCloudEndpoint('http://cloud.example.com', true), /必须使用 HTTPS/)
  assert.throws(() => cloudEndpoint.normalizeCloudEndpoint('https://127.0.0.1', true), /本机或回环/)
  assert.throws(() => cloudEndpoint.normalizeCloudEndpoint('https://192.0.2.10', true), /不能直接使用 IP/)
  assert.throws(() => cloudEndpoint.normalizeCloudEndpoint('https://cloud.example.com', true), /示例、保留或占位域名/)
  assert.throws(() => cloudEndpoint.normalizeCloudEndpoint('https://cloud.your-domain.example', true), /示例、保留或占位域名/)
  assert.equal(
    cloudEndpoint.normalizeCloudEndpoint('https://api.vocflow.cc.cd', true),
    'https://api.vocflow.cc.cd',
    'A real non-loopback HTTPS endpoint should be accepted for user builds'
  )

  const manifest = () => ({
    version: '2.9.10',
    publishedAt: '2026-10-29',
    downloadUrl: 'VocFlow-2.9.10-update.zip',
    sha256,
    payloadDir: 'payload'
  })

  const resolved = core.candidateFromManifest(manifest(), 'manifest', baseUrl, true)
  assert(resolved, 'A complete HTTPS relative manifest should be accepted')
  assert.equal(
    resolved.manifest.downloadUrl,
    'https://github.com/Apex9527xy/vocflow/releases/latest/download/VocFlow-2.9.10-update.zip'
  )

  const invalidCases = [
    ['missing SHA256', { sha256: '' }],
    ['invalid SHA256', { sha256: 'g'.repeat(64) }],
    ['HTTP download', { downloadUrl: 'http://updates.example.com/VocFlow-2.9.10-update.zip' }],
    ['localhost download', { downloadUrl: 'https://localhost/VocFlow-2.9.10-update.zip' }],
    ['loopback download', { downloadUrl: 'https://127.0.0.2/VocFlow-2.9.10-update.zip' }],
    ['file download', { downloadUrl: 'file:///C:/updates/VocFlow-2.9.10-update.zip' }],
    ['non ZIP download', { downloadUrl: 'https://updates.example.com/VocFlow-2.9.10-update.exe' }],
    ['parent payloadDir', { payloadDir: '../payload' }],
    ['absolute payloadDir', { payloadDir: '/payload' }],
    ['drive payloadDir', { payloadDir: 'C:\\payload' }]
  ]
  for (const [label, overrides] of invalidCases) {
    const candidate = core.candidateFromManifest({ ...manifest(), ...overrides }, 'manifest', baseUrl, true)
    assert.equal(candidate, null, label + ' should be rejected')
  }

  const devHttp = core.candidateFromManifest(
    { ...manifest(), downloadUrl: 'http://127.0.0.1:8787/VocFlow-2.9.10-update.zip' },
    'server',
    'http://127.0.0.1:8787/api/app-update/manifest',
    false
  )
  assert(devHttp, 'Development builds should still accept explicitly configured HTTP feeds')

  assert.equal(core.localUpdateSourcesEnabled(false), true, 'Development builds may use local update feeds')
  assert.equal(core.localUpdateSourcesEnabled(true), false, 'User builds must ignore user-writable local update feeds')

  const sources = ['local', 'local-feed', 'server', 'github-release', 'manifest']
  const ranked = core.selectCandidate(sources.map(source => ({
    source,
    manifest: { ...manifest(), downloadUrl: 'https://updates.example.com/VocFlow-2.9.10-update.zip' }
  })))
  assert.equal(ranked.source, 'manifest', 'Manifest source should win when versions are equal')

  const newerLocal = core.selectCandidate([
    { source: 'manifest', manifest: { ...manifest(), version: '2.9.9', downloadUrl: 'https://updates.example.com/VocFlow-2.9.9-update.zip' } },
    { source: 'local', manifest: { ...manifest(), version: '2.9.11', downloadUrl: 'https://updates.example.com/VocFlow-2.9.11-update.zip' } }
  ])
  assert.equal(newerLocal.source, 'local', 'Higher version should win in a development build')

  const safeUserSelection = core.selectUpdateCandidate([
    { source: 'manifest', manifest: { ...manifest(), version: '2.9.10', downloadUrl: 'https://updates.example.com/VocFlow-2.9.10-update.zip' } },
    { source: 'local', manifest: { ...manifest(), version: '9.9.9', downloadUrl: 'https://updates.example.com/VocFlow-9.9.9-update.zip' } },
    { source: 'local-feed', manifest: { ...manifest(), version: '9.9.8', downloadUrl: 'https://updates.example.com/VocFlow-9.9.8-update.zip' } }
  ], true)
  assert.equal(safeUserSelection.source, 'manifest', 'User builds must reject local update candidates even when they claim a higher version')

  const installableGithub = {
    source: 'github-release',
    manifest: { ...manifest(), downloadUrl: 'https://github.com/Apex9527xy/vocflow/releases/download/v2.9.10/VocFlow-2.9.10-update.zip' }
  }
  const incompleteManifest = {
    source: 'manifest',
    manifest: { ...manifest(), version: '2.9.11', sha256: '' }
  }
  const installableSelection = core.selectUpdateCandidate([incompleteManifest, installableGithub], true)
  assert.equal(installableSelection.source, 'github-release', 'An incomplete higher-version manifest must not hide an installable release')
  assert.equal(installableSelection.manifest.version, '2.9.10')
  assert.equal(
    core.selectUpdateCandidate([incompleteManifest], true),
    null,
    'Selection must return no update when every candidate is incomplete'
  )

  assert(core.validateRedirectUrl('https://release-assets.githubusercontent.com/github-production-release-asset/asset?download=1', true))
  assert.equal(core.validateRedirectUrl('http://release-assets.githubusercontent.com/asset', true), '')
  assert.equal(core.validateRedirectUrl('https://127.0.0.1/asset', true), '')

  assert(core.isPathInside(tempDir, path.join(tempDir, 'payload')))
  assert.equal(core.isPathInside(tempDir, tempDir), false)
  assert.equal(core.isPathInside(tempDir, path.join(tempDir, '..', 'outside')), false)

  assert.equal(core.isProtectedAppPath('C:\\Program Files\\WindowsApps\\VocFlow', false), true)
  assert.equal(core.isProtectedAppPath('C:\\Users\\Student\\AppData\\Local\\Programs\\VocFlow', false), false)
  assert.equal(core.isProtectedAppPath('D:\\Portable\\VocFlow', true), true)

  const payload = path.join(tempDir, 'payload')
  fs.mkdirSync(path.join(payload, 'resources', 'app'), { recursive: true })
  fs.writeFileSync(path.join(payload, 'resources', 'app', 'package.json'), JSON.stringify({ version: '2.9.8' }), 'utf8')
  assert.equal(core.packageVersionFromPayload(payload), '2.9.8')
  assert.notEqual(core.packageVersionFromPayload(payload), '2.9.9', 'Packaged version mismatch must be detectable')

  const stateManifest = core.manifestFromUpdateState({
    latestVersion: '2.9.10',
    publishedAt: '2026-10-29',
    downloadUrl: 'https://updates.example.com/VocFlow-2.9.10-update.zip',
    sha256,
    payloadDir: 'payload',
    releaseNotes: []
  })
  assert.equal(stateManifest.version, '2.9.10', 'Install must map latestVersion to manifest.version')
  assert(core.isInstallable(stateManifest, true), 'Mapped update state must remain installable')

  console.log('Update core tests passed: 29 checks')
} finally {
  if (fs.existsSync(tempDir)) {
    assertSafeTempDirectory(tempDir)
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

