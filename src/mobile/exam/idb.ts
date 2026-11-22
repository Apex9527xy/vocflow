/**
 * Browser IndexedDB storage for the mobile exam subsystem.
 *
 * Two stores:
 *  - `db-snapshot`: holds the exported sql.js database bytes (one record), so the
 *    in-memory SQLite state survives reloads without a native file system.
 *  - `files`: holds imported PDF / audio bytes keyed by an opaque resource id,
 *    since the browser has no local file paths.
 */

const DB_NAME = 'vocflow-mobile-exam'
// v2: rebuild the files store if an older createObjectStore() left it without an
// in-line keyPath ('id'); that made put() fail with "out-of-line keys and has no
// key generator and the key parameter was not provided".
const DB_VERSION = 2
const SNAPSHOT_STORE = 'db-snapshot'
const FILE_STORE = 'files'

const SNAPSHOT_KEY = 'main'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolveOpen, rejectOpen) => {
    if (typeof indexedDB === 'undefined') {
      rejectOpen(new Error('当前浏览器不支持本地数据库'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      const transaction = request.transaction
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE)
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE, { keyPath: 'id' })
      } else {
        // Existing store may predate the in-line keyPath; rebuild only when the
        // shape is wrong so current data keeps its upgrade path intact.
        const existing = transaction?.objectStore(FILE_STORE)
        if (existing && existing.keyPath !== 'id') {
          db.deleteObjectStore(FILE_STORE)
          db.createObjectStore(FILE_STORE, { keyPath: 'id' })
        }
      }
    }
    request.onsuccess = () => resolveOpen(request.result)
    request.onerror = () => rejectOpen(request.error || new Error('本地真题库打开失败'))
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('数据库事务失败'))
    tx.onabort = () => reject(tx.error || new Error('数据库事务被中止'))
  })
}

/** Read the last persisted sql.js database snapshot, if any. */
export async function loadDbSnapshot(): Promise<ArrayBuffer | null> {
  const db = await openDb()
  try {
    const record = await new Promise<any>((resolveGet, rejectGet) => {
      const tx = db.transaction(SNAPSHOT_STORE, 'readonly')
      const request = tx.objectStore(SNAPSHOT_STORE).get(SNAPSHOT_KEY)
      request.onsuccess = () => resolveGet(request.result)
      request.onerror = () => rejectGet(request.error || new Error('读取数据库快照失败'))
    })
    return record?.bytes ? (record.bytes as ArrayBuffer) : null
  } finally {
    db.close()
  }
}

/** Persist the exported sql.js database bytes. */
export async function saveDbSnapshot(bytes: ArrayBuffer): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(SNAPSHOT_STORE, 'readwrite')
    const store = tx.objectStore(SNAPSHOT_STORE)
    const record = { key: SNAPSHOT_KEY, bytes, savedAt: Date.now() }
    // The snapshot store is created without a keyPath, so the key must be passed
    // explicitly; omitting it throws DataError and silently loses every commit.
    if (store.keyPath == null) store.put(record, SNAPSHOT_KEY)
    else store.put(record)
    await txDone(tx)
  } finally {
    db.close()
  }
}

/** Store an imported file's bytes; returns the generated resource id. */
export async function putExamFile(resourceId: string, bytes: ArrayBuffer, fileName: string, mime: string): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(FILE_STORE, 'readwrite')
    const store = tx.objectStore(FILE_STORE)
    const record = { id: resourceId, bytes, fileName, mime, savedAt: Date.now() }
    // Out-of-line stores need the key passed explicitly; in-line ones reject it.
    if (store.keyPath == null) store.put(record, resourceId)
    else store.put(record)
    await txDone(tx)
  } finally {
    db.close()
  }
}

export async function getExamFile(resourceId: string): Promise<{ bytes: ArrayBuffer; fileName: string; mime: string } | null> {
  const db = await openDb()
  try {
    const record = await new Promise<any>((resolveGet, rejectGet) => {
      const tx = db.transaction(FILE_STORE, 'readonly')
      const request = tx.objectStore(FILE_STORE).get(resourceId)
      request.onsuccess = () => resolveGet(request.result)
      request.onerror = () => rejectGet(request.error || new Error('读取真题文件失败'))
    })
    if (!record) return null
    // Return a copy so consumers (pdf.js) detaching their buffer cannot
    // detach the ArrayBuffer kept inside the IndexedDB record.
    const bytes = (record.bytes as ArrayBuffer).slice(0)
    return { bytes, fileName: String(record.fileName || ''), mime: String(record.mime || '') }
  } finally {
    db.close()
  }
}

export async function deleteExamFile(resourceId: string): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(FILE_STORE, 'readwrite')
    tx.objectStore(FILE_STORE).delete(resourceId)
    await txDone(tx)
  } finally {
    db.close()
  }
}
