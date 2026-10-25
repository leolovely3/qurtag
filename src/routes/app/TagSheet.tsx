import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AppPage } from '@/components/layout/AppPage';
import { PrintArea, PrintChoices } from '@/components/print/PrintChoices';
import { buttonClasses } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { recordTagPrint } from '@/lib/measures';
import { recordTag } from '@/lib/tagProgress';
import { publicUrl } from '@/lib/platform';
import { rememberLookAndPaper, rememberTagStyle, rememberedLook, rememberedPaper, styleForTag } from '@/lib/printPrefs';
import { fetchItems, fetchTags } from '@/lib/queries';
import { recommendStyle } from '@/lib/tagRecommend';
import { LOOKS, PAPERS, STYLES, defaultPaper, gridFor, shortAddress, styleById, type LookId, type PaperId, type StyleId } from '@/lib/tagLayout';
import { pageToSvg } from '@/lib/tagSvg';
import { buildMixedSheet, fitEntries, type SheetEntry } from '@/lib/tagStyles';
import { recordStep } from '@/lib/useGettingStarted';
import type { Item, Tag } from '@/lib/database.types';

/**
 * Several items on one page (/app/tags/sheet): choose the items and how many copies of each, in
 * one style, so a sheet of sticker paper is not spent on one code. The page's top margin names
 * each item with its short address, which is printed on every piece, so the pieces can be told
 * apart once cut. `?with=<tag id>` starts with that tag chosen (the link on a tag's print page).
 */
export function TagSheet() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const first = params.get('with');
  const [rows, setRows] = useState<{ tag: Tag; item: Item }[] | null>(null);
  const [chosen, setChosen] = useState<Record<string, number>>({});
  const [styleId, setStyleId] = useState<StyleId>('sticker');
  const [look, setLook] = useState<LookId>(() => rememberedLook());
  const [paperId, setPaperId] = useState<PaperId>(() => rememberedPaper(defaultPaper(typeof navigator === 'undefined' ? undefined : navigator.language)));

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/start', { replace: true });
      return;
    }
    let cancelled = false;
    void Promise.all([fetchTags(), fetchItems()]).then(([tags, items]) => {
      if (cancelled) return;
      const byId = new Map(items.map((i) => [i.id, i]));
      const list = tags
        .filter((t) => t.status === 'active' && t.current_item_id && byId.has(t.current_item_id))
        .map((t) => ({ tag: t, item: byId.get(t.current_item_id!)! }));
      setRows(list);
      const start = list.find((r) => r.tag.id === first) ?? null;
      if (start) {
        setChosen({ [start.tag.id]: 2 });
        setStyleId(styleForTag(start.tag.id, start.item.name));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loading, user, navigate, first]);

  useEffect(() => rememberLookAndPaper(look, paperId), [look, paperId]);

  const spec = styleById(styleId);
  const capacity = gridFor(spec, paperId).count;
  const entries: SheetEntry[] = useMemo(
    () =>
      (rows ?? [])
        .filter((r) => (chosen[r.tag.id] ?? 0) > 0)
        .map((r) => ({
          data: { finderUrl: publicUrl(`/find/${r.tag.public_id}`), shortCode: r.tag.short_code ?? null, itemName: r.item.name },
          copies: chosen[r.tag.id],
        })),
    [rows, chosen],
  );
  const fitted = fitEntries(styleId, paperId, entries);
  const asked = entries.reduce((n, e) => n + e.copies, 0);
  const placed = fitted.reduce((n, e) => n + e.copies, 0);
  const sheet = useMemo(() => {
    if (entries.length === 0) return null;
    try {
      return buildMixedSheet(styleId, look, entries, { paper: paperId });
    } catch {
      return null;
    }
  }, [entries, styleId, look, paperId]);

  const choice = (selected: boolean) =>
    cn('rounded-card border px-3 py-3 text-left transition-colors focus-within:ring-2 focus-within:ring-ink-900', selected ? 'border-ink-900 bg-paper' : 'border-hairline hover:border-hairline-strong');

  if (loading || rows === null) {
    return (
      <AppPage title="Print several items" back={{ to: '/app/tags', label: 'Tags' }}>
        <Skeleton className="h-72 w-full rounded-modal" />
      </AppPage>
    );
  }

  return (
    <AppPage title="Print several items" back={{ to: '/app/tags', label: 'Tags' }}>
      <PrintArea sheet={sheet} paper={paperId} />
      <div className="no-print flex flex-col gap-6">
        <p className="text-base text-muted text-pretty">
          Choose the things to print and how many of each. They share one page, so one sheet of sticker paper does for
          several things. The page's top edge lists each one with the short address printed on its tags.
        </p>

        {rows.length === 0 ? (
          <section className="flex flex-col items-center gap-3 rounded-modal border border-hairline bg-paper px-6 py-10 text-center">
            <h2 className="text-xl font-semibold text-ink-900">No working tags yet</h2>
            <Link to="/start/setup" className={buttonClasses({ variant: 'primary' })}>Add an item</Link>
          </section>
        ) : (
          <section aria-labelledby="items-h" className="flex flex-col gap-3">
            <h2 id="items-h" className="text-lg font-semibold text-ink-900">Items</h2>
            <ul className="overflow-hidden rounded-modal border border-hairline bg-canvas divide-y divide-hairline">
              {rows.map(({ tag, item }) => {
                const n = chosen[tag.id] ?? 0;
                const suits = recommendStyle(null, item.name);
                return (
                  <li key={tag.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <label className="flex min-w-0 flex-1 items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 size-5 shrink-0"
                        checked={n > 0}
                        onChange={(e) => setChosen((c) => ({ ...c, [tag.id]: e.target.checked ? 2 : 0 }))}
                      />
                      <span className="min-w-0">
                        <span className="block break-words text-base font-medium text-ink-900">{item.name}</span>
                        <span className="block text-sm text-muted">
                          {tag.short_code ? shortAddress(tag.short_code) : null}
                          {suits !== styleId ? `${tag.short_code ? '. ' : ''}Best as a ${styleById(suits).name.toLowerCase()}` : null}
                        </span>
                      </span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-ink-900">
                      Copies
                      <select
                        value={n}
                        onChange={(e) => setChosen((c) => ({ ...c, [tag.id]: Number(e.target.value) }))}
                        className="h-11 rounded-card border border-hairline-strong bg-canvas px-3 text-base text-ink-900"
                      >
                        {[0, 1, 2, 3, 4, 6, 8, 12].filter((x) => x <= capacity).map((x) => (
                          <option key={x} value={x}>{x === 0 ? 'None' : x}</option>
                        ))}
                      </select>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section aria-labelledby="sheet-style-h" className="flex flex-col gap-3">
          <h2 id="sheet-style-h" className="text-lg font-semibold text-ink-900">Style for this page</h2>
          <div role="radiogroup" aria-labelledby="sheet-style-h" className="grid gap-2 sm:grid-cols-2">
            {STYLES.map((s) => (
              <label key={s.id} className={choice(s.id === styleId)}>
                <input type="radio" name="sheet-style" className="sr-only" checked={s.id === styleId} onChange={() => setStyleId(s.id)} />
                <span className="block text-base font-semibold text-ink-900">{s.name}</span>
                <span className="block text-sm text-ink-700">{s.sizeLabel}, {gridFor(s, paperId).count} on a page</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-4">
            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm font-medium text-ink-900">Look</legend>
              <div className="flex flex-wrap gap-2">
                {LOOKS.map((l) => (
                  <label key={l.id} className={cn(choice(l.id === look), 'px-4 py-2')}>
                    <input type="radio" name="sheet-look" className="sr-only" checked={l.id === look} onChange={() => setLook(l.id)} />
                    <span className="text-sm font-medium text-ink-900">{l.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm font-medium text-ink-900">Paper</legend>
              <div className="flex gap-2">
                {(['letter', 'a4'] as PaperId[]).map((id) => (
                  <label key={id} className={cn(choice(id === paperId), 'px-4 py-2')}>
                    <input type="radio" name="sheet-paper" className="sr-only" checked={id === paperId} onChange={() => setPaperId(id)} />
                    <span className="text-sm font-medium text-ink-900">{PAPERS[id].name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <p className="text-sm text-ink-700 text-pretty">
            <span className="font-medium text-ink-900">You will need:</span> {spec.needs}
          </p>
        </section>

        <section aria-labelledby="sheet-prev-h" className="flex flex-col gap-3">
          <h2 id="sheet-prev-h" className="text-lg font-semibold text-ink-900">The page</h2>
          {asked > placed && (
            <p role="status" className="rounded-card bg-signal-50 px-4 py-3 text-sm text-signal-700 text-pretty">
              {placed} of the {asked} tags you chose fit on one page in this style. Print this page, then choose the rest.
            </p>
          )}
          {sheet ? (
            <figure className="flex flex-col gap-1">
              <div
                role="img"
                aria-label={`The ${PAPERS[paperId].name} page with ${placed} tags`}
                className="mx-auto w-full max-w-[22rem] overflow-hidden rounded-card border border-hairline bg-white shadow-card"
                dangerouslySetInnerHTML={{ __html: pageToSvg(sheet, { responsive: true }) }}
              />
              <figcaption className="text-center text-sm text-muted">
                {placed} {placed === 1 ? 'tag' : 'tags'} on {PAPERS[paperId].name}, room for {capacity}
              </figcaption>
            </figure>
          ) : (
            <p className="text-base text-muted">Choose at least one item.</p>
          )}
          <PrintChoices
            sheet={sheet}
            fileName={`qurtag-${styleId}-${look}-several.pdf`}
            linkPath="/app/tags/sheet"
            onDone={(c) => {
              recordTagPrint({ style: styleId, look, paper: paperId, action: c });
              for (const r of rows) {
                if ((chosen[r.tag.id] ?? 0) === 0) continue;
                rememberTagStyle(r.tag.id, styleId);
                recordTag(r.tag.id, 'printed');
              }
              if (user) recordStep(user.id, 'print');
            }}
          />
        </section>
      </div>
    </AppPage>
  );
}
