import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/cn';

/**
 * The three pictures of how QuR Tag works, in /public/how: the tags as the app prints them
 * (the 1.25 in sticker and the label strip, Clean look, drawn by src/lib/tagStyles.ts), the page
 * a finder sees (/find/<code> for a demo item) and the owner's conversation in the app. The two
 * screens are real screenshots from a local build at 390 x 780 (780 x 1560 files), framed like
 * the home page's hero. Each has a light and a dark file; the visitor's theme picks one.
 */
const steps = [
  {
    title: 'Print it and stick it on',
    body: 'Print the tag at home. It comes as a small sticker or a label strip, and you stick it on the thing.',
    kind: 'tags' as const,
    file: 'tags',
    width: 1600,
    height: 800,
    alt: 'Two printed QuR Tag tags side by side: a square sticker that reads "Lost? Scan me" and a label strip that reads "If found, scan me", each with a QR code and a short web address.',
  },
  {
    title: 'A finder scans it',
    body: 'They point their phone camera at the code. A page opens with your item and your word to them. No app, no account.',
    kind: 'phone' as const,
    file: 'find',
    width: 780,
    height: 1560,
    alt: 'The page a finder sees on their phone: a blue water bottle, a word from the owner that says there is a coffee waiting, and a box to send the owner a note.',
  },
  {
    title: 'You get a note and reply',
    body: 'The note waits in your inbox, or arrives as an alert on your iPhone. Reply, and the finder reads it on the same page.',
    kind: 'phone' as const,
    file: 'inbox',
    width: 780,
    height: 1560,
    alt: 'The QuR Tag app on a phone: the owner of a blue water bottle reads a note from the person who found it at the gym, and replies that they can pick it up tonight.',
  },
];

export function HowVisuals({ className }: { className?: string }) {
  const mode = useTheme().resolved === 'dark' ? 'dark' : 'light';
  return (
    <ol className={cn('grid gap-8 md:grid-cols-3 md:gap-6', className)}>
      {steps.map((s, i) => (
        <li key={s.title} className="flex flex-col gap-5">
          <div className="flex items-center justify-center md:min-h-[26rem]">
            {s.kind === 'tags' ? (
              <img
                src={`/how/${s.file}-${mode}.webp`}
                width={s.width}
                height={s.height}
                loading="lazy"
                decoding="async"
                alt={s.alt}
                className="block h-auto w-full rounded-modal ring-1 ring-hairline-strong"
              />
            ) : (
              <div className="w-[14rem] rounded-[2.25rem] bg-[#050608] p-2 shadow-device ring-1 ring-hairline-strong">
                <img
                  src={`/how/${s.file}-${mode}.webp`}
                  width={s.width}
                  height={s.height}
                  loading="lazy"
                  decoding="async"
                  alt={s.alt}
                  className="block h-auto w-full rounded-[1.75rem]"
                />
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink-900 text-sm font-semibold text-canvas">{i + 1}</span>
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="text-lg font-semibold text-ink-900">{s.title}</h3>
              <p className="text-base text-ink-700 text-pretty">{s.body}</p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
