/** npm run doctor: checks everything a run needs and says exactly what to install when something is missing. */
import { execFileSync } from 'node:child_process';
import { findChrome } from './capture/browser';

export type Problem = string;

const has = (cmd: string) => { try { execFileSync(cmd, ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } };

export function diagnose(): Problem[] {
  const out: Problem[] = [];
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) out.push(`Node ${process.versions.node} is too old. Install Node 20 or newer (https://nodejs.org).`);
  if (!has('ffmpeg') || !has('ffprobe')) {
    const how = process.platform === 'darwin' ? 'brew install ffmpeg' : process.platform === 'win32' ? 'winget install ffmpeg' : 'sudo apt install ffmpeg';
    out.push(`ffmpeg and ffprobe are not on your PATH. Install them: ${how}`);
  }
  if (!findChrome()) {
    out.push(process.env.CHROME_PATH
      ? `CHROME_PATH points at ${process.env.CHROME_PATH}, which does not exist.`
      : 'Google Chrome (or Chromium, Edge, Brave) was not found. Install Chrome, or set CHROME_PATH to its executable.');
  }
  return out;
}

export function assertReady() {
  const p = diagnose();
  if (p.length) throw new Error(`Not ready:\n  - ${p.join('\n  - ')}`);
}

if (process.argv[1]?.endsWith('doctor.ts')) {
  const p = diagnose();
  if (p.length) { console.error(`Not ready:\n  - ${p.join('\n  - ')}`); process.exit(1); }
  console.log(`Ready. Node ${process.versions.node}, ffmpeg, Chrome at ${findChrome()}`);
}
