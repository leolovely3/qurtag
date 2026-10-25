/**
 * What to tag first, and which tag style suits it. The first-tag walkthrough
 * (src/routes/app/FirstTag.tsx) offers the quick picks below; a pick fills in the item's name
 * and chooses the style. Whatever the person types for "Something else" is matched by the
 * words in it (a lunchbox, a suitcase, a jacket) so the recommendation still fits.
 *
 * The styles are the ones in src/lib/tagLayout.ts: the small sticker for small hard things,
 * the label strip for flat or wide ones, the key fob for keys, the bag tag for bags and
 * luggage, the clothing strip for clothes.
 */
import type { StyleId } from './tagLayout';

export type PickId = 'bottle' | 'laptop' | 'backpack' | 'keys' | 'glasses' | 'instrument' | 'other';

export interface Pick {
  id: PickId;
  label: string;
  /** The name put in the item's name box; the person can change it. */
  name: string;
  /** The name of the lucide icon the walkthrough draws for it. */
  icon: 'GlassWater' | 'Laptop' | 'Backpack' | 'KeyRound' | 'Glasses' | 'Guitar' | 'Sparkles';
  style: StyleId;
}

export const PICKS: Pick[] = [
  { id: 'bottle', label: 'Water bottle', name: 'Water bottle', icon: 'GlassWater', style: 'sticker' },
  { id: 'laptop', label: 'Laptop', name: 'Laptop', icon: 'Laptop', style: 'strip' },
  { id: 'backpack', label: 'Backpack', name: 'Backpack', icon: 'Backpack', style: 'bag' },
  { id: 'keys', label: 'Keys', name: 'Keys', icon: 'KeyRound', style: 'fob' },
  { id: 'glasses', label: 'Glasses case', name: 'Glasses case', icon: 'Glasses', style: 'sticker' },
  { id: 'instrument', label: 'Instrument case', name: 'Instrument case', icon: 'Guitar', style: 'strip' },
  { id: 'other', label: 'Something else', name: '', icon: 'Sparkles', style: 'sticker' },
];

/** The first match wins, so the more specific words come first. */
const BY_WORD: { words: RegExp; style: StyleId }[] = [
  { words: /\b(keys?|keychain|key ?ring|fob)\b/i, style: 'fob' },
  { words: /\b(jackets?|coats?|uniforms?|shirts?|hoodies?|sweaters?|jerseys?|clothes|clothing|scarf|hats?|gloves?)\b/i, style: 'clothing' },
  { words: /\b(glasses|sunglasses|spectacles|eyeglasses)\b/i, style: 'sticker' },
  { words: /\b(wallets?|purses?|cards?)\b/i, style: 'wallet' },
  { words: /\b(backpacks?|rucksacks?|gym bags?|duffels?|duffle|luggage|suitcases?|carry-?on|totes?|tote bags?|handbags?|bags?|stroller|walker)\b/i, style: 'bag' },
  { words: /\b(laptops?|lunch ?box(es)?|lunch bags?|tablets?|ipads?|notebooks?|instrument|violin|guitar|cello|trumpet|flute|case)\b/i, style: 'strip' },
  { words: /\b(bottles?|flasks?|tumblers?|thermos|chargers?|glasses|sunglasses|headphones?|earbuds|remotes?|helmets?|phone)\b/i, style: 'sticker' },
];

/** The style to suggest for a pick, or, for "Something else" and edited names, for the words typed. */
export function recommendStyle(pick: PickId | null, name: string): StyleId {
  const typed = name.trim();
  if (typed) {
    for (const rule of BY_WORD) if (rule.words.test(typed)) return rule.style;
  }
  const chosen = PICKS.find((p) => p.id === pick);
  return chosen ? chosen.style : 'sticker';
}
