import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, Copy, Gift, Lock, Package } from 'lucide-react';
import { Display, Eyebrow, Lede } from '@/components/brand/Typography';
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

  const load = useCallback(
    async (scan: boolean, t: string | null) => {
      const r = await viewTag(tagId, t, scan);
      if (r.ok) {
        setView(r.data);
        setState('ready');
        // A remembered token that no longer opens anything (tag replaced) is forgotten.
        if (t && r.data.tokenValid === false) {
          rememberToken(tagId, null);
          setToken(null);
        }
      } else if (r.status === 404) {
        setState('missing');
      } else if (scan) {
        setState('offline');
      }
    },
    [tagId],
  );

  useEffect(() => {
    // A saved conversation link carries the token after #; keep it and tidy the address.
    const fromLink = tokenFromHash(window.location.hash);
    if (fromLink) {
      rememberToken(tagId, fromLink);
      window.history.replaceState(null, '', window.location.pathname);
    }
    const t = fromLink ?? rememberedToken(tagId);
    setToken(t);
    void load(true, t);
  }, [tagId, load]);

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
    return (
      <div className="flex items-center justify-center min-h-[40vh]" role="status" aria-label="Loading">
        <div className="size-7 rounded-full border-2 border-ink-100 border-t-ink-900 animate-spin" />
      </div>
    );
  }

  if (state === 'missing') {
    return (
      <div className="flex flex-col gap-qurtag-5 py-qurtag-8">
        <Eyebrow>Tag not found</Eyebrow>
        <Display level={2}>This tag isn't registered.</Display>
        <Lede>
          The code may be mistyped, or the owner may have switched this tag off or printed a new one.
          Check the address on the tag and try again. If you found something, you could also hand it
          in where you found it.
        </Lede>
        <Link to="/" className="link-arrow text-body mt-2 min-h-11 inline-flex items-center">
          What is QuR Tag? →
        </Link>
      </div>
    );
  }

  if (state === 'offline' || !view) {
    return (
      <div className="flex flex-col gap-qurtag-5 py-qurtag-8">
        <Eyebrow>No connection</Eyebrow>
        <Display level={2}>We couldn't load this tag.</Display>
        <Lede>Check your signal and try again.</Lede>
        <button
          type="button"
          onClick={() => {
            setState('loading');
            void load(true, token);
          }}
          className="self-start inline-flex h-11 items-center rounded-pill bg-ink-900 text-canvas text-caption font-medium px-5"
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
  const talking = messages.length > 0;
  const closed = thread?.status === 'closed';

  return (
    <div className="flex flex-col gap-qurtag-5">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-caption font-medium',
            item.lost ? 'bg-signal-50 text-signal-700' : 'bg-ink-50 text-ink-700',
          )}
        >
          <span className={cn('size-1.5 rounded-full', item.lost ? 'bg-signal-500' : 'bg-ink-300')} />
          {item.lost ? 'The owner is looking for this' : `Tag ${tagId}`}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <Display level={2} className="text-pretty">
          {talking
            ? 'Your conversation with the owner.'
            : item.lost
              ? 'You found something someone is missing.'
              : 'You found something with a QuR Tag.'}
        </Display>
        <Lede className="text-pretty">
          {talking
            ? 'Replies from the owner show up here. Keep this page, or come back to this tag later on this phone.'
            : 'Send the owner a short note: where you found it and how they can get it back. You do not need an account or an app, and the owner will not see your phone number or email.'}
        </Lede>
      </div>

      <div className="rounded-modal border border-hairline bg-paper p-qurtag-5 flex items-start gap-qurtag-3">
        {item.photo ? (
          <img src={item.photo} alt={`Photo of the ${item.name}`} className="size-20 rounded-card object-cover bg-ink-100 shrink-0" />
        ) : (
          <div className="size-20 rounded-card bg-ink-100 grid place-items-center shrink-0">
            <Package size={22} strokeWidth={1.5} className="text-muted" aria-hidden />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <Eyebrow>The item</Eyebrow>
          <h2 className="font-display font-semibold text-h5 text-ink-900 tracking-[-0.018em] mt-0.5 text-balance break-words">
            {item.name}
          </h2>
        </div>
      </div>

      {item.reward_text && (
        <aside className="rounded-modal border border-hairline bg-canvas p-qurtag-5 flex items-start gap-qurtag-3">
          <div className="size-10 rounded-pill bg-ink-900 grid place-items-center shrink-0">
            <Gift size={18} strokeWidth={1.75} className="text-canvas" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <Eyebrow>A word from the owner</Eyebrow>
            <p className="text-body text-ink-900 mt-0.5 text-pretty break-words">{item.reward_text}</p>
            <p className="text-caption text-muted mt-1">
              Any thank-you is between you and the owner. QuR Tag does not handle money.
            </p>
          </div>
        </aside>
      )}

      {talking && (
        <div className="rounded-modal border border-hairline bg-canvas p-qurtag-5 flex flex-col gap-3">
          <Eyebrow>Conversation</Eyebrow>
          <ThreadView messages={messages} viewerKind="finder" />
        </div>
      )}

      {closed ? (
        <p className="rounded-card bg-paper border border-hairline px-3 py-3 text-caption text-ink-700">
          The owner closed this conversation.
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
            <p role="alert" className="rounded-card bg-signal-50 px-3 py-2 text-caption text-signal-700">
              {error}
            </p>
          )}
        </div>
      )}

      {token && (
        <div className="rounded-card border border-hairline bg-paper p-qurtag-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-caption text-ink-700 text-pretty flex-1">
            This phone remembers your conversation. To open it somewhere else, keep this private link.
          </p>
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-pill border border-hairline-strong bg-canvas px-4 text-caption font-medium text-ink-900"
          >
            {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            {copied ? 'Link copied' : 'Copy my private link'}
          </button>
        </div>
      )}

      <div className="rounded-card bg-paper border border-hairline p-qurtag-3 flex items-start gap-3">
        <Lock size={16} strokeWidth={1.75} className="mt-0.5 text-ink-900 shrink-0" aria-hidden />
        <p className="text-caption text-ink-700 text-pretty">
          The owner sees only what you write. They do not see your phone number, email or location, and
          you do not see theirs. Do not share more than you want to.
        </p>
      </div>
    </div>
  );
}
