/**
 * The home page's first screen, matched to why the visitor came. A link with a campaign label
 * (?ch=parents, or a label that starts with parents, family, school, mom or dad, such as
 * ch=fb-parents) opens on words for parents; every other visit sees the general page. The label is
 * the one src/lib/measures.ts keeps for the tab (sessionStorage, no cookie), so the page reads the
 * same channel the sign-up count does.
 */
export type Audience = 'parents' | 'general';

export function audienceFor(channel: string | null | undefined): Audience {
  return /(^|[-_])(parents?|famil(y|ies)|school|moms?|dads?)([-_]|$)/.test(channel ?? '') ? 'parents' : 'general';
}

export const HERO: Record<Audience, { headline: string; lede: string }> = {
  general: {
    headline: 'A free QR tag, so a kind stranger can message you.',
    lede: 'Print a tag at home and stick it on a water bottle, a violin case or your keys. When someone finds it, they scan it with their camera and write you a note. Free, private, and no app for the finder.',
  },
  parents: {
    headline: 'Tag your kids’ bottles and bags, free.',
    lede: 'Print a tag at home and stick it on a water bottle, a backpack or a lunch box. When one is left behind, whoever finds it scans the tag with their camera and writes to you, the parent. Free, private, and no app for the finder.',
  },
};
