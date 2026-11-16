// Renders single composed frames through the real composition, with a test caption, to prove bundling,
// frame-accurate clip reads, transitions and caption font loading before a full render.
import fs from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { loadProject } from '../src/config/load';
import { CHROME_PATH } from '../src/capture/browser';

(async () => {
  const project = await loadProject('dennypratama');
  const pub = path.resolve('out', project.id, 'public');
  fs.mkdirSync(path.join(pub, 'clips'), { recursive: true });
  fs.copyFileSync(path.resolve('out', project.id, 'clips', 'closing.mp4'), path.join(pub, 'clips', 'smoke-closing.mp4'));
  // every shot reads the closing clip here; only the frames inside the closing shot matter
  const clips = Object.fromEntries(Object.keys(project.scenes).map((k) => [k, 'clips/smoke-closing.mp4']));
  const test = { ...project, captions: [{ text: 'dennypratama.com', from: 22.0, to: 25.0, position: 'bottom-left' as const, font: 'Archivo', size: 20 }] };
  const serveUrl = await bundle({ entryPoint: path.resolve('src/remotion/index.tsx'), publicDir: pub });
  const inputProps = { project: test, clips };
  const composition = await selectComposition({ serveUrl, id: 'Showcase', inputProps, browserExecutable: CHROME_PATH });
  console.log('composition', composition.width, composition.height, composition.fps, composition.durationInFrames);
  for (const f of [1400]) {
    const out = `/tmp/smoke-${f}.png`;
    await renderStill({ serveUrl, composition, inputProps, frame: f, output: out, browserExecutable: CHROME_PATH, onBrowserLog: (l) => console.log('browser:', l.type, l.text) });
    console.log('rendered', out);
  }
})().catch((e) => { console.error(e); process.exit(1); });
