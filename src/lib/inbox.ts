/**
 * Words for the inbox rows that do not come straight from the database.
 *
 * Several finders can write about one item (a kind one and an unkind one, say). Every row would
 * read "Water bottle", so each conversation about an item that has more than one is labelled
 * "Finder 1", "Finder 2" in the order they started. A finder has no name by design, and a
 * number says nothing about them.
 */
/** First names of the people in a Family, by account id, for "Dana:" in a shared inbox. Empty outside a Family. */
export function familyNames(family: { role: string; members?: { user_id: string; name: string | null }[] } | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!family || family.role === 'none') return out;
  for (const m of family.members ?? []) {
    const first = (m.name ?? '').trim().split(/\s+/)[0];
    if (first) out.set(m.user_id, first);
  }
  return out;
}

export interface InboxThreadLike {
  id: string;
  item_id: string;
  created_at: string;
  held_count?: number;
  last_message: { sender_kind: 'finder' | 'owner' | 'system'; body: string; sender_user_id?: string | null } | null;
}

export function finderLabels(threads: readonly InboxThreadLike[]): Map<string, string> {
  const byItem = new Map<string, InboxThreadLike[]>();
  for (const t of threads) byItem.set(t.item_id, [...(byItem.get(t.item_id) ?? []), t]);
  const out = new Map<string, string>();
  for (const list of byItem.values()) {
    if (list.length < 2) continue;
    [...list]
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      .forEach((t, i) => out.set(t.id, `Finder ${i + 1}`));
  }
  return out;
}

/** The preview line. A held note is waiting for the owner's choice, so it is said first, without its words. */
export function previewLine(t: InboxThreadLike, names?: ReadonlyMap<string, string>, viewerId?: string): string {
  if ((t.held_count ?? 0) > 0) return 'A note was held back. Open to decide.';
  if (!t.last_message) return 'No messages yet.';
  const by = t.last_message.sender_user_id;
  const owner = by && by === viewerId ? 'You: ' : by && names?.get(by) ? `${names.get(by)}: ` : 'Replied: ';
  const who = t.last_message.sender_kind === 'finder' ? 'They wrote: ' : t.last_message.sender_kind === 'owner' ? owner : '';
  return `${who}${t.last_message.body}`;
}
