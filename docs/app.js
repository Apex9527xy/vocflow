(function () {
  const repository = 'Apex9527xy/vocflow'
  const latestReleasePage = 'https://github.com/' + repository + '/releases/latest'
  const latestApi = 'https://api.github.com/repos/' + repository + '/releases/latest'
  const status = document.getElementById('release-status')
  const version = document.getElementById('latest-version')
  const description = document.getElementById('download-description')

  const downloads = {
    windows: {
      button: document.getElementById('download-primary'),
      checksum: document.getElementById('checksum-link'),
      asset: /-Setup\.exe$/i,
      checksumAsset: /-Setup\.exe\.sha256$/i,
      label: '下载 Windows 安装包'
    },
    android: {
      button: document.getElementById('download-android'),
      checksum: document.getElementById('checksum-android'),
      asset: /-android\.apk$/i,
      checksumAsset: /-android\.apk\.sha256$/i,
      label: '下载 Android APK'
    },
    ios: {
      button: document.getElementById('download-ios'),
      checksum: document.getElementById('checksum-ios'),
      asset: /-ios-unsigned\.ipa$/i,
      checksumAsset: /-ios-unsigned\.ipa\.sha256$/i,
      label: '下载未签名 IPA'
    }
  }

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

  function findAsset(assets, pattern) {
    return assets.find(function (asset) {
      return pattern.test(asset.name || '')
    })
  }

  function bindPlatform(config, assets) {
    const file = findAsset(assets, config.asset)
    const checksum = findAsset(assets, config.checksumAsset)
    if (!file || !file.browser_download_url) {
      config.button.href = latestReleasePage
      config.button.textContent = config.label + '（查看最新发布）'
      return false
    }
    config.button.href = file.browser_download_url
    config.button.textContent = config.label
    if (checksum && checksum.browser_download_url) {
      config.checksum.href = checksum.browser_download_url
    }
    return true
  }

  fetch(latestApi, { headers: { Accept: 'application/vnd.github+json' } })
    .then(function (response) {
      if (!response.ok) throw new Error('GitHub API ' + response.status)
      return response.json()
    })
    .then(function (release) {
      const tag = String(release.tag_name || '').replace(/^v/i, '')
      const assets = Array.isArray(release.assets) ? release.assets : []
      const available = Object.keys(downloads).filter(function (key) {
        return bindPlatform(downloads[key], assets)
      })

      if (tag) {
        version.textContent = 'v' + tag
        const published = formatDate(release.published_at)
        status.textContent = '最新版本 v' + tag + (published ? ' · ' + published + ' 发布' : '')
        if (available.length === 3) {
          description.textContent = 'Windows、Android 与 iPhone 安装包均已发布。请按设备选择下载，并使用 SHA256 校验文件核对完整性。'
        } else if (available.length > 0) {
          description.textContent = '当前发布包含部分平台安装包；未显示下载的移动端版本请前往 GitHub Release 查看。'
        } else {
          description.textContent = '当前最新发布尚未包含三端安装包，请前往 GitHub Release 查看历史版本。'
        }
      }
    })
    .catch(function () {
      version.textContent = 'RELEASE'
      status.textContent = '暂时无法读取版本信息，请前往 GitHub Release 查看最新版本。'
      description.textContent = '下载链接暂时无法自动更新，可前往 GitHub Release 选择 Windows、Android 或 iPhone 安装包。'
      Object.keys(downloads).forEach(function (key) {
        downloads[key].button.href = latestReleasePage
        downloads[key].checksum.href = latestReleasePage
      })
    })
})()