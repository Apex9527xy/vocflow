const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { resolveCloudEndpoint } = require('./cloud-endpoint.cjs')

const root = process.cwd()
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
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
const rollupDir = path.join(path.dirname(projectRequire.resolve('vite')), '..', '..', '..', 'rollup')
const { rollup } = require(fs.realpathSync(rollupDir))

function fileExists(candidate) {
  try { return fs.statSync(candidate).isFile() } catch { return false }
}

function resolveAsFile(candidate) {
  if (fileExists(candidate)) return candidate
  for (const suffix of ['.ts', '.js', '.mjs', '.json']) {
    if (fileExists(candidate + suffix)) return candidate + suffix
  }
  for (const name of ['index.ts', 'index.js', 'index.mjs']) {
    const next = path.join(candidate, name)
    if (fileExists(next)) return next
  }
  return null
}

function transpile(code, id) {
  code = stripDeveloperBlocks(code)
    .replaceAll('__VOCFLOW_USER_BUILD__', USER_BUILD ? 'true' : 'false')
    .replaceAll('__VOCFLOW_CLOUD_ENDPOINT_JSON__', JSON.stringify(CLOUD_ENDPOINT))
  const result = typescript.transpileModule(code, {
    fileName: id,
    reportDiagnostics: true,
    compilerOptions: {
      target: typescript.ScriptTarget.ES2022,
      module: typescript.ModuleKind.ESNext,
      moduleResolution: typescript.ModuleResolutionKind.Bundler,
      esModuleInterop: true,
      sourceMap: false,
      inlineSourceMap: false,
      removeComments: false
    }
  })
  const errors = (result.diagnostics || []).filter(item => item.category === typescript.DiagnosticCategory.Error)
  if (errors.length) {
    throw new Error(errors.map(item => typescript.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'))
  }
  return result.outputText
}

const plugins = [
  {
    name: 'cet4-main-resolver',
    resolveId(source, importer) {
      if (source.startsWith('\0')) return null
      if (source.startsWith('.')) return resolveAsFile(path.resolve(path.dirname(importer), source))
      if (path.isAbsolute(source)) return resolveAsFile(source)
      return null
    }
  },
  {
    name: 'cet4-main-typescript',
    transform(code, id) {
      if (id.endsWith('.ts') || id.endsWith('.tsx')) return transpile(code, id)
      return null
    }
  }
]

async function main() {
  fs.mkdirSync(path.join(root, 'dist-electron'), { recursive: true })
  const bundle = await rollup({
    input: path.join(root, 'electron', 'main.ts'),
    plugins,
    external(source, importer) {
      if (!source) return false
      if (source.startsWith('\0') || source.startsWith('.') || path.isAbsolute(source)) return false
      return true
    },
    onwarn(warning, warn) {
      if (warning.code === 'CIRCULAR_DEPENDENCY') return
      warn(warning)
    }
  })
  await bundle.write({
    file: path.join(root, 'dist-electron', 'main.js'),
    format: 'es',
    inlineDynamicImports: true,
    sourcemap: false
  })
  await bundle.close()
  const preloadSource = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8')
  fs.writeFileSync(
    path.join(root, 'dist-electron', 'preload.cjs'),
    stripDeveloperBlocks(preloadSource)
      .replaceAll('__VOCFLOW_USER_BUILD__', USER_BUILD ? 'true' : 'false')
      .replaceAll('__VOCFLOW_CLOUD_ENDPOINT_JSON__', JSON.stringify(CLOUD_ENDPOINT)),
    'utf8'
  )
  fs.copyFileSync(
    path.join(root, 'electron', 'capture-preload.cjs'),
    path.join(root, 'dist-electron', 'capture-preload.cjs')
  )
  fs.copyFileSync(
    path.join(root, 'electron', 'ad-preload.cjs'),
    path.join(root, 'dist-electron', 'ad-preload.cjs')
  )
  fs.writeFileSync(
    path.join(root, 'dist-electron', 'build-info.json'),
    JSON.stringify({
      schemaVersion: 1,
      version: pkg.version,
      buildEdition: USER_BUILD ? 'user' : 'developer',
      userBuild: USER_BUILD,
      cloudEndpoint: CLOUD_ENDPOINT,
      builtAt: new Date().toISOString()
    }, null, 2) + '\n',
    'utf8'
  )
  console.log('Main process build complete')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
