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
        <div className="min-h-[60vh] flex flex-col items-start gap-3 py-qurtag-12">
          <Eyebrow>Tag not found</Eyebrow>
          <h1 className="font-display font-semibold text-h3 text-ink-900 tracking-[-0.022em]">
            That tag isn't in your account, or it is switched off.
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
      <div className="no-print py-qurtag-3 flex items-center justify-between gap-3 border-b border-hairline">
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
            className="inline-flex h-10 items-center gap-2 rounded-pill bg-ink-900 text-canvas text-caption font-medium px-4 hover:bg-ink-700 transition-colors duration-qurtag"
          >
            <Printer size={14} strokeWidth={1.75} />
            Print tag
          </button>
        </div>
      </div>

      {/* The printable area */}
      <div className="py-qurtag-8 flex justify-center">
        <article className="w-full max-w-2xl bg-canvas border border-hairline rounded-modal p-qurtag-8 print:border-0 print:rounded-none print:shadow-none shadow-card">
          <div className="flex items-start justify-between mb-qurtag-5">
            <Wordmark />
            {/* Tag codes are case-sensitive, so this is never shown in capitals. */}
            <span className="text-caption text-muted font-mono">
              Tag {tag.public_id}
            </span>
          </div>

          <div className="grid sm:grid-cols-2 gap-qurtag-5 items-center">
            <div className="flex flex-col gap-3">
              <Eyebrow>If found</Eyebrow>
              <h2 className="font-display font-semibold text-h2 sm:text-h1 text-ink-900 tracking-[-0.028em] leading-[0.98] text-balance">
                Please scan.
              </h2>
              <p className="text-body text-ink-700 max-w-sm text-pretty">
                Scan with your phone camera to send the owner a note. No app needed. Neither of
                you sees the other's phone number or email.
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
          <div className="mt-qurtag-8 flex items-center gap-3 text-caption text-muted">
            <Scissors size={14} strokeWidth={1.75} />
            <span>Cut it out. Tape it on, slip it into a tag holder, or stick it inside a lid.</span>
          </div>
        </article>
      </div>

      <div className="no-print pb-qurtag-8 max-w-2xl mx-auto flex flex-col gap-2">
        <p className="text-caption text-muted">
          Tip: print on sticker paper or thick paper, and cover it with clear tape so rain and
          washing do not wear it out. You can print this page again at any time.
        </p>
        <Link to="/app" className="link-arrow text-caption text-ink-900">
          Done. Take me to my items →
        </Link>
      </div>
    </Container>
  );
}
