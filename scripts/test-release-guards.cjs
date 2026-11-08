const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { verifyPackagedUserBuild } = require('./verify-packaged-user-build.cjs')

const root = process.cwd()
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const endpoint = 'https://api.vocflow.cc.cd'
const builderConfigs = [
  'scripts/electron-builder.user-nsis.yml',
  'scripts/electron-builder.user-msix.yml'
]
for (const relativePath of builderConfigs) {
  const config = fs.readFileSync(path.join(root, relativePath), 'utf8')
  assert.match(
    config,
    /^extraMetadata:\s*\r?\n\s+buildEdition:\s*user\s*$/m,
    `${relativePath} must stamp buildEdition=user into the packaged application`
  )
}
const tempRoot = path.join(root, `.tmp-release-guard-test-${process.pid}-${Date.now()}`)
const appRoot = path.join(tempRoot, 'app')

function ensureSafeTempRoot() {
  const rootPrefix = path.resolve(root) + path.sep
  const resolved = path.resolve(tempRoot)
  assert(resolved.startsWith(rootPrefix), 'Refusing to clean a directory outside the workspace')
  assert(path.basename(resolved).startsWith('.tmp-release-guard-test-'), 'Unexpected test directory name')
}

function writeFixture(overrides = {}) {
  fs.rmSync(tempRoot, { recursive: true, force: true })
  fs.mkdirSync(path.join(appRoot, 'dist-electron'), { recursive: true })
  fs.mkdirSync(path.join(appRoot, 'dist', 'assets'), { recursive: true })
  const packageJson = {
    name: 'vocflow',
    version: pkg.version,
    buildEdition: 'user',
    ...(overrides.packageJson || {})
  }
  const buildInfo = {
    schemaVersion: 1,
    version: pkg.version,
    buildEdition: 'user',
    userBuild: true,
    cloudEndpoint: endpoint,
    builtAt: '2026-10-29T00:00:00.000Z',
    ...(overrides.buildInfo || {})
  }
  fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8')
  fs.writeFileSync(path.join(appRoot, 'dist-electron', 'build-info.json'), JSON.stringify(buildInfo, null, 2), 'utf8')
  fs.writeFileSync(
    path.join(appRoot, 'dist-electron', 'main.js'),
    overrides.main ?? `const ENDPOINT_LOCKED = true;\nconst COMPILED_ENDPOINT = ${JSON.stringify(endpoint)};\n`,
    'utf8'
  )
  fs.writeFileSync(
    path.join(appRoot, 'dist', 'assets', 'app.js'),
    overrides.renderer ?? `const cloudEndpoint = ${JSON.stringify(endpoint)};\n`,
    'utf8'
  )
}

try {
  writeFixture()
  const result = verifyPackagedUserBuild(appRoot, { expectedVersion: pkg.version, expectedEndpoint: endpoint })
  assert.equal(result.endpoint, endpoint)

  writeFixture({ packageJson: { version: '2.9.9' } })
  assert.throws(
    () => verifyPackagedUserBuild(appRoot, { expectedVersion: pkg.version, expectedEndpoint: endpoint }),
    /version|版本/,
    'A stale packaged version must be rejected'
  )

  writeFixture({ packageJson: { buildEdition: 'developer' } })
  assert.throws(
    () => verifyPackagedUserBuild(appRoot, { expectedVersion: pkg.version, expectedEndpoint: endpoint }),
    /buildEdition|用户版/,
    'A developer package must be rejected'
  )

  writeFixture()
  assert.throws(
    () => verifyPackagedUserBuild(appRoot, { expectedVersion: pkg.version, expectedEndpoint: 'https://updates.vocflow.cn' }),
    /固定云地址/,
    'A package built for a different cloud endpoint must be rejected'
  )

  writeFixture({ buildInfo: { cloudEndpoint: 'http://api.vocflow.cc.cd' } })
  assert.throws(
    () => verifyPackagedUserBuild(appRoot, { expectedVersion: pkg.version }),
    /HTTPS/,
    'An HTTP cloud endpoint must be rejected'
  )

  writeFixture({ main: `const endpoint = process.env.VOCFLOW_CLOUD_URL || ${JSON.stringify(endpoint)};\n` })
  assert.throws(
    () => verifyPackagedUserBuild(appRoot, { expectedVersion: pkg.version }),
    /运行时云地址/,
    'Runtime cloud endpoint overrides must be rejected'
  )

  writeFixture({ main: `const endpoint = ${JSON.stringify(endpoint)};\nconst path = 'C:\\\\ProgramData\\\\VocFlow\\\\Updates\\\\update.json';\n` })
  assert.throws(
    () => verifyPackagedUserBuild(appRoot, { expectedVersion: pkg.version }),
    /本地更新源/,
    'User-writable local update feeds must be rejected'
  )

  fs.rmSync(path.join(appRoot, 'dist-electron', 'build-info.json'), { force: true })
  assert.throws(
    () => verifyPackagedUserBuild(appRoot, { expectedVersion: pkg.version }),
    /构建信息/,
    'A build without provenance metadata must be rejected'
  )

  console.log('Release guard tests passed: 9 checks')
} finally {
  if (fs.existsSync(tempRoot)) {
    ensureSafeTempRoot()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}