import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox as InboxIcon, MapPin, Package } from 'lucide-react';
import { Eyebrow } from '@/components/brand/Typography';
import { ThreadRowSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/lib/auth';
import { fetchPrimaryHouseholdId, fetchThreadsForHousehold, type ThreadWithItem } from '@/lib/queries';
import { isSupabaseConfigured } from '@/lib/supabase';
import { cn } from '@/lib/cn';

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}

export function Inbox() {
  const { user, loading: authLoading } = useAuth();
  const [threads, setThreads] = useState<ThreadWithItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const hh = await fetchPrimaryHouseholdId();
      if (cancelled || !hh) {
        setLoading(false);
        return;
      }
      const t = await fetchThreadsForHousehold(hh);
      if (cancelled) return;
      setThreads(t);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  const unreadTotal = useMemo(
    () => threads.reduce((sum, t) => sum + t.unread_count, 0),
    [threads],
  );

  return (
    <div className="px-cairn-5 md:px-cairn-8 py-cairn-8 max-w-4xl">
      <div className="flex flex-col gap-2 mb-cairn-8">
        <Eyebrow>Inbox</Eyebrow>
        <h1 className="font-display font-semibold text-ink-900 text-h3 sm:text-h2 tracking-[-0.028em] leading-[1.04] text-balance">
          {unreadTotal > 0
            ? `${unreadTotal} new note${unreadTotal === 1 ? '' : 's'} to read.`
            : 'Quiet inbox.'}
        </h1>
      </div>

      {loading && (
        <div className="rounded-modal border border-hairline bg-canvas overflow-hidden">
          <ThreadRowSkeleton />
          <ThreadRowSkeleton />
          <ThreadRowSkeleton />
        </div>
      )}

      {!loading && threads.length === 0 && (
        <div className="rounded-modal border border-hairline bg-paper p-cairn-8 flex flex-col items-start gap-3">
          <div className="size-12 rounded-pill bg-canvas grid place-items-center shadow-card">
            <InboxIcon size={20} strokeWidth={1.5} className="text-ink-900" />
          </div>
          <h2 className="font-display font-semibold text-h4 text-ink-900 tracking-[-0.018em]">
            No conversations yet.
          </h2>
          <p className="text-body text-muted text-pretty max-w-md">
            When someone scans one of your tags and sends a note, it shows up here. We'll also
            email and push to you if you have those turned on.
          </p>
        </div>
      )}

      {!loading && threads.length > 0 && (
        <ul className="rounded-modal border border-hairline bg-canvas overflow-hidden divide-y divide-hairline">
          {threads.map((thread) => (
            <li key={thread.id}>
              <Link
                to={`/app/inbox/${thread.id}`}
                className="flex items-start gap-cairn-3 p-cairn-3 hover:bg-paper transition-colors duration-cairn"
              >
                {thread.item?.hero_photo_url ? (
                  <img
                    src={thread.item.hero_photo_url}
                    alt=""
                    className="size-12 rounded-card object-cover bg-ink-50 shrink-0"
                  />
                ) : (
                  <div className="size-12 rounded-card bg-ink-50 grid place-items-center shrink-0">
                    <Package size={16} strokeWidth={1.5} className="text-muted" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <h3
                      className={cn(
                        'font-display text-h6 tracking-[-0.011em] truncate',
                        thread.unread_count > 0
                          ? 'font-semibold text-ink-900'
                          : 'font-medium text-ink-700',
                      )}
                    >
                      {thread.item?.name ?? 'An item'}
                    </h3>
                    <span className="text-caption text-muted shrink-0">
                      {relativeTime(thread.last_message_at)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      'text-caption mt-0.5 truncate',
                      thread.unread_count > 0 ? 'text-ink-900' : 'text-muted',
                    )}
                  >
                    {thread.last_message
                      ? `${thread.last_message.sender_kind === 'finder' ? 'They wrote: ' : 'You wrote: '}${thread.last_message.body}`
                      : 'No messages yet.'}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-caption text-muted">
                    {thread.item?.brand && (
                      <span className="inline-flex items-center gap-1">{thread.item.brand}</span>
                    )}
                    {thread.item?.lost_mode && (
                      <span className="inline-flex items-center gap-1 text-signal-700">
                        <MapPin size={11} strokeWidth={1.75} /> Armed
                      </span>
                    )}
                    {thread.unread_count > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-pill bg-signal-500 text-canvas px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                        {thread.unread_count} new
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
