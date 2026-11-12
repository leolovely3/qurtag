/**
 * Class names for rows at Accessibility text sizes (the `ax:` variant, src/lib/textSize.ts).
 *
 * A row with a picture: the picture and the chevron share the first line and the text takes
 * the whole width under them, so a name never shrinks to a column a few letters wide. A row
 * with a small decorative icon chip: the chip is left out, as iOS's own lists do at those
 * sizes, and the text gets its room. Pictures and icons are sized in px, so they stay their
 * size while the text grows.
 */
export const axRow = 'ax:flex-wrap';
/** The text block of a row with a picture. */
export const axRowText = 'ax:order-last ax:basis-full';
/** The chevron or trailing control of a row with a picture. */
export const axRowEnd = 'ax:ml-auto';
/** A decorative icon chip at the start of a row. */
export const axIcon = 'ax:hidden';
