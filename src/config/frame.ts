import type { Project } from './schema';

/** Seconds of cover held before the film starts. */
export const coverSeconds = (p: Project) => p.cover?.duration ?? 0;
/** Cover frames, rounded to whole frames so every shot shifts by an exact frame count. */
export const coverFrames = (p: Project) => Math.round(coverSeconds(p) * p.fps);
/** Full output length in frames: the cover plus the film. */
export const totalFrames = (p: Project) => coverFrames(p) + Math.round(p.duration * p.fps);
/** File-name suffix for a variant ('' for the base project). */
export const variantSuffix = (p: Project) => (p.variant ? `-${p.variant}` : '');

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
