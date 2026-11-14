import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { countSiteVisit } from './siteVisits';

/**
 * The root of the browser's router (src/router.tsx): counts each page once per tab for the anonymous page
 * view counter (siteVisits.ts), then shows the page. Every page counts, public or signed in. The effect runs
 * after the page has rendered, so counting never delays it.
 */
export function SiteVisitsRoot() {
  const { pathname } = useLocation();
  useEffect(() => {
    countSiteVisit();
  }, [pathname]);
  return <Outlet />;
}
