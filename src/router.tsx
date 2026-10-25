import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { FEATURES } from '@/lib/features';
import { isNative } from '@/lib/platform';

import { MarketingLayout } from '@/components/layout/MarketingLayout';
import { AppLayout } from '@/components/layout/AppLayout';
import { FinderLayout } from '@/components/layout/FinderLayout';
import { MinimalLayout } from '@/components/layout/MinimalLayout';
import { PrintLayout } from '@/components/layout/PrintLayout';
import { PartnerLayout } from '@/components/layout/PartnerLayout';
import { PartnerDashboard } from '@/routes/partners/Dashboard';
import { PartnerScan } from '@/routes/partners/Scan';

import { Help } from '@/routes/marketing/Help';
import { MarketingHome } from '@/routes/marketing/Home';
import { HowItWorks } from '@/routes/marketing/HowItWorks';
import { Pricing } from '@/routes/marketing/Pricing';
import { Privacy } from '@/routes/marketing/Privacy';
import { SecurityPage } from '@/routes/marketing/Security';
import { Terms } from '@/routes/marketing/Terms';
import { Tags } from '@/routes/marketing/Tags';
import { MakeItLast } from '@/routes/marketing/MakeItLast';
import { Admin, AdminAccountPage } from '@/routes/app/Admin';
import { AppHome } from '@/routes/app/Home';
import { Inbox } from '@/routes/app/Inbox';
import { InboxThread } from '@/routes/app/InboxThread';
import { InsurancePacket } from '@/routes/app/InsurancePacket';
import { ItemDetail } from '@/routes/app/ItemDetail';
import { Items } from '@/routes/app/Items';
import { Settings } from '@/routes/app/Settings';
import { TagPrint } from '@/routes/app/TagPrint';
import { Tags as AppTags } from '@/routes/app/Tags';
import { Trips } from '@/routes/app/Trips';
import { FinderView } from '@/routes/finder/FinderView';
import { StartSignIn } from '@/routes/start/SignIn';
import { StartSetup } from '@/routes/start/Setup';
import { JoinFamily } from '@/routes/start/JoinFamily';
import { MembershipPage } from '@/routes/app/Membership';
import { ForgotPassword, ResetPassword } from '@/routes/auth/Reset';
import { AuthCallback } from '@/routes/auth/Callback';

export const router = createBrowserRouter([
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
    ],
  },
  {
    element: <MinimalLayout />,
    children: [
      { path: '/start', element: <StartSignIn /> },
      { path: '/forgot-password', element: <ForgotPassword /> },
      { path: '/reset-password', element: <ResetPassword /> },
      { path: '/auth/callback', element: <AuthCallback /> },
      { path: '/join/:token', element: <JoinFamily /> },
    ],
  },
  {
    element: <AppLayout />,
    children: [
      { path: '/app', element: <AppHome /> },
      // Adding an item and printing its tag are app screens: tab bar, title and Back.
      { path: '/start/setup', element: <StartSetup /> },
      { path: '/app/tags/:tagId/print', element: <TagPrint /> },
      { path: '/app/items', element: <Items /> },
      { path: '/app/items/:itemId', element: <ItemDetail /> },
      { path: '/app/tags', element: <AppTags /> },
      { path: '/app/inbox', element: <Inbox /> },
      { path: '/app/inbox/:threadId', element: <InboxThread /> },
      ...(FEATURES.trips ? [{ path: '/app/trips', element: <Trips /> }] : []),
      { path: '/app/membership', element: <MembershipPage /> },
      { path: '/app/settings', element: <Settings /> },
      { path: '/app/admin', element: <Admin /> },
      { path: '/app/admin/accounts/:userId', element: <AdminAccountPage /> },
    ],
  },
  {
    element: <PrintLayout />,
    children: [
      ...(FEATURES.insurancePacket ? [{ path: '/app/items/:itemId/insurance-packet', element: <InsurancePacket /> }] : []),
    ],
  },
  // Partner drop-off points are not built (src/lib/features.ts).
  ...(FEATURES.partners
    ? [
        {
          element: <PartnerLayout />,
          children: [
            { path: '/partners', element: <PartnerDashboard /> },
            { path: '/partners/scan', element: <PartnerScan /> },
            { path: '/partners/queue', element: <Navigate to="/partners" replace /> },
          ],
        } satisfies RouteObject,
      ]
    : []),
  {
    element: <FinderLayout />,
    children: [
      { path: '/find/:tagId', element: <FinderView /> },
      { path: '/find', element: <Navigate to="/" replace /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
