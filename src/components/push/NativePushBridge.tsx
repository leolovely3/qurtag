import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { shareSessionWithApp } from '@/lib/authClient';
import { onPushTap, refreshPushRegistration } from '@/lib/nativePush';
import { clearDeliveredNotifications, setAppBadge } from '@/lib/nativeSession';
import { isNative } from '@/lib/platform';

/**
 * Wires the iPhone app's notifications to the screens. Renders nothing; does nothing on the web.
 *
 *  - hands the app's native code the session (so Reply in a notification works with the app
 *    closed) and re-registers a phone that already allowed alerts;
 *  - puts the unread count on the app icon (`unread` is null until it has been read, so the
 *    badge is never wiped at launch before the count is known);
 *  - opens the conversation when a notification is tapped, and takes that conversation's
 *    notifications off the lock screen when it is open.
 */
export function NativePushBridge({ unread }: { unread: number | null }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!isNative() || !userId) return;
    shareSessionWithApp();
    void refreshPushRegistration();
  }, [userId]);

  useEffect(() => {
    if (isNative() && unread !== null) void setAppBadge(unread);
  }, [unread]);

  useEffect(() => onPushTap(({ thread }) => navigate(thread ? `/app/inbox/${thread}` : '/app/items')), [navigate]);

  useEffect(() => {
    const m = /^\/app\/inbox\/([0-9a-f-]{36})$/i.exec(pathname);
    if (isNative() && m) void clearDeliveredNotifications(m[1]);
  }, [pathname]);

  return null;
}
