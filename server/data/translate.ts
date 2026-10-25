/**
 * Turns one data API request (the PostgREST-style requests @supabase/postgrest-js sends)
 * into parameterized SQL on schema qurtag.
 *
 * Why this subset of PostgREST and not explicit endpoints: the app makes about a
 * hundred data calls, all of a few shapes, that it used to send to Supabase. Serving that
 * same surface keeps every screen's query as it was (only the client changes,
 * src/lib/db.ts) and keeps the rules in the database, where they are. Only these shapes
 * are accepted, which is what the app sends:
 *
 *   GET|HEAD /<table>?select=a,b,embed(c),alias:embed(c,inner(d)),embed!hint(c)
 *                    &<col>=<op>.<value>&or=(...)&order=a.desc.nullslast,b&limit=n&offset=n
 *   POST   /<table>[?select=...][&on_conflict=a,b][&columns=...]  body: object or array
 *   PATCH  /<table>?<filters>[&select=...]                        body: object
 *   DELETE /<table>?<filters>[&select=...]
 *   POST   /rpc/<function>                                        body: named arguments
 *
 * Filters: eq, neq, gt, gte, lt, lte; is.null|true|false and not.is.null|true|false;
 * in.(a,b,"c"); ilike.<pattern> (* or % as the wildcard). or=(...) holds up to 10 of
 * eq, neq, gt, gte, lt, lte, is or ilike on the table's own columns. No and=, no
 * nesting, no casts, no JSON paths, no renamed plain columns. PATCH and DELETE need at
 * least one filter. Embeds are the single related row (an object or null), up to two
 * levels deep, as the app's screens read them (a conversation with its item). Prefer: return=representation or minimal; count=exact (planned and
 * estimated are counted exactly too) gives a Content-Range total;
 * resolution=merge-duplicates or ignore-duplicates for an upsert. Accept:
 * application/vnd.pgrst.object+json asks for exactly one row.
 *
 * Safety: every table, column, embed, function and argument name is checked against
 * server/data/allowlist.ts for the visitor and only then written into the SQL, double
 * quoted. Every value, filter values and patterns included, is a query parameter.
 * Request bodies reach the database as one JSON parameter, read with
 * json_populate_record(set) against the table's own row type, so each value takes the
 * column's type.
 */
import { IDENT, SCHEMA, accessOf, embedRule, rpcRule, tableRule, type ArgType, type EmbedRule, type Op, type TableRule, type Visitor } from './allowlist.js';

export const MAX_ROWS = 1000;
export const MAX_INSERT_ROWS = 100;
const MAX_OFFSET = 1_000_000;
const MAX_SELECT_LENGTH = 2000;
const MAX_FILTERS = 20;
const MAX_OR_ITEMS = 10;
const MAX_IN_ITEMS = 500;
const MAX_VALUE_LENGTH = 500;
const MAX_EMBED_DEPTH = 2;
/** A small item photo as a data: address; the database checks its shape and size. */
const MAX_PHOTO_LENGTH = 120_000;

export class RequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const bad = (message = 'That request is not valid.') => new RequestError(400, 'PGRST100', message);
const notFound = () => new RequestError(404, 'PGRST205', 'Not found.');
const denied = () => new RequestError(403, '42501', 'You do not have access to that.');
const notAllowed = () => new RequestError(405, 'PGRST100', 'That is not allowed.');

export interface DataRequest {
  method: string;
  /** Path segments after /api/data, without the optional rest/v1 prefix. */
  path: string[];
  query: URLSearchParams;
  prefer: string;
  /** Accept asks for application/vnd.pgrst.object+json. */
  wantsObject: boolean;
  body: unknown;
}

export interface Plan {
  sql: string;
  params: unknown[];
  readOnly: boolean;
  /** rows: each result row has one json column `j`; value: one row, column `j`; none: nothing to send. */
  result: 'rows' | 'value' | 'none';
  status: number;
  single: boolean;
  /** HEAD: only the count (or nothing) is sent back. */
  head: boolean;
  /** count(*) of the same rows, when Prefer asked for a count. */
  count?: { sql: string; params: unknown[] };
  /** The first row's position, for Content-Range. */
  offset: number;
}

const q = (ident: string) => {
  // Every name reaching here came from the allowlist; this is a last guard.
  if (!IDENT.test(ident)) throw bad();
  return `"${ident}"`;
};
const tbl = (name: string) => `${q(SCHEMA)}.${q(name)}`;

interface Ctx {
  table: string;
  rule: TableRule;
  visitor: Visitor;
  read: readonly string[];
  write: readonly string[];
}

// ------------------------------------------------------------------ select lists

interface Embed {
  /** The JSON key in the answer: the alias, or the name as written. */
  out: string;
  rule: EmbedRule;
  sel: Selection;
}

interface Selection {
  table: string;
  columns: string[];
  embeds: Embed[];
}

function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth < 0 || depth > MAX_EMBED_DEPTH) throw bad();
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (depth !== 0) throw bad();
  out.push(cur);
  return out;
}

const EMBED = /^(?:([a-z_][a-z0-9_]{0,62}):)?([a-z_][a-z0-9_]{0,62})(?:!([a-z_][a-z0-9_]{0,62}))?\((.+)\)$/s;

/** A select list for `table`; embeds may hold embeds, up to MAX_EMBED_DEPTH levels. */
function parseSelect(raw: string | null, table: string, visitor: Visitor, allowEmbeds: boolean, depth = 0): Selection {
  const text = (raw ?? '*').replace(/\s+/g, '');
  if (text.length === 0 || text.length > MAX_SELECT_LENGTH) throw bad();
  const access = accessOf(table, visitor);
  if (!access || !access.ops.includes('select')) throw bad();
  const sel: Selection = { table, columns: [], embeds: [] };
  const outNames = new Set<string>();
  for (const part of splitTopLevel(text)) {
    const m = EMBED.exec(part);
    if (m) {
      if (!allowEmbeds || depth >= MAX_EMBED_DEPTH) throw bad();
      const key = m[3] ? `${m[2]}!${m[3]}` : m[2];
      const rule = embedRule(table, key);
      if (!rule) throw bad();
      const out = m[1] ?? m[2];
      if (outNames.has(out)) throw bad();
      outNames.add(out);
      sel.embeds.push({ out, rule, sel: parseSelect(m[4], rule.table, visitor, true, depth + 1) });
      continue;
    }
    const cols = part === '*' ? access.star : IDENT.test(part) && access.read.includes(part) ? [part] : null;
    if (!cols) throw bad();
    for (const c of cols) {
      if (outNames.has(c)) continue;
      outNames.add(c);
      sel.columns.push(c);
    }
  }
  return sel;
}

let aliasCounter = 0;

/** json_build_object(...) for a selection read from table alias `alias`, embeds as subqueries. */
function selectObject(sel: Selection, alias: string): string {
  const pairs: string[] = sel.columns.map((c) => `'${c}', ${alias}.${q(c)}`);
  for (const e of sel.embeds) {
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(e.out)) throw bad();
    const child = `e${++aliasCounter}`;
    pairs.push(
      `'${e.out}', (select ${selectObject(e.sel, child)} from ${tbl(e.rule.table)} ${child} ` +
        `where ${child}.${q(e.rule.remote)} = ${alias}.${q(e.rule.local)} limit 1)`,
    );
  }
  if (!pairs.length) return `'{}'::json`;
  // json_build_object takes at most 100 arguments.
  if (pairs.length > 50) throw bad();
  return `json_build_object(${pairs.join(', ')})`;
}

// ------------------------------------------------------------------ filters

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const CMP: Record<string, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
const IS: Record<string, string> = { null: 'null', true: 'true', false: 'false' };

function value(v: string): string {
  if (v.length > MAX_VALUE_LENGTH) throw bad();
  return v;
}

/** PostgREST takes * as the ilike wildcard as well as %. */
const pattern = (v: string) => value(v).replace(/\*/g, '%');

/** The items of a PostgREST list: a,b,"c,d" (quotes may hold commas, \" and \\). */
function listItems(inner: string): string[] {
  const items: string[] = [];
  let cur = '';
  let quoted = false;
  let wasQuoted = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (quoted) {
      if (ch === '\\' && i + 1 < inner.length) cur += inner[++i];
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') {
      if (cur.length) throw bad();
      quoted = true;
      wasQuoted = true;
    } else if (ch === ',') {
      items.push(cur);
      cur = '';
      wasQuoted = false;
    } else if (ch === '(' || ch === ')') throw bad();
    else {
      if (wasQuoted) throw bad();
      cur += ch;
    }
  }
  if (quoted) throw bad();
  items.push(cur);
  return items;
}

/** One condition on t.<col> for op.operand. */
function condition(col: string, op: string, operand: string, params: unknown[], inOr: boolean): string {
  const target = `t.${q(col)}`;
  if (Object.prototype.hasOwnProperty.call(CMP, op)) {
    params.push(value(operand));
    return `${target} ${CMP[op]} $${params.length}`;
  }
  if (op === 'is') {
    const v = IS[operand];
    if (!v) throw bad();
    return `${target} is ${v}`;
  }
  if (op === 'ilike') {
    params.push(pattern(operand));
    return `${target}::text ilike $${params.length}`;
  }
  if (!inOr && op === 'not.is') {
    const v = IS[operand];
    if (!v) throw bad();
    return `${target} is not ${v}`;
  }
  if (!inOr && op === 'in') {
    if (!operand.startsWith('(') || !operand.endsWith(')')) throw bad();
    const items = listItems(operand.slice(1, -1)).map(value);
    if (!items.length || items.length > MAX_IN_ITEMS) throw bad();
    params.push(items);
    return `${target}::text = any($${params.length}::text[])`;
  }
  throw bad();
}

/** col=<op>.<operand>: the operator is everything up to the first dot (two parts for not.is). */
function splitOp(v: string): [string, string] {
  if (v.startsWith('not.')) {
    const rest = v.slice(4);
    const dot = rest.indexOf('.');
    if (dot < 1) throw bad();
    return [`not.${rest.slice(0, dot)}`, rest.slice(dot + 1)];
  }
  const dot = v.indexOf('.');
  if (dot < 1) throw bad();
  return [v.slice(0, dot), v.slice(dot + 1)];
}

/** Items of or=(...): split at commas outside double quotes; quotes are kept for unquote. */
function listItemsForOr(inner: string): string[] {
  const items: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (quoted) {
      cur += ch;
      if (ch === '\\' && i + 1 < inner.length) cur += inner[++i];
      else if (ch === '"') quoted = false;
    } else if (ch === '"') {
      quoted = true;
      cur += ch;
    } else if (ch === ',') {
      items.push(cur);
      cur = '';
    } else if (ch === '(' || ch === ')') throw bad();
    else cur += ch;
  }
  if (quoted) throw bad();
  items.push(cur);
  return items;
}

/** A value in or=() may be "quoted" (to hold commas or dots). */
function unquote(v: string): string {
  if (!v.startsWith('"')) {
    if (v.includes('"')) throw bad();
    return v;
  }
  if (!v.endsWith('"') || v.length < 2) throw bad();
  const items = listItems(v);
  if (items.length !== 1) throw bad();
  return items[0];
}

function orCondition(raw: string, ctx: Ctx, params: unknown[]): string {
  if (!raw.startsWith('(') || !raw.endsWith(')')) throw bad();
  const items = listItemsForOr(raw.slice(1, -1));
  if (!items.length || items.length > MAX_OR_ITEMS) throw bad();
  const parts = items.map((item) => {
    const segs = item.split('.');
    if (segs.length < 3) throw bad();
    const [col, op, ...rest] = segs;
    if (!IDENT.test(col) || !ctx.read.includes(col)) throw bad();
    return condition(col, op, unquote(rest.join('.')), params, true);
  });
  return `(${parts.join(' or ')})`;
}

function whereClause(query: URLSearchParams, ctx: Ctx, params: unknown[]): string[] {
  const conds: string[] = [];
  for (const [key, raw] of query) {
    if (RESERVED.has(key)) continue;
    if (conds.length >= MAX_FILTERS) throw bad();
    if (key === 'or') {
      conds.push(orCondition(raw, ctx, params));
      continue;
    }
    if (!IDENT.test(key) || !ctx.read.includes(key)) throw bad();
    const [op, operand] = splitOp(raw);
    conds.push(condition(key, op, operand, params, false));
  }
  return conds;
}

function orderClause(raw: string | null, ctx: Ctx): string {
  if (raw === null) return '';
  const terms = raw.split(',').map((term) => {
    const [col, ...mods] = term.split('.');
    if (!IDENT.test(col) || !ctx.read.includes(col) || mods.length > 2) throw bad();
    let dir = '';
    let nulls = '';
    for (const m of mods) {
      if ((m === 'asc' || m === 'desc') && !dir) dir = ` ${m}`;
      else if ((m === 'nullsfirst' || m === 'nullslast') && !nulls) nulls = m === 'nullsfirst' ? ' nulls first' : ' nulls last';
      else throw bad();
    }
    return `t.${q(col)}${dir}${nulls}`;
  });
  if (!terms.length || terms.length > 5) throw bad();
  return ` order by ${terms.join(', ')}`;
}

function intParam(raw: string | null, max: number): number | null {
  if (raw === null) return null;
  if (!/^\d{1,7}$/.test(raw)) throw bad();
  const n = Number(raw);
  if (n > max) throw bad();
  return n;
}

// ------------------------------------------------------------------ Prefer

interface Prefer {
  representation: boolean;
  resolution: 'merge' | 'ignore' | null;
  count: boolean;
}

function parsePrefer(prefer: string): Prefer {
  const p: Prefer = { representation: false, resolution: null, count: false };
  for (const raw of prefer.split(',')) {
    const v = raw.trim();
    if (v === 'return=representation') p.representation = true;
    else if (v === 'resolution=merge-duplicates') p.resolution = 'merge';
    else if (v === 'resolution=ignore-duplicates') p.resolution = 'ignore';
    else if (v === 'count=exact' || v === 'count=planned' || v === 'count=estimated') p.count = true;
    // return=minimal, missing=default and the rest change nothing here.
  }
  return p;
}

// ------------------------------------------------------------------ bodies

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function bodyColumns(rows: Record<string, unknown>[], ctx: Ctx): string[] {
  const cols = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!IDENT.test(k) || !ctx.write.includes(k)) throw bad();
      cols.add(k);
    }
  }
  if (!cols.size) throw bad();
  return [...cols];
}

// ------------------------------------------------------------------ the plan

export function plan(req: DataRequest, visitor: Visitor): Plan {
  aliasCounter = 0;
  const { path } = req;
  if (path.length === 2 && path[0] === 'rpc') return planRpc(req, path[1], visitor);
  if (path.length !== 1) throw notFound();
  const table = path[0];
  const rule = tableRule(table);
  if (!rule) throw notFound();
  if (visitor === 'anon') throw new RequestError(401, 'PGRST302', 'Please sign in.');
  const access = accessOf(table, visitor);
  if (!access) throw denied();
  const ctx: Ctx = { table, rule, visitor, read: access.read, write: access.write };
  const allows = (op: Op) => access.ops.includes(op);
  const params: unknown[] = [];
  const prefer = parsePrefer(req.prefer);
  const base = { single: req.wantsObject, head: false, offset: 0 };

  if (req.method === 'GET' || req.method === 'HEAD') {
    if (!allows('select')) throw notAllowed();
    const sel = parseSelect(req.query.get('select'), table, visitor, true);
    const conds = whereClause(req.query, ctx, params);
    const where = conds.length ? ` where ${conds.join(' and ')}` : '';
    // The count reads the same rows with the parameters its WHERE uses (all of them so far).
    const count = prefer.count ? { sql: `select count(*)::bigint as n from ${tbl(table)} t${where}`, params: [...params] } : undefined;
    const object = selectObject(sel, 't');
    const order = orderClause(req.query.get('order'), ctx);
    const limit = Math.min(intParam(req.query.get('limit'), MAX_ROWS) ?? MAX_ROWS, MAX_ROWS);
    const offset = intParam(req.query.get('offset'), MAX_OFFSET);
    params.push(limit);
    let sql = `select ${object} as j from ${tbl(table)} t${where}${order} limit $${params.length}`;
    if (offset !== null) {
      params.push(offset);
      sql += ` offset $${params.length}`;
    }
    return { ...base, sql, params, readOnly: true, result: 'rows', status: 200, head: req.method === 'HEAD', count, offset: offset ?? 0 };
  }

  // Mutations: a select list (for the rows sent back) takes plain columns only.
  for (const key of ['order', 'limit', 'offset']) if (req.query.has(key)) throw bad();
  const wantsRows = prefer.representation || req.query.has('select');
  const returningSel = wantsRows ? parseSelect(req.query.get('select'), table, visitor, false) : null;
  const returning = () => (returningSel ? ` returning ${selectObject(returningSel, 't')} as j` : '');
  const result = wantsRows ? ('rows' as const) : ('none' as const);

  if (req.method === 'POST') {
    const upsert = prefer.resolution !== null || req.query.has('on_conflict');
    if (!allows(upsert ? 'upsert' : 'insert')) throw notAllowed();
    for (const [key] of req.query) if (!RESERVED.has(key)) throw bad();
    const rows = Array.isArray(req.body) ? req.body : [req.body];
    if (!rows.length || rows.length > MAX_INSERT_ROWS || !rows.every(isPlainObject)) throw bad();
    const cols = bodyColumns(rows as Record<string, unknown>[], ctx);
    // ?columns= (sent by postgrest-js for arrays) must name exactly the body's columns.
    const listed = req.query.get('columns');
    if (listed !== null) {
      const named = listed.split(',').map((c) => c.replace(/^"(.*)"$/, '$1'));
      if (named.some((c) => !cols.includes(c)) || cols.some((c) => !named.includes(c))) throw bad();
    }
    params.push(JSON.stringify(rows));
    const colList = cols.map(q).join(', ');
    let sql = `insert into ${tbl(table)} as t (${colList}) select ${colList} from json_populate_recordset(null::${tbl(table)}, $1::json)`;
    if (upsert) {
      const target = (req.query.get('on_conflict') ?? '').split(',').filter(Boolean);
      // Without on_conflict PostgREST uses the primary key; so does this.
      const known = target.length
        ? (rule.onConflict ?? []).find((k) => k.length === target.length && k.every((c) => target.includes(c)))
        : rule.primaryKey;
      if (!known) throw bad();
      sql += ` on conflict (${known.map(q).join(', ')})`;
      const updates = cols.filter((c) => !known.includes(c));
      sql += prefer.resolution === 'ignore' || !updates.length
        ? ' do nothing'
        : ` do update set ${updates.map((c) => `${q(c)} = excluded.${q(c)}`).join(', ')}`;
    }
    return { ...base, sql: sql + returning(), params, readOnly: false, result, status: 201 };
  }

  if (req.method === 'PATCH') {
    if (!allows('update')) throw notAllowed();
    if (!isPlainObject(req.body)) throw bad();
    const cols = bodyColumns([req.body], ctx);
    params.push(JSON.stringify(req.body));
    const conds = whereClause(req.query, ctx, params);
    if (!conds.length) throw bad('Say which rows to change.');
    const sets = cols.map((c) => `${q(c)} = r.${q(c)}`).join(', ');
    const sql = `update ${tbl(table)} as t set ${sets} from json_populate_record(null::${tbl(table)}, $1::json) as r where ${conds.join(' and ')}`;
    return { ...base, sql: sql + returning(), params, readOnly: false, result, status: wantsRows ? 200 : 204 };
  }

  if (req.method === 'DELETE') {
    if (!allows('delete')) throw notAllowed();
    const conds = whereClause(req.query, ctx, params);
    if (!conds.length) throw bad('Say which rows to remove.');
    const sql = `delete from ${tbl(table)} as t where ${conds.join(' and ')}`;
    return { ...base, sql: sql + returning(), params, readOnly: false, result, status: wantsRows ? 200 : 204 };
  }

  throw notAllowed();
}

function argValue(type: ArgType, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (type === 'integer') {
    if (typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= 2_147_483_647) return v;
    if (typeof v === 'string' && /^-?\d{1,10}$/.test(v)) return v;
    throw bad();
  }
  if (type === 'double precision') {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && /^-?\d{1,9}(\.\d{1,12})?$/.test(v)) return v;
    throw bad();
  }
  if (type === 'boolean') {
    if (typeof v === 'boolean') return v;
    throw bad();
  }
  const limit = type === 'photo' ? MAX_PHOTO_LENGTH : type === 'text' ? 6000 : MAX_VALUE_LENGTH;
  if (typeof v === 'string' && v.length <= limit) return v;
  if (typeof v === 'number' && Number.isFinite(v) && type === 'text') return String(v);
  throw bad();
}

function planRpc(req: DataRequest, name: string, visitor: Visitor): Plan {
  const rule = rpcRule(name);
  if (!rule) throw new RequestError(404, 'PGRST202', 'Not found.');
  if (!rule.callers.includes(visitor)) {
    if (visitor === 'anon') throw new RequestError(401, 'PGRST302', 'Please sign in.');
    throw denied();
  }
  if (req.method !== 'POST') throw notAllowed();
  if ([...req.query.keys()].length) throw bad();
  const body = req.body === undefined || req.body === null ? {} : req.body;
  if (!isPlainObject(body)) throw bad();
  const params: unknown[] = [];
  const named: string[] = [];
  for (const [arg, v] of Object.entries(body)) {
    const type = IDENT.test(arg) && Object.prototype.hasOwnProperty.call(rule.args, arg) ? rule.args[arg] : undefined;
    if (!type) throw bad();
    params.push(argValue(type, v));
    named.push(`${q(arg)} => $${params.length}::${type === 'photo' ? 'text' : type}`);
  }
  const call = `${tbl(name)}(${named.join(', ')})`;
  const base = { params, readOnly: false, single: req.wantsObject, head: false, offset: 0 };
  if (rule.returns === 'rows') {
    return { ...base, sql: `select to_json(f) as j from ${call} f limit ${MAX_ROWS}`, result: 'rows', status: 200 };
  }
  if (rule.returns === 'void') return { ...base, sql: `select ${call}`, result: 'none', status: 204 };
  return { ...base, sql: `select to_json(${call}) as j`, result: 'value', status: 200 };
}
