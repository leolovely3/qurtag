import { createBrowserRouter, Navigate } from 'react-router-dom';

import { MarketingLayout } from '@/components/layout/MarketingLayout';
import { AppLayout } from '@/components/layout/AppLayout';
import { FinderLayout } from '@/components/layout/FinderLayout';
import { MinimalLayout } from '@/components/layout/MinimalLayout';
import { PrintLayout } from '@/components/layout/PrintLayout';
import { PartnerLayout } from '@/components/layout/PartnerLayout';
import { PartnerDashboard } from '@/routes/partners/Dashboard';
import { PartnerScan } from '@/routes/partners/Scan';

import { Business } from '@/routes/marketing/Business';
import { Help } from '@/routes/marketing/Help';
import { MarketingHome } from '@/routes/marketing/Home';
import { HowItWorks } from '@/routes/marketing/HowItWorks';
import { Pricing } from '@/routes/marketing/Pricing';
import { Privacy } from '@/routes/marketing/Privacy';
import { SecurityPage } from '@/routes/marketing/Security';
import { Terms } from '@/routes/marketing/Terms';
import { Stories } from '@/routes/marketing/Stories';
import { Tags } from '@/routes/marketing/Tags';
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
import { AuthCallback } from '@/routes/auth/Callback';

export const router = createBrowserRouter([
  {
    element: <MarketingLayout />,
    children: [
      { path: '/', element: <MarketingHome /> },
      { path: '/how-it-works', element: <HowItWorks /> },
      { path: '/pricing', element: <Pricing /> },
      { path: '/security', element: <SecurityPage /> },
      { path: '/business', element: <Business /> },
      { path: '/help', element: <Help /> },
      { path: '/tags', element: <Tags /> },
      { path: '/stories', element: <Stories /> },
      { path: '/privacy', element: <Privacy /> },
      { path: '/terms', element: <Terms /> },
    ],
  },
  {
    element: <MinimalLayout />,
    children: [
      { path: '/start', element: <StartSignIn /> },
      { path: '/start/setup', element: <StartSetup /> },
      { path: '/auth/callback', element: <AuthCallback /> },
    ],
  },
  {
    element: <AppLayout />,
    children: [
      { path: '/app', element: <AppHome /> },
      { path: '/app/items', element: <Items /> },
      { path: '/app/items/:itemId', element: <ItemDetail /> },
      { path: '/app/tags', element: <AppTags /> },
      { path: '/app/inbox', element: <Inbox /> },
      { path: '/app/inbox/:threadId', element: <InboxThread /> },
      { path: '/app/trips', element: <Trips /> },
      { path: '/app/settings', element: <Settings /> },
    ],
  },
  {
    element: <PrintLayout />,
    children: [
      { path: '/app/tags/:tagId/print', element: <TagPrint /> },
      { path: '/app/items/:itemId/insurance-packet', element: <InsurancePacket /> },
    ],
  },
  {
    element: <PartnerLayout />,
    children: [
      { path: '/partners', element: <PartnerDashboard /> },
      { path: '/partners/scan', element: <PartnerScan /> },
      { path: '/partners/queue', element: <Navigate to="/partners" replace /> },
    ],
  },
  {
    element: <FinderLayout />,
    children: [
      { path: '/find/:tagId', element: <FinderView /> },
      { path: '/find', element: <Navigate to="/find/demo" replace /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
