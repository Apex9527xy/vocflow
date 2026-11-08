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
  define: {
    __VOCFLOW_USER_BUILD__: JSON.stringify(userBuild),
    __VOCFLOW_CLOUD_ENDPOINT_JSON__: JSON.stringify(cloudEndpoint)
  },
  plugins: [
    vue(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['sql.js', 'canvas', 'pdfjs-dist']
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
