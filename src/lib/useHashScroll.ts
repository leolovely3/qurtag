import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Scrolls to the element named by the address's #hash once the screen has drawn, and calls
 * `onFound` with it (Help opens the answer). The app's frame scrolls each new screen to its top
 * first, so this waits a moment and tries a few times while the content loads.
 */
export function useHashScroll(onFound?: (el: HTMLElement) => void): void {
  const { hash, pathname } = useLocation();
  useEffect(() => {
    const id = decodeURIComponent(hash.replace(/^#/, ''));
    if (!id) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const look = () => {
      const el = document.getElementById(id);
      if (el) {
        onFound?.(el);
        el.scrollIntoView({ block: 'start' });
        return;
      }
      if (++tries < 10) timer = setTimeout(look, 120);
    };
    timer = setTimeout(look, 60);
    return () => clearTimeout(timer);
    // onFound only touches the DOM element it is handed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, pathname]);
}
