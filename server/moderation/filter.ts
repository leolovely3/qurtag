/**
 * The check every finder note passes in the server route before it reaches the database
 * (server/routes/finder.ts). Pure: no network, no outside service, nothing stored.
 *
 * Three outcomes:
 *   ok                     goes through as written.
 *   hold                   a slur or a threat (server/moderation/wordlist.ts): the note is accepted
 *                          and the finder sees the normal confirmation, but the database stores it
 *                          held (qurtag.messages.held_at). The owner sees "This note may be
 *                          offensive. Show it?" and chooses.
 *   reject                 spam shape: more than MAX_LINKS links, or nothing but links. The finder
 *                          is told why in plain words and can fix the note. A note that is only a
 *                          link is the commonest spam, and a legitimate finder always has a few
 *                          words to add.
 *
 * Why a reject for links and a hold for words: a link note can be rewritten by the person at once,
 * so refusing it costs a real finder a few seconds; refusing a note for a word would silently drop
 * something an owner may want to read (a stolen-item message can be angry), so the owner decides.
 *
 * Limits on how fast a finder may write (per network address, per conversation, per tag) are in the
 * route and in qurtag.server_finder_post; this file only reads the text.
 */
import { SLURS, THREATS } from './wordlist.js';

/** Most links a note may hold. */
export const MAX_LINKS = 2;

export type Verdict =
  | { kind: 'ok' }
  | { kind: 'hold'; reason: 'language' | 'threat' }
  | { kind: 'reject'; code: 'only_links' | 'too_many_links'; message: string };

const LOOKALIKE: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };

/** Lower case, no accents, look-alike digits and symbols as letters, other marks gone, long runs cut. */
export function flatten(text: string): string {
  const lower = text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let out = '';
  for (const ch of lower) {
    if (LOOKALIKE[ch]) out += LOOKALIKE[ch];
    else if (/[a-z]/.test(ch)) out += ch;
    else if (/\s/.test(ch)) out += ' ';
    else if (/[.\-_*'’`,]/.test(ch)) out += ''; // "n.i.g.g.e.r" and "don't" join up
    else out += ' ';
  }
  return out.replace(/(.)\1{2,}/g, '$1$1').replace(/\s+/g, ' ').trim();
}

const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|app|ly|me|info|xyz|biz|ru|cn|tk|top|click|link|gl|us|uk|de|site|online|shop|store|live)\b(?:\/\S*)?/gi;

export function countLinks(text: string): number {
  return (text.match(LINK) ?? []).length;
}

function onlyLinks(text: string): boolean {
  if (countLinks(text) === 0) return false;
  return text.replace(LINK, ' ').replace(/[\s\p{P}\p{S}]/gu, '') === '';
}

// Built once. Each entry is padded with spaces so it only matches whole words.
const slurSet = new Set(SLURS.map((w) => flatten(w)));
const threatPhrases = THREATS.map((p) => ` ${flatten(p).replace(/ /g, ' ')} `);

export function checkNote(text: string): Verdict {
  if (onlyLinks(text)) {
    return { kind: 'reject', code: 'only_links', message: 'Please add a few words about where you found it. A note with only a link cannot be sent.' };
  }
  if (countLinks(text) > MAX_LINKS) {
    return { kind: 'reject', code: 'too_many_links', message: `Please keep to ${MAX_LINKS} links or fewer. Tell the owner where you found it in your own words.` };
  }
  const flat = flatten(text);
  const padded = ` ${flat} `;
  for (const p of threatPhrases) if (padded.includes(p)) return { kind: 'hold', reason: 'threat' };
  // A word is also tried with a stretched last letter cut back ('niggerrr').
  for (const w of flat.split(' ')) if (slurSet.has(w) || slurSet.has(w.replace(/(.)\1+$/, '$1'))) return { kind: 'hold', reason: 'language' };
  // The same word typed with spaces between its letters ("f a g g o t"): a run of single letters is
  // joined and searched for a listed word.
  for (const run of flat.match(/\b(?:[a-z] ){3,}[a-z]\b/g) ?? []) {
    const joined = run.replace(/ /g, '');
    for (const w of slurSet) if (w.length >= 4 && joined.includes(w)) return { kind: 'hold', reason: 'language' };
  }
  return { kind: 'ok' };
}
