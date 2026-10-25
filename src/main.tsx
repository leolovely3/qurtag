import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { AppProviders } from './AppProviders';
import { installBootGuard } from './lib/bootGuard';
import { installPreloadErrorHandler } from './lib/chunkRecovery';
import { installExternalLinks } from './lib/externalLinks';
import { isNative } from './lib/platform';
import { installTextSizeClasses } from './lib/textSize';
import { captureChannel } from './lib/measures';
import { startErrorReports } from './lib/errors';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './index.css';

// The iPhone app follows the phone's text size at every size, the Accessibility ones included
// (src/index.css); screens change layout at the largest sizes (src/lib/textSize.ts).
if (isNative()) document.documentElement.classList.add('native-app');
installTextSizeClasses();

// Where the visit came from (?ch=, else utm_source), kept in this tab only (src/lib/measures.ts).
captureChannel();
// Errors to Sentry, with nothing personal (src/lib/errors.ts).
startErrorReports(isNative());

// Never a blank screen: a start-up failure shows a message with a Reload button.
installBootGuard();
// A deploy retires old page files; reload once rather than show a blank page.
installPreloadErrorHandler();

// In the iPhone app, links to other websites open in Safari's sheet (with a Done
// button back to the app) instead of replacing the app.
installExternalLinks(document, window, {
  native: isNative,
  baseHref: () => window.location.href,
  open: async (url) => {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  },
});

const root = document.getElementById('root')!;
const app = (
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>
);

// A public page arrives already written out (scripts/seo/prerender.mjs), so the browser picks it up
// rather than drawing it again. The iPhone app and every signed-in screen start from an empty page.
if (root.childElementCount > 0 && !isNative()) {
  hydrateRoot(root, app);
} else {
  root.replaceChildren();
  createRoot(root).render(app);
}
