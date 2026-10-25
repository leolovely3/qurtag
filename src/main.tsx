import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { AuthProvider } from './lib/auth';
import { ToastProvider } from './components/ui/Toast';
import { ThemeProvider } from './lib/theme';
import { installBootGuard } from './lib/bootGuard';
import { installPreloadErrorHandler } from './lib/chunkRecovery';
import { installExternalLinks } from './lib/externalLinks';
import { isNative } from './lib/platform';
import './index.css';

if (isNative()) document.documentElement.classList.add('native-app');

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
