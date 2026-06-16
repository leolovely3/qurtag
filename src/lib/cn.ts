import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge needs to know that our custom QurTag type scale
 * (text-eyebrow, text-body, text-h1, etc.) are font-size classes, not
 * text-color classes. Without this, a class like `text-bone` (color) and
 * `text-body` (size) collide and the color silently disappears.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'eyebrow',
            'micro',
            'caption',
            'body',
            'lede',
            'h6',
            'h5',
            'h4',
            'h3',
            'h2',
            'h1',
            'display',
          ],
        },
      ],
    },
  },
});

/**
 * Compose Tailwind classes with conditional merging.
 * Used by every component in the design system.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
