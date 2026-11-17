import base from './dennypratama.config';
import { defineProject } from '../src/config/schema';

/**
 * Same film as dennypratama.config.ts, with a cover for Dribbble thumbnails: film frame 264 (4.40 s, the homepage
 * fully loaded, the mark at three-quarter view, cursor clear of it) held for 0.5 s before the first-visit loader.
 * Shares the captured clips; every output file gets the "-cover" suffix, so the base renders are never touched.
 */
export default defineProject({
  ...base,
  variant: 'cover',
  cover: { at: 4.4, duration: 0.5 },
});
