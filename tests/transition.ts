// A CSS transition started by real-time work (here a real setTimeout, standing in for a React commit that lands
// during a slow screenshot) must not run in real time: with the global animation rate at 0 it waits for the clock.
import { chromium } from 'playwright-core';
import { CHROME_PATH } from '../src/capture/browser';
import { NAME_SHIM, VIRTUAL_CLOCK_SCRIPT } from '../src/capture/virtualClock';

(async () => {
  for (const freeze of [false, true]) {
    const b = await chromium.launch({ executablePath: CHROME_PATH });
    const ctx = await b.newContext();
    await ctx.addInitScript(NAME_SHIM);
    await ctx.addInitScript(VIRTUAL_CLOCK_SCRIPT);
    const p = await ctx.newPage();
    const c = await ctx.newCDPSession(p);
    if (freeze) { await c.send('Animation.enable'); await c.send('Animation.setPlaybackRate', { playbackRate: 0 }); }
    await p.setContent('<style>#b{opacity:0;transition:opacity .45s linear}#b.on{opacity:1}</style><div id="b">x</div>');
    // a real-time task flips the class, as React's scheduler does outside the virtual clock
    await p.evaluate(() => { (window as any).__realTimeout = (window as any).__realTimeout; MessageChannel; const ch = new MessageChannel(); ch.port1.onmessage = () => document.getElementById('b')!.classList.add('on'); ch.port2.postMessage(0); });
    await new Promise((r) => setTimeout(r, 1500)); // a slow screenshot's worth of real time
    const before = await p.evaluate(() => getComputedStyle(document.getElementById('b')!).opacity);
    await p.evaluate(() => (window as any).__vt.step(1000 / 60));
    const after1 = await p.evaluate(() => getComputedStyle(document.getElementById('b')!).opacity);
    for (let i = 0; i < 13; i++) await p.evaluate(() => (window as any).__vt.step(1000 / 60));
    const after14 = await p.evaluate(() => getComputedStyle(document.getElementById('b')!).opacity);
    console.log(`freeze=${freeze}: after 1.5 s real time ${before}, after 1 frame ${after1}, after 14 frames ${after14} (want ≈0, ≈0, ≈0.5)`);
    await b.close();
  }
})();
