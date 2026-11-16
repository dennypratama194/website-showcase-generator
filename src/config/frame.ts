import type { Project } from './schema';

/** Where the footage sits in the output: the whole frame, or the presentation's video frame (centred by default). */
export function videoRect(p: Project) {
  const W = p.output.width;
  const H = p.output.height;
  const pr = p.presentation;
  if (!pr) return { x: 0, y: 0, w: W, h: H, radius: 0 };
  const w = pr.video.width;
  const h = pr.video.height ?? Math.round((w * p.viewport.height) / p.viewport.width);
  return { x: pr.video.x ?? Math.round((W - w) / 2), y: pr.video.y ?? Math.round((H - h) / 2), w, h, radius: pr.video.radius };
}
