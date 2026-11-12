/*
 * Checks the web bundle synced into the Android project before it is built into an upload:
 *
 *   node scripts/native/check-android-bundle.mjs     (the last step of npm run cap:android)
 *
 * - the start page is the empty app shell, not the website's prerendered home page
 *   (scripts/seo/native-shell.mjs);
 * - the bundle talks to the live site and to no local test server (localhost, 10.0.2.2,
 *   127.0.0.1), unless QURTAG_ANDROID_TEST_BUILD=1 says this is an emulator test build;
 * - RevenueCat's public Android key (goog_...) is in the bundle, so Google Play Billing can sell,
 *   and the iPhone key is not needed;
 * - the Capacitor settings load nothing over plain http and point at no server address.
 * Prints what it checked; exits 1 on the first problem.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const assets = path.join(root, 'android', 'app', 'src', 'main', 'assets');
const pub = path.join(assets, 'public');
const testBuild = process.env.QURTAG_ANDROID_TEST_BUILD === '1';
const fail = (m) => {
  console.error(`Android bundle check FAILED: ${m}`);
  process.exit(1);
};

if (!fs.existsSync(path.join(pub, 'index.html'))) fail('android/app/src/main/assets/public/index.html is missing (run npm run cap:android)');
const index = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'dist', 'app-shell.html'), 'utf8');
if (index !== shell) fail('the start page is not the app shell (dist/app-shell.html)');

const js = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) js.push(fs.readFileSync(p, 'utf8'));
  }
};
walk(pub);
const all = js.join('\n');
if (!all.includes('https://www.qurtag.com')) fail('the live site address is not in the bundle');
const local = /https?:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2)(?::\d+)?\/api/.exec(all);
if (local && !testBuild) fail(`the bundle calls a local test server (${local[0]}); rebuild without VITE_QURTAG_API_URL`);
if (!/goog_[A-Za-z0-9]{20,}/.test(all)) fail('RevenueCat\'s public Android key (VITE_REVENUECAT_ANDROID_API_KEY) is not in the bundle');

const cap = JSON.parse(fs.readFileSync(path.join(assets, 'capacitor.config.json'), 'utf8'));
if (cap.appId !== 'app.impactconsultingai.qurtag') fail(`appId is ${cap.appId}`);
if (cap.android?.allowMixedContent && !testBuild) fail('android.allowMixedContent is on');
if (cap.android?.webContentsDebuggingEnabled && !testBuild) fail('android.webContentsDebuggingEnabled is on');
if (cap.server?.url || cap.server?.cleartext) {
  if (!testBuild) fail('capacitor.config.json points at a server address or allows cleartext');
}
console.log(`Android bundle OK${testBuild ? ' (emulator test build: local server allowed)' : ''}: app shell, live site, RevenueCat Android key, no mixed content.`);
