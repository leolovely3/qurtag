import { personalDetailWarning } from '@/lib/personalDetails';

/**
 * A gentle note under a box a finder will read (the item's name, the word for the finder) when
 * what is typed looks like a name, a phone number, an email or a street address
 * (src/lib/personalDetails.ts). It never stops the owner saving.
 */
export function DetailWarning({ text }: { text: string }) {
  const w = personalDetailWarning(text);
  if (!w) return null;
  return (
    <p role="status" className="rounded-card bg-signal-50 px-3 py-2 text-sm text-signal-700 text-pretty">
      {w.message}
    </p>
  );
}
