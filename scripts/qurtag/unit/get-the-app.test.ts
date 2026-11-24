import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GetTheApp } from '../../../src/routes/marketing/GetTheApp';
import { APP_STORE_URL, ANDROID_WEB_APP_PATH, isAppStoreListing } from '../../../src/lib/appStore';

// The home page and Help tell a visitor how to get QuR Tag on a phone, in links a crawler reads
// without running JavaScript (src/routes/marketing/GetTheApp.tsx, src/lib/appStore.ts).

const read = (f: string) => readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8');
const LISTING = 'https://apps.apple.com/us/app/qur-tag/id1234567890';

test('with a live listing, the page has a plain "Download on the App Store" link to it', () => {
  const html = renderToStaticMarkup(createElement(GetTheApp, { appStoreUrl: LISTING }));
  assert.match(html, new RegExp(`<a href="${LISTING}"[^>]*>.*Download on the App Store</a>`));
});

test('without a listing there is no App Store link, so no visitor lands on a dead page', () => {
  for (const url of [null, '', 'https://apps.apple.com/us/app/qur-tag', 'https://example.com/id1234567890']) {
    const html = renderToStaticMarkup(createElement(GetTheApp, { appStoreUrl: url }));
    assert.ok(!html.includes('apps.apple.com') && !html.includes('example.com'), String(url));
    assert.ok(!html.includes('Download on the App Store'), String(url));
    assert.match(html, /coming soon to the App Store/);
  }
});

test('Android visitors get a plain link to the web app, with or without an App Store listing', () => {
  for (const url of [null, LISTING]) {
    const html = renderToStaticMarkup(createElement(GetTheApp, { appStoreUrl: url }));
    assert.match(html, new RegExp(`<a href="${ANDROID_WEB_APP_PATH}"[^>]*>On Android\\? Use the QuR Tag web app in your browser</a>`));
  }
});

test('the configured App Store address is either unset or an App Store listing', () => {
  assert.ok(APP_STORE_URL === null || isAppStoreListing(APP_STORE_URL), String(APP_STORE_URL));
  assert.ok(isAppStoreListing(LISTING));
  assert.ok(isAppStoreListing('https://apps.apple.com/app/qur-tag/id1234567890'));
  assert.ok(!isAppStoreListing('http://apps.apple.com/us/app/qur-tag/id1234567890'));
});

test('both the home page and Help show the phone links', () => {
  assert.match(read('src/routes/marketing/Home.tsx'), /<GetTheApp \/>/);
  assert.match(read('src/routes/marketing/Help.tsx'), /<GetTheApp \/>/);
});
