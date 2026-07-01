/**
 * QurTag structured system messages.
 *
 * System messages (sender_kind='system') store JSON payloads in the body
 * field so the thread view can render specialized cards (maps, courier
 * receipts, reward state changes) without a schema change.
 *
 * Anything that doesn't parse as a known payload renders as plain text.
 */

export type SystemPayload =
  | { type: 'location'; lat: number; lng: number; accuracy?: number; label?: string }
  | {
      type: 'courier_request';
      pickupWindow: string;
      city: string | null;
      label: string | null;
    }
  | { type: 'reward_offered'; amount_cents: number }
  | { type: 'reunited'; at: string };

const MARKER = 'qurtag:json:';

export function encodeSystemPayload(payload: SystemPayload): string {
  return MARKER + JSON.stringify(payload);
}

export function parseSystemPayload(body: string): SystemPayload | null {
  if (!body.startsWith(MARKER)) return null;
  try {
    const obj = JSON.parse(body.slice(MARKER.length));
    if (obj && typeof obj === 'object' && typeof obj.type === 'string') {
      return obj as SystemPayload;
    }
    return null;
  } catch {
    return null;
  }
}
