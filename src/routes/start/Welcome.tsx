import { Camera, Lock, PenLine, Printer } from 'lucide-react';
import { LogoMark } from '@/components/brand/Wordmark';
import { buttonClasses } from '@/components/ui/Button';
import { axIcon } from '@/components/ui/largeText';

/**
 * The iPhone app's first-open welcome: what QuR Tag is, in three steps, before any form.
 * Shown once per phone, to someone signed out who has never used an account on it
 * (src/lib/firstOpen.ts). One screen at the default text size on a 375 x 667 phone, so the two
 * choices are always in view; at Accessibility sizes it scrolls and the icon chips step aside.
 */
const steps = [
  { icon: PenLine, text: 'Name a thing you might lose.' },
  { icon: Printer, text: 'Print its tag and stick it on.' },
  { icon: Camera, text: 'Whoever finds it scans the tag with their phone camera and sends you a note.' },
];

export function Welcome({ onCreate, onSignIn }: { onCreate: () => void; onSignIn: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4 pb-4 pt-4">
      {/* On a tall phone the words sit in the middle of the space above the two buttons. */}
      <div className="flex flex-1 flex-col justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <LogoMark size={52} title="QuR Tag" />
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-ink-900 text-balance">
            Stick it on. Get it back.
          </h1>
        </div>

        <ol className="mt-5 flex flex-col gap-3 ax:gap-5 rounded-modal border border-hairline bg-paper p-4 shadow-card">
          {steps.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3.5">
              <span className={`grid size-9 shrink-0 place-items-center rounded-card bg-signal-50 ${axIcon}`} aria-hidden>
                <Icon size={18} strokeWidth={1.75} className="text-signal-700" />
              </span>
              <span className="flex-1 pt-1.5 text-base leading-snug text-ink-900 text-pretty ax:pt-0">{text}</span>
            </li>
          ))}
        </ol>

        <p className="mt-4 flex items-start justify-center gap-2 px-2 text-sm text-muted text-pretty">
          <Lock size={16} strokeWidth={1.75} className={`mt-0.5 shrink-0 ${axIcon}`} aria-hidden />
          <span>The finder needs no app. Your phone number and email stay private.</span>
        </p>
      </div>

      <div className="flex flex-col gap-3 pt-5">
        <button type="button" onClick={onCreate} className={buttonClasses({ variant: 'primary', size: 'lg', block: true })}>
          Make your free tag
        </button>
        <button type="button" onClick={onSignIn} className={buttonClasses({ variant: 'secondary', size: 'lg', block: true })}>
          I already have an account
        </button>
      </div>
    </div>
  );
}
