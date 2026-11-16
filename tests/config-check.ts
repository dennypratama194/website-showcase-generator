// The static checks must reject a bad timeline and a camera move that crops into fixed UI.
import assert from 'node:assert/strict';
import { loadProject } from '../src/config/load';
import { checkProject } from '../src/config/check';

(async () => {
  const p = await loadProject('dennypratama');
  assert.deepEqual(checkProject(p), [], 'shipped config is clean');

  const zoom = structuredClone(p);
  zoom.timeline[1].camera = { from: { scale: 1 }, to: { scale: 1.04 } };
  const z = checkProject(zoom);
  assert.ok(z.some((m) => m.includes('right edge')), `zoom into the ribbon is caught: ${z}`);

  const long = structuredClone(p);
  long.timeline[0].to = 12.5;
  assert.ok(checkProject(long).some((m) => m.includes('adds up to')), 'wrong total length is caught');

  const late = structuredClone(p);
  late.timeline[2].to = 9;
  assert.ok(checkProject(late).some((m) => m.includes('outside the captured')), 'shot past the captured footage is caught');
  console.log('config checks: 4/4 pass');
})().catch((e) => { console.error(e); process.exit(1); });
