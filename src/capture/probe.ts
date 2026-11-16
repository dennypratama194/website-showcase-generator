// WebGL capability + performance probe: real-time fps vs virtual-time frame cost.
import { chromium } from 'playwright-core';
import { NAME_SHIM, VIRTUAL_CLOCK_SCRIPT } from './virtualClock';
import { CHROME_ARGS, CHROME_PATH } from './browser';
import fs from 'node:fs';

const url = process.argv[2] ?? 'https://dennypratama.com/?tunnel=force';
const out = process.argv[3] ?? 'out/probe';
fs.mkdirSync(out, { recursive: true });

async function realtime() {
  const b = await chromium.launch({ executablePath: CHROME_PATH, args: CHROME_ARGS, headless: true });
  const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage();
  await p.addInitScript(NAME_SHIM);
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(6000);
  const r = await p.evaluate(async () => {
    const cv = document.querySelector('canvas.gl') as HTMLCanvasElement;
    const t0 = performance.now(); let n = 0;
    await new Promise<void>((res) => { const f = () => { n++; performance.now() - t0 < 3000 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); });
    return { gpu: cv?.dataset.gpu, why: cv?.dataset.why, q: cv?.dataset.q, canvas: cv && `${cv.width}x${cv.height}`,
      rafFps: +(n / 3).toFixed(1), glOn: document.querySelector('.site')?.className };
  });
  await p.screenshot({ path: `${out}/realtime.png` });
  await b.close();
  return r;
}

async function virtual(dpr: number) {
  const b = await chromium.launch({ executablePath: CHROME_PATH, args: CHROME_ARGS, headless: true });
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr });
  await ctx.addInitScript(NAME_SHIM);
  await ctx.addInitScript(VIRTUAL_CLOCK_SCRIPT);
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  const times: number[] = [];
  for (let i = 0; i < 420; i++) {
    const t = Date.now();
    await p.evaluate(() => (window as any).__vt.step(1000 / 60));
    if (i % 30 === 29 || i > 400) {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      if (i % 60 === 59) fs.writeFileSync(`${out}/v${dpr}-${i}.png`, Buffer.from(data, 'base64'));
      times.push(Date.now() - t);
    }
  }
  const info = await p.evaluate(() => { const cv = document.querySelector('canvas.gl') as HTMLCanvasElement; return { gpu: cv?.dataset.gpu, why: cv?.dataset.why, q: cv?.dataset.q, canvas: `${cv.width}x${cv.height}`, cls: document.querySelector('.site')?.className }; });
  await b.close();
  return { dpr, info, msPerCapturedFrame: Math.round(times.slice(-10).reduce((a, b) => a + b, 0) / 10) };
}

(async () => {
  console.log('REALTIME', JSON.stringify(await realtime()));
  console.log('VIRTUAL', JSON.stringify(await virtual(1)));
  console.log('VIRTUAL', JSON.stringify(await virtual(2)));
})();
