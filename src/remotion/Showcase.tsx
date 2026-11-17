import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Img, OffthreadVideo, Sequence, continueRender, delayRender, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Caption, Project, Shot } from '../config/schema';
import { EASE, clamp01 } from '../config/ease';
import { layout } from '../config/check';
import { coverFrames, videoRect } from '../config/frame';

export type ShowcaseProps = {
  project: Project;
  /** per scene: file under public/clips to read (the 1080 lanczos copy unless a shot zooms) */
  clips: Record<string, string>;
  /** public path of the cover PNG (an exact frame of this same composition), when project.cover is set */
  cover?: string;
};

/** One shot: the captured footage, its virtual camera, and its own in/out transitions. */
const ShotView: React.FC<{ shot: Shot; src: string; dur: number }> = ({ shot, src, dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const u = clamp01(f / Math.max(1, dur - 1));

  // camera: interpolate scale and offset with the shot's easing
  const cam = shot.camera;
  let transform = 'none';
  if (cam) {
    const e = EASE[cam.ease ?? 'inOutSine'](u);
    const lerp = (a = 0, b = 0) => a + (b - a) * e;
    const s = lerp(cam.from.scale ?? 1, cam.to.scale ?? 1);
    transform = `translate(${lerp(cam.from.x, cam.to.x)}px, ${lerp(cam.from.y, cam.to.y)}px) scale(${s})`;
  }
  const origin = cam?.origin ? `${cam.origin[0] * 100}% ${cam.origin[1] * 100}%` : '50% 50%';

  let opacity = 1;
  if (shot.in?.type === 'dissolve') opacity = interpolate(f, [0, shot.in.duration * fps], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.inOutSine });
  const fadeIn = shot.in?.type === 'fadeFrom' ? { color: shot.in.color, o: interpolate(f, [0, shot.in.duration * fps], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.inOutSine }) } : null;
  const fadeOut = shot.out?.type === 'fadeTo' ? { color: shot.out.color, o: interpolate(f, [dur - shot.out.duration * fps, dur - 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.inOutSine }) } : null;

  return (
    <AbsoluteFill style={{ opacity, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform, transformOrigin: origin }}>
        <OffthreadVideo src={staticFile(src)} trimBefore={Math.round(shot.from * fps)} muted pauseWhenBuffering={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      {fadeIn && fadeIn.o > 0 && <AbsoluteFill style={{ background: fadeIn.color, opacity: fadeIn.o }} />}
      {fadeOut && fadeOut.o > 0 && <AbsoluteFill style={{ background: fadeOut.color, opacity: fadeOut.o }} />}
    </AbsoluteFill>
  );
};

/** Loads the site's own font files (downloaded by `npm run fonts`) before any caption frame renders. */
const useFonts = (captions: Caption[]) => {
  const [handle] = useState(() => (captions.length ? delayRender('fonts') : null));
  useEffect(() => {
    if (handle === null) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = staticFile('fonts/fonts.css');
    // a face is only fetched once text uses it, so ask for every caption's exact face before the first frame
    link.onload = () => Promise.all(captions.map((c) => document.fonts.load(`${c.weight ?? 400} ${c.size ?? 18}px "${c.font ?? 'system-ui'}"`, c.text)))
      .then((faces) => {
        captions.forEach((c, i) => { if (c.font && !faces[i].length) console.warn(`caption font "${c.font}" not found in fonts.css`); });
        continueRender(handle);
      })
      .catch(() => continueRender(handle));
    link.onerror = () => { console.warn('fonts.css missing: run npm run fonts'); continueRender(handle); };
    document.head.appendChild(link);
  }, [handle, captions]);
};

const POS: Record<NonNullable<Caption['position']>, React.CSSProperties> = {
  'bottom-left': { left: 48, bottom: 40 },
  'bottom-right': { right: 48, bottom: 40, textAlign: 'right' },
  'top-left': { left: 48, top: 36 },
  'top-right': { right: 48, top: 36, textAlign: 'right' },
  center: { left: 0, right: 0, top: '50%', textAlign: 'center', transform: 'translateY(-50%)' },
};

const CaptionView: React.FC<{ c: Caption; dur: number }> = ({ c, dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inn = clamp01(f / (0.5 * fps));
  const out = clamp01((dur - f) / (0.4 * fps));
  const o = Math.min(EASE.outCubic(inn), EASE.inOutSine(out));
  const y = (1 - EASE.outCubic(inn)) * 10;
  return (
    <div style={{
      position: 'absolute', ...POS[c.position ?? 'bottom-left'], opacity: o, translate: `0 ${y}px`,
      fontFamily: c.font ?? 'system-ui', fontSize: c.size ?? 18, fontWeight: c.weight ?? 400, color: c.color ?? '#ECEAE4',
      letterSpacing: c.letterSpacing ?? '0', textTransform: c.uppercase ? 'uppercase' : 'none', whiteSpace: 'pre',
    }}>{c.text}</div>
  );
};

export const Showcase: React.FC<ShowcaseProps> = ({ project, clips, cover }) => {
  const { fps } = useVideoConfig();
  const captions = project.captions ?? [];
  useFonts(captions);
  const r = videoRect(project);
  const cf = coverFrames(project);
  return (
    <AbsoluteFill>
      {/* the cover: one exact frame of the film, held as a still before anything plays */}
      {cf > 0 && cover && (
        <Sequence from={0} durationInFrames={cf} name="cover">
          <Img src={staticFile(cover)} style={{ width: '100%', height: '100%' }} />
        </Sequence>
      )}
      {/* the film, shifted whole by the cover length: every shot, transition and caption keeps its relative timing */}
      <Sequence from={cf} name="film">
    <AbsoluteFill style={{ background: project.presentation?.background ?? '#000' }}>
      {/* the film: shots, dissolves and fades all live inside the (optionally rounded) video frame */}
      <div style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: r.radius, overflow: 'hidden', background: '#000', isolation: 'isolate' }}>
        {layout(project).map(({ shot, start }, i) => {
          const from = Math.round(start * fps);
          const dur = Math.round((shot.to - shot.from) * fps);
          return (
            <Sequence key={i} from={from} durationInFrames={dur} premountFor={fps} name={shot.label ?? shot.scene}>
              <ShotView shot={shot} src={clips[shot.scene]} dur={dur} />
            </Sequence>
          );
        })}
      </div>
      {captions.map((c, i) => {
        const dur = Math.round((c.to - c.from) * fps);
        return (
          <Sequence key={`c${i}`} from={Math.round(c.from * fps)} durationInFrames={dur} name={`caption: ${c.text}`}>
            <CaptionView c={c} dur={dur} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
