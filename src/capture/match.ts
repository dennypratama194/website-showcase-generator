/**
 * npm run match -- <project> <scene> <selector> <x0,x1> <targetGlyphTopCss>
 *
 * Finds the scroll position (as an offset from `selector`'s top) at which the first dark glyph row inside the
 * x0..x1 column band sits at `targetGlyphTopCss` — so a scene can start on exactly the frame another scene ended on
 * (a match cut). Runs on the virtual clock at 1x, in the scene's own clean session and storage.
 */
import { chromium } from 'playwright-core';
import { loadProject } from '../config/load';
import { NAME_SHIM, VIRTUAL_CLOCK_SCRIPT } from './virtualClock';
import { CHROME_ARGS, CHROME_PATH } from './browser';

(async () => {
  const [name, sceneId, selector, band, target] = process.argv.slice(2);
  const [x0, x1] = band.split(',').map(Number);
  const want = Number(target);
  const p = await loadProject(name);
  const sc = p.scenes[sceneId];
  const u = new URL(sc.path, p.url);
  for (const [k, v] of Object.entries({ ...(p.query ?? {}), ...(sc.query ?? {}) })) u.searchParams.set(k, v);
  const b = await chromium.launch({ executablePath: CHROME_PATH, args: CHROME_ARGS });
  const ctx = await b.newContext({ viewport: p.viewport, deviceScaleFactor: 1, timezoneId: 'Asia/Jakarta' });
  await ctx.addInitScript(NAME_SHIM);
  if (sc.storage) await ctx.addInitScript((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v === '$now' ? String(Date.now()) : v); }, sc.storage as Record<string, string>);
  await ctx.addInitScript(VIRTUAL_CLOCK_SCRIPT);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto(u.toString(), { waitUntil: 'networkidle' });
  await page.evaluate(() => (window as any).__vt.freeze());
  const step = (n: number) => page.evaluate((n) => { for (let i = 0; i < n; i++) (window as any).__vt.step(1000 / 60); }, n);
  await step(110);
  const top = await page.evaluate((s) => document.querySelector(s)!.getBoundingClientRect().top + scrollY, selector);

  const glyphTop = async (offset: number) => {
    await page.evaluate((y) => window.scrollTo(0, y), top + offset);
    await step(6);
    const y = await page.evaluate(() => scrollY);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y, width: p.viewport.width, height: p.viewport.height, scale: 1 } } as any);
    return page.evaluate(async ({ data, x0, x1 }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      for (let y = 90; y < c.height; y++) for (let x = x0; x < x1; x += 1) {
        const i = (y * c.width + x) * 4;
        if (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 110) return y;
      }
      return -1;
    }, { data, x0, x1 });
  };

  // glyph top moves opposite to scroll (plus any scroll-scrubbed rise), so search on offset
  // more negative offset = less scroll = glyphs lower on screen
  let lo = -1400, hi = -400;
  let best = { off: 0, gy: -1, err: 1e9 };
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const gy = await glyphTop(mid);
    const err = Math.abs(gy - want);
    if (gy >= 0 && err < best.err) best = { off: mid, gy, err };
    console.log(`offset ${mid.toFixed(1)} → glyph top ${gy}`);
    if (gy < 0 || gy > want) lo = mid; else hi = mid;
    if (err < 0.5) break;
  }
  console.log(`MATCH ${selector} offset ${best.off.toFixed(1)} (glyph top ${best.gy}, wanted ${want})`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
