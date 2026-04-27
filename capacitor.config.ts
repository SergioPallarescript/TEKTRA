import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.4e0d9fc553bd42a89c89255fb9318209',
  appName: 'TEKTRA',
  webDir: 'dist',
  server: {
    url: 'https://4e0d9fc5-53bd-42a8-9c89-255fb9318209.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;