/**
 * npm run new -- <url> [--hd] [--force]
 * Looks at a live page and writes projects/<id>.config.ts: one continuous take of the real page
 * (its own loader and hero first, then a smooth scroll down it), presented on a Dribbble canvas.
 * It is a starting point. Open the file to add hovers, clicks and extra scenes for the site's signature moves.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { CHROME_PATH, CHROME_ARGS } from './capture/browser';
import type { Project } from './config/schema';
import { checkProject } from './config/check';

export const isUrl = (s: string) => /^https?:\/\//i.test(s) || /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(s) || /^localhost(:\d+)?(\/\S*)?$/.test(s);
export const normalizeUrl = (s: string) => (/^https?:\/\//i.test(s) ? s : `${/^(localhost|127\.0\.0\.1)(:|$|\/)/.test(s) ? 'http' : 'https'}://${s}`);
export const slug = (url: string) => {
  const u = new URL(normalizeUrl(url));
  return `${u.host.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const hex = (c: number[]) => '#' + c.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');

/** Canvas colour: the page background nudged a few levels away from itself, so the film's edge stays visible. */
function canvasFor(rgb: number[]) {
  const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const d = lum > 128 ? -6 : 10;
  return hex(rgb.map((v) => v + d));
}

export async function probe(url: string) {
  const browser = await chromium.launch({ executablePath: CHROME_PATH, args: CHROME_ARGS, headless: true });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    await page.goto(url, { waitUntil: 'load', timeout: 45_000 });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    // a string, not a function: tsx would inject a helper that does not exist in the page
    return (await page.evaluate(`(() => {
      const bg = (el) => (getComputedStyle(el).backgroundColor.match(/[\\d.]+/g) || []).map(Number);
      let c = bg(document.body);
      if (c.length < 3 || (c.length === 4 && c[3] === 0)) c = bg(document.documentElement);
      if (c.length < 3 || (c.length === 4 && c[3] === 0)) c = [255, 255, 255];
      return { title: document.title, height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight), vh: innerHeight, bg: c.slice(0, 3) };
    })()`)) as { title: string; height: number; vh: number; bg: number[] };
  } finally { await browser.close(); }
}

export function buildProject(id: string, url: string, info: { height: number; vh: number; bg: number[] }, hd = false): Project {
  const vh = 1080;
  const hold = 4; // the site's own loader and hero, before any scrolling
  const travel = clamp(info.height - info.vh, 0, 10 * vh);
  const scrollTime = travel > 0 ? clamp(travel / (0.45 * vh), 3, 22) : 0;
  const duration = r2(Math.round((clamp(hold + scrollTime + 2, 8, 30)) * 20) / 20);
  const t1 = hold, t2 = hold + scrollTime;
  const bg = hex(info.bg);
  const p: Project = {
    id, url: normalizeUrl(url),
    viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, fps: 60,
    duration,
    scenes: {
      tour: {
        path: '', firstVisit: true, pointerStart: [1500, 760], duration,
        actions: [
          { type: 'pointer', at: 1.2, duration: 2.4, to: [1100, 520], ease: 'inOutSine' },
          ...(travel > 0 ? [
            { type: 'scroll' as const, ref: 'start' as const, keys: [[t1, 0], [t1 + scrollTime * 0.15, travel * 0.05], [t1 + scrollTime * 0.85, travel * 0.95], [t2, travel]] as [number, number][] },
            { type: 'pointer' as const, at: t1, duration: scrollTime, to: [820, 600] as [number, number], ease: 'inOutSine' as const },
          ] : []),
        ],
      },
    },
    timeline: [{ scene: 'tour', from: 0, to: duration, in: { type: 'fadeFrom', color: bg, duration: 0.4 }, out: { type: 'fadeTo', color: bg, duration: 0.6 }, label: info.height > 0 ? 'Page tour' : '' }],
    captions: [],
    output: hd
      ? { width: 1920, height: 1080, crf: 14, maxrate: '32M', bufsize: '64M', preset: 'slow' }
      : { width: 1600, height: 1200, crf: 14, maxrate: '32M', bufsize: '64M', preset: 'slow', platform: { name: 'dribbble', maxBytes: 20_000_000 } },
    ...(hd ? {} : { presentation: { background: canvasFor(info.bg), video: { width: 1440, radius: 20 } } }),
  };
  const problems = checkProject(p);
  if (problems.length) throw new Error(`generated config is invalid:\n  ${problems.join('\n  ')}`);
  return p;
}

export async function createProject(input: string, opts: { hd?: boolean; force?: boolean } = {}) {
  const url = normalizeUrl(input);
  const id = slug(url);
  const file = path.resolve('projects', `${id}.config.ts`);
  if (fs.existsSync(file) && !opts.force) { console.log(`Using existing ${path.relative('.', file)} (pass --force to regenerate)`); return { id, file }; }
  console.log(`Looking at ${url} ...`);
  const info = await probe(url);
  const p = buildProject(id, url, info, opts.hd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = JSON.stringify(p, null, 2).replace(/"([A-Za-z_]\w*)":/g, '$1:');
  fs.writeFileSync(file, `import { defineProject } from '../src/config/schema';\n\n// Generated from ${url}. Edit freely: add hovers, clicks and extra scenes (see examples/ and the README).\nexport default defineProject(${body});\n`);
  console.log(`Wrote ${path.relative('.', file)}: ${p.duration}s, page height ${info.height}px "${info.title}"`);
  return { id, file };
}

if (process.argv[1]?.endsWith('auto.ts')) {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith('--'));
  if (!target) { console.error('usage: npm run new -- <url> [--hd] [--force]'); process.exit(1); }
  createProject(target, { hd: args.includes('--hd'), force: args.includes('--force') }).catch((e) => { console.error(e.message ?? e); process.exit(1); });
}
