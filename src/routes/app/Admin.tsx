import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import {
  adminAccount,
  adminDeleteAccount,
  adminListAccounts,
  adminOverview,
  adminReportResolve,
  adminReportsList,
  adminSetMessageHidden,
  adminSetTag,
  adminSupportClose,
  adminSupportList,
  useIsSuperAdmin,
  type AdminAccountDetail,
  type AdminAccountRow,
  type AdminOverview,
  type AdminTag,
  type ReportAction,
  type ReportRow,
  type SupportRequestRow,
} from '@/lib/admin';

/**
 * /app/admin: for super admins only. A person who is not one is sent back to /app; the
 * real check is in the database on every call (db/admin.sql), so a hidden screen is not
 * what keeps this safe. Plain lists, no tables, so it works at phone width.
 */

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const stamp = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function Shell({ children, back }: { children: React.ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-6 md:px-8 md:pt-10">
      {back && (
        <Link to={back.to} className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-0.5 rounded-pill pl-1 pr-3 text-base text-ink-900 hover:bg-ink-50 md:text-sm md:text-muted">
          <ChevronLeft size={22} strokeWidth={2} aria-hidden />
          {back.label}
        </Link>
      )}
      {children}
    </div>
  );
}

function Heading({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-1" data-section={eyebrow}>
      <h1 className="break-words text-2xl font-semibold tracking-[-0.02em] text-ink-900 text-balance md:text-[2rem] md:leading-tight">
        {title}
      </h1>
      {sub && <p className="text-sm text-muted">{sub}</p>}
    </div>
  );
}

function Box({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="mb-qurtag-5 scroll-mt-4" id={id}>
      <h2 className="mb-3 text-lg font-semibold text-ink-900">{title}</h2>
      {children}
    </section>
  );
}

/** Wraps both pages: waits for the answer, sends everyone else away. */
function Gate({ children }: { children: React.ReactNode }) {
  const isAdmin = useIsSuperAdmin();
  if (isAdmin === null) {
    return (
      <Shell>
        <p className="text-body text-muted">Checking access...</p>
      </Shell>
    );
  }
  if (!isAdmin) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export function Admin() {
  return (
    <Gate>
      <AdminHome />
    </Gate>
  );
}

export function AdminAccountPage() {
  return (
    <Gate>
      <AccountView />
    </Gate>
  );
}

// ------------------------------------------------------------------ home

function Count({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-modal border border-hairline bg-canvas p-4">
      <div className="text-2xl font-semibold tabular-nums text-ink-900">{value}</div>
      <div className="text-sm text-muted">{label}</div>
    </div>
  );
}

function ReportsQueue() {
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await adminReportsList('open');
    if (r.ok) {
      setRows(r.data.reports);
      setError(null);
    } else setError(r.error);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  // A tap on an admin alert opens /app/admin#reported-notes.
  useEffect(() => {
    if (rows !== null && window.location.hash === '#reported-notes') document.getElementById('reported-notes')?.scrollIntoView();
  }, [rows]);
  async function act(id: string, action: ReportAction) {
    setWorking(`${id}:${action}`);
    const r = await adminReportResolve(id, action);
    setWorking(null);
    if (!r.ok) setError(r.error);
    await load();
  }
  const label = { harassment: 'Harassment', spam: 'Spam', threats: 'Threats', inappropriate: 'Inappropriate', other: 'Other' } as const;
  return (
    <Box title="Reported notes" id="reported-notes">
      {error && <p className="text-caption text-signal-600 mb-2">{error}</p>}
      <p className="text-caption text-muted mb-2">
        {rows === null ? 'Loading...' : `${rows.length} open, oldest first. Each is answered within 24 hours.`}
      </p>
      <ul className="rounded-modal border border-hairline bg-canvas overflow-hidden divide-y divide-hairline" data-testid="reports-queue">
        {(rows ?? []).map((q) => (
          <li key={q.id} className="p-3 flex flex-col gap-2">
            <div className="text-caption text-muted">
              {stamp(q.created_at)} · {label[q.reason]} · about {q.item_name}
              {q.reporter_email ? ` · reported by ${q.reporter_email}` : ''}
              {q.was_held ? ' · held by the filter' : ''}
            </div>
            <p className="text-body text-ink-900 whitespace-pre-wrap break-words rounded-card bg-ink-50 p-3">{q.message_text}</p>
            {q.comment && <p className="text-caption text-muted whitespace-pre-wrap break-words">Owner's comment: {q.comment}</p>}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={working !== null} onClick={() => void act(q.id, 'hide')}>
                {working === `${q.id}:hide` ? 'Hiding...' : 'Hide for everyone'}
              </Button>
              <Button variant="secondary" disabled={working !== null} onClick={() => void act(q.id, 'dismiss')}>
                {working === `${q.id}:dismiss` ? 'Dismissing...' : 'Dismiss'}
              </Button>
              <Button variant="secondary" disabled={working !== null} onClick={() => void act(q.id, 'block')}>
                {working === `${q.id}:block` ? 'Blocking...' : 'Block finder'}
              </Button>
            </div>
          </li>
        ))}
        {rows !== null && rows.length === 0 && <li className="p-3 text-caption text-muted">Nothing open.</li>}
      </ul>
    </Box>
  );
}

function SupportQueue() {
  const [rows, setRows] = useState<SupportRequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await adminSupportList('open');
    if (r.ok) {
      setRows(r.data.requests);
      setError(null);
    } else setError(r.error);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function close(id: string) {
    setClosing(id);
    const r = await adminSupportClose(id);
    setClosing(null);
    if (!r.ok) setError(r.error);
    await load();
  }
  return (
    <Box title="Contact requests">
      {error && <p className="text-caption text-signal-600 mb-2">{error}</p>}
      <p className="text-caption text-muted mb-2">{rows === null ? 'Loading...' : `${rows.length} open`}</p>
      <ul className="rounded-modal border border-hairline bg-canvas overflow-hidden divide-y divide-hairline">
        {(rows ?? []).map((q) => (
          <li key={q.id} className="p-3 flex flex-col gap-1">
            <div className="text-caption text-muted">
              {day(q.created_at)} · {q.topic}
              {q.plan ? ` · ${q.plan} plan` : ''} · reply to {q.reply_email ?? q.account_email ?? 'unknown'}
              {q.user_id && (
                <>
                  {' · '}
                  <Link to={`/app/admin/accounts/${q.user_id}`} className="underline underline-offset-4 text-ink-900">account</Link>
                </>
              )}
            </div>
            <p className="text-body text-ink-900 whitespace-pre-wrap break-words">{q.message}</p>
            <div>
              <Button variant="secondary" disabled={closing === q.id} onClick={() => void close(q.id)}>
                {closing === q.id ? 'Closing...' : 'Close'}
              </Button>
            </div>
          </li>
        ))}
        {rows !== null && rows.length === 0 && <li className="p-3 text-caption text-muted">Nothing open.</li>}
      </ul>
    </Box>
  );
}

function AdminHome() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<AdminAccountRow[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void adminOverview().then((r) => (r.ok ? setOverview(r.data) : setOverviewError(r.error)));
  }, []);

  const load = useCallback(async (term: string, offset: number) => {
    setBusy(true);
    const r = await adminListAccounts(term, offset);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setTotal(r.data.total);
    setRows((prev) => (offset === 0 ? r.data.accounts : [...prev, ...r.data.accounts]));
  }, []);

  useEffect(() => {
    void load(search, 0);
  }, [search, load]);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setSearch(typed.trim());
  }

  return (
    <Shell>
      <Heading eyebrow="Super admin" title="Admin" />

      <Box title="Counts">
        {overviewError && <p className="text-caption text-signal-600">{overviewError}</p>}
        {overview && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Count label="Accounts" value={overview.accounts} />
            <Count label="Accounts, last 7 days" value={overview.accounts_7d} />
            <Count label="Accounts, last 30 days" value={overview.accounts_30d} />
            <Count label="Items" value={overview.items} />
            <Count label="Tags" value={overview.tags} />
            <Count label="Tags switched on" value={overview.tags_active} />
            <Count label="Scans, 7 days" value={overview.scans_7d} />
            <Count label="Scans, 30 days" value={overview.scans_30d} />
            <Count label="Messages, 7 days" value={overview.messages_7d} />
            <Count label="Messages, 30 days" value={overview.messages_30d} />
          </div>
        )}
      </Box>

      <ReportsQueue />

      <SupportQueue />

      <Box title="Accounts">
        <form onSubmit={onSearch} className="flex flex-col sm:flex-row gap-2 mb-3">
          <div className="flex-1">
            <Input
              name="admin-search"
              type="search"
              placeholder="Search by email"
              aria-label="Search accounts by email"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </div>
          <Button type="submit" variant="secondary" size="lg">
            Search
          </Button>
        </form>
        {error && <p className="text-caption text-signal-600 mb-2">{error}</p>}
        <p className="text-caption text-muted mb-2">
          {busy && rows.length === 0 ? 'Loading...' : `${total} account${total === 1 ? '' : 's'}${search ? ` matching "${search}"` : ''}`}
        </p>
        <ul className="rounded-modal border border-hairline bg-canvas overflow-hidden divide-y divide-hairline">
          {rows.map((a) => (
            <li key={a.id}>
              <Link to={`/app/admin/accounts/${a.id}`} className="block p-3 min-h-11 hover:bg-paper transition-colors duration-qurtag">
                <div className="text-body text-ink-900 break-all flex items-center gap-2">
                  {a.email}
                  {a.is_admin && <ShieldCheck size={14} strokeWidth={1.75} aria-label="Super admin" className="shrink-0 text-muted" />}
                </div>
                <div className="text-caption text-muted">
                  Joined {day(a.joined)} · {a.item_count} item{a.item_count === 1 ? '' : 's'}
                </div>
              </Link>
            </li>
          ))}
          {!busy && rows.length === 0 && <li className="p-3 text-caption text-muted">No accounts found.</li>}
        </ul>
        {rows.length < total && (
          <div className="mt-3">
            <Button variant="secondary" disabled={busy} onClick={() => void load(search, rows.length)}>
              {busy ? 'Loading...' : 'Show more'}
            </Button>
          </div>
        )}
      </Box>
    </Shell>
  );
}

// ------------------------------------------------------------------ one account

function tagState(t: AdminTag): string {
  if (t.status === 'replaced') return 'Replaced by the owner';
  if (t.disabled_by_admin) return 'Switched off by an admin';
  return t.status === 'active' ? 'On' : 'Switched off by the owner';
}

function AccountView() {
  const { userId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState<AdminAccountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const r = await adminAccount(userId);
    if (r.ok) {
      setData(r.data);
      setError(null);
    } else setError(r.error);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setTag(t: AdminTag, active: boolean) {
    setWorking(t.id);
    const r = await adminSetTag(t.id, active);
    setWorking(null);
    if (!r.ok) toast.show({ kind: 'error', title: 'Could not change the tag', body: r.error });
    else toast.show({ kind: 'success', title: active ? 'Tag switched back on' : 'Tag switched off' });
    await load();
  }

  async function setHidden(id: string, hidden: boolean) {
    setWorking(id);
    const r = await adminSetMessageHidden(id, hidden);
    setWorking(null);
    if (!r.ok) toast.show({ kind: 'error', title: 'Could not change the message', body: r.error });
    else toast.show({ kind: 'success', title: hidden ? 'Message hidden' : 'Message shown again' });
    await load();
  }

  async function remove() {
    if (!data) return;
    setDeleting(true);
    const r = await adminDeleteAccount(data.account.id, typed);
    setDeleting(false);
    if (!r.ok) {
      toast.show({ kind: 'error', title: 'Could not delete the account', body: r.error });
      return;
    }
    toast.show({ kind: 'success', title: 'Account deleted' });
    setConfirmOpen(false);
    navigate('/app/admin', { replace: true });
  }

  const back = { to: '/app/admin', label: 'All accounts' };
  if (error && !data) {
    return (
      <Shell back={back}>
        <p className="text-body text-ink-900">{error}</p>
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell back={back}>
        <p className="text-body text-muted">Loading...</p>
      </Shell>
    );
  }

  const { account, items, tags, threads } = data;
  const itemName = (id: string | null) => items.find((i) => i.id === id)?.name ?? 'No item';
  const typedMatches = typed.trim().toLowerCase() === account.email.toLowerCase();

  return (
    <Shell back={back}>
      <Heading eyebrow={account.is_admin ? 'Super admin account' : 'Account'} title={account.email} sub={`Joined ${day(account.joined)}`} />

      <Box title={`Items (${items.length})`}>
        {items.length === 0 && <p className="text-caption text-muted">No items.</p>}
        <ul className="rounded-modal border border-hairline bg-canvas overflow-hidden divide-y divide-hairline">
          {items.map((i) => (
            <li key={i.id} className="p-3">
              <div className="text-body text-ink-900 break-words">{i.name}</div>
              <div className="text-caption text-muted break-words">
                {[i.brand, i.color].filter(Boolean).join(' · ') || 'No details'}
                {i.lost ? ' · Marked lost' : ''} · Added {day(i.created_at)}
              </div>
              {i.reward_text && <div className="text-caption text-muted break-words">Thank-you note: {i.reward_text}</div>}
            </li>
          ))}
        </ul>
      </Box>

      <Box title={`Tags (${tags.length})`}>
        {tags.length === 0 && <p className="text-caption text-muted">No tags.</p>}
        <ul className="rounded-modal border border-hairline bg-canvas overflow-hidden divide-y divide-hairline">
          {tags.map((t) => (
            <li key={t.id} className="p-3 flex flex-col gap-2">
              <div>
                <div className="text-body text-ink-900 break-words">{itemName(t.item_id)}</div>
                <div className="text-caption text-muted break-all">
                  Code {t.public_id} · {tagState(t)} · {t.scans_30d} scan{t.scans_30d === 1 ? '' : 's'} in 30 days
                </div>
              </div>
              {t.status !== 'replaced' && (
                <div>
                  {t.disabled_by_admin ? (
                    <Button size="sm" variant="secondary" disabled={working === t.id} onClick={() => void setTag(t, true)}>
                      Switch back on
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" disabled={working === t.id} onClick={() => void setTag(t, false)}>
                      Switch off
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Box>

      <Box title={`Messages (${threads.length} conversation${threads.length === 1 ? '' : 's'})`}>
        {threads.length === 0 && <p className="text-caption text-muted">No messages.</p>}
        <div className="flex flex-col gap-3">
          {threads.map((th) => (
            <div key={th.id} className="rounded-modal border border-hairline bg-canvas overflow-hidden">
              <div className="p-3 border-b border-hairline bg-paper text-caption text-muted break-words">
                About {th.item_name} · started {stamp(th.created_at)}
              </div>
              <ul className="divide-y divide-hairline">
                {th.messages.map((m) => (
                  <li key={m.id} className="p-3 flex flex-col gap-2">
                    <div className="text-caption text-muted">
                      {m.sender_kind === 'finder' ? 'Finder' : m.sender_kind === 'owner' ? 'Owner' : 'System'} · {stamp(m.created_at)}
                      {m.hidden ? ' · Hidden' : ''}
                    </div>
                    <p className={`text-body whitespace-pre-wrap break-words ${m.hidden ? 'text-muted' : 'text-ink-900'}`}>{m.body}</p>
                    <div>
                      <Button size="sm" variant="secondary" disabled={working === m.id} onClick={() => void setHidden(m.id, !m.hidden)}>
                        {m.hidden ? 'Show again' : 'Hide this message'}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Box>

      <Box title="Delete this account">
        {account.is_admin ? (
          <p className="text-caption text-muted">A super admin account cannot be deleted here.</p>
        ) : (
          <>
            <p className="text-caption text-muted mb-3 max-w-md">
              This removes the account and all of its items, tags, scans and messages for good. You will be asked to type the account's email.
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                setTyped('');
                setConfirmOpen(true);
              }}
            >
              Delete account
            </Button>
          </>
        )}
      </Box>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Delete this account?"
        eyebrow="Cannot be undone"
        description={`Type ${account.email} to confirm.`}
        primaryAction={{ label: 'Delete for good', tone: 'destructive', disabled: !typedMatches, pending: deleting, onClick: remove }}
        secondaryAction={{ label: 'Cancel', onClick: () => setConfirmOpen(false) }}
      >
        <Input
          name="admin-confirm-email"
          aria-label="Type the account's email to confirm"
          placeholder={account.email}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </Modal>
    </Shell>
  );
}
