/**
 * Pretend people for the local tests that follow e2e.test.mjs: someone who signs up, holds
 * a session cookie and a data pass, and calls the data API (through postgrest-js, as the
 * app does) and the server routes. Each has its own network address (x-forwarded-for), so
 * the per-address limits do not mix people up.
 */
import { PostgrestClient } from '@supabase/postgrest-js';

export const BASE = process.env.QURTAG_TEST_BASE;

export class Person {
  constructor(label, ip, base = BASE) {
    this.label = label;
    this.ip = ip;
    this.base = base;
    this.cookie = '';
    this.pass = null;
    this.email = null;
  }

  async req(path, { method = 'GET', body, headers = {} } = {}) {
    const r = await fetch(path.startsWith('http') ? path : `${this.base}${path}`, {
      method,
      redirect: 'manual',
      headers: {
        origin: this.base,
        'x-forwarded-for': this.ip,
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(this.pass && !headers.authorization ? { authorization: `Bearer ${this.pass}` } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of r.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      const [name, value] = pair.split('=');
      if (name.startsWith('qurtag.')) {
        const others = this.cookie.split('; ').filter((x) => x && !x.startsWith(`${name}=`));
        this.cookie = [...others, ...(value ? [`${name}=${value}`] : [])].join('; ');
      }
    }
    const text = await r.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* not json */
    }
    return { status: r.status, json, text, headers: r.headers };
  }

  /** Signs up (email is off, so the account is confirmed at once) and gets a data pass. */
  async signUp(email, name) {
    this.email = email;
    const r = await this.req('/api/auth/sign-up/email', {
      method: 'POST',
      body: { email, password: 'correct horse battery', name, callbackURL: '/app' },
      headers: { authorization: '' },
    });
    if (r.status !== 200) throw new Error(`${this.label}: sign-up answered ${r.status}`);
    await this.getPass();
    return this;
  }

  async getPass() {
    this.pass = null;
    const r = await this.req('/api/auth/token');
    this.pass = r.json?.token ?? null;
    return r;
  }

  get db() {
    const self = this;
    return new PostgrestClient(`${this.base}/api/data`, {
      schema: 'qurtag',
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set('origin', self.base);
        h.set('x-forwarded-for', self.ip);
        if (self.pass) h.set('authorization', `Bearer ${self.pass}`);
        return fetch(input, { ...init, headers: h });
      },
    });
  }

  post(path, body) {
    return this.req(path, { method: 'POST', body });
  }
  view(tag, token, scan = false) {
    return this.req('/api/fn/finder-view', { method: 'POST', body: { tag, ...(token ? { token } : {}), scan }, headers: { authorization: '' } });
  }
  send(tag, token, body) {
    return this.req('/api/fn/finder-send', { method: 'POST', body: { tag, ...(token ? { token } : {}), body }, headers: { authorization: '' } });
  }
}
