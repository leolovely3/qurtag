import { useEffect, useRef } from 'react';
import { POLL_MS } from './db';

/**
 * Keeps a screen fresh by asking again every few seconds while the page is in view.
 * QuR Tag's data API has no live push, so the inbox, a conversation and the finder's
 * page poll instead (POLL_MS, 10 seconds). It also asks once whenever the page comes
 * back into view.
 */
export function usePoll(fn: () => void | Promise<void>, active: boolean, ms: number = POLL_MS) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (document.visibilityState === 'visible') void ref.current();
    };
    const id = window.setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [active, ms]);
}
