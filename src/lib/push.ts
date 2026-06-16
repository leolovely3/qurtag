import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { fetchPrimaryHouseholdId } from './queries';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export const isPushSupported =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

export type PushPermission = 'unsupported' | 'unconfigured' | 'denied' | 'granted' | 'default';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported) return null;
  const existing = await navigator.serviceWorker.getRegistration('/sw.js');
  if (existing) return existing;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.error('[QurTag] sw register', err);
    return null;
  }
}

export function usePushSubscription(userId: string | null) {
  const [permission, setPermission] = useState<PushPermission>(() => {
    if (!isPushSupported) return 'unsupported';
    if (!VAPID_PUBLIC_KEY) return 'unconfigured';
    return (Notification.permission as PushPermission) ?? 'default';
  });
  const [subscribed, setSubscribed] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!isPushSupported || !VAPID_PUBLIC_KEY) return;
    (async () => {
      const reg = await ensureRegistration();
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    })();
  }, []);

  const subscribe = useCallback(async () => {
    if (!isPushSupported || !VAPID_PUBLIC_KEY || !userId) return;
    setPending(true);
    try {
      const reg = await ensureRegistration();
      if (!reg) return;

      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== 'granted') {
        setSubscribed(false);
        return;
      }

      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));

      const json = sub.toJSON();
      const householdId = await fetchPrimaryHouseholdId();

      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: userId,
          household_id: householdId,
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? '',
          auth_secret: json.keys?.auth ?? '',
          user_agent: navigator.userAgent.slice(0, 200),
          last_used_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' },
      );
      if (error) console.error('[QurTag] push subscribe persist', error);
      setSubscribed(true);
    } finally {
      setPending(false);
    }
  }, [userId]);

  const unsubscribe = useCallback(async () => {
    if (!isPushSupported) return;
    setPending(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } finally {
      setPending(false);
    }
  }, []);

  return { permission, subscribed, pending, subscribe, unsubscribe };
}
