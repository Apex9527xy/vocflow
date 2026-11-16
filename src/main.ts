import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/variables.css'
import './styles/global.css'
import { installMobileBridge } from './mobile/mobileApi'

if (__VOCFLOW_MOBILE__) {
  installMobileBridge()
  document.documentElement.classList.add('vocflow-mobile')
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
