import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/variables.css'
import './styles/global.css'

async function boot(): Promise<void> {
  if (__VOCFLOW_MOBILE__) {
    document.documentElement.classList.add('vocflow-mobile')
    // Imported lazily: the mobile data layer (sql.js + IndexedDB) must stay out of the
    // desktop bundle, where the renderer reaches the native database over IPC.
    await import('./mobile/bootMobile')
      .then(module => module.bootMobileApp())
      .catch(() => undefined)
  }

  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.mount('#app')

  if (__VOCFLOW_MOBILE__ && 'serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        // The PWA remains fully usable when service worker registration is unavailable.
      })
    })
  }
}

void boot()
