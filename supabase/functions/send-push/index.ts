// QurTag — send-push Edge Function
//
// Dispatches a Web Push notification to every device subscribed for the
// recipient owners of a given message. Triggered by a Supabase Database
// Webhook on `messages.insert` (configured per docs/SETUP.md).
//
// Deploy with:
//   supabase functions deploy send-push
//
// Required Edge Function env (set via Supabase Dashboard → Functions → Secrets):
//   VAPID_PUBLIC_KEY   — same value the frontend uses
//   VAPID_PRIVATE_KEY  — never shipped to the client
//   VAPID_SUBJECT      — mailto:you@example.com (required by RFC 8292)
//   SUPABASE_URL       — provided automatically
//   SUPABASE_SERVICE_ROLE_KEY — provided automatically; used to read DB rows
//
// The webhook payload from Supabase has shape:
//   { type: 'INSERT', table: 'messages', record: { id, thread_id, sender_kind, body, ... } }

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

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
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const payload = (await req.json()) as WebhookPayload;
  if (payload.table !== 'messages' || payload.type !== 'INSERT') {
    return new Response('ignored', { status: 200 });
  }

  // Only notify the owner side when a finder writes.
  if (payload.record.sender_kind !== 'finder') {
    return new Response('not a finder message', { status: 200 });
  }

  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hello@qurtag.com';
  if (!vapidPublic || !vapidPrivate) {
    return new Response('VAPID keys not configured', { status: 500 });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Look up the thread → household → subscribers.
  const { data: thread } = await supabase
    .from('threads')
    .select('id, household_id, item_id, items(name)')
    .eq('id', payload.record.thread_id)
    .maybeSingle();
  if (!thread) return new Response('thread not found', { status: 404 });

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_secret')
    .eq('household_id', thread.household_id);

  if (!subs || subs.length === 0) {
    return new Response('no subscribers', { status: 200 });
  }

  const itemName = (thread as any).items?.name ?? 'an item';
  const preview = payload.record.body.slice(0, 120);

  const notification = JSON.stringify({
    title: 'Someone found your stuff',
    body: `${itemName}: "${preview}${payload.record.body.length > 120 ? '…' : ''}"`,
    tag: `thread:${thread.id}`,
    url: `/app/inbox/${thread.id}`,
    threadId: thread.id,
  });

  const results = await Promise.allSettled(
    subs.map((s: any) =>
      webpush.sendNotification(
        {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth_secret },
        },
        notification,
      ),
    ),
  );

  // Clean up gone-410 subscriptions.
  const dead: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const err: any = r.reason;
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        dead.push(subs[i].endpoint);
      }
    }
  });
  if (dead.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', dead);
  }

  return new Response(JSON.stringify({ sent: results.length, dead: dead.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
