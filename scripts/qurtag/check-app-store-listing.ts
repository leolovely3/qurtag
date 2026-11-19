/**
 * Pre-merge check: the App Store address that Home and Help link to (APP_STORE_URL in
 * src/lib/appStore.ts) answers HTTP 200 with the QuR Tag listing, so no visitor lands on a dead page.
 *
 *   npx tsx scripts/qurtag/check-app-store-listing.ts
 *
 * Exits 0 when the listing is live, 1 otherwise, with the reason on one line. Run it on the branch
 * that sets APP_STORE_URL, before that branch merges.
 */
import { APP_STORE_URL, isAppStoreListing } from '../../src/lib/appStore.js';

export type Verdict = { ok: boolean; reason: string };

export function listingVerdict(url: string | null, status: number | null, body: string | null): Verdict {
  if (!url) return { ok: false, reason: 'APP_STORE_URL is not set in src/lib/appStore.ts, so there is no listing to link to yet' };
  if (!isAppStoreListing(url)) return { ok: false, reason: `${url} is not an App Store listing address` };
  if (status !== 200) return { ok: false, reason: `${url} answers ${status ?? 'nothing'}, not 200` };
  if (!/QuR Tag/i.test(body ?? '')) return { ok: false, reason: `${url} answers 200 but is not the QuR Tag listing` };
  return { ok: true, reason: `${url} answers 200 with the QuR Tag listing` };
}

async function main(): Promise<void> {
  const url = APP_STORE_URL;
  let status: number | null = null;
  let body: string | null = null;
  if (url && isAppStoreListing(url)) {
    try {
      const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
      status = res.status;
      body = await res.text();
    } catch (err) {
      console.error(`Could not reach ${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const verdict = listingVerdict(url, status, body);
  console.log(`${verdict.ok ? 'PASS' : 'FAIL'}: ${verdict.reason}`);
  process.exitCode = verdict.ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
