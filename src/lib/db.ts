/**
 * How the owner's screens reach their data: QuR Tag's own data API at /api/data (the
 * Vercel function api/data/index.ts), never the shared Supabase project's API.
 *
 *   const { data } = await db.from('items').select('*').eq('household_id', id);
 *   const { data } = await db.rpc('create_item', { p_name: 'Violin case' });
 *
 * The client is postgrest-js, the query builder supabase-js used, so screens keep their
 * queries; the data API answers the requests PostgREST would for the calls the app
 * makes (server/data/translate.ts). Every request carries the signed-in person's pass.
 *
 * There is no live push of changes: screens that need fresh data (the inbox, a
 * conversation) ask again every few seconds (`POLL_MS`).
 */
import { PostgrestClient } from '@supabase/postgrest-js';
import { getDataPass } from './authClient';
import { serverUrl } from './platform';

export const POLL_MS = 10_000;

const withPass: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers);
  const pass = await getDataPass();
  if (pass) headers.set('Authorization', `Bearer ${pass}`);
  else headers.delete('Authorization');
  return fetch(input, { ...init, headers });
};

// Untyped at the boundary; queries.ts gives each answer its row type.
export const db = new PostgrestClient(serverUrl('/api/data'), { schema: 'qurtag', fetch: withPass });

/**
 * For the code of features that are not built yet (src/lib/features.ts): they used to
 * call Supabase Edge Functions that this backend does not have. Every call answers
 * "not available" without a request.
 */
export async function notBuilt<T>(feature: string): Promise<{ data: T | null; error: { message: string } }> {
  return { data: null, error: { message: `${feature} is not available yet.` } };
}
