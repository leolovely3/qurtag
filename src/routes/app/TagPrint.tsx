import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Printer, Scissors } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Wordmark } from '@/components/brand/Wordmark';
import { Eyebrow } from '@/components/brand/Typography';
import { useAuth } from '@/lib/auth';
import { fetchItemById, fetchTagById } from '@/lib/queries';
import type { Item, Tag } from '@/lib/database.types';

export function TagPrint() {
  const { tagId } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [tag, setTag] = useState<Tag | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/start', { replace: true });
      return;
    }
    if (!tagId) return;
    let cancelled = false;
    (async () => {
      const t = await fetchTagById(tagId);
      if (cancelled) return;
      setTag(t);
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
    return `${window.location.origin}/find/${tag.public_id}`;
  }, [tag]);

  if (loading || fetching) {
    return (
      <Container size="md">
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="size-7 rounded-full border-2 border-ink-100 border-t-ink-900 animate-spin" />
        </div>
      </Container>
    );
  }

  if (!tag) {
    return (
      <Container size="md">
        <div className="min-h-[60vh] flex flex-col items-start gap-3 py-cairn-12">
          <Eyebrow>Tag not found</Eyebrow>
          <h1 className="font-display font-semibold text-h3 text-ink-900 tracking-[-0.022em]">
            That tag isn't in your account.
          </h1>
          <Link to="/app" className="link-arrow text-body">
            Back to your items →
          </Link>
        </div>
      </Container>
    );
  }

  return (
    <Container size="md">
      {/* Toolbar. Hidden in print */}
      <div className="no-print py-cairn-3 flex items-center justify-between gap-3 border-b border-hairline">
        <Link
          to="/app"
          className="inline-flex items-center gap-2 text-caption text-muted hover:text-ink-900 transition-colors"
        >
          <ArrowLeft size={14} strokeWidth={1.75} />
          Your items
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-caption text-muted hidden sm:inline">
            Press print, then "Save as PDF" to keep a copy.
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-10 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-4 hover:bg-ink-700 transition-colors duration-cairn"
          >
            <Printer size={14} strokeWidth={1.75} />
            Print tag
          </button>
        </div>
      </div>

      {/* The printable area */}
      <div className="py-cairn-8 flex justify-center">
        <article className="w-full max-w-2xl bg-canvas border border-hairline rounded-modal p-cairn-8 print:border-0 print:rounded-none print:shadow-none shadow-card">
          <div className="flex items-start justify-between mb-cairn-5">
            <Wordmark />
            <span className="text-eyebrow uppercase tracking-[0.14em] text-muted">
              Tag · {tag.public_id}
            </span>
          </div>

          <div className="grid sm:grid-cols-2 gap-cairn-5 items-center">
            <div className="flex flex-col gap-3">
              <Eyebrow>If found</Eyebrow>
              <h2 className="font-display font-semibold text-h2 sm:text-h1 text-ink-900 tracking-[-0.028em] leading-[0.98] text-balance">
                Please scan.
              </h2>
              <p className="text-body text-ink-700 max-w-sm text-pretty">
                The owner will be notified instantly. You'll never see their phone, email, or
                address, and they'll never see yours.
              </p>
              {item && (
                <p className="text-caption text-muted mt-2">
                  Linked to: <span className="text-ink-900 font-medium">{item.name}</span>
                </p>
              )}
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-modal bg-canvas border border-hairline-strong p-4">
                <QRCodeSVG
                  value={finderUrl}
                  size={208}
                  level="H"
                  marginSize={0}
                  bgColor="#FFFFFF"
                  fgColor="#0A0B0F"
                />
              </div>
              <span className="text-caption text-muted text-center font-mono break-all">
                {finderUrl.replace(/^https?:\/\//, '')}
              </span>
            </div>
          </div>

          {/* Fold + cut guide */}
          <div className="mt-cairn-8 flex items-center gap-3 text-caption text-muted">
            <Scissors size={14} strokeWidth={1.75} />
            <span>Cut along the inside edge. Fold around a luggage tag sleeve or laminate.</span>
          </div>
        </article>
      </div>

      <div className="no-print pb-cairn-8 max-w-2xl mx-auto flex flex-col gap-2">
        <p className="text-caption text-muted">
          Tip: print on heavier paper (110gsm) or stick the cut-out onto an existing luggage tag.
          Laminating it doubles the lifetime.
        </p>
        <Link to="/app" className="link-arrow text-caption text-ink-900">
          Done. Take me to my items →
        </Link>
      </div>
    </Container>
  );
}
