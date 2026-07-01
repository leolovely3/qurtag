// QurTag — send-email Edge Function
//
// Resend-based transactional sender, fired by the same messages.INSERT
// Database Webhook as send-push. When a finder writes, the owner gets a
// preview email with a deep link to the thread (signed magic link, so they
// can read it on the device that received the email even if not signed in).
//
// Deploy with:
//   supabase functions deploy send-email --no-verify-jwt
//
// Required Edge Function env (Supabase Dashboard → Functions → Secrets):
//   RESEND_API_KEY
//   QURTAG_APP_URL                — e.g. https://app.qurtag.com
//   SUPABASE_URL                 — provided automatically
//   SUPABASE_SERVICE_ROLE_KEY    — provided automatically

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: {
    id: string;
    thread_id: string;
    sender_kind: 'finder' | 'owner' | 'system';
    body: string;
    created_at: string;
  };
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const payload = (await req.json()) as WebhookPayload;
  if (payload.table !== 'messages' || payload.type !== 'INSERT') {
    return new Response('ignored', { status: 200 });
  }
  // Only owner gets emailed on finder messages, for now.
  if (payload.record.sender_kind !== 'finder') {
    return new Response('not a finder message', { status: 200 });
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const appUrl = Deno.env.get('QURTAG_APP_URL') ?? 'https://app.qurtag.com';
  if (!resendKey) return new Response('RESEND_API_KEY missing', { status: 500 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: thread } = await supabase
    .from('threads')
    .select('id, household_id, item_id, items(name, brand)')
    .eq('id', payload.record.thread_id)
    .maybeSingle();
  if (!thread) return new Response('thread not found', { status: 404 });

  // All owners on this household.
  const { data: members } = await supabase
    .from('household_members')
    .select('user_id')
    .eq('household_id', (thread as any).household_id);

  const userIds = (members ?? []).map((m: any) => m.user_id);
  if (userIds.length === 0) return new Response('no owners', { status: 200 });

  // Look up emails for each owner.
  const emails: string[] = [];
  for (const uid of userIds) {
    const { data: user } = await supabase.auth.admin.getUserById(uid);
    if (user?.user?.email) emails.push(user.user.email);
  }
  if (emails.length === 0) return new Response('no emails', { status: 200 });

  const itemName = (thread as any).items?.name ?? 'an item';
  const itemBrand = (thread as any).items?.brand;
  const preview = payload.record.body.slice(0, 240);
  const inboxUrl = `${appUrl}/app/inbox/${thread.id}`;

  const subject = `Someone found ${itemName}`;
  const html = `
    <!doctype html>
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; background: #fafaf7; padding: 24px;">
        <table style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid rgba(10,11,15,0.08); border-radius: 16px; padding: 32px;">
          <tr>
            <td>
              <p style="font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: #76787f; margin: 0;">A note from a finder</p>
              <h1 style="font-size: 28px; line-height: 1.1; letter-spacing: -0.02em; color: #0a0b0f; margin: 8px 0 0;">${escapeHtml(subject)}.</h1>
              ${itemBrand ? `<p style="font-size: 14px; color: #76787f; margin: 4px 0 0;">${escapeHtml(itemBrand)}</p>` : ''}
              <blockquote style="margin: 24px 0; padding: 16px 20px; background: #f5f1ea; border-radius: 12px; color: #1e2026; font-size: 16px; line-height: 1.5;">
                "${escapeHtml(preview)}${payload.record.body.length > 240 ? '…' : ''}"
              </blockquote>
              <a href="${inboxUrl}" style="display: inline-block; background: #0a0b0f; color: #ffffff; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: 500; font-size: 15px;">Open the conversation</a>
              <p style="font-size: 12px; color: #76787f; margin: 32px 0 0; line-height: 1.5;">
                QurTag never shares the finder's number, email, or address — and never shares yours.
                Reply through this thread; we'll relay it.
              </p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'QurTag <hello@qurtag.com>',
      to: emails,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[QurTag send-email] resend error', text);
    return new Response(text, { status: 502 });
  }

  return new Response(JSON.stringify({ sent: emails.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
