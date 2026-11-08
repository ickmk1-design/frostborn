import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cytbilisim.frostborn',
  appName: 'Frostborn: Last Camp',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
    preferredContentMode: 'mobile',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2500,
      launchAutoHide: true,
      backgroundColor: '#0a0a1a',
      iosSpinnerStyle: 'small',
      spinnerColor: '#aaddff',
      showSpinner: false,
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#000000',
      overlaysWebView: true,
    },
    ScreenOrientation: {
      // portrait is enforced via native configs
    },
  },
};

export default config;
