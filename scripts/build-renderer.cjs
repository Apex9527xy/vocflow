const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { createRequire } = require('node:module')
const { resolveCloudEndpoint } = require('./cloud-endpoint.cjs')

const root = process.cwd()
const USER_BUILD = process.env.VOCFLOW_USER_BUILD === '1'
const CLOUD_ENDPOINT = resolveCloudEndpoint(USER_BUILD)
function stripDeveloperBlocks(code) {
  if (!USER_BUILD) return code
  return code
    .replace(/\/\* VOCFLOW_DEVELOPER_ONLY_START \*\/[\s\S]*?\/\* VOCFLOW_DEVELOPER_ONLY_END \*\//g, '')
    .replace(/<!-- VOCFLOW_DEVELOPER_ONLY_START -->[\s\S]*?<!-- VOCFLOW_DEVELOPER_ONLY_END -->/g, '')
}
const projectRequire = createRequire(path.join(root, 'package.json'))
const typescript = projectRequire('typescript')
const compiler = projectRequire('vue/compiler-sfc')
const rollupDir = path.join(path.dirname(projectRequire.resolve('vite')), '..', '..', '..', 'rollup')
const { rollup } = require(fs.realpathSync(rollupDir))

const srcRoot = path.join(root, 'src')
const distRoot = path.join(root, 'dist')
const collectedStyles = []
const styleKeys = new Set()

function normalizeId(id) {
  return path.normalize(id.split('?')[0])
}

function hashId(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 8)
}

function fileExists(candidate) {
  try { return fs.statSync(candidate).isFile() } catch { return false }
}

function resolveAsFile(candidate) {
  if (fileExists(candidate)) return candidate
  for (const suffix of ['.ts', '.js', '.mjs', '.vue', '.json', '.css']) {
    if (fileExists(candidate + suffix)) return candidate + suffix
  }
  for (const name of ['index.ts', 'index.js', 'index.mjs', 'index.vue', 'index.json']) {
    const next = path.join(candidate, name)
    if (fileExists(next)) return next
  }
  return null
}

function packageRootFor(name) {
  const packageName = name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0]
  try {
    const pkgPath = projectRequire.resolve(`${packageName}/package.json`)
    return { packageName, pkgPath, pkg: JSON.parse(fs.readFileSync(pkgPath, 'utf8')) }
  } catch {
    return null
  }
}

function resolveBare(source, importer) {
  const special = {
    vue: 'vue/dist/vue.runtime.esm-bundler.js',
    pinia: 'pinia/dist/pinia.mjs',
    'vue-router': 'vue-router/dist/vue-router.mjs'
  }
  if (special[source]) return projectRequire.resolve(special[source])

  const packageName = source.startsWith('@') ? source.split('/').slice(0, 2).join('/') : source.split('/')[0]
  const isPackageRoot = source === packageName
  if (isPackageRoot) {
    try {
      const pkgPath = projectRequire.resolve(`${packageName}/package.json`, { paths: [path.dirname(importer)] })
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      const entry = pkg.module || pkg['jsnext:main'] || (typeof pkg.browser === 'string' ? pkg.browser : null) || pkg.main || 'index.js'
      const resolvedEntry = resolveAsFile(path.resolve(path.dirname(pkgPath), entry))
      if (resolvedEntry) return resolvedEntry
    } catch {}
  }

  try {
    return projectRequire.resolve(source, { paths: [path.dirname(importer)] })
  } catch (error) {
    throw new Error(`Cannot resolve "${source}" from ${importer}: ${error.message}`)
  }
}

function resolveId(source, importer) {
  if (source.startsWith('\0') || source.startsWith('virtual:')) return null
  let target = source
  if (target.startsWith('@/')) target = path.join(srcRoot, target.slice(2))
  if (target.startsWith('.')) target = path.resolve(path.dirname(importer), target)
  if (path.isAbsolute(target)) return resolveAsFile(target)
  const bare = resolveBare(target, importer || path.join(root, 'index.html'))
  return resolveAsFile(bare) || bare
}

function addStyle(css, key) {
  if (!css || styleKeys.has(key)) return
  styleKeys.add(key)
  collectedStyles.push(css)
}

function transpile(code, id) {
  code = stripDeveloperBlocks(code)
    .replaceAll('__VOCFLOW_USER_BUILD__', USER_BUILD ? 'true' : 'false')
    .replaceAll('__VOCFLOW_CLOUD_ENDPOINT_JSON__', JSON.stringify(CLOUD_ENDPOINT))
  const result = typescript.transpileModule(code, {
    fileName: id,
    reportDiagnostics: true,
    compilerOptions: {
      target: typescript.ScriptTarget.ES2020,
      module: typescript.ModuleKind.ESNext,
      moduleResolution: typescript.ModuleResolutionKind.Bundler,
      jsx: typescript.JsxEmit.Preserve,
      esModuleInterop: true,
      sourceMap: false,
      inlineSourceMap: false,
      removeComments: false
    }
  })
  const errors = (result.diagnostics || []).filter(d => d.category === typescript.DiagnosticCategory.Error)
  if (errors.length) {
    const text = errors.map(d => typescript.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n')
    throw new Error(`TypeScript transform failed for ${id}:\n${text}`)
  }
  return result.outputText
}

function buildVueModule(id, source) {
  source = stripDeveloperBlocks(source)
  const filename = normalizeId(id)
  const { descriptor, errors } = compiler.parse(source, { filename })
  if (errors.length) throw new Error(`Vue parse failed for ${filename}: ${errors.join('\n')}`)

  const scopeId = hashId(path.relative(root, filename))
  const hasScoped = descriptor.styles.some(style => style.scoped)
  let scriptCode = 'const __sfc__ = {}'
  let bindings

  if (descriptor.script || descriptor.scriptSetup) {
    const script = compiler.compileScript(descriptor, { id: scopeId, genDefaultAs: '__sfc__' })
    scriptCode = script.content
    bindings = script.bindings
  }

  let renderCode = ''
  if (descriptor.template) {
    const template = compiler.compileTemplate({
      source: descriptor.template.content,
      filename,
      id: scopeId,
      scoped: hasScoped,
      isProd: true,
      compilerOptions: { mode: 'module', bindingMetadata: bindings }
    })
    if (template.errors.length) {
      throw new Error(`Vue template compile failed for ${filename}: ${template.errors.join('\n')}`)
    }
    renderCode = template.code.replace('export function render', 'function render')
  }

  for (const style of descriptor.styles) {
    if (style.src) throw new Error(`External SFC styles are not supported: ${filename}`)
    const result = compiler.compileStyle({
      source: style.content,
      filename,
      id: `data-v-${scopeId}`,
      scoped: style.scoped,
      isProd: true
    })
    if (result.errors.length) {
      throw new Error(`Vue style compile failed for ${filename}: ${result.errors.join('\n')}`)
    }
    addStyle(result.code, `${filename}:style:${style.scoped ? 'scoped' : 'plain'}`)
  }

  const suffix = []
  if (renderCode) suffix.push('__sfc__.render = render')
  if (hasScoped) suffix.push(`__sfc__.__scopeId = ${JSON.stringify(`data-v-${scopeId}`)}`)
  suffix.push(`__sfc__.__file = ${JSON.stringify(path.relative(root, filename))}`)
  suffix.push('export default __sfc__')

  return transpile(`${scriptCode}\n${renderCode}\n${suffix.join('\n')}\n`, filename)
}

const plugins = [
  {
    name: 'cet4-resolver',
    resolveId(source, importer) {
      const resolved = resolveId(source, importer)
      return resolved || null
    }
  },
  {
    name: 'cet4-vue',
    load(id) {
      const filename = normalizeId(id)
      if (filename.endsWith('.vue')) {
        return buildVueModule(filename, fs.readFileSync(filename, 'utf8'))
      }
      return null
    }
  },
  {
    name: 'cet4-typescript',
    transform(code, id) {
      const filename = normalizeId(id)
      if (filename.endsWith('.ts') || filename.endsWith('.tsx')) {
        return transpile(code, filename)
      }
      return null
    }
  },
  {
    name: 'cet4-json',
    load(id) {
      const filename = normalizeId(id)
      if (!filename.endsWith('.json')) return null
      return `export default ${fs.readFileSync(filename, 'utf8')}`
    }
  },
  {
    name: 'cet4-css',
    load(id) {
      const filename = normalizeId(id)
      if (!filename.endsWith('.css')) return null
      addStyle(fs.readFileSync(filename, 'utf8'), filename)
      return 'export default ""'
    }
  },
  {
    name: 'cet4-production',
    transform(code) {
      return code
        .replaceAll('process.env.NODE_ENV', JSON.stringify('production'))
        .replaceAll('__VUE_OPTIONS_API__', 'true')
        .replaceAll('__VUE_PROD_DEVTOOLS__', 'false')
    }
  }
]

async function main() {
  const assetsRoot = path.join(distRoot, 'assets')
  fs.mkdirSync(assetsRoot, { recursive: true })
  fs.rmSync(path.join(assetsRoot, 'chunks'), { recursive: true, force: true })
  fs.rmSync(path.join(assetsRoot, 'app.js'), { force: true })
  fs.copyFileSync(
    path.join(root, 'resources', 'icon.png'),
    path.join(distRoot, 'assets', 'icon.png')
  )
  fs.cpSync(
    path.join(root, 'resources', 'ocr'),
    path.join(distRoot, 'assets', 'ocr'),
    { recursive: true, force: true }
  )
  const pdfjsRoot = path.dirname(projectRequire.resolve('pdfjs-dist/package.json'))
  fs.copyFileSync(
    path.join(pdfjsRoot, 'build', 'pdf.worker.min.mjs'),
    path.join(distRoot, 'assets', 'pdf.worker.min.mjs')
  )
  for (const directory of ['cmaps', 'standard_fonts']) {
    fs.cpSync(
      path.join(pdfjsRoot, directory),
      path.join(distRoot, 'assets', 'pdfjs', directory),
      { recursive: true, force: true }
    )
  }
  const bundle = await rollup({
    input: path.join(root, 'src', 'main.ts'),
    plugins,
    external(source) {
      return ['fs', 'http', 'https', 'url', 'canvas', 'path2d-polyfill'].includes(source)
    },
    onwarn(warning, warn) {
      if (warning.code === 'CIRCULAR_DEPENDENCY') return
      warn(warning)
    }
  })

  await bundle.write({
    dir: assetsRoot,
    format: 'es',
    entryFileNames: 'app.js',
    chunkFileNames: 'chunks/[name]-[hash].js',
    inlineDynamicImports: false,
    compact: true,
    minifyInternalExports: true,
    sourcemap: false
  })
  await bundle.close()

  fs.writeFileSync(path.join(assetsRoot, 'style.css'), collectedStyles.join('\n'), 'utf8')

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/png" href="./assets/icon.png" />
    <title>VocFlow</title>
    <link rel="stylesheet" href="./assets/style.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./assets/app.js"></script>
  </body>
</html>
`
  fs.writeFileSync(path.join(distRoot, 'index.html'), html, 'utf8')
  console.log(`Renderer build complete: ${distRoot}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
