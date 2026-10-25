import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Download, ImageDown, Printer } from 'lucide-react';
import { AppPage } from '@/components/layout/AppPage';
import { HelpLink } from '@/components/account/Account';
import { recordStep } from '@/lib/useGettingStarted';
import { buttonClasses } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/lib/auth';
import { isNative, publicUrl } from '@/lib/platform';
import { cn } from '@/lib/cn';
import { saveTagPdf, saveTagPng } from '@/lib/tagExport';
import { recordTagPrint, type PrintAction } from '@/lib/measures';
import {
  BLEED_IN,
  LOOKS,
  PAPERS,
  STYLES,
  copiesOnPage,
  copyChoices,
  defaultPaper,
  gridFor,
  printReadySize,
  styleById,
  type LookId,
  type PaperId,
  type StyleId,
} from '@/lib/tagLayout';
import { pageToSvg } from '@/lib/tagSvg';
import { buildPreview, buildPrintReady, buildSheet } from '@/lib/tagStyles';
import { fetchItemById, fetchTagById } from '@/lib/queries';
import type { Item, Tag } from '@/lib/database.types';

const STORE = 'qurtag.tagstyle';

function remembered<T extends string>(key: string, allowed: T[], fallback: T): T {
  try {
    const v = (JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, string>)[key];
    return allowed.includes(v as T) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function remember(values: Record<string, string>): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(values));
  } catch {
    /* private window: nothing to remember */
  }
}

export function TagPrint() {
  const { tagId } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [tag, setTag] = useState<Tag | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [fetching, setFetching] = useState(true);
  const [busy, setBusy] = useState<'pdf' | 'png' | 'pdf2' | null>(null);
  const [error, setError] = useState('');
  const [styleId, setStyleId] = useState<StyleId>(() => remembered('style', STYLES.map((s) => s.id), 'wallet'));
  const [look, setLook] = useState<LookId>(() => remembered('look', LOOKS.map((l) => l.id), 'clean'));
  const [paperId, setPaperId] = useState<PaperId>(() =>
    remembered('paper', ['letter', 'a4'], defaultPaper(typeof navigator === 'undefined' ? undefined : navigator.language)),
  );
  const [copies, setCopies] = useState(0);
  const [mirror, setMirror] = useState(false);

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

  const spec = styleById(styleId);
  const paper = PAPERS[paperId];
  const capacity = gridFor(spec, paperId).count;
  const choices = copyChoices(spec, paperId);
  // 0 means "a full page"; a choice that no longer fits (another style or paper) is cut back.
  const count = copies === 0 ? capacity : copiesOnPage(spec, paperId, copies);

  useEffect(() => remember({ style: styleId, look, paper: paperId }), [styleId, look, paperId]);
  useEffect(() => setCopies(0), [styleId, paperId]);

  const data = useMemo(
    () => ({ finderUrl, shortCode: tag?.short_code ?? null, itemName: item?.name ?? null }),
    [finderUrl, tag?.short_code, item?.name],
  );
  const { preview, sheet, printReady } = useMemo(() => {
    if (!finderUrl) return { preview: null, sheet: null, printReady: null };
    try {
      return {
        preview: buildPreview(styleId, look, data),
        sheet: buildSheet(styleId, look, data, { paper: paperId, copies: count, mirror }),
        printReady: buildPrintReady(styleId, look, data),
      };
    } catch {
      return { preview: null, sheet: null, printReady: null };
    }
  }, [finderUrl, styleId, look, data, paperId, count, mirror]);

  /** Pixels per inch on screen: a small tag is shown larger so its details can be seen. */
  const zoomPx = Math.min(180, 420 / spec.w, 560 / spec.h);
  const zoom = Math.round((zoomPx / 96) * 10) / 10;

  const fileBase = `qurtag-${styleId}-${look}-${tag?.short_code ?? tag?.public_id ?? 'tag'}`;

  /** Counts the print or download (db/measures.sql): style, look and paper only, once the file was made. */
  function counted(action: PrintAction) {
    recordTagPrint({ style: styleId, look, paper: paperId, action });
  }

  async function run(kind: 'pdf' | 'png' | 'pdf2', work: () => Promise<void>, action: PrintAction) {
    setError('');
    setBusy(kind);
    try {
      await work();
      if (user) recordStep(user.id, 'print');
      counted(action);
    } catch (err) {
      // Closing the share sheet without choosing anything is not a failure.
      const message = err instanceof Error ? err.message : '';
      if (!/cancel/i.test(message)) setError('The tag could not be prepared. Please try again.');
    } finally {
      setBusy(null);
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
      disabled={busy !== null || !sheet}
      onClick={() => {
        if (isNative()) void run('pdf', () => saveTagPdf(sheet!, fileBase + '.pdf', 'Print your tags'), 'print');
        else {
          if (user) recordStep(user.id, 'print');
          counted('print');
          window.print();
        }
      }}
      className={buttonClasses({ variant: 'primary', className: 'px-4' })}
    >
      <Printer size={16} strokeWidth={1.75} aria-hidden />
      {busy === 'pdf' ? 'Preparing…' : isNative() ? 'Print or share' : 'Print'}
    </button>
  );

  const choice = (selected: boolean) =>
    cn(
      'rounded-card border px-3 py-3 text-left transition-colors focus-within:ring-2 focus-within:ring-ink-900',
      selected ? 'border-ink-900 bg-paper' : 'border-hairline hover:border-hairline-strong',
    );

  return (
    <AppPage title="Tag" back={back} action={printButton} width="normal">
      <style>{`
        @media print {
          body { background: white !important; }
          @page { size: ${paper.w}in ${paper.h}in; margin: 0; }
        }
      `}</style>

      {/* What the printer gets: the page itself, at true size. Hidden on screen. */}
      {sheet && (
        <div
          aria-hidden
          className="hidden bg-white print:fixed print:left-0 print:top-0 print:z-[200] print:block print:overflow-hidden"
          style={{ width: `${paper.w}in`, height: `${paper.h}in` }}
          dangerouslySetInnerHTML={{ __html: pageToSvg(sheet) }}
        />
      )}

      <div className="no-print flex flex-col gap-6">
        {error && (
          <p role="alert" className="rounded-card bg-signal-50 px-4 py-3 text-sm text-signal-700">
            {error}
          </p>
        )}

        <section aria-labelledby="style-h" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="style-h" className="text-lg font-semibold text-ink-900">Choose a style</h2>
            <HelpLink section="which-style" label="Which style?" />
          </div>
          <div role="radiogroup" aria-labelledby="style-h" className="grid gap-2 sm:grid-cols-2">
            {STYLES.map((s) => (
              <label key={s.id} className={choice(s.id === styleId)}>
                <input type="radio" name="tag-style" className="sr-only" checked={s.id === styleId} onChange={() => setStyleId(s.id)} />
                <span className="block text-base font-semibold text-ink-900">{s.name}</span>
                <span className="block text-sm text-ink-700">{s.sizeLabel}</span>
                <span className="block text-sm text-muted">{s.suits}</span>
              </label>
            ))}
          </div>
        </section>

        <section aria-labelledby="look-h" className="flex flex-col gap-3">
          <h2 id="look-h" className="text-lg font-semibold text-ink-900">Choose a look</h2>
          <div role="radiogroup" aria-labelledby="look-h" className="grid gap-2 sm:grid-cols-3">
            {LOOKS.map((l) => (
              <label key={l.id} className={choice(l.id === look)}>
                <input type="radio" name="tag-look" className="sr-only" checked={l.id === look} onChange={() => setLook(l.id)} />
                <span className="block text-base font-semibold text-ink-900">{l.name}</span>
                <span className="block text-sm text-muted">{l.note}</span>
              </label>
            ))}
          </div>
        </section>

        <section aria-labelledby="page-h" className="flex flex-col gap-3">
          <h2 id="page-h" className="text-lg font-semibold text-ink-900">Your page</h2>
          <div className="flex flex-wrap items-end gap-4">
            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm font-medium text-ink-900">Paper</legend>
              <div className="flex gap-2">
                {(['letter', 'a4'] as PaperId[]).map((id) => (
                  <label key={id} className={cn(choice(id === paperId), 'px-4 py-2')}>
                    <input type="radio" name="tag-paper" className="sr-only" checked={id === paperId} onChange={() => setPaperId(id)} />
                    <span className="text-sm font-medium text-ink-900">{PAPERS[id].name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex flex-col gap-1 text-sm font-medium text-ink-900">
              Copies on the page
              <select
                value={count}
                onChange={(e) => setCopies(Number(e.target.value))}
                className="h-11 rounded-card border border-hairline-strong bg-canvas px-3 text-base text-ink-900"
              >
                {choices.map((n) => (
                  <option key={n} value={n}>
                    {n === capacity ? `${n} (a full page)` : n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {spec.mirrorable && (
            <label className="flex items-start gap-3 text-sm text-ink-900">
              <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} className="mt-1 size-4" />
              <span>
                <span className="font-medium">Print mirrored.</span> Tick this if your transfer paper says to print mirrored.
                The page is flipped left to right so the tag reads the right way round once it is ironed on.
              </span>
            </label>
          )}
          <p className="text-sm text-muted text-pretty">{spec.howTo}</p>
        </section>

        <section aria-labelledby="prev-h" className="flex flex-col gap-3">
          <h2 id="prev-h" className="text-lg font-semibold text-ink-900">Preview</h2>
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
            {preview && (
              <figure className="flex min-w-0 flex-col gap-1">
                <div
                  role="img"
                  aria-label={`${spec.name}, ${look} look, enlarged`}
                  className="overflow-hidden rounded-card border border-hairline bg-[#E8E9EC] p-3"
                  style={{ width: preview.w * zoomPx + 24, maxWidth: '100%' }}
                  dangerouslySetInnerHTML={{ __html: pageToSvg(preview, { responsive: true }) }}
                />
                <figcaption className="text-sm text-muted">One tag, {spec.sizeLabel}, shown {zoom} times real size
                  {spec.panels === 2 && '. The lower half is printed upside down so it reads the right way up once folded.'}
                </figcaption>
              </figure>
            )}
            {sheet && (
              <figure className="flex min-w-0 flex-col gap-1">
                <div
                  role="img"
                  aria-label={`The ${paper.name} page with ${count} copies`}
                  className="mx-auto w-full max-w-[22rem] overflow-hidden rounded-card border border-hairline bg-white shadow-card"
                  dangerouslySetInnerHTML={{ __html: pageToSvg(sheet, { responsive: true }) }}
                />
                <figcaption className="text-center text-sm text-muted">
                  The page: {count} {count === 1 ? 'copy' : 'copies'} on {paper.name}
                </figcaption>
              </figure>
            )}
          </div>
          {!isNative() && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy !== null || !sheet}
                onClick={() => void run('pdf', () => saveTagPdf(sheet!, fileBase + '.pdf', 'Save your tags'), 'download_pdf')}
                className={buttonClasses({ variant: 'secondary' })}
              >
                <Download size={16} strokeWidth={1.75} aria-hidden />
                {busy === 'pdf' ? 'Preparing…' : 'Download PDF'}
              </button>
            </div>
          )}
          <p className="text-sm text-muted text-pretty">
            {isNative()
              ? 'Print or share opens the share sheet: print it, save it to Files or AirDrop it to a computer. '
              : 'Print at 100% (actual size), with no scaling or "fit to page", or the tags will not be the size shown. '}
            You can print tags again at any time.
          </p>
        </section>

        <section aria-labelledby="order-h" className="flex flex-col gap-3 rounded-card border border-hairline bg-paper p-4">
          <h2 id="order-h" className="text-lg font-semibold text-ink-900">Get a print-ready file</h2>
          <p className="text-sm text-ink-700 text-pretty">
            One tag at exact size ({spec.w} x {spec.h} in) with {BLEED_IN} in of bleed on every side ({printReadySize(spec).w.toFixed(3)} x{' '}
            {printReadySize(spec).h.toFixed(3)} in in all). You can upload it to any online sticker printer to have it made on
            waterproof vinyl. Choose the shape you want cut when you order: the corners here are square so the printer's cutter
            decides.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null || !printReady}
              onClick={() => void run('png', () => saveTagPng(printReady!, `${fileBase}-print-ready.png`), 'download_print_ready_png')}
              className={buttonClasses({ variant: 'secondary' })}
            >
              <ImageDown size={16} strokeWidth={1.75} aria-hidden />
              {busy === 'png' ? 'Preparing…' : 'PNG, 600 dpi'}
            </button>
            <button
              type="button"
              disabled={busy !== null || !printReady}
              onClick={() => void run('pdf2', () => saveTagPdf(printReady!, `${fileBase}-print-ready.pdf`, 'Save your sticker file'), 'download_print_ready_pdf')}
              className={buttonClasses({ variant: 'secondary' })}
            >
              <Download size={16} strokeWidth={1.75} aria-hidden />
              {busy === 'pdf2' ? 'Preparing…' : 'PDF with bleed'}
            </button>
          </div>
        </section>

        <p className="text-sm text-ink-700 text-pretty">
          Want it to last through rain, washing machines and school bags?{' '}
          <Link to="/app/make-it-last" className="font-medium text-ink-900 underline underline-offset-4">
            Make it last
          </Link>
          .
        </p>
        <Link to="/app" className={buttonClasses({ variant: 'secondary', size: 'lg', block: true, className: 'sm:w-auto sm:self-start' })}>
          Done
        </Link>
      </div>
    </AppPage>
  );
}
