/**
 * The Contact us form's calls. Signed in, the pass goes along so the server attaches the
 * account and plan itself; signed out, an email to reply to is sent. Never any card detail.
 */
import { getDataPass } from './authClient';
import { serverUrl } from './platform';

export type SupportTopic = 'billing' | 'account' | 'finder' | 'other';

export const TOPICS: { id: SupportTopic; label: string }[] = [
  { id: 'billing', label: 'A charge or my membership' },
  { id: 'account', label: 'My account' },
  { id: 'finder', label: 'A tag, a finder or a note' },
  { id: 'other', label: 'Something else' },
];

export async function sendSupport(input: { topic: SupportTopic; message: string; email?: string; website?: string; signedIn: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (input.signedIn) {
      const pass = await getDataPass();
      if (pass) headers.authorization = `Bearer ${pass}`;
    }
    const r = await fetch(serverUrl('/api/fn/support'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ topic: input.topic, message: input.message, email: input.email, website: input.website }),
    });
    if (r.ok) return { ok: true };
    const j = (await r.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, error: j?.message ?? 'Could not send your message. Please try again, or write to info@impactconsulting.ai.' };
  } catch {
    return { ok: false, error: 'Could not reach QuR Tag. Check your connection and try again.' };
  }
}
