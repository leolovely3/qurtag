import test from 'node:test';
import assert from 'node:assert/strict';
import { CHANNEL_KEY, captureChannel, channelFromSearch, cleanChannel, signupChannel } from '../../../src/lib/measures';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

test('a channel is cleaned to the shape the database accepts', () => {
  assert.equal(cleanChannel('Facebook'), 'facebook');
  assert.equal(cleanChannel('  Mom Group!! '), 'mom-group');
  assert.equal(cleanChannel('x'.repeat(80))?.length, 32);
  assert.equal(cleanChannel('<script>'), 'script');
  assert.equal(cleanChannel(''), null);
  assert.equal(cleanChannel('---'), null);
  assert.equal(cleanChannel(null), null);
});

test('ch wins over utm_source', () => {
  assert.equal(channelFromSearch('?ch=fb&utm_source=google'), 'fb');
  assert.equal(channelFromSearch('?utm_source=Newsletter'), 'newsletter');
  assert.equal(channelFromSearch('?foo=1'), null);
});

test('the first tagged visit in a tab is kept, a later one does not replace it', () => {
  const s = memory();
  captureChannel('?foo=1', s);
  assert.equal(s.getItem(CHANNEL_KEY), null);
  captureChannel('?ch=instagram', s);
  captureChannel('?ch=tiktok', s);
  assert.equal(s.getItem(CHANNEL_KEY), 'instagram');
  assert.equal(signupChannel(s), 'instagram');
});

test('with nothing remembered there is no channel on the web', () => {
  assert.equal(signupChannel(memory()), null);
});

const { scrubEvent, scrubPath, scrubText } = await import('../../../src/lib/errors');
const { telemetryAllowed } = await import('../../../src/lib/telemetryGate');

test('an error event is stripped of anything personal', () => {
  const e = scrubEvent({
    user: { email: 'a@b.c' },
    breadcrumbs: [{ message: 'tapped Send' }],
    extra: { note: 'hello' },
    request: {
      url: 'https://www.qurtag.com/find/AbCdEfGhJkMn?x=1',
      data: 'the finder note',
      cookies: { s: 'x' },
      headers: { a: 'b' },
      query_string: 'token=abc',
    },
    exception: { values: [{ value: 'bad token abcdefghijklmnopqrstuvwxyz0123456789 here' }] },
  });
  assert.equal(e.user, undefined);
  assert.equal(e.breadcrumbs, undefined);
  assert.equal(e.extra, undefined);
  assert.equal(e.request?.data, undefined);
  assert.equal(e.request?.cookies, undefined);
  assert.equal(e.request?.headers, undefined);
  assert.equal(e.request?.query_string, undefined);
  assert.equal(e.request?.url, 'https://www.qurtag.com/find/:tag');
  assert.equal(e.exception?.values?.[0].value, 'bad token :token here');
});

test('codes in addresses are cut out', () => {
  assert.equal(scrubPath('/find/AbCdEfGhJkMn'), '/find/:tag');
  assert.equal(scrubPath('/join/secretinvitetoken?x=1'), '/join/:token');
  assert.equal(scrubPath('/reset-password?token=abc'), '/reset-password');
  assert.equal(scrubPath('/k7m2p'), '/:short');
  assert.equal(scrubPath('/app/items'), '/app/items');
  assert.equal(scrubText('hello'), 'hello');
});

test('reports stay off in an automated browser and on localhost, and run on the live site and in the app', () => {
  assert.equal(telemetryAllowed({ webdriver: true, hostname: 'www.qurtag.com' }), false);
  assert.equal(telemetryAllowed({ webdriver: false, hostname: 'localhost' }), false);
  assert.equal(telemetryAllowed({ webdriver: false, hostname: 'www.qurtag.com' }), true);
  assert.equal(telemetryAllowed({ webdriver: false, hostname: 'qurtag-ios-app' }), true);
});
