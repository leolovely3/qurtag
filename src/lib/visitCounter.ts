// Anonymous visit counter: one number per day, page and source.
//
// What leaves the browser is two short strings and nothing else:
//   path    the route pattern of the page (/c/:slug, never /c/the-oceanic),
//           ids and tokens replaced with ":id", no query, no hash;
//   source  where the visit came from, reduced to a word: direct, search,
//           ai, social or referral, or the link's own tag (utm_source or src,
//           when it is lower-case letters, digits and dashes, up to 40).
// The referring site is classified here and dropped; its address is never
// sent. No cookie, no id, no IP, no fingerprint: the database adds one to a
// counter for (today, path, source) and keeps nothing else.
//
// One page counts once per tab: the path is remembered in sessionStorage, so
// a refresh or going back does not count again. The source is decided on the
// first page of the tab and kept for the pages opened after it, because
// in-app navigation has no referrer of its own. A browser driven by a script
// (navigator.webdriver) is not counted, nor is a development server. Nor is a crawler that names itself (isCrawler).
//
// Pure apart from countVisit, which takes everything it touches as
// arguments so the tests can drive it.

export const SOURCES = ['direct', 'search', 'ai', 'social', 'referral'] as const;
export type SourceCategory = (typeof SOURCES)[number];

const TAG = /^[a-z0-9-]{1,40}$/;
const PLAIN_PATH = /^\/[A-Za-z0-9/:_-]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC = /^\d+$/;
// Long opaque tokens and ids with digits in them (share links, codes).
const OPAQUE = /^(?=.*\d)[A-Za-z0-9_-]{12,}$/;
export const MAX_PATH = 100;

// Checked in this order: AI first, because gemini.google.com is Google and
// copilot.microsoft.com is Microsoft, and both are answers, not searches.
const AI_HOSTS = ['chatgpt.com', 'chat.openai.com', 'openai.com', 'perplexity.ai', 'gemini.google.com', 'bard.google.com', 'copilot.microsoft.com', 'copilot.cloud.microsoft', 'claude.ai'];
const SOCIAL_HOSTS = [
  'facebook.com', 'fb.com', 'fb.me', 'messenger.com', 'instagram.com', 'threads.net', 'threads.com',
  'x.com', 'twitter.com', 't.co', 'linkedin.com', 'lnkd.in', 'reddit.com', 'redd.it',
  'tiktok.com', 'youtube.com', 'youtu.be', 'pinterest.com', 'nextdoor.com',
];
const SEARCH_HOSTS = [
  'bing.com', 'duckduckgo.com', 'ecosia.org', 'search.brave.com', 'startpage.com', 'qwant.com',
  'kagi.com', 'baidu.com', 'naver.com', 'search.aol.com', 'yahoo.com', 'yandex.com', 'yandex.ru', 'ask.com',
];
// google.com, google.co.uk, google.com.au and the rest.
const GOOGLE = /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/;

const under = (host: string, domains: string[]) => domains.some((d) => host === d || host.endsWith(`.${d}`));

/** The referring host, lower case without "www.", or null when there is none or it is not a web address. */
export function referrerHost(referrer: string): string | null {
  if (!referrer) return null;
  try {
    const u = new URL(referrer);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** A referring host reduced to its kind. Never returns the host. */
export function hostCategory(host: string): Exclude<SourceCategory, 'direct'> {
  if (under(host, AI_HOSTS)) return 'ai';
  if (under(host, SOCIAL_HOSTS)) return 'social';
  if (GOOGLE.test(host) || under(host, SEARCH_HOSTS)) return 'search';
  return 'referral';
}

/** A link's own tag (utm_source, src or a product's own parameter), when it is a safe word. */
export function tagFrom(search: string, params: readonly string[] = ['utm_source', 'src']): string | null {
  let q: URLSearchParams;
  try {
    q = new URLSearchParams(search);
  } catch {
    return null;
  }
  for (const p of params) {
    const v = (q.get(p) ?? '').trim().toLowerCase();
    if (v && TAG.test(v)) return v;
  }
  return null;
}

/**
 * Where this page load came from: the link's tag, else the kind of site that
 * sent it, else direct. A referrer on the product's own host is direct, since
 * it is someone already on the site.
 */
export function classifySource(search: string, referrer: string, ownHost: string, params?: readonly string[]): string {
  const tag = tagFrom(search, params);
  if (tag) return tag;
  const host = referrerHost(referrer);
  const own = ownHost.toLowerCase().replace(/^www\./, '');
  if (!host || host === own) return 'direct';
  return hostCategory(host);
}

/** Does a route pattern such as /c/:slug/where-your-dues-go match this path? */
function matches(pattern: string, segs: string[]): boolean {
  const p = pattern.split('/').filter(Boolean);
  if (p.length !== segs.length) return false;
  return p.every((s, i) => s.startsWith(':') || s === segs[i]);
}

/** How many fixed (non-parameter) segments a pattern has: the more, the more specific. */
const fixed = (pattern: string) => pattern.split('/').filter((s) => s && !s.startsWith(':')).length;

/**
 * The path to count for an address: the most specific route pattern it
 * matches, else the path with ids and tokens as ":id". A match in `keep`
 * (public pages whose slug is their name, such as an article) counts the
 * path itself. Null when the result is not a short plain path, so nothing
 * odd is ever sent.
 */
export function visitPath(pathname: string, patterns: readonly string[] = [], keep: readonly string[] = []): string | null {
  const path = (pathname || '/').split('?')[0].split('#')[0];
  const segs = path.split('/').filter(Boolean);
  const best = [...patterns.map((p) => ({ p, keep: false })), ...keep.map((p) => ({ p, keep: true }))]
    .filter((c) => matches(c.p, segs))
    .sort((a, b) => fixed(b.p) - fixed(a.p))[0];
  const out = best && !best.keep ? best.p : `/${segs.map((s) => (UUID.test(s) || NUMERIC.test(s) || OPAQUE.test(s) ? ':id' : s)).join('/')}`;
  if (out.length > MAX_PATH || !PLAIN_PATH.test(out)) return null;
  return out;
}

/** The parts of sessionStorage this uses; a Map stands in when storage is blocked. */
export interface KeyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const memory = new Map<string, string>();
const memoryStore: KeyStore = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) };

/** sessionStorage when the browser allows it, else memory for this page. */
export function tabStore(): KeyStore {
  try {
    const s = window.sessionStorage;
    const probe = '__visit_probe';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return memoryStore;
  }
}

const SEEN = 'visit:seen:';
const SOURCE = 'visit:source';

/** True the first time this tab opens this path; false after, so it counts once. */
export function claimVisit(store: KeyStore, path: string): boolean {
  try {
    if (store.getItem(SEEN + path)) return false;
    store.setItem(SEEN + path, '1');
    return true;
  } catch {
    return false;
  }
}

/**
 * The source for this tab: a tag or an outside referrer on this load wins and
 * is remembered; otherwise the source the tab arrived with, else direct.
 */
export function tabSource(store: KeyStore, current: string): string {
  try {
    if (current !== 'direct') {
      store.setItem(SOURCE, current);
      return current;
    }
    const kept = store.getItem(SOURCE);
    return kept && TAG.test(kept) ? kept : 'direct';
  } catch {
    return current;
  }
}

/** Development servers and file previews are not visits. */
export function isLocalHost(protocol: string, hostname: string): boolean {
  if (protocol !== 'http:' && protocol !== 'https:') return false;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1' || hostname.endsWith('.local');
}

/**
 * Search engines, AI crawlers, link previewers and headless browsers that name
 * themselves in their user agent. They render pages like a visitor but are not
 * people: on 13 Nov 2026 a crawler loaded 3,455 FaithHaven church and city pages
 * in a day, and every one counted as a direct visit.
 */
const CRAWLER = /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pagespeed|prerender|facebookexternalhit|meta-externalagent|embedly|preview|bingpreview|google-inspectiontool|gptbot|chatgpt-user|oai-searchbot|claudebot|claude-user|anthropic-ai|perplexity|ccbot|bytespider|amazonbot|applebot|petalbot|yandex|baiduspider|duckduckbot|semrush|ahrefs|mj12bot|dotbot|python-requests|curl\/|wget|go-http-client|node-fetch|axios/i;

/** True for a user agent that names a crawler or an automated client. */
export function isCrawler(userAgent: string): boolean {
  return CRAWLER.test(userAgent);
}

export interface VisitEnv {
  pathname: string;
  search: string;
  referrer: string;
  protocol: string;
  hostname: string;
  webdriver: boolean;
  userAgent?: string;
  store: KeyStore;
  /** Sends one visit; its failure is the caller's to swallow. */
  send: (path: string, source: string) => void;
  patterns?: readonly string[];
  keep?: readonly string[];
  tagParams?: readonly string[];
}

/** Count this page once for this tab. Returns what was sent, or null when nothing was. */
export function countVisit(env: VisitEnv): { path: string; source: string } | null {
  if (env.webdriver || isCrawler(env.userAgent ?? '') || isLocalHost(env.protocol, env.hostname)) return null;
  const path = visitPath(env.pathname, env.patterns, env.keep);
  if (!path) return null;
  const source = tabSource(env.store, classifySource(env.search, env.referrer, env.hostname, env.tagParams));
  if (!claimVisit(env.store, path)) return null;
  try {
    env.send(path, source);
  } catch {
    /* counting must never break the page */
  }
  return { path, source };
}

/** countVisit with the browser's own values. */
export function countThisPage(send: VisitEnv['send'], opts: { patterns?: readonly string[]; keep?: readonly string[]; tagParams?: readonly string[] } = {}): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  try {
    countVisit({
      pathname: window.location.pathname,
      search: window.location.search,
      referrer: document.referrer,
      protocol: window.location.protocol,
      hostname: window.location.hostname,
      webdriver: navigator.webdriver === true,
      userAgent: navigator.userAgent,
      store: tabStore(),
      send,
      ...opts,
    });
  } catch {
    /* counting must never break the page */
  }
}
