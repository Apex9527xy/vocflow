/**
 * Desktop stand-in for sql.js.
 *
 * The desktop renderer talks to the native database through IPC and never boots the
 * mobile data layer, but Rollup still has to resolve the dynamic mobile chunk at build
 * time. This stub keeps that chunk resolvable without pulling a UMD/CJS package that
 * the desktop bundler cannot transform.
 */
function initSqlJsStub() {
  throw new Error('sql.js 仅在移动端 PWA 构建中可用')
}

export default initSqlJsStub
