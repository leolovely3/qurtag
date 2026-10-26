/** The iPhone app's first-open welcome screen: when /start shows it, and when it goes straight to a form. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACCOUNT_ON_DEVICE_KEY,
  hasAccountOnDevice,
  initialStartView,
  rememberAccountOnDevice,
  type FlagStorage,
} from '../../../src/lib/firstOpen.ts';

const memory = (): FlagStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

const phone = { native: true, mode: null, next: null };
const web = { native: false, mode: null, next: null };

test('a fresh phone, signed out, sees the welcome screen', () => {
  const store = memory();
  assert.equal(hasAccountOnDevice(store), false);
  assert.equal(initialStartView({ ...phone, accountOnDevice: hasAccountOnDevice(store) }), 'welcome');
});

test('after a sign-in or a new account on the phone, a signed-out open goes to signing in', () => {
  const store = memory();
  rememberAccountOnDevice(store);
  assert.equal(store.data.get(ACCOUNT_ON_DEVICE_KEY), '1');
  assert.equal(initialStartView({ ...phone, accountOnDevice: hasAccountOnDevice(store) }), 'signin');
});

test('signing out does not bring the welcome screen back (nothing clears the flag)', () => {
  const store = memory();
  rememberAccountOnDevice(store);
  rememberAccountOnDevice(store);
  assert.equal(hasAccountOnDevice(store), true);
});

test('a cold start of the app (/start?next=/app from the signed-out redirect) still shows the welcome screen', () => {
  assert.equal(initialStartView({ ...phone, next: '/app', accountOnDevice: false }), 'welcome');
  assert.equal(initialStartView({ ...phone, next: '/app/', accountOnDevice: false }), 'welcome');
  assert.equal(initialStartView({ ...phone, next: '/app', accountOnDevice: true }), 'signin');
  assert.equal(initialStartView({ ...web, next: '/app', accountOnDevice: false }), 'create');
});

test('a link with next (an invite, a paid plan) skips the welcome screen on a fresh phone', () => {
  assert.equal(initialStartView({ ...phone, next: '/app/membership?plan=plus', accountOnDevice: false }), 'signin');
  assert.equal(initialStartView({ ...phone, next: '/app/inbox', accountOnDevice: false }), 'signin');
  assert.equal(initialStartView({ ...phone, next: '/join/abc', accountOnDevice: false }), 'signin');
  assert.equal(initialStartView({ ...phone, next: '/join/abc', mode: 'create', accountOnDevice: false }), 'create');
});

test('?mode= is respected on the phone, fresh or not', () => {
  for (const accountOnDevice of [false, true]) {
    assert.equal(initialStartView({ ...phone, mode: 'create', accountOnDevice }), 'create');
    assert.equal(initialStartView({ ...phone, mode: 'signin', accountOnDevice }), 'signin');
  }
});

test('the website is unchanged: make an account by default, mode respected, never the welcome screen', () => {
  for (const accountOnDevice of [false, true]) {
    assert.equal(initialStartView({ ...web, accountOnDevice }), 'create');
    assert.equal(initialStartView({ ...web, next: '/join/abc', accountOnDevice }), 'create');
    assert.equal(initialStartView({ ...web, mode: 'signin', accountOnDevice }), 'signin');
    assert.equal(initialStartView({ ...web, mode: 'create', accountOnDevice }), 'create');
    assert.equal(initialStartView({ ...web, mode: 'other', accountOnDevice }), 'create');
  }
});

test('blocked or broken storage never throws and means a fresh phone', () => {
  const broken: FlagStorage = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('full');
    },
  };
  assert.equal(hasAccountOnDevice(broken), false);
  assert.doesNotThrow(() => rememberAccountOnDevice(broken));
  assert.equal(hasAccountOnDevice(null), false);
});
