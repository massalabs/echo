import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'net.massa.gossip',
  appName: 'Gossip',
  webDir: 'dist',
  plugins: {
    StatusBar: {
      style: 'dark',
      overlaysWebView: false,
    },
  },
};

export default config;
