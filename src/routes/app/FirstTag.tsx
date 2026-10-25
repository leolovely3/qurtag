import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Backpack, Bell, Check, Glasses, GlassWater, Guitar, KeyRound, Laptop, Lock, ScanLine, Sparkles } from 'lucide-react';
import { AppPage } from '@/components/layout/AppPage';
import { buttonClasses } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PhotoUploader } from '@/components/ui/PhotoUploader';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { markPushExplained, pushPermission, turnOnPush } from '@/lib/nativePush';
import { isNative, publicUrl } from '@/lib/platform';
import { createItemWithPrintableTag, fetchItems, fetchPrimaryHouseholdId, fetchTagById } from '@/lib/queries';
import { PICKS, recommendStyle, type Pick, type PickId } from '@/lib/tagRecommend';
import { STYLES, defaultCopies, defaultPaper, styleById, type StyleId } from '@/lib/tagLayout';
import { PrintArea, PrintChoices } from '@/components/print/PrintChoices';
import { rememberTagStyle } from '@/lib/printPrefs';
import { recordTagPrint } from '@/lib/measures';
import { OWNER_TEST_KEY, SKIP_KEY } from '@/lib/gettingStarted';
import { pageToSvg } from '@/lib/tagSvg';
import { buildPreview, buildSheet } from '@/lib/tagStyles';
import { recordStep } from '@/lib/useGettingStarted';

/**
 * The first-tag walkthrough at /app/first-tag: what to tag, a photo, a word for the finder,
 * the tag style, print or share, a test scan, and (iPhone app) alerts. It opens after
 * sign-up and whenever the account has no items, can be skipped, and resumes from Items.
 *
 * The item is saved when the person leaves step 3, so the rest of the walkthrough works on
 * a real tag. Where they are is kept per account on this device (qurtag.first-tag.<id>), so
 * closing the app mid-way resumes at the same step.
 *
 * The test (step 6) opens the finder's own page in test mode (/find/<code>#test=1,
 * src/routes/finder/FinderView.tsx): it asks the server for the page without recording a scan,
 * sends nothing and starts no conversation, so a test never shows in the scan history or the
 * measures. A scan made with the phone camera is a real scan: the finder routes cannot tell
 * the owner from a stranger, so the walkthrough says so.
 */

const ICONS = { GlassWater, Laptop, Backpack, KeyRound, Glasses, Guitar, Sparkles } as const;

const WORDS = [
  "Thank you! There's a reward for its safe return.",
  'Thank you for being kind. A coffee is on me.',
  'Please scan and tell me where it is. I will come right away.',
];

interface Saved {
  step: number;
  pick: PickId | null;
  name: string;
  reward: string;
  photo: string | null;
  styleId: StyleId | null;
  created: { itemId: string; tagId: string; publicId: string } | null;
}

const EMPTY: Saved = { step: 1, pick: null, name: '', reward: '', photo: null, styleId: null, created: null };
const key = (userId: string) => `qurtag.first-tag.${userId}`;

function load(userId: string): Saved | null {
  try {
    const raw = window.localStorage.getItem(key(userId));
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Saved>) } : null;
  } catch {
    return null;
  }
}
function save(userId: string, s: Saved | null): void {
  try {
    if (s) window.localStorage.setItem(key(userId), JSON.stringify(s));
    else window.localStorage.removeItem(key(userId));
  } catch {
    /* storage off: no resuming */
  }
}

export function FirstTag() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [ready, setReady] = useState(false);
  const [s, setS] = useState<Saved>(EMPTY);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [hasItems, setHasItems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [changeStyle, setChangeStyle] = useState(false);
  const [tested, setTested] = useState(false);
  const [alerts, setAlerts] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const native = isNative();
  const total = native ? 7 : 6;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/start', { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      const hh = await fetchPrimaryHouseholdId();
      const items = hh ? await fetchItems(hh) : [];
      if (cancelled) return;
      setHouseholdId(hh);
      setHasItems(items.length > 0);
      const saved = load(user.id);
      // A saved walkthrough whose item is gone starts again.
      if (saved?.created && !(await fetchTagById(saved.created.tagId))) save(user.id, null);
      else if (saved) setS(saved);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, user, navigate]);

  useEffect(() => {
    if (ready && user) save(user.id, s);
  }, [ready, user, s]);

  // Leaving before an item exists (Back, Skip for now, a tab) leaves the empty Items screen alone for this visit.
  const madeItem = useRef(false);
  madeItem.current = !!s.created || hasItems;
  useEffect(
    () => () => {
      if (madeItem.current) return;
      try {
        window.sessionStorage.setItem(SKIP_KEY, '1');
      } catch {
        /* the walkthrough may open again */
      }
    },
    [],
  );

  // Coming back from the test page: it leaves the code of the tag it opened.
  useEffect(() => {
    const check = () => {
      try {
        setTested(!!s.created && window.localStorage.getItem(OWNER_TEST_KEY) === s.created.publicId);
      } catch {
        setTested(false);
      }
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [s.created]);

  useEffect(() => {
    if (s.step === 7 && native) void pushPermission().then((v) => setAlerts(v === 'granted' ? 'granted' : v === 'denied' ? 'denied' : 'unknown'));
  }, [s.step, native]);

  const styleId: StyleId = s.styleId ?? recommendStyle(s.pick, s.name);
  const spec = styleById(styleId);
  const finderUrl = s.created ? publicUrl(`/find/${s.created.publicId}`) : '';
  const [shortCode, setShortCode] = useState<string | null>(null);
  useEffect(() => {
    if (s.created) void fetchTagById(s.created.tagId).then((t) => setShortCode(t?.short_code ?? null));
  }, [s.created]);
  const paperId = defaultPaper(typeof navigator === 'undefined' ? undefined : navigator.language);
  const data = useMemo(() => ({ finderUrl, shortCode, itemName: s.name.trim() || null }), [finderUrl, shortCode, s.name]);
  const { preview, sheet } = useMemo(() => {
    if (!finderUrl) return { preview: null, sheet: null };
    try {
      const count = defaultCopies(spec, paperId);
      return { preview: buildPreview(styleId, 'clean', data), sheet: buildSheet(styleId, 'clean', data, { paper: paperId, copies: count }) };
    } catch {
      return { preview: null, sheet: null };
    }
  }, [finderUrl, styleId, spec, paperId, data]);

  if (!ready || loading) {
    return (
      <AppPage title="Your first tag" back={{ to: '/app', label: 'Items' }} width="narrow">
        <Skeleton className="h-72 w-full rounded-modal" />
      </AppPage>
    );
  }
  // Someone who already has items and no walkthrough under way has nothing to do here.
  if (hasItems && !s.created) return <Navigate to="/app" replace />;

  const go = (step: number) => {
    setError('');
    setS((p) => ({ ...p, step }));
    window.scrollTo(0, 0);
  };

  function choose(p: Pick) {
    setS((prev) => ({
      ...prev,
      pick: p.id,
      // A pick fills the name; the person's own edits are kept if they already typed something else.
      name: prev.pick === null || prev.name === '' || PICKS.some((x) => x.name === prev.name) ? p.name : prev.name,
      styleId: null,
    }));
  }

  async function makeTag() {
    if (s.created) {
      go(4);
      return;
    }
    setError('');
    setSaving(true);
    const result = await createItemWithPrintableTag({
      name: s.name.trim(),
      heroPhotoUrl: s.photo ?? undefined,
      rewardText: s.reward.trim() || undefined,
    });
    setSaving(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setS((p) => ({ ...p, created: result, step: 4 }));
    window.scrollTo(0, 0);
  }

  function finish() {
    if (user) save(user.id, null);
    toast.show({ kind: 'success', title: 'You are set up', body: 'Your tag is ready for the day someone finds your thing.' });
    navigate('/app', { replace: true });
  }

  function skipForNow() {
    try {
      window.sessionStorage.setItem(SKIP_KEY, '1');
    } catch {
      /* the walkthrough may open again */
    }
    navigate('/app', { replace: true });
  }

  async function allowAlerts() {
    markPushExplained();
    const r = await turnOnPush();
    setAlerts(r === 'granted' ? 'granted' : 'denied');
  }

  const nameOk = s.name.trim().length > 0;
  const card = 'flex flex-col gap-4 rounded-modal border border-hairline bg-canvas p-4 sm:p-6';
  const next = (label: string, onClick: () => void, disabled = false) => (
    <button type="button" onClick={onClick} disabled={disabled} className={buttonClasses({ variant: 'primary', size: 'lg', block: true })}>
      {label}
    </button>
  );

  return (
    <AppPage
      title="Your first tag"
      back={{ to: '/app', label: 'Items' }}
      width="narrow"
    >
      <PrintArea sheet={sheet} paper={paperId} />
      <div className="no-print flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <div role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={s.step} aria-label="Progress" className="flex flex-1 gap-1.5">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={cn('h-1.5 flex-1 rounded-pill', i < s.step ? 'bg-ink-900' : 'bg-ink-100')} />
            ))}
          </div>
          <span className="shrink-0 text-sm text-muted">Step {s.step} of {total}</span>
        </div>

        {error && <p role="alert" className="rounded-card bg-signal-50 px-4 py-3 text-sm text-signal-700">{error}</p>}

        {s.step === 1 && (
          <>
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink-900 text-balance">What do you want to tag first?</h2>
            <div className="grid grid-cols-2 gap-2 ax:grid-cols-1" role="radiogroup" aria-label="What to tag first">
              {PICKS.map((p) => {
                const Icon = ICONS[p.icon];
                const on = s.pick === p.id;
                return (
                  <label
                    key={p.id}
                    className={cn(
                      'flex min-h-[4.5rem] cursor-pointer items-center gap-3 rounded-card border px-3 py-3 transition-colors focus-within:ring-2 focus-within:ring-ink-900',
                      on ? 'border-ink-900 bg-paper' : 'border-hairline hover:border-hairline-strong',
                    )}
                  >
                    <input type="radio" name="pick" className="sr-only" checked={on} onChange={() => choose(p)} />
                    <span className="grid size-[40px] shrink-0 place-items-center rounded-card bg-ink-100 ax:hidden">
                      <Icon size={20} strokeWidth={1.75} className="text-ink-900" aria-hidden />
                    </span>
                    <span className="text-base font-medium leading-tight text-ink-900">{p.label}</span>
                  </label>
                );
              })}
            </div>
            {s.pick && (
              <div className={card}>
                <Input
                  name="name"
                  label="What is it called?"
                  placeholder="Blue water bottle"
                  maxLength={80}
                  value={s.name}
                  onChange={(e) => setS((p) => ({ ...p, name: e.target.value, styleId: null }))}
                  hint="The finder sees this. You can change it later."
                />
              </div>
            )}
            {next('Continue', () => go(2), !nameOk)}
          </>
        )}

        {s.step === 2 && (
          <>
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink-900 text-balance">Add a photo, if you like</h2>
            <div className={card}>
              <PhotoUploader householdId={householdId} value={s.photo} onChange={(url) => setS((p) => ({ ...p, photo: url }))} />
              <p className="flex items-start gap-2 text-sm text-muted text-pretty">
                <Lock size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
                It helps the finder tell it is yours, most of all when many bottles or cases look the same.
              </p>
            </div>
            {next(s.photo ? 'Continue' : 'Skip the photo', () => go(3))}
          </>
        )}

        {s.step === 3 && (
          <>
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink-900 text-balance">A word for the finder</h2>
            <div className={card}>
              <Input
                name="reward"
                label="Your word (optional)"
                placeholder="Thank you! There's a reward for its safe return."
                maxLength={140}
                value={s.reward}
                onChange={(e) => setS((p) => ({ ...p, reward: e.target.value }))}
                hint="The finder sees this on the page."
              />
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-ink-900">Ideas</span>
                {WORDS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setS((p) => ({ ...p, reward: w }))}
                    className="min-h-11 rounded-card border border-hairline px-3 py-2 text-left text-sm text-ink-900 hover:border-hairline-strong"
                  >
                    {w}
                  </button>
                ))}
              </div>
              <p className="rounded-card bg-signal-50 px-3 py-2 text-sm text-signal-700 text-pretty">
                Do not put your phone number or address here. Anyone who scans the tag can read it. The finder writes to you
                through QuR Tag instead.
              </p>
            </div>
            {next(saving ? 'Saving…' : 'Make my tag', () => void makeTag(), saving)}
          </>
        )}

        {s.step === 4 && (
          <>
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink-900 text-balance">Where will the tag go?</h2>
            <p className="text-base text-muted text-pretty">
              We suggest the <strong className="font-semibold text-ink-900">{spec.name.toLowerCase()}</strong> for this: {spec.suits.toLowerCase()}.
            </p>
            {preview && (
              <figure className="flex flex-col gap-2">
                <div
                  role="img"
                  aria-label={`Your ${spec.name} tag for ${s.name}`}
                  className="mx-auto w-full overflow-hidden rounded-card border border-hairline bg-[#E8E9EC] p-4"
                  style={{ maxWidth: Math.round(Math.min(320, 300 * (preview.w / preview.h) + 32)) }}
                  dangerouslySetInnerHTML={{ __html: pageToSvg(preview, { responsive: true }) }}
                />
                <figcaption className="text-center text-sm text-muted">Your tag: {spec.sizeLabel}.</figcaption>
              </figure>
            )}
            <p className="rounded-card border border-hairline bg-paper px-4 py-3 text-sm text-ink-700 text-pretty">
              <span className="font-medium text-ink-900">You will need:</span> {spec.needs} {spec.noHolder}
            </p>
            <button type="button" onClick={() => setChangeStyle((v) => !v)} aria-expanded={changeStyle} className={buttonClasses({ variant: 'secondary', block: true })}>
              Change style
            </button>
            {changeStyle && (
              <div role="radiogroup" aria-label="Tag style" className="grid gap-2 sm:grid-cols-2 ax:grid-cols-1">
                {STYLES.map((st) => (
                  <label
                    key={st.id}
                    className={cn(
                      'cursor-pointer rounded-card border px-3 py-3 focus-within:ring-2 focus-within:ring-ink-900',
                      st.id === styleId ? 'border-ink-900 bg-paper' : 'border-hairline hover:border-hairline-strong',
                    )}
                  >
                    <input type="radio" name="style" className="sr-only" checked={st.id === styleId} onChange={() => setS((p) => ({ ...p, styleId: st.id }))} />
                    <span className="block text-base font-semibold text-ink-900">{st.name}</span>
                    <span className="block text-sm text-muted">{st.suits}</span>
                  </label>
                ))}
              </div>
            )}
            {next('Continue', () => {
              if (s.created) rememberTagStyle(s.created.tagId, styleId);
              go(5);
            })}
          </>
        )}

        {s.step === 5 && (
          <>
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink-900 text-balance">{native ? 'Print or share your tag' : 'Print your tag'}</h2>
            <PrintChoices
              sheet={sheet}
              fileName={`qurtag-${styleId}-clean.pdf`}
              linkPath={`/app/tags/${s.created?.tagId}/print`}
              onDone={(c) => {
                if (user) recordStep(user.id, 'print');
                recordTagPrint({ style: styleId, look: 'clean', paper: paperId, action: c });
              }}
            />
            <p className="text-sm text-muted text-pretty">
              The page has a few spare copies.{' '}
              <Link to={`/app/tags/${s.created?.tagId}/print`} className="font-medium text-ink-900 underline underline-offset-4">More choices</Link>
            </p>
            <div className={card}>
              <h3 className="text-base font-semibold text-ink-900">Three tips so it lasts</h3>
              <ul className="flex list-disc flex-col gap-2 pl-5 text-base text-ink-700 marker:text-ink-300">
                <li className="text-pretty">Cover a paper tag with clear packing tape, or laminate it, so rain and washing do not ruin it.</li>
                <li className="text-pretty">Stick it on a clean, flat, dry spot and press from the middle out.</li>
                <li className="text-pretty">Print at full size and keep the code at least about 0.75 inch (2 cm) wide, with its white border.</li>
              </ul>
              <Link to="/app/make-it-last" className="text-sm font-medium text-ink-900 underline underline-offset-4">More in Make it last</Link>
            </div>
            <button
              type="button"
              onClick={() => {
                if (user) recordStep(user.id, 'print');
                go(6);
              }}
              className={buttonClasses({ variant: 'secondary', size: 'lg', block: true })}
            >
              I have printed it
            </button>
          </>
        )}

        {s.step === 6 && (
          <>
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink-900 text-balance">Test it</h2>
            {tested ? (
              <div role="status" className="flex items-start gap-3 rounded-modal border border-verdigris-300 bg-verdigris-50 p-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-verdigris-700 text-canvas"><Check size={16} strokeWidth={2.5} aria-hidden /></span>
                <div className="flex flex-col gap-1">
                  <p className="text-base font-semibold text-ink-900">It works. This is what a finder sees.</p>
                  <p className="text-sm text-ink-700">The test sent nothing and was not counted as a scan.</p>
                </div>
              </div>
            ) : (
              <>
                <p className="text-base text-ink-700 text-pretty">
                  Open the page a finder would see. It is a test view: nothing is sent to you and it does not count as a scan.
                </p>
                <Link to={`/find/${s.created?.publicId}#test=1`} className={buttonClasses({ variant: 'primary', size: 'lg', block: true })}>
                  <ScanLine size={18} aria-hidden />
                  Open the test page
                </Link>
                <p className="text-sm text-muted text-pretty">
                  You can also scan the printed tag with your phone camera. A scan with the camera is counted in your scan
                  history like any other.
                </p>
              </>
            )}
            {tested ? (
              next(native ? 'Continue' : 'Finish', () => (native ? go(7) : finish()))
            ) : (
              <button type="button" onClick={() => (native ? go(7) : finish())} className={buttonClasses({ variant: 'secondary', size: 'lg', block: true })}>
                Skip the test
              </button>
            )}
          </>
        )}

        {s.step === 7 && native && (
          <>
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink-900 text-balance">Know the moment someone finds it</h2>
            <p className="text-base text-ink-700 text-pretty">
              Allow alerts and your iPhone tells you as soon as a finder writes, so you can reply in seconds. iPhone will ask
              for permission next. You can change this any time in Settings.
            </p>
            {alerts === 'granted' ? (
              <p role="status" className="flex items-center gap-2 rounded-card bg-verdigris-50 px-4 py-3 text-base font-medium text-ink-900"><Check size={18} aria-hidden />Alerts are on.</p>
            ) : (
              <button type="button" onClick={() => void allowAlerts()} className={buttonClasses({ variant: 'primary', size: 'lg', block: true })}>
                <Bell size={18} aria-hidden />
                Turn on alerts
              </button>
            )}
            {alerts === 'denied' && <p className="text-sm text-muted text-pretty">Alerts are off. You can allow them later in the iPhone's Settings app, under QuR Tag.</p>}
            {next('Finish', finish)}
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {s.step > 1 && !(s.created && s.step <= 4) ? (
            <button type="button" onClick={() => go(s.step - 1)} className={buttonClasses({ variant: 'ghost' })}>Back</button>
          ) : <span />}
          <button type="button" onClick={skipForNow} className={buttonClasses({ variant: 'ghost' })}>Skip for now</button>
        </div>
      </div>
    </AppPage>
  );
}
