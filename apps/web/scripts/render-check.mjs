/**
 * H6 / DS-4 render check — drive the real app in Chromium, in BOTH themes.
 *
 * Why this exists as a committed script (W46 A13, Chris 2026-08-16): every
 * previous "light + dark 真 render" in this project was done with whatever
 * browser tool the AI session happened to have. That made an acceptance
 * criterion depend on session luck — CH-016 could verify, W43 could not, and
 * the honest fallback was to write "未 render 驗" and move on. A dev dependency
 * plus this script makes the check reproducible instead.
 *
 * It does NOT judge the design. It collects the four kinds of evidence prior
 * sessions collected by hand — screenshots, innerText, the computed tokens that
 * prove the `.dark` swap really happened, and a horizontal-overflow measure —
 * so a human (or a later session) reads real values rather than a claim.
 *
 * Theme is switched by CLICKING the top-bar toggle, not by adding the class:
 * the store (store/ui.ts) is in-memory and App mirrors it onto <html>, so
 * forcing the class would test a state the app can never actually be in.
 *
 * Screenshots go wherever --out points. Keep them OUT of the repo (.gitignore
 * §Playwright), and delete any that carry a real UPN (H4).
 *
 * 🔴 **A screenshot of a `position: fixed` overlay is not evidence** (W47,
 * 2026-08-17). Capturing an open Dialog here produces an image where the panel
 * looks translucent and the 45% scrim is missing entirely — in BOTH `fullPage`
 * and viewport modes. It is the capture, not the page: probing the live DOM at
 * the same moment returns `opacity: 1` on the panel, a solid `rgb(255,255,255)`
 * background, `rgba(0, 0, 0, 0.45)` on the scrim, and zero running animations.
 *
 * Nearly an hour went into "fixing" a defect that did not exist. So for
 * overlays, trust `page.evaluate` on computed styles — which is what `probe()`
 * below already does for tokens — and treat the PNG as a layout sketch only.
 *
 * Usage:
 *   node apps/web/scripts/render-check.mjs --out <dir> --url /requests --url /drift
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

function parseArgs(argv) {
  const out = { urls: [], base: 'http://localhost:5173', width: 1440, height: 900 };
  for (let i = 0; i < argv.length; i += 2) {
    const [k, v] = [argv[i], argv[i + 1]];
    if (k === '--url') out.urls.push(v);
    else if (k === '--out') out.out = v;
    else if (k === '--base') out.base = v;
    else if (k === '--width') out.width = Number(v);
    else if (k === '--height') out.height = Number(v);
  }
  if (!out.out) throw new Error('--out <dir> is required');
  if (out.urls.length === 0) throw new Error('at least one --url is required');
  return out;
}

/** The values that prove a token swap happened, read off the live document. */
function probe() {
  const cs = getComputedStyle(document.documentElement);
  const de = document.documentElement;
  return {
    dark: de.classList.contains('dark'),
    tokens: {
      bg: cs.getPropertyValue('--bg').trim(),
      fg: cs.getPropertyValue('--fg').trim(),
      card: cs.getPropertyValue('--card').trim(),
      accent: cs.getPropertyValue('--accent').trim(),
      purple: cs.getPropertyValue('--purple').trim(),
    },
    bodyBg: getComputedStyle(document.body).backgroundColor,
    // A page must never scroll sideways (design-system.md layout rule).
    overflowsX: de.scrollWidth > de.clientWidth,
    scrollWidth: de.scrollWidth,
    clientWidth: de.clientWidth,
    innerText: document.body.innerText,
  };
}

const opts = parseArgs(process.argv.slice(2));
await mkdir(opts.out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: opts.width, height: opts.height },
});

const report = [];
for (const url of opts.urls) {
  const slug = url.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root';
  const entry = { url, themes: {} };

  await page.goto(opts.base + url, { waitUntil: 'networkidle' });

  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') {
      await page.click('[title="Toggle theme"]');
      // The class lands via an effect, so wait on the DOM, not on a timer.
      await page.waitForFunction(() =>
        document.documentElement.classList.contains('dark'),
      );
    }
    const shot = join(opts.out, `${slug}-${theme}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    const data = await page.evaluate(probe);
    await writeFile(join(opts.out, `${slug}-${theme}.txt`), data.innerText, 'utf8');
    delete data.innerText; // it goes to the .txt; keep the JSON report readable
    entry.themes[theme] = { ...data, screenshot: shot };
  }

  // Leave the next page in light, since the store does not persist.
  await page.click('[title="Toggle theme"]');
  report.push(entry);
}

await browser.close();
await writeFile(
  join(opts.out, 'report.json'),
  JSON.stringify(report, null, 2),
  'utf8',
);
console.log(JSON.stringify(report, null, 2));
