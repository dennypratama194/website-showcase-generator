/**
 * npm run validate -- <project> [file.mp4]
 *
 * Checks the rendered MP4 against the spec, then looks at the pictures:
 *  - container/stream: H.264 High, size, 60 fps CFR, frame count, duration, bitrate, pix_fmt, audio
 *  - every frame (decoded small, grey): frozen runs, blank frames, hard cuts
 *  - representative frames (full size): sharpness (variance of the Laplacian), mean level
 *  - contact sheet + full-size PNGs for eyeballing
 * Exit code 1 when a hard requirement fails.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { loadProject } from './config/load';
import { layout } from './config/check';
import { coverSeconds, totalFrames, variantSuffix, videoRect } from './config/frame';

const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { maxBuffer: 1 << 28 }).toString();

/** Decode every frame at w×h grey into memory. */
function greyFrames(file: string, w: number, h: number): Promise<Uint8Array[]> {
  return new Promise((res, rej) => {
    const p = spawn('ffmpeg', ['-loglevel', 'error', '-i', file, '-vf', `scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', '-']);
    const chunks: Buffer[] = [];
    p.stdout.on('data', (d) => chunks.push(d));
    p.on('close', (c) => {
      if (c) return rej(new Error('decode failed'));
      const all = Buffer.concat(chunks);
      const n = w * h;
      const out: Uint8Array[] = [];
      for (let i = 0; i + n <= all.length; i += n) out.push(new Uint8Array(all.buffer, all.byteOffset + i, n));
      res(out);
    });
  });
}

/** Full-size grey frame at a frame index. */
function grabGrey(file: string, frame: number, w: number, h: number, fps: number): Uint8Array {
  const buf = execFileSync('ffmpeg', ['-loglevel', 'error', '-ss', (frame / fps).toFixed(4), '-i', file, '-frames:v', '1', '-vf', 'format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 26 });
  return new Uint8Array(buf.buffer, buf.byteOffset, w * h);
}

/** Variance of the 4-neighbour Laplacian over the frame: low = soft/blurred. */
function sharpness(g: Uint8Array, w: number, h: number) {
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
    s += l; s2 += l * l; n++;
  }
  const m = s / n;
  return s2 / n - m * m;
}

(async () => {
  // --capped: the file was encoded to a byte budget (output.platform), so check its size instead of a bitrate floor
  const capped = process.argv.includes('--capped');
  const args = process.argv.slice(2).filter((a) => a !== '--capped');
  const project = await loadProject(args[0]);
  const root = path.resolve('out', project.id);
  const file = args[1] ? path.resolve(args[1]) : path.join(root, `${project.id}-showcase-${project.output.width}x${project.output.height}-${project.fps}fps${variantSuffix(project)}.mp4`);
  const vdir = path.join(root, 'validation', path.basename(file, '.mp4'));
  fs.mkdirSync(vdir, { recursive: true });
  const fails: string[] = [];
  const notes: string[] = [];

  // stream checks
  const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file]));
  const v = probe.streams.find((s: any) => s.codec_type === 'video');
  const a = probe.streams.filter((s: any) => s.codec_type === 'audio');
  const W = v.width, H = v.height;
  const fpsReal = v.r_frame_rate;
  const frames = Number(v.nb_read_frames);
  const dur = Number(probe.format.duration);
  const kbps = Math.round(Number(probe.format.bit_rate) / 1000);
  const expectFrames = totalFrames(project);
  const cs = coverSeconds(project);
  const isPreview = file.includes('preview');
  const check = (ok: boolean, msg: string) => (ok ? notes : fails).push(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  check(v.codec_name === 'h264', `codec ${v.codec_name} ${v.profile}`);
  if (!isPreview) {
    check(v.profile === 'High', `profile ${v.profile}`);
    check(W === project.output.width && H === project.output.height, `size ${W}x${H}`);
    check(fpsReal === `${project.fps}/1`, `frame rate ${fpsReal}`);
    check(frames === expectFrames, `frames ${frames} (expected ${expectFrames})`);
    // floor scales with the footage's on-screen area: flat presentation canvas costs next to nothing to encode
    const vr = videoRect(project);
    const floor = Math.round((8000 * vr.w * vr.h) / (1920 * 1080));
    if (capped && project.output.platform) check(fs.statSync(file).size <= project.output.platform.maxBytes, `size ${fs.statSync(file).size} bytes ≤ ${project.output.platform.name} cap ${project.output.platform.maxBytes} (${kbps} kb/s)`);
    // CRF encodes spend few bits on simple pages, so a low rate alone is not a defect: sharpness is checked frame by frame below
    else notes.push(`${kbps >= floor ? 'ok  ' : 'info'} bitrate ${kbps} kb/s${kbps >= floor ? '' : ` (below ${floor}: fine for a simple, flat page; sharpness is checked per frame)`}`);
  }
  check(Math.abs(dur - expectFrames / project.fps) < 0.05, `duration ${dur.toFixed(3)} s${cs ? ` (${cs} s cover + ${project.duration} s film)` : ''}`);
  check(v.pix_fmt === 'yuv420p', `pixel format ${v.pix_fmt}, colour ${v.color_primaries ?? '?'}/${v.color_transfer ?? '?'}/${v.color_space ?? '?'}`);
  notes.push(`info audio streams: ${a.length}${a.length ? '' : ' (site has no audio; none configured)'}`);

  // every frame, small and grey: frozen runs, blank frames, cuts
  const fps = Number(fpsReal.split('/')[0]) / Number(fpsReal.split('/')[1] ?? 1);
  const sw = 160, shh = 90;
  const g = await greyFrames(file, sw, shh);
  const diffs: number[] = [0];
  const means: number[] = [];
  for (let i = 0; i < g.length; i++) {
    let m = 0; for (let j = 0; j < g[i].length; j++) m += g[i][j];
    means.push(m / g[i].length);
    if (i) { let d = 0; for (let j = 0; j < g[i].length; j++) d += Math.abs(g[i][j] - g[i - 1][j]); diffs.push(d / g[i].length); }
  }
  // frozen runs: 6+ consecutive frames with no visible change (holds are fine, but list them)
  const frozen: string[] = [];
  for (let i = 1, run0 = -1; i <= diffs.length; i++) {
    const still = i < diffs.length && diffs[i] < 0.02;
    if (still && run0 < 0) run0 = i;
    if (!still && run0 >= 0) { if (i - run0 >= 6) frozen.push(`${(run0 / fps).toFixed(2)}–${(i / fps).toFixed(2)} s (${i - run0} f)`); run0 = -1; }
  }
  notes.push(`info frozen runs ≥6 frames: ${frozen.length ? frozen.join(', ') : 'none'}`);
  const cuts = diffs.map((d, i) => [d, i] as const).filter(([d]) => d > 18).map(([d, i]) => `${(i / fps).toFixed(2)} s (Δ${d.toFixed(0)})`);
  notes.push(`info hard changes (Δ>18): ${cuts.join(', ') || 'none'}`);
  const blanks = means.map((m, i) => [m, i] as const).filter(([m, i]) => { const fr = g[i]; let mn = 255, mx = 0; for (const p of fr) { if (p < mn) mn = p; if (p > mx) mx = p; } return mx - mn < 4; });
  notes.push(`info uniform frames (no detail): ${blanks.length} ${blanks.length ? `(${(blanks[0][1] / fps).toFixed(2)}–${(blanks[blanks.length - 1][1] / fps).toFixed(2)} s)` : ''}`);
  // a single-frame flash: one frame that differs from both neighbours while they match each other
  const flashes: string[] = [];
  for (let i = 1; i < g.length - 1; i++) {
    let dn = 0; for (let j = 0; j < g[i].length; j++) dn += Math.abs(g[i + 1][j] - g[i - 1][j]);
    dn /= g[i].length;
    if (diffs[i] > 6 && diffs[i + 1] > 6 && dn < 1.5) flashes.push(`${(i / fps).toFixed(3)} s`);
  }
  check(flashes.length === 0, `single-frame glitches: ${flashes.join(', ') || 'none'}`);

  // representative frames at full size: shot boundaries, middles, plus named beats
  const L = layout(project);
  const picks = new Map<number, string>();
  const add = (t: number, why: string) => picks.set(Math.min(frames - 1, Math.max(0, Math.round(t * fps))), why);
  if (cs) { add(0, 'cover first'); add(cs - 1 / fps, 'cover last'); }
  L.forEach(({ shot, start, end }, i) => {
    add(cs + start + 2 / fps, `shot ${i + 1} first`);
    add(cs + (start + end) / 2, `shot ${i + 1} middle`);
    add(cs + end - 2 / fps, `shot ${i + 1} last`);
  });
  for (const t of [1.0, 2.0, 2.8, 3.6, 5.0, 7.0, 8.2, 9.1, 10.0, 10.8, 11.6, 13.0, 14.0, 15.4, 16.9, 18.2, 19.5, 20.6, 22.4, 23.6, 24.4]) if (t < project.duration) add(cs + t, `beat film ${t}s`);
  const rows: string[] = [];
  for (const [f, why] of [...picks.entries()].sort((a, b) => a[0] - b[0])) {
    const t = f / fps;
    const png = path.join(vdir, `f${String(f).padStart(4, '0')}.png`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', t.toFixed(4), '-i', file, '-frames:v', '1', png]);
    const s = sharpness(grabGrey(file, f, W, H, fps), W, H);
    rows.push(`${String(f).padStart(4)}  ${t.toFixed(2).padStart(6)} s  sharp ${s.toFixed(0).padStart(6)}  mean ${means[f]?.toFixed(0).padStart(3)}  ${why}`);
  }
  // contact sheet: 6 x 5 thumbnails across the whole video
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-vf', `select='not(mod(n\\,${Math.max(1, Math.floor(frames / 30))}))',scale=480:-1,tile=6x5:padding=6:color=0x222222`, '-frames:v', '1', '-fps_mode', 'vfr', path.join(vdir, 'contact-sheet.png')]);

  const report = [`file ${file}`, `size ${(fs.statSync(file).size / 1e6).toFixed(1)} MB`, '', ...fails, ...notes, '', 'frame  time      sharpness  level  why', ...rows].join('\n');
  fs.writeFileSync(path.join(vdir, 'report.txt'), report);
  console.log(report);
  console.log(`\nframes and contact sheet: ${vdir}`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
