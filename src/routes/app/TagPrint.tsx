import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Download, ImageDown, Layers, Printer } from 'lucide-react';
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
import { PrintArea, PrintChoices } from '@/components/print/PrintChoices';
import { rememberLookAndPaper, rememberTagStyle, rememberedLook, rememberedPaper, styleForTag } from '@/lib/printPrefs';
import {
  BLEED_IN,
  LOOKS,
  PAPERS,
  STYLES,
  copiesOnPage,
  copyChoices,
  defaultCopies,
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

/**
 * One tag's print page. It opens on the style the tag was last printed in or, for a tag never
 * printed, the style its item suits (src/lib/printPrefs.ts), with a few copies rather than a full
 * sheet. "Print several items on one page" (TagSheet.tsx) shares one sheet between items.
 */
export function TagPrint() {
  const { tagId } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [tag, setTag] = useState<Tag | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [fetching, setFetching] = useState(true);
  const [busy, setBusy] = useState<'pdf' | 'png' | 'pdf2' | null>(null);
  const [error, setError] = useState('');
  const [styleId, setStyleId] = useState<StyleId>('sticker');
  const [look, setLook] = useState<LookId>(() => rememberedLook());
  const [paperId, setPaperId] = useState<PaperId>(() =>
    rememberedPaper(defaultPaper(typeof navigator === 'undefined' ? undefined : navigator.language)),
  );
  /** null: the style's default number of copies. */
  const [copies, setCopies] = useState<number | null>(null);
  const [mirror, setMirror] = useState(false);
  const [showName, setShowName] = useState(false);

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
      let name: string | null = null;
      if (t?.current_item_id) {
        const i = await fetchItemById(t.current_item_id);
        if (cancelled) return;
        setItem(i);
        name = i?.name ?? null;
      }
      setStyleId(styleForTag(tagId, name));
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
  // Unchosen, the style's few copies; a choice that no longer fits (another style or paper) is cut back.
  const count = copies === null ? defaultCopies(spec, paperId) : copiesOnPage(spec, paperId, copies);

  useEffect(() => rememberLookAndPaper(look, paperId), [look, paperId]);
  useEffect(() => setCopies(null), [styleId, paperId]);

  const data = useMemo(
    () => ({ finderUrl, shortCode: tag?.short_code ?? null, itemName: item?.name ?? null, showName: spec.showsName && showName }),
    [finderUrl, tag?.short_code, item?.name, spec.showsName, showName],
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
    if (tag) rememberTagStyle(tag.id, styleId);
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
      <AppPage title="Print a tag" back={{ to: '/app', label: 'Items' }} width="normal">
        <Skeleton className="mx-auto h-[26rem] w-full max-w-2xl rounded-modal" />
      </AppPage>
    );
  }

  if (!tag) {
    return (
      <AppPage title="Print a tag" back={{ to: '/app', label: 'Items' }} width="normal">
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
    <AppPage title={item?.name ? `Print: ${item.name}` : 'Print a tag'} back={back} action={printButton} width="normal">
      {/* What the printer gets: the page itself, at true size. Hidden on screen. */}
      <PrintArea sheet={sheet} paper={paperId} />

      <div className="no-print flex flex-col gap-6">
        {error && (
          <p role="alert" className="rounded-card bg-signal-50 px-4 py-3 text-sm text-signal-700">
            {error}
          </p>
        )}

        <section aria-labelledby="style-h" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="style-h" className="text-lg font-semibold text-ink-900">Choose a style</h2>
            <HelpLink section="which-style" label="Which style?" />
          </div>
          <div role="radiogroup" aria-labelledby="style-h" className="grid gap-2 sm:grid-cols-2 ax:grid-cols-1">
            {STYLES.map((s) => (
              <label key={s.id} className={choice(s.id === styleId)}>
                <input type="radio" name="tag-style" className="sr-only" checked={s.id === styleId} onChange={() => setStyleId(s.id)} />
                <span className="block text-base font-semibold text-ink-900">{s.name}</span>
                <span className="block text-sm text-ink-700">{s.sizeLabel}</span>
                <span className="block text-sm text-muted">{s.suits}</span>
              </label>
            ))}
          </div>
          <p className="text-sm text-ink-700 text-pretty">
            <span className="font-medium text-ink-900">You will need:</span> {spec.needs} {spec.noHolder}
          </p>
          {spec.showsName && (
            <label className="flex items-start gap-3 text-sm text-ink-900">
              <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} className="mt-1 size-4" />
              <span>
                <span className="font-medium">Print the item's name on the tag.</span> Leave this off for a child's things:
                anyone who finds it can read it.
              </span>
            </label>
          )}
        </section>

        <section aria-labelledby="look-h" className="flex flex-col gap-3">
          <h2 id="look-h" className="text-lg font-semibold text-ink-900">Choose a look</h2>
          <div role="radiogroup" aria-labelledby="look-h" className="grid gap-2 sm:grid-cols-3 ax:grid-cols-1">
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
                className="h-11 max-w-full rounded-card border border-hairline-strong bg-canvas px-3 text-base text-ink-900 ax:h-auto ax:min-h-[44px]"
              >
                {choices.map((n) => (
                  <option key={n} value={n}>
                    {n === capacity ? `${n} (a full page)` : n === defaultCopies(spec, paperId) ? `${n} (suggested)` : n}
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
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:grid-cols-[auto_minmax(0,1fr)] ax:grid-cols-[minmax(0,1fr)]">
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
          <PrintChoices
            sheet={sheet}
            fileName={fileBase + '.pdf'}
            linkPath={`/app/tags/${tag.id}/print`}
            onDone={(choice) => {
              if (user) recordStep(user.id, 'print');
              counted(choice);
            }}
          />
          <p className="text-sm text-muted text-pretty">You can print tags again at any time.</p>
          <Link to={`/app/tags/sheet?with=${tag.id}`} className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-ink-900 underline underline-offset-4">
            <Layers size={16} strokeWidth={1.75} aria-hidden />
            Print several items on one page
          </Link>
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
