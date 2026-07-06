import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.smafnan.compound',
  appName: 'Compound',
  webDir: 'dist',
  backgroundColor: '#FBF7EE',
  android: {
    backgroundColor: '#FBF7EE',
  },
  ios: {
    backgroundColor: '#FBF7EE',
    contentInset: 'automatic',
  },
}

export default config
