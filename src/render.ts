/**
 * npm run render -- <project> [--preview]
 *
 * 1. checks every captured clip exists and covers its shots
 * 2. downsamples 2x captures to output size with Lanczos (supersampled, crisp type) unless a shot zooms
 * 3. Remotion composes the timeline frame-accurately into a ProRes HQ master (preview: H.264, half size)
 * 4. FFmpeg encodes the delivery file: H.264 High, yuv420p, bt709, CFR, +faststart, audio if configured
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { loadProject } from './config/load';
import { CHROME_PATH } from './capture/browser';
import type { SceneManifest } from './capture/engine';
import { videoRect } from './config/frame';

const log = (...a: unknown[]) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const sh = (cmd: string, args: string[]) => execFileSync(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });

(async () => {
  const args = process.argv.slice(2);
  const preview = args.includes('--preview');
  // reuse the existing master and only redo the size-capped platform exports
  const exportsOnly = args.includes('--exports-only');
  const name = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--stills');
  if (!name) throw new Error('usage: render <project> [--preview]');
  const project = await loadProject(name);
  const root = path.resolve('out', project.id);
  const clipsDir = path.join(root, 'clips');
  const pub = path.join(root, 'public');
  fs.mkdirSync(path.join(pub, 'clips'), { recursive: true });

  // 1. clips
  const clips: Record<string, string> = {};
  for (const id of new Set(project.timeline.map((s) => s.scene))) {
    const mf = path.join(clipsDir, `${id}.json`);
    if (!fs.existsSync(mf)) throw new Error(`scene "${id}" has not been captured: npm run capture -- ${name} ${id}`);
    const m: SceneManifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
    const need = Math.max(...project.timeline.filter((s) => s.scene === id).map((s) => s.to));
    if (m.frames / m.fps + 1e-6 < need) throw new Error(`scene "${id}" has ${m.frames / m.fps} s, shots need ${need} s`);
    if (m.fps !== project.fps) throw new Error(`scene "${id}" captured at ${m.fps} fps, project is ${project.fps}`);

    // 2. a zooming shot reads the full-resolution capture; everything else gets a Lanczos downsample
    const zooms = project.timeline.some((s) => s.scene === id && s.camera && Math.max(s.camera.from.scale ?? 1, s.camera.to.scale ?? 1) > 1);
    const src = path.join(clipsDir, m.file);
    // footage is resampled once, from the 2x capture straight to the size it occupies in the output
    const { w: W, h: H } = videoRect(project);
    const name1080 = `${id}@${W}x${H}.mp4`;
    const dst = path.join(pub, 'clips', zooms ? m.file : name1080);
    const stale = !fs.existsSync(dst) || fs.statSync(dst).mtimeMs < fs.statSync(src).mtimeMs;
    if (stale) {
      if (zooms) fs.copyFileSync(src, dst);
      else {
        log(`resampling ${id} ${m.width}x${m.height} → ${W}x${H} (lanczos)`);
        sh('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', `scale=${W}:${H}:flags=lanczos+accurate_rnd+full_chroma_int`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '6', '-pix_fmt', 'yuv420p', '-g', String(project.fps),
          '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', dst]);
      }
    }
    clips[id] = `clips/${path.basename(dst)}`;
  }
  if ((project.captions ?? []).length && !fs.existsSync(path.join(pub, 'fonts', 'fonts.css'))) throw new Error(`captions need the site fonts: npm run fonts -- ${name}`);

  const master = path.join(root, preview ? 'preview-master.mp4' : 'master.mov');
  // --stills 5,13.5,...: render just these moments as PNGs, to check layout before a full render
  const si = args.indexOf('--stills');
  if (si >= 0) {
    const serveUrl = await bundle({ entryPoint: path.resolve('src/remotion/index.tsx'), publicDir: pub });
    const inputProps = { project, clips };
    const composition = await selectComposition({ serveUrl, id: 'Showcase', inputProps, browserExecutable: CHROME_PATH });
    for (const t of args[si + 1].split(',').map(Number)) {
      const out = path.join(root, 'stills', `t${t.toFixed(2)}.png`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await renderStill({ serveUrl, composition, inputProps, frame: Math.round(t * project.fps), output: out, browserExecutable: CHROME_PATH });
      log(`still ${out}`);
    }
    return;
  }
  if (!exportsOnly) {
  // 3. compose
  log('bundling composition');
  const serveUrl = await bundle({ entryPoint: path.resolve('src/remotion/index.tsx'), publicDir: pub });
  const inputProps = { project, clips };
  const composition = await selectComposition({ serveUrl, id: 'Showcase', inputProps, browserExecutable: CHROME_PATH });
  log(`rendering ${composition.durationInFrames} frames → ${path.basename(master)}`);
  let last = 0;
  await renderMedia({
    serveUrl, composition, inputProps, outputLocation: master, browserExecutable: CHROME_PATH,
    concurrency: 2,
    ...(preview
      ? { codec: 'h264' as const, crf: 20, scale: 0.5, x264Preset: 'veryfast' as const }
      : { codec: 'prores' as const, proResProfile: 'hq' as const }),
    colorSpace: 'bt709',
    onProgress: ({ progress }) => { if (progress - last >= 0.1) { last = progress; log(`  ${Math.round(progress * 100)}%`); } },
  });

  // 4. delivery encode
  const o = project.output;
  const final = path.join(root, preview ? `${project.id}-preview.mp4` : `${project.id}-showcase-${o.width}x${o.height}-${project.fps}fps.mp4`);
  const audio = o.audio ? path.resolve(path.dirname(path.resolve('projects')), 'projects', o.audio) : null;
  const vArgs = preview
    ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20']
    : ['-c:v', 'libx264', '-profile:v', 'high', '-level:v', '4.2', '-preset', o.preset, '-crf', String(o.crf), '-maxrate', o.maxrate, '-bufsize', o.bufsize, '-g', String(project.fps * 2), '-bf', '2'];
  log(`encoding ${path.basename(final)}`);
  sh('ffmpeg', ['-y', '-loglevel', 'error', '-i', master, ...(audio ? ['-i', audio] : []),
    '-map', '0:v:0', ...(audio ? ['-map', '1:a:0', '-c:a', 'aac', '-b:a', '320k', '-shortest'] : ['-an']),
    ...vArgs, '-pix_fmt', 'yuv420p', '-r', String(project.fps), '-fps_mode', 'cfr',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart', final]);
  log(`done: ${final}`);
  }
  const o = project.output;

  // 5. size-capped platform exports (two-pass, so the file lands just under the cap at the best quality it allows)
  const pf = o.platform;
  if (pf && !preview) {
    const parts = [{ name: 'full', from: 0, to: project.duration }, ...(pf.chapters ?? [])];
    const W = pf.width ?? o.width;
    const H = Math.round((W * o.height) / o.width / 2) * 2;
    for (const c of parts) {
      const dur = c.to - c.from;
      // 3% headroom for container overhead and rate-control overshoot
      const kbps = Math.floor((pf.maxBytes * 8 * 0.97) / dur / 1000);
      const out = path.join(root, `${project.id}-${pf.name}-${c.name}.mp4`);
      const log2 = path.join(root, `.x264-${c.name}`);
      const base = ['-y', '-loglevel', 'error', '-ss', c.from.toFixed(4), '-t', dur.toFixed(4), '-i', master, '-an',
        '-vf', `scale=${W}:${H}:flags=lanczos`, '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-b:v', `${kbps}k`,
        '-maxrate', `${Math.round(kbps * 1.6)}k`, '-bufsize', `${kbps * 3}k`, '-pix_fmt', 'yuv420p', '-r', String(project.fps), '-fps_mode', 'cfr',
        '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-passlogfile', log2];
      log(`${pf.name} ${c.name}: ${dur.toFixed(2)} s at ${kbps} kb/s, ${W}x${H}`);
      const rate = (k: number) => ['-b:v', `${k}k`, '-maxrate', `${Math.round(k * 1.6)}k`, '-bufsize', `${k * 3}k`];
      const strip = (a: string[]) => { const i = a.indexOf('-b:v'); return [...a.slice(0, i), ...a.slice(i + 6)]; };
      const common = strip(base);
      sh('ffmpeg', [...common, ...rate(kbps), '-pass', '1', '-f', 'mp4', '/dev/null']);
      // two-pass rate control can overshoot a few percent: re-run pass 2 scaled by the measured overshoot until it fits
      let k = kbps;
      let size = 0;
      for (let attempt = 0; attempt < 4; attempt++) {
        sh('ffmpeg', [...common, ...rate(k), '-pass', '2', '-movflags', '+faststart', out]);
        size = fs.statSync(out).size;
        log(`  ${path.basename(out)}: ${(size / 1e6).toFixed(2)} MB at ${k} kb/s ${size <= pf.maxBytes ? 'ok' : 'over, retrying lower'}`);
        if (size <= pf.maxBytes) break;
        k = Math.floor(k * (pf.maxBytes / size) * 0.985);
      }
      for (const f of fs.readdirSync(root)) if (f.startsWith(path.basename(log2))) fs.rmSync(path.join(root, f));
      if (size > pf.maxBytes) throw new Error(`${out} is ${size} bytes, over ${pf.maxBytes}`);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
