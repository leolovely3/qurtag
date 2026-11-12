/**
 * The Android back button (and the back gesture). The system sends one "back" to the app; this
 * decides what it means, so QuR Tag behaves like a phone's own apps:
 *   1. An open dialog takes it and closes itself (useAndroidBackClose; every Modal does this).
 *   2. Otherwise, on a screen reached from another one, go back to that screen.
 *   3. On a screen with nothing behind it in the app, go to Items.
 *   4. On a first screen (Items, or the welcome and sign-in screen), leave the app.
 * Nothing happens on the web or on iPhone, which have their own back controls.
 *
 * Pure rules (backAction) are kept apart from the Capacitor listener so they can be tested.
 */
import { useEffect } from 'react';
import { isAndroidApp } from './platform';

export const APP_BACK_EVENT = 'qurtag:back';

const FIRST_SCREENS = new Set(['/', '/app', '/start']);

export function isFirstScreen(path: string): boolean {
  return FIRST_SCREENS.has(path.replace(/\/+$/, '') || '/');
}

export type BackAction = 'exit' | 'history' | 'home';

/**
 * What back does on `path`. `historyIndex` is the router's position in this session's history
 * (react-router keeps it in history.state.idx): 0 means nothing in the app is behind this screen.
 */
export function backAction(path: string, historyIndex: number | null | undefined): BackAction {
  if (isFirstScreen(path)) return 'exit';
  if (typeof historyIndex === 'number' && historyIndex > 0) return 'history';
  return 'home';
}

/** Starts listening for the back button in the Android app. Returns a function that stops it. */
export async function installAndroidBack(home: () => void): Promise<() => void> {
  if (!isAndroidApp()) return () => undefined;
  const { App } = await import('@capacitor/app');
  const handle = await App.addListener('backButton', () => {
    const ev = new CustomEvent(APP_BACK_EVENT, { cancelable: true });
    if (!window.dispatchEvent(ev)) return; // an open dialog closed itself
    const idx = (window.history.state as { idx?: number } | null)?.idx;
    const action = backAction(window.location.pathname, idx);
    if (action === 'history') window.history.back();
    else if (action === 'home') home();
    else void App.exitApp();
  });
  return () => {
    void handle.remove();
  };
}

/** An open dialog takes the back button and closes itself while `active` is true. */
export function useAndroidBackClose(active: boolean, close: () => void): void {
  useEffect(() => {
    if (!active) return;
    const onBack = (e: Event) => {
      e.preventDefault();
      close();
    };
    window.addEventListener(APP_BACK_EVENT, onBack);
    return () => window.removeEventListener(APP_BACK_EVENT, onBack);
  }, [active, close]);
}
