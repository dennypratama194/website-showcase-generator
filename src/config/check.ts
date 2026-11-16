import type { Project, Shot } from './schema';
import { videoRect } from './frame';

/** Length of a shot on the final timeline, and how much it overlaps the previous one. */
export const shotLength = (s: Shot) => s.to - s.from;
export const overlapIn = (s: Shot) => (s.in && s.in.type === 'dissolve' ? s.in.duration : 0);

/** Start time (s) of every shot on the final timeline. */
export function layout(p: Project) {
  let t = 0;
  return p.timeline.map((s, i) => {
    const start = i === 0 ? 0 : t - overlapIn(s);
    t = start + shotLength(s);
    return { shot: s, start, end: t };
  });
}

/** Static checks that catch a broken config before an hour of capture. Returns problems; empty means fine. */
export function checkProject(p: Project): string[] {
  const out: string[] = [];
  const L = layout(p);
  const total = L.length ? L[L.length - 1].end : 0;
  if (Math.abs(total - p.duration) > 0.5 / p.fps) out.push(`timeline adds up to ${total.toFixed(3)} s, expected ${p.duration} s`);
  for (const { shot: s } of L) {
    const sc = p.scenes[s.scene];
    if (!sc) { out.push(`shot uses unknown scene "${s.scene}"`); continue; }
    if (s.from < 0 || s.to > sc.duration + 1e-9 || s.to <= s.from) out.push(`shot ${s.scene} ${s.from}–${s.to} is outside the captured 0–${sc.duration} s`);
    // a camera push crops the frame edges; refuse to crop into fixed UI declared in safeEdges
    if (s.camera && p.safeEdges) {
      for (const k of [s.camera.from, s.camera.to]) {
        const sc2 = k.scale ?? 1;
        if (sc2 <= 1) continue;
        const [ox, oy] = s.camera.origin ?? [0.5, 0.5];
        const { w: W, h: H } = videoRect(p);
        const cropL = ox * W * (1 - 1 / sc2) - (k.x ?? 0);
        const cropR = (1 - ox) * W * (1 - 1 / sc2) + (k.x ?? 0);
        const cropT = oy * H * (1 - 1 / sc2) - (k.y ?? 0);
        const cropB = (1 - oy) * H * (1 - 1 / sc2) + (k.y ?? 0);
        const e = p.safeEdges;
        const fail = (side: string, c: number, lim?: number) => lim !== undefined && c > 0 && c >= lim * 0.25 && out.push(`shot ${s.scene}: camera scale ${sc2} crops ${Math.round(c)} px off the ${side} edge, into fixed UI (${lim} px)`);
        fail('left', cropL, e.left); fail('right', cropR, e.right); fail('top', cropT, e.top); fail('bottom', cropB, e.bottom);
      }
    }
  }
  for (const [id, sc] of Object.entries(p.scenes)) {
    for (const a of sc.actions) {
      const end = a.type === 'pointer' ? a.at + a.duration : a.type === 'scroll' ? Math.max(...a.keys.map((k) => k[0])) : a.at;
      if (end > sc.duration + 1e-9) out.push(`scene ${id}: ${a.type} ends at ${end} s, after the scene's ${sc.duration} s`);
    }
  }
  for (const c of p.captions ?? []) if (c.from < 0 || c.to > p.duration || c.to <= c.from) out.push(`caption "${c.text}" ${c.from}–${c.to} is outside the timeline`);
  return out;
}
