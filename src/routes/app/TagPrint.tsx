import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, Scissors } from 'lucide-react';
import { AppPage } from '@/components/layout/AppPage';
import { TagLogo } from '@/components/brand/Wordmark';
import { buttonClasses } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/lib/auth';
import { isNative, publicUrl } from '@/lib/platform';
import { shareTagPdf } from '@/lib/tagPdf';
import { fetchItemById, fetchTagById } from '@/lib/queries';
import type { Item, Tag } from '@/lib/database.types';

export function TagPrint() {
  const { tagId } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [tag, setTag] = useState<Tag | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [fetching, setFetching] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [shareError, setShareError] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/start', { replace: true });
      return;
    }
    if (!tagId) return;
    let cancelled = false;
    // A switched-off or replaced tag is not printed: its page says "not registered".
    (async () => {
      const t = await fetchTagById(tagId);
      if (cancelled) return;
      setTag(t && t.status === 'active' ? t : null);
      if (t?.current_item_id) {
        const i = await fetchItemById(t.current_item_id);
        if (cancelled) return;
        setItem(i);
      }
      setFetching(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tagId, user, loading, navigate]);

  const finderUrl = useMemo(() => {
    if (!tag) return '';
    return publicUrl(`/find/${tag.public_id}`);
  }, [tag]);

  async function printInApp() {
    if (!tag) return;
    setShareError('');
    setPreparing(true);
    try {
      await shareTagPdf({ publicId: tag.public_id, finderUrl, itemName: item?.name });
    } catch (err) {
      // Closing the share sheet without choosing anything is not a failure.
      const message = err instanceof Error ? err.message : '';
      if (!/cancel/i.test(message)) setShareError('The tag could not be prepared. Please try again.');
    } finally {
      setPreparing(false);
    }
  }

  const back = { to: tag?.current_item_id ? `/app/items/${tag.current_item_id}` : '/app', label: tag?.current_item_id ? 'Item' : 'Items' };

  if (loading || fetching) {
    return (
      <AppPage title="Tag" back={{ to: '/app', label: 'Items' }} width="normal">
        <Skeleton className="mx-auto h-[26rem] w-full max-w-2xl rounded-modal" />
      </AppPage>
    );
  }

  if (!tag) {
    return (
      <AppPage title="Tag" back={{ to: '/app', label: 'Items' }} width="normal">
        <section className="flex flex-col items-center gap-3 rounded-modal border border-hairline bg-paper px-6 py-10 text-center">
          <h2 className="text-xl font-semibold text-ink-900">Tag not found</h2>
          <p className="max-w-sm text-base text-muted">That tag isn't in your account, or it is switched off.</p>
          <Link to="/app" className={buttonClasses({ variant: 'secondary', className: 'mt-2' })}>
            Back to Items
          </Link>
        </section>
      </AppPage>
    );
  }

  const printButton = (
    <button
      type="button"
      disabled={preparing}
      onClick={() => (isNative() ? void printInApp() : window.print())}
      className={buttonClasses({ variant: 'primary', className: 'px-4' })}
    >
      <Printer size={16} strokeWidth={1.75} aria-hidden />
      {preparing ? 'Preparing…' : 'Print'}
    </button>
  );

  return (
    <AppPage title="Tag" back={back} action={printButton} width="normal">
      <style>{`
        @media print {
          body { background: white !important; }
          @page { size: Letter; margin: 0.5in; }
        }
      `}</style>

      {shareError && (
        <p role="alert" className="no-print mb-4 rounded-card bg-signal-50 px-4 py-3 text-sm text-signal-700">
          {shareError}
        </p>
      )}

      {/* The printable tag */}
      <div className="flex justify-center print:block">
        <article className="w-full max-w-2xl rounded-modal border border-hairline bg-white p-6 text-[#0A0B0F] shadow-card sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <div className="mb-6">
            <TagLogo />
          </div>

          <div className="grid items-center gap-6 sm:grid-cols-2 sm:gap-8">
            <div className="flex flex-col gap-3">
              <h2 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-[#0A0B0F]">
                If found, please scan.
              </h2>
              <p className="max-w-sm text-base text-[#34363D] text-pretty">
                Point your phone camera at the code to send the owner a note. No app needed, and
                neither of you sees the other's phone number or email.
              </p>
              {item && (
                <p className="mt-1 text-sm text-[#52545B]">
                  On: <span className="font-medium text-[#0A0B0F]">{item.name}</span>
                </p>
              )}
            </div>
            <div className="flex flex-col items-center gap-3">
              {/* White in every theme: a QR code needs a light quiet zone around it to scan. */}
              <div className="rounded-modal border border-black/15 bg-white p-4">
                <QRCodeSVG value={finderUrl} size={200} level="H" marginSize={0} bgColor="#FFFFFF" fgColor="#0A0B0F" />
              </div>
              {/* The address carries the tag's code, which is case-sensitive: never shown in capitals. */}
              <span className="break-all text-center font-mono text-sm text-[#52545B]">
                {finderUrl.replace(/^https?:\/\//, '')}
              </span>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2 border-t border-dashed border-black/20 pt-4 text-sm text-[#52545B]">
            <Scissors size={16} strokeWidth={1.75} aria-hidden />
            <span>Cut it out. Tape it on, slip it into a tag holder, or stick it inside a lid.</span>
          </div>
        </article>
      </div>

      <div className="no-print mx-auto mt-6 flex max-w-2xl flex-col gap-4">
        <p className="px-1 text-sm text-muted text-pretty">
          {isNative()
            ? 'Print opens the share sheet: print it, save it to Files or AirDrop it to a computer.'
            : 'Print, or choose "Save as PDF" in the print window to keep a copy.'}{' '}
          Sticker paper or thick paper lasts longest; clear tape over it keeps rain off. You can print
          this tag again at any time.
        </p>
        <Link to="/app" className={buttonClasses({ variant: 'secondary', size: 'lg', block: true, className: 'sm:w-auto sm:self-start' })}>
          Done
        </Link>
      </div>
    </AppPage>
  );
}
