/**
 * npm run make -- <url | project> [scene ...] [--hd] [--force]
 * One command, one video: check → capture (all scenes, or just the named ones) → render → validate,
 * then copies the single deliverable to out/<id>/<id>-showcase[-variant].mp4 (the size-capped platform
 * file when `output.platform` is set, otherwise the master). With `cover` set, it opens on that still.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadProject } from './config/load';
import { variantSuffix } from './config/frame';
import { assertReady } from './doctor';
import { createProject, isUrl } from './auto';

const run = (script: string, args: string[]) => execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsx', script, ...args], { stdio: 'inherit', shell: process.platform === 'win32' });

(async () => {
  const argv = process.argv.slice(2);
  const flags = argv.filter((a) => a.startsWith('--'));
  const [target, ...scenes] = argv.filter((a) => !a.startsWith('--'));
  if (!target) throw new Error('usage: npm run make -- <url | project> [scene ...] [--hd] [--force]');
  assertReady();
  // a URL becomes projects/<site>.config.ts (kept, so you can edit it and re-run); a name uses an existing config
  const name = isUrl(target) && !/\.config\.ts$/.test(target) && !/^[\w-]+$/.test(target)
    ? (await createProject(target, { hd: flags.includes('--hd'), force: flags.includes('--force') })).id
    : target;
  const p = await loadProject(name);
  run('src/capture/capture.ts', [name, ...scenes]);
  run('src/render.ts', [name]);
  const root = path.resolve('out', p.id);
  const sfx = variantSuffix(p);
  const master = path.join(root, `${p.id}-showcase-${p.output.width}x${p.output.height}-${p.fps}fps${sfx}.mp4`);
  run('src/validate.ts', [name, master]);
  const src = p.output.platform ? path.join(root, `${p.id}-${p.output.platform.name}-full${sfx}.mp4`) : master;
  const out = path.join(root, `${p.id}-showcase${sfx}.mp4`);
  fs.copyFileSync(src, out);
  run('src/validate.ts', [name, out, ...(p.output.platform ? ['--capped'] : [])]);
  console.log(`\nDELIVERABLE ${out} (${(fs.statSync(out).size / 1e6).toFixed(2)} MB)`);
})().catch((e) => { console.error(e.message ?? e); process.exit(1); });
