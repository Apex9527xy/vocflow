const assert = require('node:assert/strict')
const {
  DEFAULT_FEED_URL,
  expectedDownloadUrl,
  validatePublishedManifest,
  verifyPublishedUpdate
} = require('./verify-published-update.cjs')

const version = '2.9.10'
const tag = `v${version}`
const sha256 = 'a'.repeat(64)
const downloadUrl = expectedDownloadUrl(tag, version)
const manifest = {
  version,
  downloadUrl,
  sha256,
  payloadDir: 'payload',
  releaseNotes: [{ version, items: ['修复更新与同步问题'] }]
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return structuredClone(body)
    }
  }
}

async function main() {
  assert.equal(
    validatePublishedManifest(manifest, { tag, version, sha256, downloadUrl }).version,
    version,
    'A complete public manifest should be accepted'
  )

  assert.throws(
    () => validatePublishedManifest({ ...manifest, version: '2.9.9' }, { tag, version, sha256, downloadUrl }),
    /版本/,
    'A manifest with the wrong version should be rejected'
  )
  assert.throws(
    () => validatePublishedManifest({ ...manifest, downloadUrl: 'https://example.com/update.zip' }, { tag, version, sha256, downloadUrl }),
    /downloadUrl/,
    'A manifest with the wrong download URL should be rejected'
  )
  assert.throws(
    () => validatePublishedManifest({ ...manifest, releaseNotes: [] }, { tag, version, sha256, downloadUrl }),
    /发布说明/,
    'A manifest without release notes should be rejected'
  )

  let normalCalls = 0
  const normal = await verifyPublishedUpdate({
    tag,
    version,
    sha256,
    attempts: 1,
    delayMs: 0,
    fetchImpl: async (url, options) => {
      normalCalls += 1
      assert.equal(url, DEFAULT_FEED_URL)
      assert.equal(options.method, 'GET')
      assert.equal(options.redirect, 'follow')
      return response(manifest)
    }
  })
  assert.equal(normal.version, version)
  assert.equal(normalCalls, 1, 'A valid manifest should be accepted on the first request')

  let checksumCalls = 0
  await assert.rejects(
    verifyPublishedUpdate({
      tag,
      version,
      sha256,
      attempts: 2,
      delayMs: 0,
      fetchImpl: async () => {
        checksumCalls += 1
        return response({ ...manifest, sha256: 'b'.repeat(64) })
      }
    }),
    /SHA256/,
    'A checksum mismatch should fail verification'
  )
  assert.equal(checksumCalls, 2, 'A checksum mismatch should be retried')

  let transientCalls = 0
  const recovered = await verifyPublishedUpdate({
    tag,
    version,
    sha256,
    attempts: 2,
    delayMs: 0,
    fetchImpl: async () => {
      transientCalls += 1
      return transientCalls === 1 ? response({ message: 'not ready' }, 404) : response(manifest)
    }
  })
  assert.equal(recovered.version, version)
  assert.equal(transientCalls, 2, 'A transient 404 should be retried before succeeding')

  console.log('Published update verifier tests passed: 8 checks')
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
