import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, Copy, Gift, Lock, Package, SearchX, TestTube2, WifiOff } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { MessageComposer } from '@/components/ui/MessageComposer';
import { ThreadView } from '@/components/ui/ThreadView';
import {
  rememberToken,
  rememberedToken,
  sendNote,
  tokenFromHash,
  viewTag,
  type FinderView as View,
} from '@/lib/finder';
import { usePoll } from '@/lib/realtime';
import { OWNER_TEST_KEY } from '@/lib/gettingStarted';
import type { Message } from '@/lib/database.types';
import { cn } from '@/lib/cn';

/**
 * The page a finder sees after scanning a tag: /find/<tag id>. No account, no app.
 *
 * It shows the finder-safe card for the item (name, photo, the owner's thank-you text,
 * whether it is lost), a box to send a note, and, once they have written, their own
 * conversation with the owner's replies. Everything comes from the server routes
 * (src/lib/finder.ts); the owner's name, email and address are never sent here.
 */
export function FinderView() {
  const { tagId = '' } = useParams();
  const [view, setView] = useState<View | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'offline'>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  // The owner's test view (/find/<code>#test=1): the page as a finder sees it, with no scan
  // recorded, nothing sent and no conversation started. Opened from the first-tag walkthrough
  // and the Getting started card (src/routes/app/FirstTag.tsx).
  const [testMode] = useState(() => /(?:^#|&)test=1(?:&|$)/.test(window.location.hash));

  const load = useCallback(
    async (scan: boolean, t: string | null) => {
      // A finder who already wrote a note and comes back to read the reply is not a new scan.
      const r = await viewTag(tagId, t, scan && !t);
      if (r.ok) {
        setView(r.data);
        setState('ready');
        if (testMode) {
          try {
            window.localStorage.setItem(OWNER_TEST_KEY, tagId);
          } catch {
            /* storage off: the owner can confirm the test by hand */
          }
        }
        // A remembered token that no longer opens anything (tag replaced) is forgotten.
        if (t && r.data.tokenValid === false) {
          rememberToken(tagId, null);
          setToken(null);
        }
      } else if (r.status === 404) {
        setState('missing');
      } else if (scan || testMode) {
        setState('offline');
      }
    },
    [tagId, testMode],
  );

  useEffect(() => {
    if (testMode) {
      void load(false, null);
      return;
    }
    // A saved conversation link carries the token after #; keep it and tidy the address.
    const fromLink = tokenFromHash(window.location.hash);
    if (fromLink) {
      rememberToken(tagId, fromLink);
      window.history.replaceState(null, '', window.location.pathname);
    }
    const t = fromLink ?? rememberedToken(tagId);
    setToken(t);
    void load(true, t);
  }, [tagId, load, testMode]);

  usePoll(() => load(false, token), state === 'ready' && !!token);

  const handleSend = useCallback(
    async (body: string) => {
      setError(null);
      const r = await sendNote(tagId, token, body);
      if (!r.ok) {
        if (r.status === 404 && token) {
          // The conversation is gone from this tag; start a new one next time.
          rememberToken(tagId, null);
          setToken(null);
        }
        setError(r.message);
        throw new Error(r.message);
      }
      const next = r.data.token ?? token;
      if (r.data.token) {
        rememberToken(tagId, r.data.token);
        setToken(r.data.token);
      }
      await load(false, next);
    },
    [tagId, token, load],
  );

  async function copyLink() {
    if (!token) return;
    const link = `${window.location.origin}/find/${tagId}#t=${token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt('Copy this link to come back to this conversation:', link);
    }
  }

  if (state === 'loading') {
    // Shaped like the page it becomes, so nothing jumps when the tag arrives.
    return (
      <div className="flex flex-col gap-5" role="status" aria-label="Loading this tag">
        <Skeleton className="h-7 w-40 rounded-pill" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-4/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="h-24 w-full rounded-modal" />
        <Skeleton className="h-36 w-full rounded-modal" />
      </div>
    );
  }

  if (state === 'missing') {
    return (
      <div className="flex flex-col items-start gap-4 py-4">
        <span className="grid size-12 place-items-center rounded-modal bg-ink-100">
          <SearchX size={24} strokeWidth={1.75} className="text-ink-900" aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink-900 sm:text-3xl">This tag isn't registered</h1>
        <p className="text-base text-ink-700 text-pretty">
          The code may be mistyped, or the owner may have switched this tag off or printed a new one.
          Check the address on the tag and try again. If you found something, you could also hand it
          in where you found it.
        </p>
        <Link to="/" className={buttonClasses({ variant: 'secondary', className: 'mt-2' })}>
          What is QuR Tag?
        </Link>
      </div>
    );
  }

  if (state === 'offline' || !view) {
    return (
      <div className="flex flex-col items-start gap-4 py-4">
        <span className="grid size-12 place-items-center rounded-modal bg-ink-100">
          <WifiOff size={24} strokeWidth={1.75} className="text-ink-900" aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink-900 sm:text-3xl">We couldn't load this tag</h1>
        <p className="text-base text-ink-700">Check your signal and try again.</p>
        <button
          type="button"
          onClick={() => {
            setState('loading');
            void load(true, token);
          }}
          className={buttonClasses({ variant: 'primary', className: 'mt-2' })}
        >
          Try again
        </button>
      </div>
    );
  }

  const { item, thread } = view;
  const messages: Message[] = (thread?.messages ?? []).map((m) => ({
    ...m,
    thread_id: '',
    read_by_owner_at: null,
    read_by_finder_at: null,
  }));
  const talking = !testMode && messages.length > 0;
  const closed = thread?.status === 'closed';

  function leaveTest() {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/app', { replace: true });
  }

  return (
    <div className="flex flex-col gap-5">
      {testMode && (
        <div role="status" className="flex flex-col gap-3 rounded-modal border border-verdigris-300 bg-verdigris-50 p-4">
          <p className="flex items-start gap-2 text-base font-semibold text-ink-900">
            <TestTube2 size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
            It works. This is what a finder sees.
          </p>
          <p className="text-sm text-ink-700 text-pretty">
            This is your test view. It was not counted as a scan, and nothing you do here is sent to you.
          </p>
          <button type="button" onClick={leaveTest} className={buttonClasses({ variant: 'primary', block: true })}>
            Done
          </button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex h-8 items-center gap-2 rounded-pill px-3 text-sm font-medium',
            item.lost ? 'bg-signal-50 text-signal-700' : 'bg-ink-50 text-ink-700',
          )}
        >
          <span className={cn('size-1.5 rounded-full', item.lost ? 'bg-signal-500' : 'bg-ink-300')} />
          {item.lost ? 'The owner is looking for this' : 'QuR Tag'}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold leading-tight tracking-[-0.02em] text-ink-900 text-pretty sm:text-3xl">
          {talking
            ? 'Your conversation with the owner.'
            : item.lost
              ? 'You found something someone is missing.'
              : 'You found something with a QuR Tag.'}
        </h1>
        <p className="text-base text-ink-700 text-pretty">
          {talking
            ? 'Replies from the owner show up here. Keep this page, or come back to this tag later on this phone.'
            : 'Send the owner a short note: where you found it and how they can get it back. You do not need an account or an app, and the owner will not see your phone number or email.'}
        </p>
      </div>

      <div className="flex items-center gap-4 rounded-modal border border-hairline bg-canvas p-4 shadow-card">
        {item.photo ? (
          <img src={item.photo} alt={`Photo of the ${item.name}`} className="size-20 shrink-0 rounded-card bg-ink-100 object-cover" />
        ) : (
          <div className="grid size-20 shrink-0 place-items-center rounded-card bg-ink-100">
            <Package size={28} strokeWidth={1.5} className="text-muted" aria-hidden />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">The item</p>
          <h2 className="break-words text-xl font-semibold leading-snug text-ink-900 text-balance">{item.name}</h2>
        </div>
      </div>

      {item.reward_text && (
        <aside className="flex items-start gap-3 rounded-modal border border-hairline bg-canvas p-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-pill bg-signal-50">
            <Gift size={20} strokeWidth={1.75} className="text-signal-700" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-900">A word from the owner</p>
            <p className="mt-0.5 break-words text-base text-ink-900 text-pretty">{item.reward_text}</p>
            <p className="mt-1 text-sm text-muted">
              Any thank-you is between you and the owner. QuR Tag does not handle money.
            </p>
          </div>
        </aside>
      )}

      {talking && (
        <div className="flex flex-col gap-3 rounded-modal border border-hairline bg-canvas p-4">
          <h2 className="text-sm font-semibold text-ink-700">Conversation</h2>
          <ThreadView messages={messages} viewerKind="finder" />
        </div>
      )}

      {testMode ? null : closed ? (
        <p className="rounded-card border border-hairline bg-paper px-4 py-3 text-sm text-ink-700">
          This conversation is closed.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <MessageComposer
            label={talking ? 'Write another note' : 'Send a note to the owner'}
            placeholder={
              talking ? 'A short reply' : 'I found this at the bus stop on Main Street. I can leave it at the library desk.'
            }
            maxLength={2000}
            onSend={handleSend}
          />
          {error && (
            <p role="alert" className="rounded-card bg-signal-50 px-4 py-3 text-sm text-signal-700">
              {error}
            </p>
          )}
        </div>
      )}

      {token && !testMode && (
        <div className="flex flex-col gap-3 rounded-modal border border-hairline bg-paper p-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-ink-700 text-pretty">
            This phone remembers your conversation. To open it somewhere else, keep this private link.
          </p>
          <button
            type="button"
            onClick={copyLink}
            className={buttonClasses({ variant: 'secondary' })}
          >
            {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
            {copied ? 'Link copied' : 'Copy my private link'}
          </button>
        </div>
      )}

      <div className="flex items-start gap-3 px-1">
        <Lock size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted" aria-hidden />
        <p className="text-sm text-muted text-pretty">
          The owner sees only what you write. They do not see your phone number, email or location, and
          you do not see theirs. Do not share more than you want to.{' '}
          <a
            href="mailto:info@impactconsulting.ai?subject=Problem%20with%20a%20QuR%20Tag%20page"
            className="underline underline-offset-4 hover:text-ink-900"
          >
            Report a problem with this page
          </a>
          .
        </p>
      </div>
    </div>
  );
}
