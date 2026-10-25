import type { CapacitorConfig } from '@capacitor/cli';

/* Capacitor configuration for the QuR Tag iPhone app.
 *
 * - `webDir` is Vite's build output. Run `npm run build` before `npx cap sync ios`
 *   (npm run cap:sync does both).
 * - `appId` is the bundle identifier registered with Apple. Do not change it.
 * - The pages load from capacitor://localhost, which serves no /api, so the app calls
 *   the live site by full address (src/lib/platform.ts) and the server answers the
 *   phone origin with CORS (server/auth/phoneCors.ts).
 */
const config: CapacitorConfig = {
  appId: 'app.impactconsultingai.qurtag',
  appName: 'QuR Tag',
  webDir: 'dist',
  ios: {
    // The page pads itself with the safe-area insets (src/index.css); the native view adds none.
    contentInset: 'never',
    backgroundColor: '#FFFFFF',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: '#0A0B0F',
      showSpinner: false,
    },
    StatusBar: { style: 'DEFAULT' },
  },
};

export default config;
