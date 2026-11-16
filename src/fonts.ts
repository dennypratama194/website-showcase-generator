/**
 * npm run fonts -- <project>
 * Downloads the site's own @font-face files (from its live stylesheets) into out/<id>/public/fonts, so captions
 * are set in the site's typeface instead of a stand-in. Writes fonts.css with the families as the site declares them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadProject } from './config/load';

(async () => {
  const p = await loadProject(process.argv[2]);
  const dir = path.resolve('out', p.id, 'public', 'fonts');
  fs.mkdirSync(dir, { recursive: true });
  const html = await (await fetch(p.url)).text();
  const sheets = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => new URL(m[1].replace(/&amp;/g, '&'), p.url).toString());
  // font urls are relative to the stylesheet that declares them, not to the page
  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => ({ base: p.url, css: m[1] }));
  const linked = await Promise.all(sheets.map(async (s) => ({ base: s, css: await (await fetch(s)).text() })));
  let out = '';
  let n = 0;
  let faces = 0;
  for (const { base, css } of [...inline, ...linked]) {
    for (const face of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
      faces++;
      let f = face;
      for (const m of face.matchAll(/url\(([^)]+)\)/g)) {
        const src = new URL(m[1].replace(/["']/g, ''), base).toString();
        const res = await fetch(src);
        const type = res.headers.get('content-type') ?? '';
        if (!res.ok || type.includes('html')) throw new Error(`font ${src} answered ${res.status} ${type}`);
        const name = `f${n++}${path.extname(new URL(src).pathname) || '.woff2'}`;
        fs.writeFileSync(path.join(dir, name), Buffer.from(await res.arrayBuffer()));
        f = f.replace(m[0], `url(${name})`);
      }
      out += f + '\n';
    }
  }
  fs.writeFileSync(path.join(dir, 'fonts.css'), out);
  const fams = [...new Set([...out.matchAll(/font-family:\s*([^;]+);/g)].map((m) => m[1].trim()))];
  console.log(`${faces} faces, ${n} files → ${dir}\nfamilies: ${fams.join(', ')}`);
})().catch((e) => { console.error(e); process.exit(1); });
