import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  base: './',
  define: {
    __VOCFLOW_USER_BUILD__: JSON.stringify(false),
    __VOCFLOW_MOBILE__: JSON.stringify(true),
    __VOCFLOW_CLOUD_ENDPOINT_JSON__: JSON.stringify('')
  },
  plugins: [vue()],
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
