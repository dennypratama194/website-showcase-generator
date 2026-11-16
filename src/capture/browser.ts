// Browser launch settings. Override with CHROME_PATH / CAPTURE_GPU=1 on a machine with a real GPU.
export const CHROME_PATH = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';

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
