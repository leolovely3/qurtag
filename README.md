# QurTag

> Your things find their way home.

A premium recovery network — physical tags + a beautifully designed app — that turns the
moment of loss into the shortest, calmest path to reunion. Privacy is the quiet substrate.
Recovery is the headline.

The full product spec lives in [`docs/PRD.md`](docs/PRD.md). Read it before touching the code.

---

## Stack

- **React 18.3** + **TypeScript 5.5**
- **Vite 5.4** for build and dev
- **React Router 7** (data router)
- **Tailwind 3.4** + `tailwindcss-animate` + `tailwind-merge` + `clsx`
- **Lucide React** for iconography
- **Supabase** for database, auth, storage, realtime

Component primitives are hand-rolled shadcn-style — every component lives in
`src/components` and is owned by this repo.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill in your Supabase credentials
npm run dev                         # http://localhost:5173
```

Other scripts:

```bash
npm run build       # tsc -b && vite build (writes to dist/)
npm run preview     # serve the production build locally
npm run typecheck   # tsc -b
npm run lint        # eslint
```

## Project structure

```
docs/
  PRD.md                 # source of truth for what we're building
src/
  components/
    brand/               # Wordmark, Typography primitives (Display, Lede, Body, Eyebrow, Caption)
    ui/                  # Button, Container — shadcn-style headless primitives
    layout/              # MarketingLayout, AppLayout, FinderLayout
  lib/
    supabase.ts          # typed Supabase client
    database.types.ts    # stub — regenerate with `supabase gen types typescript`
    cn.ts                # the Tailwind class merger
  routes/
    marketing/           # public-facing pages
    app/                 # owner dashboard
    finder/              # the post-scan page — the most important screen
  router.tsx             # all route definitions
  main.tsx               # entrypoint
  index.css              # Tailwind layers + base styles
```

## Routes

| Path | Purpose |
|---|---|
| `/` | Marketing home. Editorial, slow, premium. |
| `/how-it-works`, `/tags`, `/security`, `/stories`, `/business`, `/help` | Marketing placeholders, ready for content. |
| `/app` | Owner dashboard. Items, trip mode, recent scans. |
| `/find/:tagId` | Finder page. The single most important screen in the product. |

## Design system

Tokenized in [`tailwind.config.ts`](tailwind.config.ts). The brand-essential pieces:

- **Type families**: `font-display` (editorial serif, e.g. Editorial New) and `font-sans`
  (e.g. GT America). The fallbacks ship by default; license the real faces before launch.
- **Palette**: `ink` (primary text + dark surface), `bone` (light surface), `verdigris`
  (quiet accent), `coral` (reserved exclusively for lost-mode signal), `slate` (secondary text).
- **Motion**: `duration-qurtag` (220 ms), `ease-qurtag`. The `qurtag-pulse` animation is the
  only animation used on lost-mode UI — it is slow and intentional, never frantic.
- **Spacing scale**: `qurtag`, `qurtag-2`, `qurtag-3`, `qurtag-5`, `qurtag-8`, `qurtag-12`, `qurtag-16`
  (8 / 16 / 24 / 40 / 64 / 96 / 128 px). Whitespace is the luxury.
- **Corners**: `rounded-card` (8 px), `rounded-modal` (12 px), `rounded-pill`.
- **Shadows**: `shadow-card`, `shadow-elevated`, `shadow-modal` — quiet and layered, not floaty.

## Conventions

- **No exclamation marks** in product copy except finder-page confirmation states.
- **Iconography** is Lucide, 1.5 px stroke.
- **Accessibility** is first-class. WCAG 2.2 AA. `prefers-reduced-motion` is respected globally
  in `index.css`. Tap targets ≥ 44 pt. Focus rings are visible and quiet.
- **Privacy by structure**: the finder routes must never reach any owner PII. The
  `/find/*` surface is the single most important attack surface — treat it accordingly.

## Roadmap

See [`docs/PRD.md`](docs/PRD.md) §16 for the phased plan. The short version:

1. **Phase 0** — auth, item profile, tag activation, finder messaging bridge, notifications.
2. **Phase 1** — mobile apps, reward escrow, translation, trip mode, wallet passes.
3. **Phase 2** — drop-off network, courier handoff, chain of custody, family + caregiver modes.
4. **Phase 3** — business workspace, partner portal, insurance partnerships, Track tier hardware.
