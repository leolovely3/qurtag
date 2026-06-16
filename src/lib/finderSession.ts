import { supabase } from './supabase';

const KEY = 'qurtag.finder_session_id';

/**
 * Returns a stable anonymous session id for this browser, generating one
 * the first time and registering it server-side for analytics.
 *
 * The session id is the finder's identity across visits and across items
 * they may have found in the past.
 */
export async function getOrCreateFinderSession(): Promise<string> {
  let id = localStorage.getItem(KEY);
  if (id) return id;
  id = crypto.randomUUID();
  localStorage.setItem(KEY, id);
  // Best-effort register. Failures don't block the conversation.
  void supabase.from('finder_sessions').insert({
    id,
    locale: typeof navigator !== 'undefined' ? navigator.language : null,
    user_agent_class:
      typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : null,
  });
  return id;
}

const THREAD_KEY_PREFIX = 'qurtag.finder_thread.'; // + tagPublicId

export function rememberThreadForTag(tagPublicId: string, threadId: string) {
  localStorage.setItem(THREAD_KEY_PREFIX + tagPublicId, threadId);
}

export function recallThreadForTag(tagPublicId: string): string | null {
  return localStorage.getItem(THREAD_KEY_PREFIX + tagPublicId);
}
