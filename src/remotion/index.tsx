import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { Showcase, type ShowcaseProps } from './Showcase';
import { totalFrames } from '../config/frame';

const Root: React.FC = () => (
  <Composition
    id="Showcase"
    component={Showcase as unknown as React.FC<Record<string, unknown>>}
    // real values arrive as inputProps from src/render.ts; these only satisfy the Studio
    width={1920}
    height={1080}
    fps={60}
    durationInFrames={1500}
    defaultProps={{ project: null, clips: {} } as unknown as Record<string, unknown>}
    calculateMetadata={({ props }) => {
      const { project } = props as unknown as ShowcaseProps;
      return { width: project.output.width, height: project.output.height, fps: project.fps, durationInFrames: totalFrames(project) };
    }}
  />
);

registerRoot(Root);
