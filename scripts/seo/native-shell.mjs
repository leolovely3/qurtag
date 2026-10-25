/*
 * For the iPhone app: puts the empty app shell where Capacitor expects the start page.
 *
 * `npm run build` writes the finished home page to dist/index.html, which is right for the
 * website. The iPhone app loads dist/index.html too, but it opens to the app, not the home page,
 * so it must start from the empty shell (dist/app-shell.html) or it would flash the home page
 * first. `npm run cap:sync` runs this between the build and `cap sync`.
 */
import { copyFile } from 'node:fs/promises';
import path from 'node:path';

const dist = path.join(process.cwd(), 'dist');
await copyFile(path.join(dist, 'app-shell.html'), path.join(dist, 'index.html'));
console.log('dist/index.html is now the app shell, for the iPhone app.');
