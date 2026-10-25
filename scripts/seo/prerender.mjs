/*
 * Writes the public pages into the build as finished HTML, so a search engine (or anyone with
 * JavaScript off) gets each page's own title, description, canonical address, link-preview tags,
 * one heading and its real text, not an empty shell that only JavaScript fills in.
 *
 * Runs after `vite build` (the app) and `vite build --ssr` (src/seo/entry-server.tsx), from
 * `npm run build`. For every page in src/seo/pages.ts it renders the page with the same React
 * routes the browser uses and writes it into the built index.html. The browser then hydrates it.
 *
 * Files written into dist/:
 *   index.html          the home page. (The iPhone app's copy is the shell; see native-shell.mjs.)
 *   <page>.html         every other public page, served at /<page> (vercel.json "cleanUrls")
 *   app-shell.html      the empty shell with "noindex", served for the signed-in app, sign-in, the
 *                       finder's page and invite links, none of which belong in search
 *   404.html            the "page not found" page, which Vercel serves with status 404
 *   sitemap.xml         the public pages, from the same list
 *
 * It fails the build if a page would reach search badly: a missing or repeated title, a description
 * outside 70 to 160 characters, not exactly one H1, or under 250 characters of text of its own.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, process.env.SEO_DIST ?? 'dist');
const server = await import(pathToFileURL(path.join(root, '.seo-build', 'entry-server.js')).href);
const { PUBLIC_PAGES, pageUrl, render, homeStructuredData, faqStructuredData, SITE_NAME, SHARE_IMAGE, SHARE_IMAGE_ALT } = server;

const template = await readFile(path.join(dist, 'index.html'), 'utf8');
for (const need of ['<!--seo-head-->', '<title>QuR Tag</title>', '<div id="root"></div>']) {
  if (!template.includes(need)) throw new Error(`index.html lost ${need}`);
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

// The two body fonts every page starts with, fetched early (their file names carry a hash).
const files = await readdir(path.join(dist, 'assets'));
const fonts = ['400'].map((w) => files.find((f) => f.startsWith(`inter-latin-${w}-normal`) && f.endsWith('.woff2')));
if (fonts.some((f) => !f)) throw new Error('The Inter font files are missing from dist/assets');
const fontPreload = fonts.map((f) => `<link rel="preload" href="/assets/${f}" as="font" type="font/woff2" crossorigin />`).join('\n    ');

function previewTags(title, description, url) {
  return [
    `<meta name="description" content="${esc(description)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:image" content="${SHARE_IMAGE}" />`,
    `<meta property="og:image:secure_url" content="${SHARE_IMAGE}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(SHARE_IMAGE_ALT)}" />`,
    `<meta property="og:type" content="website" />`,
    ...(url ? [`<meta property="og:url" content="${url}" />`] : []),
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${SHARE_IMAGE}" />`,
    `<meta name="twitter:image:alt" content="${esc(SHARE_IMAGE_ALT)}" />`,
  ];
}

function compose({ title, head, html }) {
  return template
    .replace('<title>QuR Tag</title>', `<title>${esc(title)}</title>`)
    .replace('<!--seo-head-->', [...head, fontPreload].join('\n    '))
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`);
}

const homePage = PUBLIC_PAGES.find((p) => p.path === '/');
const out = {};
const problems = [];
const titles = new Map();

for (const p of PUBLIC_PAGES) {
  const { html, status } = await render(p.path);
  if (status !== 200) throw new Error(`${p.path} rendered with status ${status}`);
  const url = pageUrl(p.path);
  const head = [
    ...previewTags(p.title, p.description, url).slice(0, 1),
    `<link rel="canonical" href="${url}" />`,
    ...previewTags(p.title, p.description, url).slice(1),
  ];
  if (p.path === '/') head.push(ld(homeStructuredData()));
  if (p.path === '/help') head.push(ld(faqStructuredData()));
  out[p.path === '/' ? 'index.html' : `${p.path.slice(1)}.html`] = compose({ title: p.title, head, html });

  // The checks a search engine's reader would make.
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  const h1s = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1s !== 1) problems.push(`${p.path} has ${h1s} H1 elements`);
  if (text.length < 250) problems.push(`${p.path} has only ${text.length} characters of text`);
  if (p.description.length < 70 || p.description.length > 160) problems.push(`${p.path} description is ${p.description.length} characters`);
  if (titles.has(p.title)) problems.push(`${p.path} and ${titles.get(p.title)} share the title "${p.title}"`);
  titles.set(p.title, p.path);
  if (p.path !== '/' && p.title === homePage.title) problems.push(`${p.path} carries the home title`);
}

// The empty shell, for everything that is not a public page.
const shellTitle = 'QuR Tag';
out['app-shell.html'] = compose({
  title: shellTitle,
  head: [`<meta name="robots" content="noindex" />`, ...previewTags(homePage.title, homePage.description, null)],
  html: '',
});

// The page for an address the site does not have.
const nf = await render('/this-page-does-not-exist');
if (nf.status !== 404) throw new Error(`The not-found page rendered with status ${nf.status}`);
out['404.html'] = compose({
  title: 'Page not found | QuR Tag',
  head: [`<meta name="robots" content="noindex" />`, ...previewTags(homePage.title, homePage.description, null)],
  html: nf.html,
});

if (problems.length) {
  console.error(`Search check failed:\n - ${problems.join('\n - ')}`);
  process.exit(1);
}

for (const [name, html] of Object.entries(out)) await writeFile(path.join(dist, name), html);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PUBLIC_PAGES.map(
  (p) => `  <url>
    <loc>${pageUrl(p.path)}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority.toFixed(1)}</priority>
  </url>`,
).join('\n')}
</urlset>
`;
await writeFile(path.join(dist, 'sitemap.xml'), sitemap);
console.log(`Prerendered ${PUBLIC_PAGES.length} public pages, the app shell and the 404 page.`);
