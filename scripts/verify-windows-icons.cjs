const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const REQUIRED_ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readPngSize(file) {
  const buffer = fs.readFileSync(file)
  assert(buffer.length >= 24 && buffer.subarray(0, 8).equals(PNG_SIGNATURE), `Invalid PNG file: ${file}`)
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

function readIcoSizes(file) {
  const buffer = fs.readFileSync(file)
  assert(buffer.length >= 6 && buffer.readUInt16LE(0) === 0 && buffer.readUInt16LE(2) === 1, `Invalid ICO file: ${file}`)
  const count = buffer.readUInt16LE(4)
  assert(count > 0, `ICO file has no images: ${file}`)
  const sizes = []
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16
    assert(entry + 16 <= buffer.length, `Truncated ICO directory: ${file}`)
    const width = buffer[entry] || 256
    const height = buffer[entry + 1] || 256
    assert(width === height, `ICO frame is not square: ${width}x${height}`)
    const bytes = buffer.readUInt32LE(entry + 8)
    const offset = buffer.readUInt32LE(entry + 12)
    assert(bytes > 0 && offset + bytes <= buffer.length, `ICO frame data is invalid: ${width}x${height}`)
    assert(buffer.subarray(offset, offset + 8).equals(PNG_SIGNATURE), `ICO frame must be PNG compressed: ${width}x${height}`)
    sizes.push(width)
  }
  return sizes
}

function extractAssociatedIconHash(file) {
  const escaped = path.resolve(file).replace(/'/g, "''")
  const script = `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon('${escaped}')
if ($null -eq $icon) { throw 'No associated icon found: ${escaped}' }
$bitmap = $icon.ToBitmap()
$stream = New-Object System.IO.MemoryStream
$bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
$sha = [System.Security.Cryptography.SHA256]::Create()
$hash = [System.BitConverter]::ToString($sha.ComputeHash($stream.ToArray())).Replace('-', '').ToLowerInvariant()
$stream.Dispose()
$bitmap.Dispose()
$icon.Dispose()
Write-Output $hash
`
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    encoding: 'utf8',
    windowsHide: true
  })
  if (result.error) throw result.error
  assert(result.status === 0, `Unable to read Windows icon from ${file}: ${(result.stderr || '').trim()}`)
  const hash = String(result.stdout || '').trim().split(/\r?\n/).pop() || ''
  assert(/^[a-f0-9]{64}$/.test(hash), `Unexpected icon hash for ${file}: ${hash}`)
  return hash
}

function verifyWindowsIcons({ iconPng, iconIco, appExe, installerExe }) {
  for (const [label, file] of Object.entries({ iconPng, iconIco, appExe, installerExe })) {
    assert(file && fs.existsSync(file) && fs.statSync(file).isFile(), `Missing ${label}: ${file}`)
  }

  const png = readPngSize(iconPng)
  assert(png.width === png.height && png.width >= 256, `Application PNG icon must be square and at least 256px: ${png.width}x${png.height}`)
  const sizes = readIcoSizes(iconIco)
  for (const size of REQUIRED_ICO_SIZES) {
    assert(sizes.includes(size), `Windows ICO icon is missing ${size}x${size}`)
  }

  const iconHash = extractAssociatedIconHash(iconIco)
  const appHash = extractAssociatedIconHash(appExe)
  const installerHash = extractAssociatedIconHash(installerExe)
  assert(appHash === iconHash, `Application executable icon does not match resources/icon.ico: ${appExe}`)
  assert(installerHash === iconHash, `Installer executable icon does not match resources/icon.ico: ${installerExe}`)

  return { iconHash, appHash, installerHash, png, icoSizes: sizes }
}

if (require.main === module) {
  const root = process.cwd()
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const appExe = process.argv[2] || path.join(root, 'release', 'user-nsis', 'win-unpacked', 'VocFlow.exe')
  const installerExe = process.argv[3] || path.join(root, 'release', 'user-nsis', `VocFlow-${packageJson.version}-Setup.exe`)
  const result = verifyWindowsIcons({
    iconPng: path.join(root, 'resources', 'icon.png'),
    iconIco: path.join(root, 'resources', 'icon.ico'),
    appExe,
    installerExe
  })
  console.log(`Windows icons are consistent: ${result.iconHash}`)
}

module.exports = { verifyWindowsIcons, readIcoSizes, readPngSize }
