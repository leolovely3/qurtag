import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from './auth';
import { membershipsAvailableInApp, probeOfferings, subscribeMemberships } from './iap';

/**
 * True when screens may show memberships (see membership-flag.ts). In the iPhone app it
 * starts false and turns true by itself when RevenueCat's offerings load.
 */
export function useMembershipsAvailable(): boolean {
  const { user } = useAuth();
  const available = useSyncExternalStore(subscribeMemberships, membershipsAvailableInApp, membershipsAvailableInApp);
  const id = user?.id;
  useEffect(() => {
    if (id) void probeOfferings(id);
  }, [id]);
  return available;
}
