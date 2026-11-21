// Minimal deterministic ZIP writer/reader built on Node's built-in zlib.
// The update package must not depend on PowerShell Compress-Archive /
// Expand-Archive: the latter's .NET overload resolution broke on newer
// Windows runners (Expand-Archive "Cannot find an overload for ExtractToDirectory").
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function collectZipEntries(dir) {
  const entries = []
  const walk = (abs, relParts) => {
    const stat = fs.statSync(abs)
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(abs).sort()) walk(path.join(abs, name), [...relParts, name])
      return
    }
    entries.push({ rel: relParts.join('/'), abs, size: stat.size })
  }
  walk(dir, [])
  return entries
}

function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
    crc32.table = table
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function zipDirectory(srcDir, zipFile) {
  const entries = collectZipEntries(srcDir)
  const localChunks = []
  const central = []
  let offset = 0
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.rel, 'utf8')
    const raw = fs.readFileSync(entry.abs)
    const crc = crc32(raw)
    const deflated = zlib.deflateRawSync(raw, { level: 9 })
    const useStored = deflated.length >= raw.length
    const payload = useStored ? raw : deflated
    const method = useStored ? 0 : 8

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // UTF-8 flag
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    localChunks.push(local, nameBuf, payload)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(0x0800, 8)
    cd.writeUInt16LE(method, 10)
    cd.writeUInt16LE(0, 12)
    cd.writeUInt16LE(0, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(payload.length, 20)
    cd.writeUInt32LE(raw.length, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt16LE(0, 30)
    cd.writeUInt16LE(0, 32)
    cd.writeUInt16LE(0, 34)
    cd.writeUInt16LE(0, 36)
    cd.writeUInt32LE(0, 38)
    cd.writeUInt32LE(offset, 42)
    central.push(cd, nameBuf)

    offset += local.length + nameBuf.length + payload.length
  }
  const centralBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  fs.mkdirSync(path.dirname(zipFile), { recursive: true })
  fs.writeFileSync(zipFile, Buffer.concat([...localChunks, centralBuf, eocd]))
  return entries.length
}

function unzipToDir(zipFile, destDir) {
  const buf = fs.readFileSync(zipFile)
  let p = 0
  let extracted = 0
  const rootPrefix = path.resolve(destDir) + path.sep
  while (p + 4 <= buf.length && buf.readUInt32LE(p) === 0x04034b50) {
    const method = buf.readUInt16LE(p + 8)
    const compSize = buf.readUInt32LE(p + 18)
    const nameLen = buf.readUInt16LE(p + 26)
    const extraLen = buf.readUInt16LE(p + 28)
    const name = buf.toString('utf8', p + 30, p + 30 + nameLen)
    const dataStart = p + 30 + nameLen + extraLen
    const payload = buf.subarray(dataStart, dataStart + compSize)
    const resolved = path.resolve(destDir, name)
    assert(resolved.startsWith(rootPrefix), `Refusing to extract outside destination: ${name}`)
    if (!name.endsWith('/')) {
      fs.mkdirSync(path.dirname(resolved), { recursive: true })
      const raw = method === 0 ? Buffer.from(payload) : zlib.inflateRawSync(payload)
      fs.writeFileSync(resolved, raw)
      extracted += 1
    }
    p = dataStart + compSize
  }
  return extracted
}

module.exports = { zipDirectory, unzipToDir }
