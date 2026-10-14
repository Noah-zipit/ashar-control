import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ashar.control',
  appName: 'Ashar Control',
  webDir: 'out',
  backgroundColor: '#05090b',
  android: {
    backgroundColor: '#05090b',
    allowMixedContent: false,
  },
};

export default config;
