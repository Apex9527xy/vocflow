const fs = require('node:fs')

const expected = String(process.argv[2] || '').replace(/^v/i, '').trim()
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
if (!expected) {
  console.error('Usage: node scripts/verify-release-version.cjs v1.0.1')
  process.exit(1)
}
if (pkg.version !== expected) {
  console.error(`Release tag v${expected} does not match package.json version ${pkg.version}.`)
  process.exit(1)
}
console.log(`Release version verified: ${pkg.version}`)
