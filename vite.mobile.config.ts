import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { copyFileSync, cpSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// The mobile PWA reuses the same in-app pdf.js reader as the desktop build.
// The Vite build does not bundle the worker/cmaps/standard fonts by default, so
// copy them into dist-mobile/assets after the renderer bundle is written.
function copyPdfjsAssets(): Plugin {
  const root = fileURLToPath(new URL('./', import.meta.url))
  const outDir = path.join(root, 'dist-mobile')
  return {
    name: 'vocflow-copy-pdfjs-assets',
    closeBundle() {
      const pdfjsRoot = path.dirname(require.resolve('pdfjs-dist/package.json'))
      const assetsDir = path.join(outDir, 'assets')
      mkdirSync(assetsDir, { recursive: true })
      copyFileSync(
        path.join(pdfjsRoot, 'build', 'pdf.worker.min.mjs'),
        path.join(assetsDir, 'pdf.worker.min.mjs')
      )
      for (const directory of ['cmaps', 'standard_fonts']) {
        cpSync(
          path.join(pdfjsRoot, directory),
          path.join(assetsDir, 'pdfjs', directory),
          { recursive: true, force: true }
        )
      }
      // sql.js browser wasm for the in-browser exam data layer.
      const sqljsRoot = path.join(path.dirname(require.resolve('sql.js')), '..')
      copyFileSync(
        path.join(sqljsRoot, 'dist', 'sql-wasm-browser.wasm'),
        path.join(assetsDir, 'sql-wasm-browser.wasm')
      )
    }
  }
}

export default defineConfig({
  base: './',
  define: {
    __VOCFLOW_USER_BUILD__: JSON.stringify(false),
    __VOCFLOW_MOBILE__: JSON.stringify(true),
    __VOCFLOW_CLOUD_ENDPOINT_JSON__: JSON.stringify(''),
    __VOCFLOW_SQLJS_WASM_URL__: JSON.stringify('./assets/sql-wasm-browser.wasm')
  },
  plugins: [vue(), copyPdfjsAssets()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    outDir: 'dist-mobile',
    emptyOutDir: true,
    target: 'esnext',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vue: ['vue', 'vue-router', 'pinia']
        }
      }
    }
  }
})
