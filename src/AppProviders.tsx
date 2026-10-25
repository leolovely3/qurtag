import type { ReactNode } from 'react';
import { AuthProvider } from './lib/auth';
import { ToastProvider } from './components/ui/Toast';
import { ThemeProvider } from './lib/theme';

/** What every screen sits inside. Used by the browser (src/main.tsx) and the build-time prerender (src/seo/entry-server.tsx). */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
