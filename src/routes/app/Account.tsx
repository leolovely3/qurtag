import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, KeyRound, LogOut, Mail, Trash2 } from 'lucide-react';
import { AppPage, AppSection } from '@/components/layout/AppPage';
import { Avatar } from '@/components/account/Account';
import { buttonClasses } from '@/components/ui/Button';
import { Input, ShowToggle } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/auth';
import { exportMyData } from '@/lib/queries';
import { DELETE_WORD, needsTypedConfirm, typedOk } from '@/lib/accountDelete';
import { fetchFamily, fetchMembership } from '@/lib/membership';
import { saveFile } from '@/lib/saveFile';
import { useMembershipsAvailable } from '@/lib/useMembershipsAvailable';
import { cn } from '@/lib/cn';

/**
 * /app/account, opened from the account card in Settings (and the avatar on Items): who you
 * are, your password, your data, and, at the very bottom and apart from the rest, signing out.
 *
 * The display name is kept by the sign-in service (auth_users.name). The email is shown and not
 * editable: changing it needs a confirmation email through the sign-in service, which is not set up, so the
 * screen says where to write instead of offering a button that cannot work.
 */
export function Account() {
  const { user, signOut, deleteAccount, updateName, changePassword } = useAuth();
  const memberships = useMembershipsAvailable();
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? '');
  // The account loads after the screen opens when it is reached by address.
  useEffect(() => setName(user?.name ?? ''), [user?.name]);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');
  const [pwOpen, setPwOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [show, setShow] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState('');
  const [mustType, setMustType] = useState(false);
  // How much would go: asked when the dialog opens, so the typed word is asked for only when it matters.
  useEffect(() => {
    if (!deleteOpen) return;
    setTyped('');
    void Promise.all([fetchMembership(), fetchFamily()]).then(([m, f]) => {
      const people = (f?.members ?? []).filter((p) => p.user_id !== user?.id).length + (f?.invites?.length ?? 0);
      setMustType(needsTypedConfirm({ itemsUsed: m?.items_used ?? 0, familyRole: f?.role ?? 'none', otherPeople: people }));
    });
  }, [deleteOpen, user?.id]);
  const [signOutOpen, setSignOutOpen] = useState(false);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setNameError('');
    setSavingName(true);
    const r = await updateName(name);
    setSavingName(false);
    if (!r.ok) setNameError(r.error);
    else toast.show({ kind: 'success', title: 'Name saved' });
  }

  async function submitPassword() {
    setPwError('');
    setPwBusy(true);
    const r = await changePassword(current, next);
    setPwBusy(false);
    if (!r.ok) {
      setPwError(r.error);
      return;
    }
    setPwOpen(false);
    setCurrent('');
    setNext('');
    toast.show({ kind: 'success', title: 'Password changed', body: 'Your other devices were signed out.' });
  }

  async function handleExport() {
    setExporting(true);
    try {
      const data = await exportMyData();
      await saveFile({
        filename: 'qurtag-my-data.json',
        mime: 'application/json',
        text: JSON.stringify({ account: { email: user?.email, name: user?.name }, ...data }, null, 2),
        dialogTitle: 'Save your data',
      });
    } catch {
      toast.show({ kind: 'error', title: "Couldn't prepare your data", body: 'Your file was not saved. Try again in a moment.' });
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    const r = await deleteAccount();
    setDeleting(false);
    if (!r.ok) {
      toast.show({ kind: 'error', title: "Couldn't delete your account", body: r.error });
      return;
    }
    setDeleteOpen(false);
    navigate('/', { replace: true });
  }

  async function handleSignOut() {
    await signOut();
    navigate('/start', { replace: true });
  }

  const row =
    'flex min-h-14 w-full items-center gap-3 border-t border-hairline px-4 py-3 text-left transition-colors first:border-t-0 hover:bg-ink-50 active:bg-ink-50 disabled:opacity-60 focus-visible:outline-offset-[-2px]';
  const icon = (I: typeof Mail, danger = false) => (
    <span className={cn('grid size-[36px] shrink-0 place-items-center ax:hidden rounded-card', danger ? 'bg-signal-50' : 'bg-ink-100')}>
      <I size={18} strokeWidth={1.75} className={danger ? 'text-signal-700' : 'text-ink-900'} aria-hidden />
    </span>
  );

  return (
    <AppPage title="Account" back={{ to: '/app/settings', label: 'Settings' }} width="narrow">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 py-2">
          <Avatar size={72} />
          <p className="text-sm text-muted [overflow-wrap:anywhere]">{user?.email}</p>
        </div>

        <AppSection title="Your name" description="Shown on your account card. Finders never see it.">
          <form onSubmit={saveName} className="flex flex-col gap-3 p-4">
            <Input name="name" label="Display name" autoComplete="name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} error={nameError || undefined} />
            <button type="submit" disabled={savingName || !name.trim() || name.trim() === (user?.name ?? '')} className={buttonClasses({ variant: 'primary', className: 'self-start' })}>
              {savingName ? 'Saving…' : 'Save name'}
            </button>
          </form>
        </AppSection>

        <AppSection title="Sign-in">
          <div className={cn(row, 'cursor-default hover:bg-transparent active:bg-transparent')}>
            {icon(Mail)}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-base font-medium text-ink-900 [overflow-wrap:anywhere]">{user?.email}</span>
              <span className="text-sm text-muted text-pretty">The email you sign in with. To change it, write to info@impactconsulting.ai. Finders never see it.</span>
            </span>
          </div>
          <button type="button" onClick={() => setPwOpen(true)} className={row}>
            {icon(KeyRound)}
            <span className="flex-1 text-base font-medium text-ink-900">Change password</span>
          </button>
        </AppSection>

        <AppSection title="Your data">
          <button type="button" onClick={handleExport} disabled={exporting} className={row}>
            {icon(Download)}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-base font-medium text-ink-900">{exporting ? 'Preparing your file…' : 'Download my data'}</span>
              <span className="text-sm text-muted text-pretty">
                {memberships
                  ? 'Your items, tags, scans and conversations, as a file. On the Free plan the file holds the last 30 days of scans.'
                  : 'Your items, tags, scans and conversations, as a file.'}
              </span>
            </span>
          </button>
        </AppSection>

        <AppSection description="Deletes your account, items, tags and conversations for good. Your tags stop working.">
          <button type="button" onClick={() => setDeleteOpen(true)} className={row}>
            {icon(Trash2, true)}
            <span className="text-base font-medium text-signal-700">Delete my account</span>
          </button>
        </AppSection>

        {/* Apart from everything else, so it cannot be tapped by accident. */}
        <div className="mt-10 border-t border-hairline pt-6">
          <button type="button" onClick={() => setSignOutOpen(true)} className={buttonClasses({ variant: 'secondary', size: 'lg', block: true })}>
            <LogOut size={18} strokeWidth={1.75} aria-hidden />
            Sign out
          </button>
        </div>
      </div>

      <Modal
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        title="Change your password"
        description="Your other devices will be signed out."
        primaryAction={{ label: 'Change password', onClick: submitPassword, pending: pwBusy, disabled: !current || next.length < 8 }}
        secondaryAction={{ label: 'Cancel', onClick: () => setPwOpen(false) }}
      >
        <div className="flex flex-col gap-3">
          <Input name="current" type={show ? 'text' : 'password'} label="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          <Input
            name="new"
            type={show ? 'text' : 'password'}
            label="New password"
            autoComplete="new-password"
            hint="At least 8 characters."
            value={next}
            onChange={(e) => setNext(e.target.value)}
            trailing={<ShowToggle shown={show} onToggle={() => setShow((v) => !v)} />}
            error={pwError || undefined}
          />
        </div>
      </Modal>

      <Modal
        open={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        title="Sign out of QuR Tag?"
        description="Your tags keep working and finders can still write to you. You will need your email and password to sign back in."
        primaryAction={{ label: 'Sign out', onClick: handleSignOut }}
        secondaryAction={{ label: 'Cancel', onClick: () => setSignOutOpen(false) }}
      />

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete your QuR Tag account?"
        description={
          memberships
            ? "Your account, items, tags, scans and conversations are deleted at once and cannot be brought back. Any tag you printed stops working. If you have a family, its members lose access to the family's items. A membership that is still renewing must be canceled first."
            : 'Your account, items, tags, scans and conversations are deleted at once and cannot be brought back. Any tag you printed stops working.'
        }
        primaryAction={{ label: 'Delete everything', tone: 'destructive', onClick: handleDelete, pending: deleting, disabled: mustType && !typedOk(typed) }}
        secondaryAction={{ label: 'Cancel', onClick: () => setDeleteOpen(false) }}
      >
        <button type="button" onClick={handleExport} disabled={exporting} className={buttonClasses({ variant: 'secondary', className: 'self-start' })}>
          <Download size={16} strokeWidth={1.75} aria-hidden />
          {exporting ? 'Preparing your file…' : 'Download my data first'}
        </button>
        {mustType && (
          <Input
            name="confirm-delete"
            label={`Type ${DELETE_WORD} to confirm`}
            autoComplete="off"
            autoCapitalize="characters"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            hint="You have several items or a family, so we ask once more."
          />
        )}
      </Modal>
    </AppPage>
  );
}
