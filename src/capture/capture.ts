/**
 * npm run capture -- <project> [scene ...] [--stills N]
 * Captures each scene in its own clean browser session into out/<project>/clips.
 * Scenes not named are skipped; with no names, every scene in the timeline is captured.
 */
import fs from 'node:fs';
import path from 'node:path';
import { captureScene } from './engine';
import { loadProject } from '../config/load';

(async () => {
  const args = process.argv.slice(2);
  const name = args.shift();
  if (!name) throw new Error('usage: capture <project> [scene ...] [--stills N]');
  const si = args.indexOf('--stills');
  const stillsEvery = si >= 0 ? Number(args.splice(si, 2)[1]) : 30;
  const project = await loadProject(name);
  const wanted = args.length ? args : [...new Set(project.timeline.map((s) => s.scene))];
  const outDir = path.resolve('out', project.id, 'clips');
  fs.mkdirSync(outDir, { recursive: true });
  for (const id of wanted) await captureScene(project, id, outDir, { stillsEvery });
})().catch((e) => { console.error(e); process.exit(1); });
