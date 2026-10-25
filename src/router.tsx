import { createBrowserRouter } from 'react-router-dom';
import { routes } from './routes';

/** The browser's router. The routes themselves are in src/routes.tsx, shared with the build-time prerender. */
export const router = createBrowserRouter(routes);
