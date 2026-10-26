/**
 * Every email QuR Tag sends: sign-in emails (confirm your email, reset your password)
 * and the server routes' email (an owner is told a finder wrote about one of their
 * items).
 *
 * The sender is pluggable so nothing depends on one mail provider:
 *  - "capture": appends each message as one JSON line to QURTAG_MAIL_CAPTURE_FILE.
 *    The local tests read the links a person would have clicked from it.
 *  - Resend, when RESEND_API_KEY is set (server side only; never a VITE_ variable).
 *    From: QURTAG_EMAIL_FROM, by default "QuR Tag <no-reply@qurtag.com>" (the domain must
 *    be verified in Resend). Replies go to info@impactconsulting.ai.
 *  - Off otherwise: nothing is sent, and `mailConfigured()` is false. The sign-in
 *    service then confirms new accounts at once (there is no one to send the email),
 *    and the outbox marks its emails done unsent (the note is in the owner's inbox either way). Logs name only the kind
 *    of message and the recipient's domain, never a link, because a link is a credential.
 */
import { appendFile } from 'node:fs/promises';

export interface Mail {
  /** For logs and tags: verify-email, reset-password, finder-message. */
  kind: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  /** Extra headers, such as List-Unsubscribe. */
  headers?: Record<string, string>;
}

export const OPERATOR = 'Impact Consulting AI LLC';
export const CONTACT_EMAIL = 'info@impactconsulting.ai';
export const DEFAULT_FROM = 'QuR Tag <no-reply@qurtag.com>';

export type MailSender = (mail: Mail) => Promise<void>;

export function mailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.QURTAG_MAIL_MODE === 'capture' || !!env.RESEND_API_KEY;
}

export function captureSender(file: string): MailSender {
  return async (mail) => {
    await appendFile(file, JSON.stringify({ ...mail, at: new Date().toISOString() }) + '\n', { mode: 0o600 });
  };
}

export const offSender: MailSender = async (mail) => {
  const domain = mail.to.split('@')[1] ?? 'unknown';
  throw new Error(`email is not set up (RESEND_API_KEY); a ${mail.kind} message to a ${domain} address was not sent`);
};

export function resendSender(apiKey: string, from: string): MailSender {
  return async (mail) => {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        reply_to: mail.replyTo ?? CONTACT_EMAIL,
        ...(mail.headers ? { headers: mail.headers } : {}),
        tags: [{ name: 'category', value: mail.kind.replace(/[^a-z0-9_-]/gi, '_') }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`Resend refused a ${mail.kind} message (HTTP ${r.status})`);
  };
}

export function senderFromEnv(env: NodeJS.ProcessEnv = process.env): MailSender {
  if (env.QURTAG_MAIL_MODE === 'capture') {
    const file = env.QURTAG_MAIL_CAPTURE_FILE;
    if (!file) throw new Error('QURTAG_MAIL_MODE=capture needs QURTAG_MAIL_CAPTURE_FILE');
    return captureSender(file);
  }
  if (env.RESEND_API_KEY) {
    return resendSender(env.RESEND_API_KEY, env.QURTAG_EMAIL_FROM?.trim() || DEFAULT_FROM);
  }
  return offSender;
}

/** The address emails come from, without the display name (for example no-reply@qurtag.com). */
export function fromAddress(env: NodeJS.ProcessEnv = process.env): string {
  const from = env.QURTAG_EMAIL_FROM?.trim() || DEFAULT_FROM;
  return /<([^>]+)>/.exec(from)?.[1]?.trim() ?? from;
}

/** The test an owner sends to themselves from Settings or the first-tag walkthrough. */
export function testAlertMail(to: string, settingsUrl: string): Mail {
  const lead = 'This is a test from QuR Tag. When someone finds one of your things and writes to you, an email like this one comes to this address.';
  const after = 'If this email was in spam or junk, mark it Not spam and add this sender to your contacts, so the real one reaches your inbox.';
  return {
    kind: 'test-alert',
    to,
    subject: 'QuR Tag test: this is how you will hear from a finder',
    text: `${lead}\n\n${after}\n\nTell QuR Tag it arrived: ${settingsUrl}\n\n${OPERATOR}\n${CONTACT_EMAIL}\n`,
    html:
      `<p style="font-size:20px;font-weight:600;margin:0 0 16px">QuR Tag</p>` +
      `<p>${escapeHtml(lead)}</p>` +
      `<p style="color:#555">${escapeHtml(after)}</p>` +
      `<p><a href="${escapeHtml(settingsUrl)}" style="display:inline-block;padding:10px 18px;background:#0A0B0F;color:#fff;border-radius:8px;text-decoration:none">It arrived</a></p>` +
      `<p style="color:#777;font-size:12px;margin-top:24px">${OPERATOR}<br>${CONTACT_EMAIL}</p>`,
  };
}

/** Said in the owner's emails, so the next one (a finder's note) does not land in spam or junk. */
export const KEEP_OUT_OF_SPAM = 'To keep our emails out of spam or junk, add no-reply@qurtag.com to your contacts.';

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** The two sign-in emails. */
export function signInMail(kind: 'verify-email' | 'reset-password', to: string, url: string): Mail {
  const words =
    kind === 'verify-email'
      ? {
          subject: 'Confirm your email for QuR Tag',
          lead: 'Confirm your email address to finish setting up your QuR Tag account.',
          button: 'Confirm my email',
          after: `If you did not create a QuR Tag account, you can ignore this email. ${KEEP_OUT_OF_SPAM}`,
        }
      : {
          subject: 'Reset your QuR Tag password',
          lead: 'Someone asked to reset the password for your QuR Tag account. The link works once and expires in 1 hour.',
          button: 'Reset my password',
          after: "If you didn't ask for this, ignore this email. Your password stays the same.",
        };
  const safe = escapeHtml(url);
  return {
    kind,
    to,
    subject: words.subject,
    text: `QuR Tag\n\n${words.lead}\n\n${words.button}: ${url}\n\n${words.after}\n\n${OPERATOR}\n${CONTACT_EMAIL}\n`,
    html:
      `<p style="font-size:20px;font-weight:600;margin:0 0 16px">QuR Tag</p>` +
      `<p>${escapeHtml(words.lead)}</p>` +
      `<p><a href="${safe}" style="display:inline-block;padding:10px 18px;background:#0A0B0F;color:#fff;border-radius:8px;text-decoration:none">${escapeHtml(words.button)}</a></p>` +
      `<p style="color:#555">Or open this link: ${safe}</p>` +
      `<p style="color:#555">${escapeHtml(words.after)}</p>` +
      `<p style="color:#777;font-size:12px;margin-top:24px">${OPERATOR}<br>${CONTACT_EMAIL}</p>`,
  };
}

/** Tells an owner that a finder wrote about one of their items. Nothing about the finder. */
export function finderMessageMail(to: string, itemName: string, inboxUrl: string): Mail {
  const lead = `Someone who found your ${itemName} sent you a note on QuR Tag.`;
  const after = 'Reply from your QuR Tag inbox. They will not see your email address.';
  return {
    kind: 'finder-message',
    to,
    subject: `A note about your ${itemName}`,
    text: `${lead}\n\nRead it and reply: ${inboxUrl}\n\n${after}\n\n${KEEP_OUT_OF_SPAM}\n`,
    html:
      `<p>${escapeHtml(lead)}</p>` +
      `<p><a href="${escapeHtml(inboxUrl)}" style="display:inline-block;padding:10px 18px;background:#0A0B0F;color:#fff;border-radius:8px;text-decoration:none">Read and reply</a></p>` +
      `<p style="color:#555">${escapeHtml(after)}</p>` +
      `<p style="color:#777;font-size:12px">${escapeHtml(KEEP_OUT_OF_SPAM)}</p>`,
  };
}

/**
 * Tells a finder the owner replied (or, at the end, that the owner has it back). The owner's words are
 * written for the finder, so they are included; up to five replies, oldest first. A link back to the
 * conversation (the token after #, which a browser never sends to a server), a way to stop the emails
 * with one click, and nothing about the owner.
 */
export function finderReplyMail(input: {
  to: string;
  itemName: string;
  replies: string[];
  more: boolean;
  returned: boolean;
  conversationUrl: string;
  stopUrl: string;
}): Mail {
  const { to, itemName, replies, more, returned, conversationUrl, stopUrl } = input;
  const lead = returned
    ? `The owner of the ${itemName} has it back. Thank you for being kind.`
    : replies.length > 0
      ? `The owner of the ${itemName} replied to your note.`
      : 'The owner replied.';
  const quoted = replies.map((r) => r.slice(0, 2000));
  const moreLine = more ? 'There are more replies in the conversation.' : '';
  const privacy = returned
    ? 'We have now deleted your email address. The owner never saw it.'
    : 'The owner never sees your email address. We delete it when the conversation ends, or after 30 days without a note.';
  const keep = 'To keep these emails out of spam or junk, add no-reply@qurtag.com to your contacts.';
  return {
    kind: 'finder-reply',
    to,
    subject: returned ? `The owner has the ${itemName} back` : `The owner replied about the ${itemName}`,
    headers: { 'List-Unsubscribe': `<${stopUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    text:
      `${lead}\n\n` +
      (quoted.length ? quoted.map((r) => `"${r}"`).join('\n\n') + '\n\n' : '') +
      (moreLine ? `${moreLine}\n\n` : '') +
      `Open the conversation: ${conversationUrl}\n\n${privacy}\n${keep}\n\nStop these emails: ${stopUrl}\n\n${OPERATOR}, makers of QuR Tag\n`,
    html:
      `<p style="font-size:20px;font-weight:600;margin:0 0 16px">QuR Tag</p>` +
      `<p>${escapeHtml(lead)}</p>` +
      quoted.map((r) => `<blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #FF5C2E;background:#F6F6F4;white-space:pre-wrap">${escapeHtml(r)}</blockquote>`).join('') +
      (moreLine ? `<p>${escapeHtml(moreLine)}</p>` : '') +
      `<p><a href="${escapeHtml(conversationUrl)}" style="display:inline-block;padding:10px 18px;background:#0A0B0F;color:#fff;border-radius:8px;text-decoration:none">Open the conversation</a></p>` +
      `<p style="color:#555">${escapeHtml(privacy)} ${escapeHtml(keep)}</p>` +
      `<p style="color:#777;font-size:12px;margin-top:24px"><a href="${escapeHtml(stopUrl)}" style="color:#777">Stop these emails</a><br>${OPERATOR}, makers of QuR Tag</p>`,
  };
}

/** Tells the company a report or a held note is waiting. A link to the Admin screen; never any note text. */
export function adminReportMail(waiting: number, adminUrl: string): Mail {
  const lead = waiting === 1 ? 'There is a new report on QuR Tag.' : `There are ${waiting} new reports on QuR Tag.`;
  const after = 'Each report is answered within 24 hours. Open Admin, then Reported notes.';
  return {
    kind: 'admin-report',
    to: CONTACT_EMAIL,
    subject: 'New report on QuR Tag',
    text: `${lead}\n\nReview: ${adminUrl}\n\n${after}\n`,
    html:
      `<p>${escapeHtml(lead)}</p>` +
      `<p><a href="${escapeHtml(adminUrl)}" style="display:inline-block;padding:10px 18px;background:#0A0B0F;color:#fff;border-radius:8px;text-decoration:none">Open Admin</a></p>` +
      `<p style="color:#555">${escapeHtml(after)}</p>`,
  };
}

/** Invites someone to share a Family plan. Says who invited them and how to accept. */
export function familyInviteMail(to: string, inviter: string, joinUrl: string): Mail {
  const lead = `${inviter} invited you to share their QuR Tag family plan. You will see the same items and the same inbox.`;
  const after = 'The link works once, for this email address, and expires in 7 days. If you do not know them, ignore this email.';
  return {
    kind: 'family-invite',
    to,
    subject: `${inviter} invited you to QuR Tag`,
    text: `${lead}\n\nAccept the invite: ${joinUrl}\n\n${after}\n\n${OPERATOR}\n${CONTACT_EMAIL}\n`,
    html:
      `<p>${escapeHtml(lead)}</p>` +
      `<p><a href="${escapeHtml(joinUrl)}" style="display:inline-block;padding:10px 18px;background:#0A0B0F;color:#fff;border-radius:8px;text-decoration:none">Accept the invite</a></p>` +
      `<p style="color:#555">Or open this link: ${escapeHtml(joinUrl)}</p>` +
      `<p style="color:#555">${escapeHtml(after)}</p>` +
      `<p style="color:#777;font-size:12px;margin-top:24px">${OPERATOR}<br>${CONTACT_EMAIL}</p>`,
  };
}

/**
 * Tells the company inbox that someone wrote through the Contact us form. Reply-to is the
 * sender's own address, so replying answers them. Carries the account id and plan when the
 * sender was signed in. Never any card detail: the form has no place for one.
 */
export function supportNoticeMail(input: { id: string; topic: string; message: string; replyEmail: string | null; plan: string | null; userId: string | null }): Mail {
  const who = input.userId ? `Signed in. Account ${input.userId}, plan ${input.plan ?? 'unknown'}.` : 'Not signed in.';
  const head = `Contact us (${input.topic}). ${who} Request ${input.id}.`;
  return {
    kind: 'support-request',
    to: CONTACT_EMAIL,
    subject: `QuR Tag question about ${input.topic}`,
    replyTo: input.replyEmail ?? undefined,
    text: `${head}\nReply to: ${input.replyEmail ?? '(none)'}\n\n${input.message}\n`,
    html: `<p>${escapeHtml(head)}</p><p>Reply to: ${escapeHtml(input.replyEmail ?? '(none)')}</p><p style="white-space:pre-wrap">${escapeHtml(input.message)}</p>`,
  };
}
