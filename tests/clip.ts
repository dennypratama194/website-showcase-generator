// Verifies whether CDP Page.captureScreenshot `clip` is document- or viewport-relative after scrolling.
// The engine depends on this: a wrong origin silently records the wrong part of the page.
import { chromium } from 'playwright-core';
import { CHROME_PATH } from '../src/capture/browser';

(async () => {
  const b = await chromium.launch({ executablePath: CHROME_PATH });
  const ctx = await b.newContext({ viewport: { width: 400, height: 300 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const c = await ctx.newCDPSession(p);
  await p.setContent('<body style="margin:0"><div style="height:300px;background:#f00"></div><div style="height:300px;background:#0f0"></div><div style="height:600px;background:#00f"></div></body>');
  await p.evaluate(() => scrollTo(0, 300));
  const { data } = await c.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: Number(process.env.CY ?? 0), width: 400, height: 300, scale: 2 }, captureBeyondViewport: false } as any);
  const buf = Buffer.from(data, 'base64');
  // decode the first pixel row via a 1x1 crop screenshot of the same clip, read colour from the page instead
  const shot = await p.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d')!;
    g.drawImage(img, 0, 0);
    return { w: img.width, h: img.height, px: Array.from(g.getImageData(10, 10, 1, 1).data) };
  }, data);
  console.log(JSON.stringify(shot), buf.length);
  console.log(shot.px[0] > 200 && shot.px[1] < 50 ? 'red = document top' : shot.px[1] > 200 && shot.px[0] < 50 ? 'green = viewport top' : 'unexpected');
  await b.close();
})();
