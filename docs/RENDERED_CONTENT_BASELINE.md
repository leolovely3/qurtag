# Home page rendered length: the cause of the 25 Oct drop and the baseline to use

Incident 2026-10-25-live-products-worse-4fa69f reported that the QuR Tag home page fell from
4757 to 2346 characters of rendered text. This note records what caused it, measured on
8 Nov 2026, so the next reading starts from the right number.

## How it was measured

Each version was built with `vite build`, served with `vite preview`, opened in headless Chrome
at 1440 by 900 and 390 by 900, and read with `document.body.innerText.length` after the page
loaded. The live site was read the same way.

| Version | Desktop (1440) | Phone (390) |
|---|---|---|
| `befa1c9`, the site before 25 Oct (the old baseline) | 4757 | 4246 |
| `9ba7ce4`, PR #2, 25 Oct 08:47 | 2340 | 2300 |
| www.qurtag.com, 8 Nov 2026 (main at `34097e4`) | 3335 | 3266 |

## The cause

Nothing failed to render. PR #2 (`9ba7ce4`, "QuR Tag on its own backend, ... honest site")
rewrote `src/routes/marketing/Home.tsx` on purpose, from 20029 to 6466 bytes. It removed the
sections that described things the product does not do or could not back up:

- the "Built for owners of" brand strip and the desktop and phone mockups of an inbox with
  invented items and Trips;
- "The membership", "Three ways in" and "Membership" sections selling leather and premium tags;
- "Stories of return", testimonials from people who do not exist.

The commit message says so: "Site repositioned for cheap and many things a kind stranger finds;
every unbackable claim removed". Putting that text back would restore false claims, so the old
number is not a target.

Later work on 25 Oct (#18, #23, #29, #30, #33) added real sections back: how it works with real
pictures, who it is for, the finder section and the tracker backup section. Every section of
today's home page renders on the live read above, and the same text is in the HTML that #33
writes at build time.

## The baseline to use from now on

**3335 characters at 1440 wide and 3266 at 390 wide**, read from www.qurtag.com on 8 Nov 2026.
A fall of more than 10% below these numbers is worth an incident. 90% of the old 4757 baseline
cannot be reached without the removed claims and should not be asked for.
