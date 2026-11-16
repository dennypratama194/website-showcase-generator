// npm run check -- <project>: validates a config and prints the timeline, without capturing anything.
import { loadProject } from './load';
import { layout } from './check';

(async () => {
  const p = await loadProject(process.argv[2]);
  console.log(`${p.id}: ${p.duration}s @ ${p.fps}fps, capture ${p.viewport.width}x${p.viewport.height} @${p.deviceScaleFactor}x`);
  for (const { shot, start, end } of layout(p)) {
    console.log(`  ${start.toFixed(2).padStart(6)}–${end.toFixed(2).padEnd(6)} ${shot.scene.padEnd(10)} ${shot.from}–${shot.to}s  ${shot.in?.type ?? 'cut'}${shot.out ? ` → ${shot.out.type}` : ''}  ${shot.label ?? ''}`);
  }
  for (const c of p.captions ?? []) console.log(`  caption ${c.from}–${c.to} "${c.text}"`);
  console.log('config ok');
})().catch((e) => { console.error(e.message); process.exit(1); });
