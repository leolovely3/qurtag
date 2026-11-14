/**
 * Anonymous page views for every visitor, signed in or not.
 *
 * Each page load adds one to qurtag.site_visits for (today, route pattern, source) through
 * qurtag.record_visit (db/page-views.sql, rollout step 18). The rules for what is sent live in
 * visitCounter.ts: the route pattern, never the address, and a one-word source, never the referring
 * site; once per page per tab; nothing from scripted browsers or crawlers. It sets no cookie and
 * keeps nothing about the person.
 *
 * The call is made with no pass, as a visitor: the data API runs it as qurtag_anon, which may call only
 * this and the Factory's counts. It is never awaited and its failure is swallowed, so a database that has not
 * had step 18 yet changes nothing for the page.
 */
import { PostgrestClient } from '@supabase/postgrest-js';
import { serverUrl } from './platform';
import { countThisPage } from './visitCounter';
import { KEEP_SLUG, TAG_PARAMS, UNKNOWN, VISIT_ROUTES } from './siteVisitRoutes';

const visitor = new PostgrestClient(serverUrl('/api/data'), { schema: 'qurtag' });

/** Count the page now showing. Never throws, never awaited. */
export function countSiteVisit(): void {
  countThisPage(
    (path, source) => {
      void Promise.resolve(visitor.rpc('record_visit', { p_path: path, p_source: source })).then(() => undefined, () => undefined);
    },
    { patterns: [...VISIT_ROUTES, ...UNKNOWN], keep: KEEP_SLUG, tagParams: TAG_PARAMS },
  );
}
