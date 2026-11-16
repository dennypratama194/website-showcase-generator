// How does Chrome scale CDP mouseWheel deltas under deviceScaleFactor emulation, fast vs slow dispatch?
import { chromium } from 'playwright-core';
import { CHROME_PATH } from '../src/capture/browser';

(async () => {
  for (const dpr of [1, 2]) {
    const b = await chromium.launch({ executablePath: CHROME_PATH });
    const ctx = await b.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: dpr });
    const p = await ctx.newPage();
    const c = await ctx.newCDPSession(p);
    await p.setContent('<body style="height:20000px"><script>window.s=0;window.n=0;addEventListener("wheel",e=>{s+=e.deltaY;n++;e.preventDefault()},{passive:false})</script></body>');
    for (const gap of [0, 300, -1]) {
      if (gap === -1) await c.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 800, height: 600, scale: dpr } } as any);
      await p.evaluate(() => { (window as any).s = 0; (window as any).n = 0; });
      for (let i = 0; i < 10; i++) {
        await c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 400, y: 300, deltaX: 0, deltaY: 10 });
        if (gap > 0) await new Promise((r) => setTimeout(r, gap));
      }
      await new Promise((r) => setTimeout(r, 500));
      console.log(`dpr ${dpr} ${gap === -1 ? 'after a clip.scale screenshot' : `gap ${gap}ms`}: sent 100, page saw`, await p.evaluate(() => [(window as any).s, (window as any).n]));
    }
    await b.close();
  }
})();
