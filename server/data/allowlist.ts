/**
 * Everything the data API will name in SQL: the tables, columns, embeds and functions of
 * schema qurtag that the QuR Tag owner screens use, and what a visitor may do with them.
 *
 * Why a fixed list: every identifier in a query comes from here, never from the request.
 * A request may only pick names from this list; anything else is refused before the
 * database is touched. Values always travel as query parameters.
 *
 * Two kinds of visitor: `user` (a signed-in owner with a pass) and `anon` (no pass).
 * With no pass, no table is served at all: only the Factory's counts. Finders never use
 * this API; their page goes through the server routes (/api/fn/finder/*,
 * server/routes/finder.ts), which return a finder-safe card and the finder's own
 * conversation only.
 *
 * What the list grants is not what the database allows. Row security, column rights
 * and the functions' own checks still decide every read and write, as qurtag_user or
 * qurtag_anon. Every name here exists in db/qurtag.sql; scripts/qurtag/e2e.test.mjs
 * checks that against the schema it runs on. Never list threads.finder_token_sha256.
 */
export type Op = 'select' | 'insert' | 'update' | 'delete' | 'upsert';
export type Visitor = 'user' | 'anon';

export interface Access {
  ops: readonly Op[];
  /** Columns the visitor may read, filter and order by. Default: the table's columns. */
  read?: readonly string[];
  /** Columns the visitor may set. Default: none. */
  write?: readonly string[];
}

export interface TableRule {
  /** Every column the API may name (all exist in qurtag.<table>). */
  columns: readonly string[];
  /** Column sets an upsert may name in on_conflict (each a unique key of the table). */
  onConflict?: readonly (readonly string[])[];
  /** The primary key, which an upsert without on_conflict uses (as PostgREST does). */
  primaryKey?: readonly string[];
  /**
   * Columns a visitor may read only by naming them: select=* leaves them out. Used for a
   * column added by a database rollout that may run after the app is deployed (is_demo),
   * so that a database without it still answers every query that uses select=*.
   */
  explicit?: readonly string[];
  user?: Access;
}

export const TABLES: Readonly<Record<string, TableRule>> = {
  households: {
    columns: ['id', 'name', 'plan_tier', 'owner_user_id', 'created_at'],
    user: { ops: ['select', 'update'], write: ['name'] },
  },
  household_members: {
    columns: ['household_id', 'user_id', 'role', 'created_at'],
    user: { ops: ['select'] },
  },
  // Items are added through create_item (with their first tag).
  items: {
    columns: [
      'id', 'household_id', 'name', 'brand', 'color', 'hero_photo_url', 'lost_mode',
      'reward_text', 'notes', 'created_at', 'updated_at',
    ],
    user: { ops: ['select', 'update', 'delete'], write: ['name', 'brand', 'color', 'hero_photo_url', 'lost_mode', 'reward_text', 'notes'] },
  },
  // Tags are made by create_item and replace_tag; an owner may switch one off or on.
  tags: {
    columns: ['id', 'public_id', 'short_code', 'household_id', 'current_item_id', 'hardware_tier', 'status', 'activated_at', 'created_at'],
    user: { ops: ['select', 'update'], write: ['status'] },
  },
  scans: {
    columns: ['id', 'tag_id', 'item_id', 'scanned_at', 'user_agent_class'],
    user: { ops: ['select'] },
  },
  // Never finder_token_sha256.
  threads: {
    columns: ['id', 'item_id', 'household_id', 'tag_id', 'status', 'last_message_at', 'created_at'],
    user: { ops: ['select', 'update'], write: ['status'] },
  },
  // Replies go through owner_reply; reading marks through mark_thread_read.
  messages: {
    columns: ['id', 'thread_id', 'sender_kind', 'body', 'read_by_owner_at', 'read_by_finder_at', 'created_at'],
    user: { ops: ['select'] },
  },
};

/**
 * Embeds: a related table read inside a select, e.g. select=*,item:items(name).
 * Each is the single row whose `remote` column equals the parent's `local` column (an
 * object, or null), read under the same row security and the same column list. The key
 * is what the app writes: the table's name or the alias the screens use.
 */
export interface EmbedRule {
  table: string;
  local: string;
  remote: string;
}

export const EMBEDS: Readonly<Record<string, Readonly<Record<string, EmbedRule>>>> = {
  threads: {
    items: { table: 'items', local: 'item_id', remote: 'id' },
  },
  tags: {
    items: { table: 'items', local: 'current_item_id', remote: 'id' },
  },
};

/** `photo` is text sent as text: a small picture as a data: address (checked by the database). */
export type ArgType = 'text' | 'photo' | 'uuid' | 'integer' | 'boolean' | 'double precision' | 'timestamp with time zone';

export interface RpcRule {
  args: Readonly<Record<string, ArgType>>;
  /** What the function gives back: rows (returns table), one value, or nothing. */
  returns: 'rows' | 'value' | 'void';
  /** Who may call it. 'anon' means with no pass at all. */
  callers: readonly Visitor[];
}

export const RPCS: Readonly<Record<string, RpcRule>> = {
  // Owners.
  create_item: {
    args: { p_name: 'text', p_brand: 'text', p_color: 'text', p_photo: 'photo', p_reward_text: 'text', p_notes: 'text' },
    returns: 'value',
    callers: ['user'],
  },
  replace_tag: { args: { p_item_id: 'uuid' }, returns: 'value', callers: ['user'] },
  owner_reply: { args: { p_thread_id: 'uuid', p_body: 'text' }, returns: 'value', callers: ['user'] },
  mark_thread_read: { args: { p_thread_id: 'uuid' }, returns: 'void', callers: ['user'] },
  delete_my_account: { args: {}, returns: 'void', callers: ['user'] },
  // Moderation of finders' notes (db/moderation.sql): report a note, block or unblock a finder,
  // the finders blocked, and the notes the filter held (no text) with the choice to show one.
  report_message: { args: { p_message: 'uuid', p_reason: 'text', p_comment: 'text' }, returns: 'value', callers: ['user'] },
  block_finder: { args: { p_thread: 'uuid' }, returns: 'value', callers: ['user'] },
  unblock_finder: { args: { p_thread: 'uuid' }, returns: 'value', callers: ['user'] },
  my_blocked_finders: { args: {}, returns: 'value', callers: ['user'] },
  my_held_notes: { args: { p_thread: 'uuid' }, returns: 'value', callers: ['user'] },
  release_held_note: { args: { p_message: 'uuid' }, returns: 'value', callers: ['user'] },
  // Super admins (db/admin.sql). Listed for every signed-in person; each function checks
  // for itself, in the database, that the live session belongs to a super admin, and
  // refuses everyone else with 403. is_super_admin only answers true or false.
  is_super_admin: { args: {}, returns: 'value', callers: ['user'] },
  admin_overview: { args: {}, returns: 'value', callers: ['user'] },
  admin_list_accounts: { args: { p_search: 'text', p_limit: 'integer', p_offset: 'integer' }, returns: 'value', callers: ['user'] },
  admin_account: { args: { p_user: 'uuid' }, returns: 'value', callers: ['user'] },
  admin_set_tag: { args: { p_tag: 'uuid', p_active: 'boolean' }, returns: 'value', callers: ['user'] },
  admin_set_message_hidden: { args: { p_message: 'uuid', p_hidden: 'boolean' }, returns: 'value', callers: ['user'] },
  admin_support_list: { args: { p_status: 'text' }, returns: 'value', callers: ['user'] },
  admin_support_close: { args: { p_id: 'uuid' }, returns: 'value', callers: ['user'] },
  my_admin_alerts: { args: {}, returns: 'value', callers: ['user'] },
  set_admin_alerts: { args: { p_on: 'boolean' }, returns: 'value', callers: ['user'] },
  admin_reports_list: { args: { p_status: 'text' }, returns: 'value', callers: ['user'] },
  admin_report_resolve: { args: { p_id: 'uuid', p_action: 'text' }, returns: 'value', callers: ['user'] },
  admin_delete_account: { args: { p_user: 'uuid', p_confirm_email: 'text' }, returns: 'value', callers: ['user'] },
  // Membership (db/membership.sql) and the Family household (db/family.sql).
  my_membership: { args: {}, returns: 'value', callers: ['user'] },
  my_family: { args: {}, returns: 'value', callers: ['user'] },
  invite_preview: { args: { p_token: 'text' }, returns: 'value', callers: ['user'] },
  accept_invite: { args: { p_token: 'text' }, returns: 'value', callers: ['user'] },
  leave_household: { args: {}, returns: 'void', callers: ['user'] },
  remove_member: { args: { p_user: 'uuid' }, returns: 'void', callers: ['user'] },
  revoke_invite: { args: { p_invite: 'uuid' }, returns: 'void', callers: ['user'] },
  // Notification settings (db/push.sql).
  my_push_settings: { args: {}, returns: 'value', callers: ['user'] },
  set_push_settings: {
    args: { p_found_on: 'boolean', p_message_on: 'boolean', p_scan_on: 'boolean', p_hide_text: 'boolean', p_email_copy: 'boolean' },
    returns: 'value',
    callers: ['user'],
  },
  // With no pass: the Factory's counts (which check a token of their own).
  factory_metrics: { args: { p_token: 'text' }, returns: 'value', callers: ['anon'] },
};

export const SCHEMA = 'qurtag';

/** Lower-case SQL identifier shape; every name above has it, so it can be quoted as is. */
export const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
export const tableRule = (name: string): TableRule | undefined => (IDENT.test(name) && has(TABLES, name) ? TABLES[name] : undefined);
export const rpcRule = (name: string): RpcRule | undefined => (IDENT.test(name) && has(RPCS, name) ? RPCS[name] : undefined);
/** The embed `key` (name, foreign key column, or name!hint) of `parent`. */
export const embedRule = (parent: string, key: string): EmbedRule | undefined =>
  /^[a-z_][a-z0-9_]{0,62}(![a-z_][a-z0-9_]{0,62})?$/.test(key) && has(EMBEDS, parent) && has(EMBEDS[parent], key) ? EMBEDS[parent][key] : undefined;

/** What `visitor` may do with `table`, with its column lists filled in. */
export function accessOf(
  table: string,
  visitor: Visitor,
): { ops: readonly Op[]; read: readonly string[]; star: readonly string[]; write: readonly string[] } | undefined {
  if (visitor === 'anon') return undefined;
  const rule = tableRule(table);
  const a = rule?.user;
  if (!rule || !a) return undefined;
  const read = a.read ?? rule.columns;
  const star = rule.explicit ? read.filter((c) => !rule.explicit!.includes(c)) : read;
  return { ops: a.ops, read, star, write: a.write ?? [] };
}
