import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tektra.app',
  appName: 'TEKTRA',
  webDir: 'dist', // Asegúrate de que tu carpeta de construcción se llame 'dist'
  server: {
    // Hemos eliminado la línea de 'url'
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;