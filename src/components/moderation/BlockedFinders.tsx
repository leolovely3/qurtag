import { useCallback, useEffect, useState } from 'react';
import { ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { fetchBlockedFinders, unblockFinder, type BlockedFinder } from '@/lib/queries';

function day(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Settings: the finders the owner blocked, with a way to unblock each. A finder has no name or
 * contact details, so a row says which item the conversation was about and when it was blocked.
 * One a QuR Tag admin blocked cannot be unblocked here.
 */
export function BlockedFinders() {
  const [rows, setRows] = useState<BlockedFinder[] | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const toast = useToast();
  const load = useCallback(async () => setRows(await fetchBlockedFinders()), []);
  useEffect(() => {
    void load();
  }, [load]);

  async function unblock(id: string) {
    setWorking(id);
    const r = await unblockFinder(id);
    setWorking(null);
    if (!r.ok) {
      toast.show({
        kind: 'error',
        title: r.byAdmin ? 'This finder was blocked by QuR Tag' : "Couldn't unblock this finder",
        body: r.byAdmin ? 'Write to info@impactconsulting.ai if you think that was a mistake.' : 'Check your connection and try again.',
      });
    } else {
      toast.show({ kind: 'success', title: 'Finder unblocked', body: 'Their conversation is back in your inbox.' });
    }
    await load();
  }

  if (rows === null) return <p className="px-4 py-4 text-sm text-muted">Loading...</p>;
  if (rows.length === 0) return <p className="px-4 py-4 text-sm text-muted">You have not blocked anyone.</p>;
  return (
    <ul className="divide-y divide-hairline" aria-label="Blocked finders">
      {rows.map((b) => (
        <li key={b.thread_id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-card bg-ink-100">
              <ShieldOff size={18} strokeWidth={1.75} className="text-ink-900" aria-hidden />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="break-words text-base font-medium text-ink-900">A finder of your {b.item_name}</span>
              <span className="text-sm text-muted">
                Blocked {day(b.blocked_at)} · {b.notes} {b.notes === 1 ? 'note' : 'notes'}
                {b.by_admin ? ' · blocked by QuR Tag' : ''}
              </span>
            </div>
          </div>
          {!b.by_admin && (
            <Button variant="secondary" disabled={working === b.thread_id} onClick={() => void unblock(b.thread_id)}>
              {working === b.thread_id ? 'Unblocking...' : 'Unblock'}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
