import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync } from 'fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { resolveCloudEndpoint } = require('./scripts/cloud-endpoint.cjs') as {
  resolveCloudEndpoint: (userBuild?: boolean) => string
}
const userBuild = process.env.VOCFLOW_USER_BUILD === '1'
const cloudEndpoint = resolveCloudEndpoint(userBuild)

function copyPreload(): import('vite').Plugin {
  const src = resolve(__dirname, 'electron/preload.cjs')
  const destDir = resolve(__dirname, 'dist-electron')
  const dest = resolve(destDir, 'preload.cjs')

  function doCopy() {
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
    copyFileSync(src, dest)
  }

  return {
    name: 'copy-preload',
    buildStart() { doCopy() },
    writeBundle() { doCopy() }
  }
}

export default defineConfig({
  // Electron 35 runs Chromium 134; the legacy es2020 target made pdfjs-dist's top-level
  // await an outright build error. esnext keeps the desktop bundles buildable.
  build: {
    target: 'esnext',
    // sql.js ships a UMD/CJS bundle; the mixed-module transform is what lets the desktop
    // renderer bundle the shared mobile exam module instead of failing on its default export.
    commonjsOptions: {
      transformMixedEsModules: true
    }
  },
  // pdfjs-dist ships top-level await; the dependency pre-bundler needs the same modern target.
  esbuild: {
    target: 'esnext'
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext'
    }
  },
  define: {
    __VOCFLOW_USER_BUILD__: JSON.stringify(userBuild),
    __VOCFLOW_MOBILE__: JSON.stringify(false),
    __VOCFLOW_CLOUD_ENDPOINT_JSON__: JSON.stringify(cloudEndpoint)
  },
  plugins: [
    vue(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          define: {
            __VOCFLOW_USER_BUILD__: JSON.stringify(userBuild),
            __VOCFLOW_MOBILE__: JSON.stringify(false),
            __VOCFLOW_CLOUD_ENDPOINT_JSON__: JSON.stringify(cloudEndpoint)
          },
          build: {
            outDir: 'dist-electron',
            target: 'esnext',
            rollupOptions: {
              external: ['sql.js', 'canvas', 'pdfjs-dist', 'tesseract.js', 'tesseract.js-core']
            }
          }
        }
      }
    ]),
    copyPreload()
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
})
