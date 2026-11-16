// Dry run of a scene (no screenshots): writes the per-frame pointer/scroll/hover trace.
import path from 'node:path';
import { loadProject } from '../src/config/load';
import { captureScene } from '../src/capture/engine';
(async () => {
  const [name, id, frames, dpr] = process.argv.slice(2);
  const p = await loadProject(name);
  p.deviceScaleFactor = Number(dpr ?? 1);
  await captureScene(p, id, path.resolve('out', p.id, 'dry'), { dryRun: true, frames: Number(frames) });
})().catch((e) => { console.error(e); process.exit(1); });
