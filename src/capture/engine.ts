/**
 * Captures one scene in its own clean browser session, frame by frame on a virtual clock,
 * and streams the frames straight into an intermediate video (no 4K PNG pile on disk).
 */
import { chromium, type Page, type CDPSession } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Action, Point, Project, Scene } from '../config/schema';
import { EASE, clamp01, monotoneCubic } from '../config/ease';
import { NAME_SHIM, VIRTUAL_CLOCK_SCRIPT } from './virtualClock';
import { CHROME_ARGS, CHROME_PATH } from './browser';

export type SceneManifest = {
  scene: string;
  file: string;
  fps: number;
  frames: number;
  width: number;
  height: number;
  url: string;
  gpu?: string;
  canvas?: string;
  quality?: string;
  rootClass?: string;
  realSeconds: number;
  msPerFrame: number;
  warnings: string[];
};

const log = (...a: unknown[]) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

function sceneUrl(p: Project, s: Scene) {
  const u = new URL(s.path, p.url);
  for (const [k, v] of Object.entries({ ...(p.query ?? {}), ...(s.query ?? {}) })) u.searchParams.set(k, v);
  return u.toString();
}

/** Resolve a Point to viewport CSS px in the live page. */
async function resolvePoint(page: Page, pt: Point): Promise<[number, number]> {
  if (Array.isArray(pt)) return pt;
  const r = await page.evaluate(({ selector, index }) => {
    const el = document.querySelectorAll(selector)[index ?? 0];
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height };
  }, { selector: pt.selector, index: pt.index });
  if (!r) throw new Error(`pointer target not found: ${pt.selector}[${pt.index ?? 0}]`);
  const x = pt.x ?? r.x + r.w * (pt.ax ?? 0.5) + (pt.dx ?? 0);
  const y = pt.y ?? r.y + r.h * (pt.ay ?? 0.5) + (pt.dy ?? 0);
  return [x, y];
}

/** Absolute document scroll Y for a scroll ref value. */
async function scrollResolver(page: Page, ref: Extract<Action, { type: 'scroll' }>['ref'], startY: number) {
  if (ref === 'start') return (v: number) => startY + v;
  if ('progressOf' in ref) {
    const m = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { top: b.top + window.scrollY, h: b.height, vh: window.innerHeight };
    }, ref.progressOf);
    if (!m) throw new Error(`scroll ref not found: ${ref.progressOf}`);
    return (v: number) => m.top + v * (m.h - m.vh);
  }
  const y = await page.evaluate(({ selector, edge }) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return (edge === 'bottom' ? b.bottom : b.top) + window.scrollY;
  }, { selector: ref.selector, edge: ref.edge ?? 'top' });
  if (y === null) throw new Error(`scroll ref not found: ${ref.selector}`);
  return (v: number) => y + (ref.offset ?? 0) + v;
}

/**
 * Wait (in real time) for the network, fonts and the images that are on screen, so nothing pops in mid-shot.
 * Lazy images below the fold never load until scrolled to, so only images near the viewport are awaited, and
 * the whole wait is bounded from Node: page-side timers run on the virtual clock and would never fire.
 */
async function settle(page: Page, label: string) {
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => log(`  ${label}: networkidle timeout, continuing`));
  const wait = page.evaluate(async () => {
    await document.fonts.ready;
    const near = Array.from(document.images).filter((i) => { const r = i.getBoundingClientRect(); return r.bottom > -innerHeight && r.top < innerHeight * 2 && r.width > 0; });
    await Promise.all(near.map((i) => (i.complete ? i.decode().catch(() => {}) : new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }))));
    return near.length;
  });
  const n = await Promise.race([wait, new Promise<string>((r) => setTimeout(() => r('timeout'), 15000))]);
  log(`  ${label}: ${n === 'timeout' ? 'image wait timed out' : `${n} on-screen images ready`}`);
}

export async function captureScene(project: Project, id: string, outDir: string, opts: { stillsEvery?: number; dryRun?: boolean; frames?: number } = {}): Promise<SceneManifest> {
  const scene = project.scenes[id];
  if (!scene) throw new Error(`unknown scene ${id}`);
  const { width, height } = project.viewport;
  const dpr = project.deviceScaleFactor;
  const fps = project.fps;
  const dt = 1000 / fps;
  const url = sceneUrl(project, scene);
  const warnings: string[] = [];
  // stills from an earlier run of this scene would be mistaken for this one
  fs.rmSync(path.join(outDir, 'stills', id), { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, 'stills', id), { recursive: true });

  log(`scene ${id}: ${url}`);
  const browser = await chromium.launch({ executablePath: CHROME_PATH, args: CHROME_ARGS, headless: true });
  // a fresh context per scene: empty cookies, storage and cache — a clean first visit unless storage is seeded
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    locale: 'en-US',
    timezoneId: 'Asia/Jakarta',
    reducedMotion: 'no-preference',
    colorScheme: 'dark',
  });
  await ctx.addInitScript(NAME_SHIM);
  if (scene.storage && !scene.firstVisit) {
    const seed = Object.fromEntries(Object.entries(scene.storage).map(([k, v]) => [k, v === '$now' ? '__NOW__' : v]));
    await ctx.addInitScript((s) => {
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v === '__NOW__' ? String(Date.now()) : v);
    }, seed);
  }
  await ctx.addInitScript(VIRTUAL_CLOCK_SCRIPT);
  // what the page itself last received, for the per-frame trace
  await ctx.addInitScript(() => {
    (window as any).__seen = { x: -1, y: -1 };
    (window as any).__wheel = 0;
    (window as any).__wheelN = 0;
    window.addEventListener('pointermove', (e) => { (window as any).__seen = { x: e.clientX, y: e.clientY }; }, { capture: true, passive: true });
    window.addEventListener('wheel', (e) => { (window as any).__wheel += e.deltaY; (window as any).__wheelN++; }, { capture: true, passive: true });
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') warnings.push(`console ${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => warnings.push(`pageerror: ${e.message.slice(0, 200)}`));
  const cdp: CDPSession = await ctx.newCDPSession(page);

  /**
   * Stop the browser's own animation timeline from moving in real time. Work that lands outside a clock step
   * (a React commit from the scheduler, a network callback) can start a CSS transition during a slow screenshot;
   * left alone it would play out in real time and arrive finished. At rate 0 it waits, and the virtual clock seeks it.
   * Proven in tests/transition.ts.
   */
  const freezeTimeline = async () => {
    await cdp.send('Animation.enable');
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 0 });
  };
  await freezeTimeline();
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await freezeTimeline();
  await settle(page, 'load');
  await page.evaluate(() => (window as any).__vt.freeze());

  // pointer at rest before anything moves
  let pointer: [number, number] = scene.pointerStart ? await resolvePoint(page, scene.pointerStart) : [-1, -1];
  let moved = false;
  const move = async (x: number, y: number) => {
    pointer = [x, y];
    moved = true;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', pointerType: 'mouse' });
  };
  /**
   * Wheel deltas, closed loop. Chrome scales CDP wheel deltas by an emulation-dependent factor (at 2x DPR it halves
   * them until the first clip.scale screenshot, then stops: see tests/wheel.ts). So the engine never trusts a fixed
   * ratio: the page reports what it actually received, the ratio is re-learned from every event, and any residual
   * is folded into the next one. The page always receives the intended scroll, whatever Chrome does.
   */
  let wheelWant = 0; // intended cumulative page delta
  let wheelSeen = 0; // cumulative page delta actually received
  let wheelCount = 0; // events sent
  let ratio = 1; // page delta per raw CDP delta, learned
  let lastRaw = 0;
  const wheel = async (d: number) => {
    wheelWant += d;
    const raw = (wheelWant - wheelSeen) / ratio;
    if (Math.abs(raw) < 0.001) return;
    lastRaw = raw;
    wheelCount++;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: Math.max(0, pointer[0]), y: Math.max(0, pointer[1]), deltaX: 0, deltaY: raw, pointerType: 'mouse' });
  };
  /**
   * Chrome hands mouse and wheel events to the page on its own real-time frame schedule, not on dispatch.
   * Before the virtual clock advances, wait until the page has actually received everything sent,
   * otherwise an event lands a frame late whenever the last frame was slow to render.
   */
  const syncInput = async () => {
    const until = Date.now() + 5000;
    for (;;) {
      const r = await page.evaluate(() => ({ s: (window as any).__seen, w: (window as any).__wheel, n: (window as any).__wheelN }));
      const okP = !moved || (Math.abs(r.s.x - pointer[0]) < 0.6 && Math.abs(r.s.y - pointer[1]) < 0.6);
      const okW = r.n >= wheelCount;
      if (okP && okW) {
        const got = r.w - wheelSeen;
        if (Math.abs(lastRaw) > 0.5 && Math.abs(got) > 0.05) ratio = got / lastRaw;
        lastRaw = 0;
        wheelSeen = r.w;
        return;
      }
      if (Date.now() > until) { warnings.push(`input not delivered within 5 s (pointer ${okP}, wheel events ${r.n}/${wheelCount})`); return; }
      await new Promise((res) => setTimeout(res, 2));
    }
  };
  if (pointer[0] >= 0) await move(...pointer);

  if (scene.startScroll !== undefined) {
    const y = typeof scene.startScroll === 'number' ? scene.startScroll : await (await scrollResolver(page, scene.startScroll, 0))(0);
    await page.evaluate((y) => window.scrollTo(0, y), y);
    // a few virtual frames let the smooth scroller and scroll triggers sync, then lazy images near the new spot load
    for (let i = 0; i < 4; i++) await page.evaluate((d) => (window as any).__vt.step(d), 1000 / fps);
    await settle(page, 'after start scroll');
  }

  const step = () => page.evaluate((d) => (window as any).__vt.step(d), dt);
  const preFrames = Math.round((scene.preroll ?? 0) * fps);
  for (let i = 0; i < preFrames; i++) await step();

  // resolve scroll keyframes against the page as it stands when recording starts
  const startY = await page.evaluate(() => window.scrollY);
  type ScrollRun = { curve: (t: number) => number; t0: number; prev: number | null };
  const scrolls: ScrollRun[] = [];
  for (const a of scene.actions) {
    if (a.type !== 'scroll') continue;
    const toY = await scrollResolver(page, a.ref, startY);
    const curve = monotoneCubic(a.keys);
    scrolls.push({ curve: (t) => toY(curve(t)), t0: a.keys[0][0], prev: null });
    if (a.keys[0][0] === 0) {
      const want = toY(a.keys[0][1]);
      if (Math.abs(want - startY) > 4) warnings.push(`scroll key 0 resolves to ${Math.round(want)} but page sits at ${Math.round(startY)}`);
    }
  }
  type PointerRun = { a: Extract<Action, { type: 'pointer' }>; from?: [number, number]; to?: [number, number] };
  const pointers: PointerRun[] = scene.actions.filter((a): a is Extract<Action, { type: 'pointer' }> => a.type === 'pointer').sort((a, b) => a.at - b.at).map((a) => ({ a }));
  const oneShots = scene.actions.filter((a) => a.type === 'click' || a.type === 'key') as Extract<Action, { type: 'click' | 'key' }>[];
  const fired = new Set<unknown>();

  const total = opts.frames ?? Math.round(scene.duration * fps);
  const file = path.join(outDir, `${id}.mp4`);
  // near-lossless intermediate at capture resolution; Remotion reads it frame-accurately
  const ff = opts.dryRun ? null : spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '8', '-pix_fmt', 'yuv420p', '-g', String(fps), '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = ff ? new Promise<void>((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`))))) : Promise.resolve();

  const t0 = Date.now();
  /** per frame: [t, pointer x, y as sent, x, y as the page saw it, wheel Σ intended, wheel Σ received, scrollY, hovered link/button] */
  const trace: (number | string)[][] = [];
  for (let f = 0; f < total; f++) {
    const t = f / fps;
    // pointer glides
    for (const p of pointers) {
      const { a } = p;
      if (t < a.at) continue;
      const u = clamp01((t - a.at) / a.duration);
      if (u >= 1 && fired.has(p)) continue;
      if (!p.from) p.from = pointer;
      // element targets are re-measured every frame, so the pointer lands on them even while the page still scrolls
      if (!p.to || !Array.isArray(a.to)) p.to = await resolvePoint(page, a.to);
      const e = EASE[a.ease ?? 'inOutSine'](u);
      const x = p.from[0] + (p.to![0] - p.from[0]) * e;
      const y = p.from[1] + (p.to![1] - p.from[1]) * e;
      if (Math.abs(x - pointer[0]) > 0.01 || Math.abs(y - pointer[1]) > 0.01) await move(x, y);
      if (u >= 1) fired.add(p);
    }
    // an element target stays under the pointer after its glide, until the next pointer action takes over
    const lastStarted = [...pointers].reverse().find((p) => t >= p.a.at);
    if (lastStarted && fired.has(lastStarted) && !Array.isArray(lastStarted.a.to)) {
      const [x, y] = await resolvePoint(page, lastStarted.a.to);
      if (Math.abs(x - pointer[0]) > 0.01 || Math.abs(y - pointer[1]) > 0.01) await move(x, y);
    }
    // scroll camera, as wheel deltas
    for (const s of scrolls) {
      if (t < s.t0) continue;
      const y = s.curve(t);
      if (s.prev === null) { s.prev = y; continue; }
      const d = y - s.prev;
      s.prev = y;
      if (Math.abs(d) > 0.001) await wheel(d);
    }
    // clicks and keys
    for (const a of oneShots) {
      if (t < a.at || fired.has(a)) continue;
      fired.add(a);
      if (a.type === 'click') {
        const [x, y] = a.target ? await resolvePoint(page, a.target) : pointer;
        if (a.target) await move(x, y);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' });
      } else {
        await page.keyboard.press(a.key);
      }
    }

    await syncInput();
    await step();
    const st = await page.evaluate(() => ({ y: window.scrollY, seen: (window as any).__seen, hover: (document.querySelector(':is(a,button):hover')?.textContent ?? '').trim().slice(0, 24) }));
    trace.push([+t.toFixed(4), +pointer[0].toFixed(1), +pointer[1].toFixed(1), Math.round(st.seen.x), Math.round(st.seen.y), +wheelWant.toFixed(1), +wheelSeen.toFixed(1), +st.y.toFixed(1), st.hover]);
    if (opts.dryRun) continue;
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: CLIP_IS_DOCUMENT ? st.y : 0, width, height, scale: dpr },
      captureBeyondViewport: false,
      optimizeForSpeed: true,
    } as any);
    const buf = Buffer.from(data, 'base64');
    if (!ff!.stdin.write(buf)) await new Promise((r) => ff!.stdin.once('drain', r));
    if (opts.stillsEvery && f % opts.stillsEvery === 0) fs.writeFileSync(path.join(outDir, 'stills', id, `${String(f).padStart(4, '0')}.png`), buf);
    if (f % 60 === 0) {
      const el = (Date.now() - t0) / 1000;
      log(`  ${id} frame ${f}/${total}  ${(el / Math.max(1, f)).toFixed(2)} s/frame  eta ${Math.round((el / Math.max(1, f)) * (total - f))} s`);
    }
  }
  ff?.stdin.end();
  await ffDone;
  fs.writeFileSync(path.join(outDir, `${id}${opts.dryRun ? '.dry' : ''}.trace.json`), JSON.stringify(trace));

  const meta = await page.evaluate((sel) => {
    const cv = document.querySelector('canvas.gl') as HTMLCanvasElement | null;
    return {
      gpu: cv?.dataset.gpu, canvas: cv ? `${cv.width}x${cv.height}` : undefined, quality: cv?.dataset.q,
      rootClass: (document.querySelector(sel || '.site') ?? document.body).className,
    };
  }, scene.rootSelector ?? '');
  // fail loudly if the site silently took a fallback path
  const ex = scene.expect;
  if (ex?.rootClassIncludes) for (c of ex.rootClassIncludes) if (!meta.rootClass.split(' ').includes(c)) throw new Error(`scene ${id}: expected root class "${c}", got "${meta.rootClass}"`);
  if (ex?.rootClassExcludes) for (c of ex.rootClassExcludes) if (meta.rootClass.split(' ').includes(c)) throw new Error(`scene ${id}: root has fallback class "${c}"`);
  if (ex?.selectorVisible) for (const s of ex.selectorVisible) {
    const ok = await page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }, s);
    if (!ok) throw new Error(`scene ${id}: expected ${s} to be visible at the end`);
  }
  await browser.close();

  const realSeconds = (Date.now() - t0) / 1000;
  const m: SceneManifest = {
    scene: id, file: path.basename(file), fps, frames: total, width: width * dpr, height: height * dpr, url,
    ...meta, realSeconds, msPerFrame: Math.round((realSeconds * 1000) / total), warnings,
  };
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(m, null, 2));
  log(`scene ${id} done: ${total} frames in ${Math.round(realSeconds)} s, ${warnings.length} warnings`);
  return m;
}

let c: string;
/** CDP screenshot clip origin: document (true) or viewport (false). Verified in tests/clip.ts. */
export const CLIP_IS_DOCUMENT = process.env.CLIP_IS_DOCUMENT !== '0';
