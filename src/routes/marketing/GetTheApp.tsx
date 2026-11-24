/** @jsxRuntime automatic @jsxImportSource react */
import { Smartphone } from 'lucide-react';
import { ANDROID_WEB_APP_PATH, APP_STORE_URL, isAppStoreListing } from '../../lib/appStore';

/**
 * How to get QuR Tag on a phone, as plain links that are in the page's HTML before any script
 * runs: the App Store listing for iPhone, once there is one (src/lib/appStore.ts), and the web
 * app for Android until the Google Play app is live. Used on the home page and on Help.
 */
export function GetTheApp({ appStoreUrl = APP_STORE_URL }: { appStoreUrl?: string | null }) {
  const listing = appStoreUrl && isAppStoreListing(appStoreUrl) ? appStoreUrl : null;
  return (
    <div className="flex flex-col items-start gap-3">
      {listing ? (
        <a
          href={listing}
          className="inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-pill bg-ink-900 px-6 text-base font-medium text-canvas hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2"
        >
          <Smartphone size={20} strokeWidth={1.75} aria-hidden />
          Download on the App Store
        </a>
      ) : (
        <p className="inline-flex items-center gap-2 text-base text-ink-700">
          <Smartphone size={16} strokeWidth={1.75} aria-hidden />
          The QuR Tag iPhone app is coming soon to the App Store.
        </p>
      )}
      <a
        href={ANDROID_WEB_APP_PATH}
        className="inline-flex min-h-11 items-center text-base font-medium text-ink-900 underline underline-offset-4"
      >
        On Android? Use the QuR Tag web app in your browser
      </a>
    </div>
  );
}
