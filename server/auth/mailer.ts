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
          after: 'If you did not create a QuR Tag account, you can ignore this email.',
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
    text: `${lead}\n\nRead it and reply: ${inboxUrl}\n\n${after}\n`,
    html:
      `<p>${escapeHtml(lead)}</p>` +
      `<p><a href="${escapeHtml(inboxUrl)}" style="display:inline-block;padding:10px 18px;background:#0A0B0F;color:#fff;border-radius:8px;text-decoration:none">Read and reply</a></p>` +
      `<p style="color:#555">${escapeHtml(after)}</p>`,
  };
}
