/**
 * 判断当前是否为移动端 / 网页 PWA 构建。
 * 优先使用构建期注入的 __VOCFLOW_MOBILE__ 标志，运行期再用 UA 与窄屏兜底。
 */
export function isMobileBuild(): boolean {
  if (typeof __VOCFLOW_MOBILE__ !== 'undefined' && __VOCFLOW_MOBILE__) return true
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent.toLowerCase()
  const mobileUa = /android|iphone|ipad|ipod|mobile|harmonyos|micromessenger/.test(ua)
  const narrow = window.matchMedia('(max-width: 720px)').matches
  return mobileUa || narrow
}
