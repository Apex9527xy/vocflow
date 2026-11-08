const assert = require('node:assert/strict')
const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')
const { Worker } = require('node:worker_threads')

const root = process.cwd()
const serverPath = path.join(root, 'server', 'cloud-server.cjs')
const tempRoot = path.join(root, `.tmp-cloud-server-test-${process.pid}-${Date.now()}`)
const activeServers = new Set()
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

function assertSafeTempDirectory(directory) {
  const resolvedRoot = path.resolve(root) + path.sep
  const resolvedDirectory = path.resolve(directory)
  assert(resolvedDirectory.startsWith(resolvedRoot), 'Refusing to clean a directory outside the workspace')
  assert(path.basename(resolvedDirectory).startsWith('.tmp-cloud-server-test-'), 'Unexpected temp directory name')
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      assert(address && typeof address === 'object')
      const port = address.port
      server.close(error => error ? reject(error) : resolve(port))
    })
  })
}

async function request(baseUrl, route, options = {}) {
  const response = await fetch(baseUrl + route, {
    method: options.method || 'GET',
    headers: { Accept: 'application/json', ...(options.headers || {}) }
  })
  const text = await response.text()
  let payload = {}
  try { payload = text ? JSON.parse(text) : {} } catch {}
  return { status: response.status, payload, headers: response.headers, text }
}

function createWorker(env) {
  const worker = new Worker(serverPath, { env, stdout: true, stderr: true })
  let output = ''
  let exited = false
  let exitCode = null
  let workerError = null
  worker.stdout.on('data', chunk => { output += chunk.toString('utf8') })
  worker.stderr.on('data', chunk => { output += chunk.toString('utf8') })
  const exitPromise = new Promise(resolve => {
    worker.once('exit', code => {
      exited = true
      exitCode = code
      resolve(code)
    })
  })
  worker.once('error', error => {
    workerError = error
    output += String(error?.stack || error) + '\n'
  })
  return {
    worker,
    output: () => output,
    isExited: () => exited,
    error: () => workerError,
    exitCode: () => exitCode,
    exitPromise
  }
}

function serverEnvironment(port, options = {}) {
  const env = { ...process.env }
  for (const key of [
    'VOCFLOW_PUBLIC_URL',
    'VOCFLOW_CLOUD_DATA_FILE',
    'VOCFLOW_CLOUD_DATA_DIR',
    'VOCFLOW_UPDATE_DIR',
    'VOCFLOW_CLOUD_HOST'
  ]) delete env[key]
  return Object.assign(env, {
    PORT: String(port),
    VOCFLOW_CLOUD_HOST: '127.0.0.1',
    VOCFLOW_CLOUD_DATA_DIR: options.dataDir,
    ...(options.env || {})
  })
}

async function startServer(options = {}) {
  const dataDir = options.dataDir || path.join(tempRoot, `data-${Math.random().toString(16).slice(2)}`)
  fs.mkdirSync(dataDir, { recursive: true })
  const port = await freePort()
  const workerState = createWorker(serverEnvironment(port, { ...options, dataDir }))
  const server = {
    port,
    dataDir,
    baseUrl: `http://127.0.0.1:${port}`,
    output: workerState.output,
    async stop() {
      if (!workerState.isExited()) await workerState.worker.terminate()
      activeServers.delete(server)
    }
  }
  activeServers.add(server)
  const deadline = Date.now() + 12000
  while (Date.now() < deadline) {
    if (workerState.error()) throw new Error('Cloud server failed during startup:\n' + workerState.output())
    if (workerState.isExited()) throw new Error('Cloud server exited during startup:\n' + workerState.output())
    try {
      const health = await request(server.baseUrl, '/health')
      if (health.status === 200 && health.payload.ok === true) return server
    } catch {}
    await sleep(100)
  }
  await server.stop()
  throw new Error('Cloud server did not become healthy:\n' + workerState.output())
}

async function expectStartupFailure(envValue, expectedPattern) {
  const port = await freePort()
  const state = createWorker(serverEnvironment(port, {
    dataDir: path.join(tempRoot, `invalid-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    env: { VOCFLOW_PUBLIC_URL: envValue }
  }))
  const exitCode = await Promise.race([state.exitPromise, sleep(5000).then(() => Symbol.for('timeout'))])
  if (exitCode === Symbol.for('timeout')) await state.worker.terminate()
  assert.notEqual(exitCode, Symbol.for('timeout'), `Invalid public URL should fail startup: ${envValue}`)
  assert.notEqual(exitCode, 0, `Invalid public URL should fail startup: ${envValue}`)
  assert.match(state.output(), expectedPattern)
}

async function run() {
  const dataDir = path.join(tempRoot, 'main-data')
  const server = await startServer({ dataDir })

  const health = await request(server.baseUrl, '/health')
  assert.equal(health.status, 200)
  assert.deepEqual(
    { ok: health.payload.ok, service: health.payload.service, accountFeatures: health.payload.accountFeatures },
    { ok: true, service: 'vocflow-cloud', accountFeatures: false }
  )
  assert.equal(health.headers.get('access-control-allow-origin'), '*')

  const adConfig = await request(server.baseUrl, '/api/ad-config')
  assert.equal(adConfig.status, 200)
  assert.deepEqual(adConfig.payload.config, {
    enabled: false,
    imageUrl: '',
    targetUrl: '',
    updatedAt: null,
    updatedBy: ''
  })
  assert.equal((await request(server.baseUrl, '/api/auth/me')).status, 404)
  assert.equal((await request(server.baseUrl, '/api/sync')).status, 404)
  assert.equal((await request(server.baseUrl, '/api/messages')).status, 404)
  assert.equal((await request(server.baseUrl, '/api/ad-config', { method: 'POST' })).status, 405)
  assert.equal((await request(server.baseUrl, '/api/app-update/manifest')).status, 404)

  fs.writeFileSync(path.join(dataDir, 'vocflow-cloud.json'), JSON.stringify({
    schemaVersion: 2,
    adConfig: {
      enabled: true,
      imageUrl: 'https://cdn.vocflow.cc.cd/banner.png',
      targetUrl: 'https://vocflow.cc.cd/',
      updatedAt: '2026-11-07T00:00:00.000Z',
      updatedBy: 'cache'
    }
  }), 'utf8')
  const configuredAd = await request(server.baseUrl, '/api/ad-config')
  assert.equal(configuredAd.status, 200)
  assert.equal(configuredAd.payload.config.enabled, true)
  assert.equal(configuredAd.payload.config.imageUrl, 'https://cdn.vocflow.cc.cd/banner.png')

  const updateDir = path.join(dataDir, 'updates')
  fs.mkdirSync(updateDir, { recursive: true })
  fs.writeFileSync(path.join(updateDir, 'VocFlow-2.9.13-update.zip'), Buffer.from('PK test update'))
  fs.writeFileSync(path.join(updateDir, 'update.json'), JSON.stringify({
    version: '2.9.13',
    publishedAt: '2026-11-07',
    downloadUrl: 'VocFlow-2.9.13-update.zip',
    sha256: 'b'.repeat(64),
    payloadDir: 'payload',
    releaseNotes: [{ version: '2.9.13', items: ['test'] }]
  }), 'utf8')
  const manifest = await request(server.baseUrl, '/api/app-update/manifest')
  assert.equal(manifest.status, 200)
  assert.equal(manifest.payload.manifest.version, '2.9.13')
  assert.equal(
    manifest.payload.manifest.downloadUrl,
    `${server.baseUrl}/api/app-update/download/VocFlow-2.9.13-update.zip`
  )
  const download = await fetch(manifest.payload.manifest.downloadUrl)
  assert.equal(download.status, 200)
  assert.equal(await download.text(), 'PK test update')

  fs.writeFileSync(path.join(updateDir, 'update.json'), JSON.stringify({
    version: '2.9.13',
    downloadUrl: 'VocFlow-2.9.13-update.zip',
    sha256: 'invalid',
    payloadDir: 'payload'
  }), 'utf8')
  assert.equal((await request(server.baseUrl, '/api/app-update/manifest')).status, 400)

  fs.writeFileSync(path.join(updateDir, 'update.json'), JSON.stringify({
    version: '2.9.13',
    downloadUrl: 'VocFlow-2.9.13-update.zip',
    sha256: 'b'.repeat(64),
    payloadDir: '../escape'
  }), 'utf8')
  assert.equal((await request(server.baseUrl, '/api/app-update/manifest')).status, 400)

  fs.writeFileSync(path.join(updateDir, 'update.json'), JSON.stringify({
    version: '2.9.13',
    downloadUrl: 'https://github.com/Apex9527xy/vocflow/releases/download/v2.9.13/VocFlow-2.9.13-update.zip',
    sha256: 'b'.repeat(64),
    payloadDir: 'payload'
  }), 'utf8')
  const remoteManifest = await request(server.baseUrl, '/api/app-update/manifest')
  assert.equal(remoteManifest.status, 200)
  assert.equal(
    remoteManifest.payload.manifest.downloadUrl,
    'https://github.com/Apex9527xy/vocflow/releases/download/v2.9.13/VocFlow-2.9.13-update.zip'
  )

  const publicOriginServer = await startServer({
    dataDir: path.join(tempRoot, 'public-origin-data'),
    env: { VOCFLOW_PUBLIC_URL: 'https://api.vocflow.cc.cd' }
  })
  fs.mkdirSync(path.join(publicOriginServer.dataDir, 'updates'), { recursive: true })
  fs.writeFileSync(path.join(publicOriginServer.dataDir, 'updates', 'VocFlow-2.9.13-update.zip'), Buffer.from('PK test update'))
  fs.writeFileSync(path.join(publicOriginServer.dataDir, 'updates', 'update.json'), JSON.stringify({
    version: '2.9.13',
    downloadUrl: 'VocFlow-2.9.13-update.zip',
    sha256: 'c'.repeat(64),
    payloadDir: 'payload'
  }), 'utf8')
  const publicManifest = await request(publicOriginServer.baseUrl, '/api/app-update/manifest')
  assert.equal(
    publicManifest.payload.manifest.downloadUrl,
    'https://api.vocflow.cc.cd/api/app-update/download/VocFlow-2.9.13-update.zip'
  )
  await publicOriginServer.stop()
  await server.stop()

  for (const invalidPublicUrl of [
    'http://api.vocflow.cc.cd',
    'https://localhost:8787',
    'https://127.0.0.1',
    'https://192.0.2.10',
    'https://api.vocflow.cc.cd/path'
  ]) {
    await expectStartupFailure(invalidPublicUrl, /VOCFLOW_PUBLIC_URL/)
  }
}

run()
  .then(() => console.log('Cloud server end-to-end tests passed'))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    for (const server of [...activeServers]) await server.stop()
    if (fs.existsSync(tempRoot)) {
      assertSafeTempDirectory(tempRoot)
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  })
