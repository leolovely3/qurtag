import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router-dom';
import { routes } from '../routes';
import { AppProviders } from '../AppProviders';

/**
 * Renders a public page to HTML at build time. scripts/seo/prerender.mjs builds this file for
 * the server (`vite build --ssr`), calls `render` for each page in src/seo/pages.ts, and writes the
 * result into the built index.html. The browser then hydrates the page (src/main.tsx).
 *
 * Only the public pages are rendered. Anything signed-in loads on demand (src/routes.tsx), so
 * rendering here never touches the app, the browser's storage or the network.
 */
export { PUBLIC_PAGES, pageUrl, SITE_ORIGIN, SITE_NAME, SHARE_IMAGE, SHARE_IMAGE_ALT } from './pages';
export { homeStructuredData, faqStructuredData } from './structured';

export async function render(path: string): Promise<{ html: string; status: number }> {
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request(`https://www.qurtag.com${path}`));
  if (context instanceof Response) throw new Error(`${path} redirects; only pages are rendered`);
  const router = createStaticRouter(handler.dataRoutes, context);
  const html = renderToString(
    <StrictMode>
      <AppProviders>
        <StaticRouterProvider router={router} context={context} hydrate={false} />
      </AppProviders>
    </StrictMode>,
  );
  // The catch-all route is the "page not found" page, which the site answers with status 404.
  const notFound = context.matches.some((m) => m.route.path === '*');
  return { html, status: notFound ? 404 : context.statusCode };
}
