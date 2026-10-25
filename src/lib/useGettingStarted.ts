import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth';
import {
  closeCard,
  isFinished,
  loadProgress,
  markDone,
  markSkipped,
  nextStep,
  saveProgress,
  stepStates,
  type Progress,
  type StepId,
} from './gettingStarted';
import { isNative } from './platform';
import { pushPermission } from './nativePush';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Records a step as done from any screen (printing a tag, for example), without the checklist being open. */
export function recordStep(userId: string, step: StepId): void {
  saveProgress(storage(), userId, markDone(loadProgress(storage(), userId), step));
}

/** The Getting started checklist for the signed-in person (rules in src/lib/gettingStarted.ts). */
export function useGettingStarted(itemCount: number) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [progress, setProgress] = useState<Progress>(() => (userId ? loadProgress(storage(), userId) : { done: [], skipped: [], closed: false }));
  const [alertsOn, setAlertsOn] = useState(false);

  const refresh = useCallback(() => {
    if (!userId) return;
    // The test view of the finder page does not tick "Scan the printed tag": only the owner's own
    // word that a scan of the paper tag opened the page does (it checks the paper, the view does not).
    setProgress(loadProgress(storage(), userId));
    if (isNative()) void pushPermission().then((v) => setAlertsOn(v === 'granted'));
  }, [userId]);

  useEffect(() => {
    refresh();
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const update = useCallback(
    (change: (p: Progress) => Progress) => {
      if (!userId) return;
      setProgress((p) => {
        const next = change(p);
        saveProgress(storage(), userId, next);
        return next;
      });
    },
    [userId],
  );

  const facts = useMemo(() => ({ itemCount, native: isNative(), alertsOn }), [itemCount, alertsOn]);
  return {
    steps: stepStates(progress, facts),
    next: nextStep(progress, facts),
    finished: isFinished(progress, facts),
    done: (s: StepId) => update((p) => markDone(p, s)),
    skip: (s: StepId) => update((p) => markSkipped(p, s)),
    close: () => update(closeCard),
    refresh,
  };
}
