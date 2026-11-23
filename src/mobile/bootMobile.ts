/**
 * Mobile / PWA only bootstrap.
 *
 * The desktop shell talks to the main process over IPC, so it must never pull the
 * browser data layer (sql.js + IndexedDB) into its bundle. Keeping this behind a
 * dynamic import that only the mobile build reaches avoids that dependency entirely.
 */
import { installMobileBridge } from './mobileApi'
import { initExamDb } from './exam/db'

export function bootMobileApp(): void {
  installMobileBridge()
  // Warm up the in-browser exam SQLite snapshot early; failures are non-fatal
  // and surface lazily when the exam module is first opened.
  initExamDb().catch(() => undefined)
}
