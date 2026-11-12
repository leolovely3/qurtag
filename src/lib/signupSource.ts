/**
 * Where a new account came from (db/signup-source.sql, rollout step 16).
 *
 * On the first page of the visit (src/main.tsx) the browser notes the link's utm_* tags, the referring page
 * and the first page's path in this tab's sessionStorage (no cookie), and works out a channel from them. Once
 * the person is signed in, the app calls qurtag.record_signup_source once; the database writes it only for an
 * account made in the last 7 days, and never overwrites the first touch. The old single label
 * (src/lib/measures.ts, ?ch=) is a separate record and is left alone.
 *
 * Kept as small as it can be: the five utm_* tags, the referring page without its query or hash, the first page's
 * path (a tag's page is /find/:id, never its code), and the channel. Never a name, an email, a tag code or an id.
 */

export const SIGNUP_SOURCE_KEY = 'qurtag.signupSource';
const RECORDED_PREFIX = 'qurtag.signupSourceRecorded:';

export const CHANNELS = ['paid_search', 'organic_search', 'paid_social', 'organic_social', 'email', 'partner', 'ai', 'referral', 'direct'] as const;
export type Channel = (typeof CHANNELS)[number];

export interface SignupSource {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  referrer_url: string | null;
  landing_path: string | null;
  acquisition_channel: Channel;
  captured_at: string;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

const AI_HOSTS = ['chatgpt.com', 'chat.openai.com', 'perplexity.ai', 'gemini.google.com', 'copilot.microsoft.com', 'claude.ai'];
const SOCIAL_HOSTS = ['facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'threads.net', 'x.com', 'twitter.com', 't.co', 'linkedin.com', 'lnkd.in', 'reddit.com', 'redd.it', 'tiktok.com', 'youtube.com', 'youtu.be', 'pinterest.com', 'nextdoor.com'];
const SEARCH_HOSTS = ['bing.com', 'duckduckgo.com', 'ecosia.org', 'search.brave.com', 'startpage.com', 'qwant.com', 'yahoo.com', 'yandex.com', 'ask.com'];
const GOOGLE = /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/;
const under = (host: string, domains: string[]) => domains.some((d) => host === d || host.endsWith(`.${d}`));
const PLAIN_SEGMENT = /^[a-z][a-z-]{0,30}$/;

function param(search: string, name: string): string | null {
  try {
    const v = new URLSearchParams(search).get(name);
    return v && v.trim() ? v.trim().slice(0, 100) : null;
  } catch {
    return null;
  }
}

/** The referring page without its query or hash, or null when it is not a web address. */
export function cleanReferrer(referrer: string): string | null {
  try {
    const u = new URL(referrer);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.origin}${u.pathname}`.slice(0, 512);
  } catch {
    return null;
  }
}

/** The first page's path: any segment that is not a plain lower-case word (a tag code, a short code, an id) becomes ":id". */
export function landingPath(pathname: string): string | null {
  const segs = (pathname || '/').split('?')[0].split('#')[0].split('/').filter(Boolean).slice(0, 5);
  const out = '/' + segs.map((s) => (PLAIN_SEGMENT.test(s) ? s : ':id')).join('/');
  return out.length <= 100 ? out : null;
}

/** The tags first, then the kind of referring site, else direct. A visit from our own site is direct. */
export function inferChannel(p: { utm_source: string | null; utm_medium: string | null; referrer: string | null; ownHost?: string }): Channel {
  const medium = (p.utm_medium ?? '').toLowerCase();
  const source = (p.utm_source ?? '').toLowerCase();
  if (['cpc', 'ppc', 'paid_search', 'paidsearch'].includes(medium)) return 'paid_search';
  if (['email', 'newsletter'].includes(medium)) return 'email';
  if (['paid_social', 'paid-social', 'cpm', 'display'].includes(medium)) return 'paid_social';
  if (['affiliate', 'partner'].includes(medium)) return 'partner';
  if (medium === 'social') return 'organic_social';
  if (medium === 'referral') return 'referral';
  if (!medium && (source.includes('google') || source.includes('bing'))) return 'organic_search';
  if (!medium && ['facebook', 'instagram', 'x', 'twitter', 'linkedin', 'reddit', 'tiktok', 'youtube'].includes(source)) return 'organic_social';
  let host: string | null = null;
  try {
    host = p.referrer ? new URL(p.referrer).hostname.toLowerCase().replace(/^www\./, '') : null;
  } catch {
    host = null;
  }
  const own = (p.ownHost ?? '').toLowerCase().replace(/^www\./, '');
  if (host && host !== own) {
    if (under(host, AI_HOSTS)) return 'ai';
    if (under(host, SOCIAL_HOSTS)) return 'organic_social';
    if (GOOGLE.test(host) || under(host, SEARCH_HOSTS)) return 'organic_search';
    return 'referral';
  }
  return 'direct';
}

export interface CaptureEnv {
  search: string;
  referrer: string;
  pathname: string;
  hostname: string;
  storage: Store;
  now?: Date;
}

/** First page of the visit: keep the source for this tab. A later page never overwrites it. */
export function captureSignupSource(env: CaptureEnv): SignupSource | null {
  try {
    if (env.storage.getItem(SIGNUP_SOURCE_KEY)) return null;
    const utm_source = param(env.search, 'utm_source');
    const utm_medium = param(env.search, 'utm_medium');
    const referrer_url = cleanReferrer(env.referrer);
    const src: SignupSource = {
      utm_source,
      utm_medium,
      utm_campaign: param(env.search, 'utm_campaign'),
      utm_term: param(env.search, 'utm_term'),
      utm_content: param(env.search, 'utm_content'),
      referrer_url,
      landing_path: landingPath(env.pathname),
      acquisition_channel: inferChannel({ utm_source, utm_medium, referrer: referrer_url, ownHost: env.hostname }),
      captured_at: (env.now ?? new Date()).toISOString(),
    };
    env.storage.setItem(SIGNUP_SOURCE_KEY, JSON.stringify(src));
    return src;
  } catch {
    return null; // storage off: the account is then recorded with no source
  }
}

export function readSignupSource(storage: Store): SignupSource | null {
  try {
    const raw = storage.getItem(SIGNUP_SOURCE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SignupSource;
    return (CHANNELS as readonly string[]).includes(s?.acquisition_channel) ? s : null;
  } catch {
    return null;
  }
}

/** The one call the app makes to the database; a test passes its own. */
export type RecordSource = (args: Record<string, string | null>) => PromiseLike<{ error: { message: string } | null }>;

/**
 * Once signed in: send the captured source, once per account on this tab. The database decides whether the
 * account is new enough and whether a source is already held. Returns true when a call was made. A failed
 * call is thrown for the caller to ignore or report, and tried again next time.
 */
export async function recordSignupSource(userId: string, storage: Store, record: RecordSource): Promise<boolean> {
  const src = readSignupSource(storage);
  if (!src) return false;
  try {
    if (storage.getItem(RECORDED_PREFIX + userId) === '1') return false;
  } catch {
    /* storage off: the database call is itself idempotent */
  }
  const { error } = await record({
    p_utm_source: src.utm_source,
    p_utm_medium: src.utm_medium,
    p_utm_campaign: src.utm_campaign,
    p_utm_term: src.utm_term,
    p_utm_content: src.utm_content,
    p_referrer_url: src.referrer_url,
    p_landing_path: src.landing_path,
    p_channel: src.acquisition_channel,
  });
  if (error) throw new Error(error.message);
  try {
    storage.setItem(RECORDED_PREFIX + userId, '1');
  } catch {
    /* noop */
  }
  return true;
}

/** recordSignupSource with the browser's tab storage and the app's database client. Never throws. */
export function recordThisSignupSource(userId: string): void {
  try {
    void import('./db')
      .then(({ db }) => recordSignupSource(userId, window.sessionStorage, (args) => db.rpc('record_signup_source', args)))
      .catch(() => {});
  } catch {
    /* storage off */
  }
}
