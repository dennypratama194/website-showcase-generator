// npx tsx tests/measure.ts <url> [selector ...]
// Prints document top and height of each selector on the live page at 1920x1080, with any query flags in the URL
// (e.g. a site's own debug flag) so the layout matches the captures. Seeds no storage unless --seen <key> is given.
import { chromium } from 'playwright-core';
import { CHROME_ARGS, CHROME_PATH } from '../src/capture/browser';
import { NAME_SHIM } from '../src/capture/virtualClock';

(async () => {
  const args = process.argv.slice(2);
  const si = args.indexOf('--seen');
  const seenKey = si >= 0 ? args.splice(si, 2)[1] : null;
  const [url, ...sels] = args;
  if (!url) throw new Error('usage: measure <url> [selector ...] [--seen <localStorageKey>]');
  const b = await chromium.launch({ executablePath: CHROME_PATH, args: CHROME_ARGS });
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.addInitScript(NAME_SHIM);
  if (seenKey) await ctx.addInitScript((k) => localStorage.setItem(k, String(Date.now())), seenKey);
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  const out = await p.evaluate((sels) => sels.map((s) => {
    const e = document.querySelector(s);
    if (!e) return [s, null];
    const r = e.getBoundingClientRect();
    return [s, Math.round(r.top + scrollY), Math.round(r.height)];
  }), sels);
  console.log(JSON.stringify(out), 'docH', await p.evaluate(() => document.documentElement.scrollHeight), await p.evaluate(() => document.querySelector('.site')?.className));
  await b.close();
})();
