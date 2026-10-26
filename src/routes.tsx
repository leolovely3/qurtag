import type { ComponentType } from 'react';
import { Navigate, type RouteObject } from 'react-router-dom';
import { FEATURES } from '@/lib/features';
import { isNative } from '@/lib/platform';

import { MarketingLayout } from '@/components/layout/MarketingLayout';
import { InAppDoc } from '@/routes/marketing/parts';
import { Help } from '@/routes/marketing/Help';
import { MarketingHome } from '@/routes/marketing/Home';
import { HowItWorks } from '@/routes/marketing/HowItWorks';
import { Pricing } from '@/routes/marketing/Pricing';
import { Privacy } from '@/routes/marketing/Privacy';
import { SecurityPage } from '@/routes/marketing/Security';
import { Terms } from '@/routes/marketing/Terms';
import { Tags } from '@/routes/marketing/Tags';
import { MakeItLast } from '@/routes/marketing/MakeItLast';
import { NotFound } from '@/routes/marketing/NotFound';

/**
 * Every address the site answers, shared by the browser (src/router.tsx) and the build-time
 * prerender (src/seo/entry-server.tsx, scripts/seo/prerender.mjs).
 *
 * The public pages are imported here, so they are in the first download and can be rendered to HTML
 * at build time. Everything else (the signed-in app, sign-in, the finder's page, partners) loads
 * only when someone goes there: a visitor to the home page does not download the app.
 * Adding a public page means adding it to src/seo/pages.ts too; a unit test fails if the two differ.
 */

/** A route whose screen is fetched when first visited. `load` imports the file, `name` is its export. */
function screen<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M): Pick<RouteObject, 'lazy'> {
  return { lazy: async () => ({ Component: (await load())[name] as ComponentType }) };
}

const appLayout = () => import('@/components/layout/AppLayout');
const minimalLayout = () => import('@/components/layout/MinimalLayout');
const finderLayout = () => import('@/components/layout/FinderLayout');
const printLayout = () => import('@/components/layout/PrintLayout');
const partnerLayout = () => import('@/components/layout/PartnerLayout');

export const routes: RouteObject[] = [
  {
    element: <MarketingLayout />,
    children: [
      // The iPhone app opens to the app itself (sign in, or the owner's items), not the marketing page.
      { path: '/', element: isNative() ? <Navigate to="/app" replace /> : <MarketingHome /> },
      { path: '/how-it-works', element: <HowItWorks /> },
      { path: '/pricing', element: <Pricing /> },
      { path: '/security', element: <SecurityPage /> },
      { path: '/help', element: <Help /> },
      { path: '/tags', element: <Tags /> },
      { path: '/make-it-last', element: <MakeItLast /> },
      { path: '/privacy', element: <Privacy /> },
      { path: '/terms', element: <Terms /> },
      // An address the site does not have: the website says so (the server answers 404 too); the iPhone app goes home.
      { path: '*', element: isNative() ? <Navigate to="/" replace /> : <NotFound /> },
    ],
  },
  {
    ...screen(minimalLayout, 'MinimalLayout'),
    children: [
      { path: '/start', ...screen(() => import('@/routes/start/SignIn'), 'StartSignIn') },
      { path: '/forgot-password', ...screen(() => import('@/routes/auth/Reset'), 'ForgotPassword') },
      { path: '/reset-password', ...screen(() => import('@/routes/auth/Reset'), 'ResetPassword') },
      { path: '/auth/callback', ...screen(() => import('@/routes/auth/Callback'), 'AuthCallback') },
      { path: '/join/:token', ...screen(() => import('@/routes/start/JoinFamily'), 'JoinFamily') },
    ],
  },
  {
    ...screen(appLayout, 'AppLayout'),
    children: [
      { path: '/app', ...screen(() => import('@/routes/app/Home'), 'AppHome') },
      // Adding an item and printing its tag are app screens: tab bar, title and Back.
      { path: '/start/setup', ...screen(() => import('@/routes/start/Setup'), 'StartSetup') },
      { path: '/app/tags/:tagId/print', ...screen(() => import('@/routes/app/TagPrint'), 'TagPrint') },
      { path: '/app/tags/sheet', ...screen(() => import('@/routes/app/TagSheet'), 'TagSheet') },
      { path: '/app/items', ...screen(() => import('@/routes/app/Items'), 'Items') },
      { path: '/app/items/:itemId', ...screen(() => import('@/routes/app/ItemDetail'), 'ItemDetail') },
      { path: '/app/tags', ...screen(() => import('@/routes/app/Tags'), 'Tags') },
      { path: '/app/inbox', ...screen(() => import('@/routes/app/Inbox'), 'Inbox') },
      { path: '/app/inbox/:threadId', ...screen(() => import('@/routes/app/InboxThread'), 'InboxThread') },
      ...(FEATURES.trips ? [{ path: '/app/trips', ...screen(() => import('@/routes/app/Trips'), 'Trips') }] : []),
      { path: '/app/membership', ...screen(() => import('@/routes/app/Membership'), 'MembershipPage') },
      { path: '/app/settings', ...screen(() => import('@/routes/app/Settings'), 'Settings') },
      // The shared pages, read inside the app frame (src/routes/marketing/parts.tsx, InAppDoc).
      { path: '/app/help', ...screen(() => import('@/routes/app/HelpCenter'), 'HelpCenter') },
      { path: '/app/first-tag', ...screen(() => import('@/routes/app/FirstTag'), 'FirstTag') },
      { path: '/app/account', ...screen(() => import('@/routes/app/Account'), 'Account') },
      { path: '/app/terms', element: <InAppDoc title="Terms" back={{ to: '/app/settings', label: 'Settings' }}><Terms /></InAppDoc> },
      { path: '/app/privacy', element: <InAppDoc title="Privacy" back={{ to: '/app/settings', label: 'Settings' }}><Privacy /></InAppDoc> },
      { path: '/app/make-it-last', element: <InAppDoc title="Make it last" back={{ to: '/app/help', label: 'Help' }}><MakeItLast /></InAppDoc> },
      { path: '/app/admin', ...screen(() => import('@/routes/app/Admin'), 'Admin') },
      { path: '/app/admin/accounts/:userId', ...screen(() => import('@/routes/app/Admin'), 'AdminAccountPage') },
    ],
  },
  {
    ...screen(printLayout, 'PrintLayout'),
    children: [
      ...(FEATURES.insurancePacket
        ? [{ path: '/app/items/:itemId/insurance-packet', ...screen(() => import('@/routes/app/InsurancePacket'), 'InsurancePacket') }]
        : []),
    ],
  },
  // Partner drop-off points are not built (src/lib/features.ts).
  ...(FEATURES.partners
    ? [
        {
          ...screen(partnerLayout, 'PartnerLayout'),
          children: [
            { path: '/partners', ...screen(() => import('@/routes/partners/Dashboard'), 'PartnerDashboard') },
            { path: '/partners/scan', ...screen(() => import('@/routes/partners/Scan'), 'PartnerScan') },
            { path: '/partners/queue', element: <Navigate to="/partners" replace /> },
          ],
        } satisfies RouteObject,
      ]
    : []),
  {
    ...screen(finderLayout, 'FinderLayout'),
    children: [
      { path: '/find/:tagId', ...screen(() => import('@/routes/finder/FinderView'), 'FinderView') },
      { path: '/reply', ...screen(() => import('@/routes/finder/Reply'), 'Reply') },
      { path: '/find', element: <Navigate to="/" replace /> },
    ],
  },
];
