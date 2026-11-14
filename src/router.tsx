import { createBrowserRouter } from 'react-router-dom';
import { routes } from './routes';
import { SiteVisitsRoot } from './lib/useSiteVisits';

/**
 * The browser's router. The routes themselves are in src/routes.tsx, shared with the build-time prerender.
 * They sit under one root that counts each page view (src/lib/siteVisits.ts); the prerender does not count.
 */
export const router = createBrowserRouter([{ element: <SiteVisitsRoot />, children: routes }]);
