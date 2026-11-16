import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'cd.cc.vocflow',
  appName: 'VocFlow',
  webDir: 'dist-mobile',
  server: {
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: false
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile'
  }
}

export default config
