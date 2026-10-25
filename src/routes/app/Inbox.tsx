import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox as InboxIcon } from 'lucide-react';
import { AppPage } from '@/components/layout/AppPage';
import { ItemThumb, LostChip } from './Home';
import { ThreadRowSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/lib/auth';
import { fetchPrimaryHouseholdId, fetchThreadsForHousehold, type ThreadWithItem } from '@/lib/queries';
import { cn } from '@/lib/cn';
import { usePoll } from '@/lib/realtime';

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'now';
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
    if (authLoading || !user) {
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

  // New notes from finders: ask again every few seconds while the inbox is open.
  usePoll(async () => {
    const hh = await fetchPrimaryHouseholdId();
    if (hh) setThreads(await fetchThreadsForHousehold(hh));
  }, !!user && !loading);

  const unreadTotal = useMemo(
    () => threads.reduce((sum, t) => sum + t.unread_count, 0),
    [threads],
  );

  return (
    <AppPage title="Inbox" subtitle={loading ? '\u00a0' : unreadTotal > 0 ? `${unreadTotal} new note${unreadTotal === 1 ? '' : 's'}` : 'Notes from people who scan your tags'}>
      {loading && (
        <div className="overflow-hidden rounded-modal border border-hairline bg-canvas divide-y divide-hairline" aria-busy="true" aria-label="Loading your inbox">
          <ThreadRowSkeleton />
          <ThreadRowSkeleton />
          <ThreadRowSkeleton />
        </div>
      )}

      {!loading && threads.length === 0 && (
        <section className="flex flex-col items-center gap-3 rounded-modal border border-hairline bg-paper px-6 py-10 text-center">
          <div className="grid size-14 place-items-center rounded-modal bg-canvas shadow-card">
            <InboxIcon size={24} strokeWidth={1.75} className="text-ink-900" aria-hidden />
          </div>
          <h2 className="text-xl font-semibold text-ink-900">No notes yet</h2>
          <p className="max-w-sm text-base text-muted text-pretty">
            When someone scans one of your tags and writes to you, the note shows up here. Email alerts
            are not switched on yet, so check back here when something is lost.
          </p>
        </section>
      )}

      {!loading && threads.length > 0 && (
        <ul className="overflow-hidden rounded-modal border border-hairline bg-canvas divide-y divide-hairline">
          {threads.map((thread) => {
            const unread = thread.unread_count > 0;
            return (
              <li key={thread.id}>
                <Link
                  to={`/app/inbox/${thread.id}`}
                  className="flex items-start gap-3 px-4 py-3 transition-colors duration-150 hover:bg-ink-50 focus-visible:outline-offset-[-2px] active:bg-ink-50"
                >
                  <ItemThumb src={thread.item?.hero_photo_url} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3
                        className={cn(
                          'min-w-0 break-words text-base leading-snug',
                          unread ? 'font-semibold text-ink-900' : 'font-medium text-ink-900',
                        )}
                      >
                        {thread.item?.name ?? 'An item'}
                      </h3>
                      <span className={cn('shrink-0 text-sm', unread ? 'font-semibold text-signal-700' : 'text-muted')}>
                        {relativeTime(thread.last_message_at)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-start gap-2">
                      <p className={cn('line-clamp-2 min-w-0 flex-1 text-sm', unread ? 'text-ink-900' : 'text-muted')}>
                        {thread.last_message
                          ? `${thread.last_message.sender_kind === 'finder' ? 'They wrote: ' : 'You: '}${thread.last_message.body}`
                          : 'No messages yet.'}
                      </p>
                      {unread && (
                        <span className="mt-0.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-pill bg-signal-700 px-1.5 text-xs font-semibold text-canvas">
                          {thread.unread_count}
                          <span className="sr-only"> new</span>
                        </span>
                      )}
                    </div>
                    {(thread.status !== 'open' || thread.item?.lost_mode) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {thread.status !== 'open' && (
                          <span className="inline-flex h-6 items-center rounded-pill bg-ink-100 px-2 text-xs font-medium text-ink-700">
                            {thread.status === 'reunited' ? 'Back with you' : 'Closed'}
                          </span>
                        )}
                        <LostChip lost={!!thread.item?.lost_mode} />
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AppPage>
  );
}
