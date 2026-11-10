import type { CapacitorConfig } from '@capacitor/cli';

/* Capacitor configuration for the QuR Tag iPhone and Android apps.
 *
 * - `webDir` is Vite's build output. `npm run cap:sync` (iPhone) and `npm run cap:android`
 *   (Android) build it, put the empty app shell in place and sync it into the native project.
 * - `appId` is the bundle identifier registered with Apple and the package name on Google
 *   Play (android/app/build.gradle). Do not change it.
 * - The pages load from capacitor://localhost (iPhone) and https://localhost (Android), which
 *   serve no /api, so the apps call the live site by full address (src/lib/platform.ts) and
 *   the server answers both phone origins with CORS (server/auth/phoneCors.ts).
 */
/* An emulator test build (QURTAG_ANDROID_TEST_BUILD=1, with VITE_QURTAG_API_URL pointing at the
 * local test server over plain http) may load that server; an upload build never may, and
 * scripts/native/check-android-bundle.mjs refuses a bundle that would. */
const androidTestBuild = process.env.QURTAG_ANDROID_TEST_BUILD === '1';

const config: CapacitorConfig = {
  appId: 'app.impactconsultingai.qurtag',
  appName: 'QuR Tag',
  webDir: 'dist',
  ios: {
    // The page pads itself with the safe-area insets (src/index.css); the native view adds none.
    contentInset: 'never',
    backgroundColor: '#FFFFFF',
    // The app's own notification handler (ios/App/App/QurTagNotifications.swift) is the delegate, set
    // before launch finishes, so Reply typed in a notification works with the app closed.
    handleApplicationNotifications: false,
  },
  android: {
    // The page's own colour shows while it loads; the launch screen itself is near-black
    // with the mark (android/app/src/main/res/values/styles.xml).
    backgroundColor: '#FFFFFF',
    // Every address the app loads is https; a plain http one is refused.
    allowMixedContent: androidTestBuild,
    // Chrome's inspector can attach to an emulator test build, never to an upload build.
    webContentsDebuggingEnabled: androidTestBuild,
    // Every plugin but push. The Android app has no push (pushOffered() in src/lib/platform.ts):
    // leaving the plugin out keeps Firebase's libraries out of the Android app altogether.
    // A new plugin must be added here as well as to package.json.
    includePlugins: [
      '@capacitor/app',
      '@capacitor/browser',
      '@capacitor/filesystem',
      '@capacitor/share',
      '@capacitor/splash-screen',
      '@capacitor/status-bar',
      '@revenuecat/purchases-capacitor',
    ],
  },
  ...(androidTestBuild ? { server: { cleartext: true } } : {}),
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
