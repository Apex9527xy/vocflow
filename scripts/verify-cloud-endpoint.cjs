const { resolveCloudEndpoint } = require('./cloud-endpoint.cjs')

async function main() {
  const endpoint = resolveCloudEndpoint(true)
  if (process.env.VOCFLOW_SKIP_ENDPOINT_HEALTHCHECK === '1') {
    console.warn(`WARNING: cloud endpoint health check skipped for staging build: ${endpoint}`)
    return
  }
  const target = `${endpoint}/health`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(target, {
      method: 'GET',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'VocFlow-release-preflight/1.0'
      },
      signal: controller.signal
    })
    if (!response.ok) {
      throw new Error(`生产云端健康检查失败：HTTP ${response.status}`)
    }
    if (new URL(response.url || target).origin !== new URL(endpoint).origin) {
      throw new Error('生产云端健康检查发生了跨域跳转')
    }
    const payload = await response.json().catch(() => null)
    if (!payload || payload.ok !== true || payload.service !== 'vocflow-cloud') {
      throw new Error('生产云端健康检查返回的内容不是 VocFlow 云服务')
    }
    if (payload.accountFeatures !== false || payload.adConfig !== true || payload.appUpdate !== true) {
      throw new Error('生产云端点功能标记不正确')
    }
    console.log(`Production cloud endpoint verified: ${endpoint}`)
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error(`生产云端健康检查超时：${target}`)
    }
    if (error instanceof TypeError) {
      throw new Error(`无法连接生产云端健康检查地址：${target}`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
