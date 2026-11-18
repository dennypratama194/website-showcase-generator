// Browser launch settings. Chrome is found automatically; override with CHROME_PATH.
// Set CAPTURE_GPU=1 on a machine with a real GPU for faster WebGL capture (timing is identical either way).
import fs from 'node:fs';

const CANDIDATES: Record<string, string[]> = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'],
  win32: [
    `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ],
};

/** The browser to capture with, or undefined when none is installed. */
export function findChrome(): string | undefined {
  if (process.env.CHROME_PATH) return fs.existsSync(process.env.CHROME_PATH) ? process.env.CHROME_PATH : undefined;
  return (CANDIDATES[process.platform] ?? []).find((p) => fs.existsSync(p));
}

export const CHROME_PATH = findChrome() ?? process.env.CHROME_PATH ?? '/usr/bin/google-chrome';

const GPU = process.env.CAPTURE_GPU === '1';

export const CHROME_ARGS = [
  '--hide-scrollbars',
  '--force-color-profile=srgb',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--autoplay-policy=no-user-gesture-required',
  ...(GPU
    ? ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=default']
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
];
