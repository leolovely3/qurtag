import { cn } from '@/lib/cn';

/**
 * A screenshot that exists in a light and a dark version. Both are in the page and the style sheet
 * shows the one that matches the page's theme (the `dark` class on <html>, set before the first
 * paint by the script in index.html). Choosing in CSS rather than in code means the page written at
 * build time (scripts/seo/prerender.mjs) is right for a dark phone too, and the browser can pick
 * it up without redrawing. A hidden image that loads lazily is never downloaded.
 */
export function ThemedImage({
  base,
  width,
  height,
  alt,
  className,
  eager = false,
}: {
  /** The file name without its theme and extension, for example "inbox" for /how/inbox-light.webp. */
  base: string;
  width: number;
  height: number;
  alt: string;
  className?: string;
  /** Load now, for the one image that is the first thing seen; everything else loads when near the screen. */
  eager?: boolean;
}) {
  const common = { width, height, alt, decoding: 'async' as const, loading: eager ? ('eager' as const) : ('lazy' as const) };
  return (
    <>
      <img src={`/how/${base}-light.webp`} {...common} className={cn('block dark:hidden', className)} />
      <img src={`/how/${base}-dark.webp`} {...common} className={cn('hidden dark:block', className)} />
    </>
  );
}
