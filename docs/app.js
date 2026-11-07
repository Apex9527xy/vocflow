(function () {
  const repository = 'Apex9527xy/vocflow'
  const latestReleasePage = 'https://github.com/' + repository + '/releases/latest'
  const latestApi = 'https://api.github.com/repos/' + repository + '/releases/latest'
  const primary = document.getElementById('download-primary')
  const secondary = document.getElementById('download-secondary')
  const checksum = document.getElementById('checksum-link')
  const status = document.getElementById('release-status')
  const version = document.getElementById('latest-version')
  const description = document.getElementById('download-description')

  function formatDate(value) {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(date)
  }

  fetch(latestApi, { headers: { Accept: 'application/vnd.github+json' } })
    .then(function (response) {
      if (!response.ok) throw new Error('GitHub API ' + response.status)
      return response.json()
    })
    .then(function (release) {
      const tag = String(release.tag_name || '').replace(/^v/i, '')
      const assets = Array.isArray(release.assets) ? release.assets : []
      const installer = assets.find(function (asset) {
        return /-Setup\.exe$/i.test(asset.name || '')
      })
      const checksumAsset = assets.find(function (asset) {
        return /-Setup\.exe\.sha256$/i.test(asset.name || '')
      })

      if (installer && installer.browser_download_url) {
        primary.href = installer.browser_download_url
        secondary.href = installer.browser_download_url
        secondary.textContent = '下载 Windows 安装包'
      }
      if (checksumAsset && checksumAsset.browser_download_url) {
        checksum.href = checksumAsset.browser_download_url
      }
      if (tag) {
        version.textContent = 'v' + tag
        const published = formatDate(release.published_at)
        status.textContent = '最新版本 v' + tag + (published ? ' · ' + published + ' 发布' : '')
        description.textContent = '当前 Windows 正式版为 v' + tag + '。安装包通过 GitHub Release 的 HTTPS 链接分发，并提供 SHA256 校验文件。'
      }
    })
    .catch(function () {
      version.textContent = 'RELEASE'
      status.textContent = '暂时无法读取版本信息，请前往 GitHub Release 查看最新版本。'
      checksum.href = latestReleasePage
    })
})()
