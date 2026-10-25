import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withPhoneAppCors } from '../../../server/auth/phoneCors.ts';
import { trustedOrigins } from '../../../server/auth/origins.ts';

const handler = withPhoneAppCors(async () => new Response('{"ok":true}', { status: 200 }));
const origin = 'capacitor://localhost';

test('the iPhone app origin gets credentials and a preflight answer', async () => {
  const pre = await handler(
    new Request('https://www.qurtag.com/api/auth/sign-in/email', {
      method: 'OPTIONS',
      headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type' },
    }),
  );
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), origin);
  assert.equal(pre.headers.get('access-control-allow-credentials'), 'true');
  assert.match(pre.headers.get('access-control-allow-headers') ?? '', /authorization/);
  const res = await handler(new Request('https://www.qurtag.com/api/fn/finder-view', { method: 'POST', headers: { origin } }));
  assert.equal(res.headers.get('access-control-allow-origin'), origin);
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
  assert.equal(res.headers.get('access-control-expose-headers'), 'set-auth-token');
});

test('any other origin gets no CORS headers', async () => {
  const res = await handler(new Request('https://www.qurtag.com/api/fn/x', { method: 'POST', headers: { origin: 'https://evil.example' } }));
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('the sign-in service and the data API trust the iPhone app origin', () => {
  assert.ok(trustedOrigins({ QURTAG_AUTH_URL: 'https://www.qurtag.com' } as NodeJS.ProcessEnv).includes(origin));
});
