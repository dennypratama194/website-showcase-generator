import { defineProject } from '../src/config/schema';

/**
 * dennypratama.com, 25 s Dribbble showcase.
 *
 * Every shot is a real interaction already on the site (read from dennypratama-portfolio/src):
 *   Intro.tsx + home.css   loader: the d is drawn, turns 180° into the p, halves part (3.15 s, first visit only)
 *   Hero.tsx               WebGL2 ray-marched tunnel; pointer yaws the camera; scroll dives through the slash,
 *                          degree counter 000°→180°, four chapters, flash to bone
 *   WorkIndex.tsx          outline names wipe to ink on hover; live preview trails the pointer and leans
 *   CaseViewer.tsx         full-screen live concept; arrow keys step, each frame cuts in along the slash
 *   ContactFooter.tsx      email letters swell in width and weight near the pointer
 *
 * `tunnel=force` is the site's own test flag (Hero.tsx). It only skips the up-front device check so the
 * WebGL hero runs in a GPU-less capture browser instead of falling back to stills. Same shader, same code path.
 */
const INK = '#0C0C0B';

export default defineProject({
  id: 'dennypratama',
  url: 'https://dennypratama.com',
  query: { tunnel: 'force' },
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
  fps: 60,
  webgl: true,
  duration: 42.45,

  scenes: {
    // 0:00 loader → hero → dive through the slash → flash to bone. One clean first visit, one continuous take.
    opening: {
      path: '/',
      firstVisit: true,
      pointerStart: [1340, 790],
      duration: 12.1,
      actions: [
        // the pointer yaws the tunnel once the hero is up: a slow orbit around the mark
        { type: 'pointer', at: 4.0, duration: 2.2, to: [760, 520], ease: 'inOutSine' },
        { type: 'pointer', at: 6.4, duration: 3.0, to: [1080, 600], ease: 'inOutSine' },
        { type: 'pointer', at: 9.5, duration: 2.0, to: [960, 540], ease: 'inOutSine' },
        // the dive: plunge (0→.26), steady flight through the four chapters (.26→.885), ease into the flash
        { type: 'scroll', ref: { progressOf: '.hero-wrap' }, keys: [[6.0, 0], [7.4, 0.26], [11.0, 0.885], [11.8, 0.96]] },
      ],
      expect: { rootClassIncludes: ['gl-on'], rootClassExcludes: ['gl-fail'] },
      rootSelector: '.site',
    },

    // the work index rises in on bone, three names hovered, Noctua opened in the case viewer, then Morrow
    work: {
      path: '/',
      storage: { 'dp-intro': '$now' },
      // MATCH CUT: starts on the opening's last frame. Offset found with `npm run match -- dennypratama work .idx
      // 170,900 714` (header glyphs at y=714, as in opening frame 719); pointer where the opening left it.
      startScroll: { selector: '.idx', edge: 'top', offset: -891.5 },
      pointerStart: [960, 540],
      // the returning-visit intro fades the nav in over 1.25 s; let it finish so the nav matches the opening
      preroll: 1.9,
      duration: 9.6,
      actions: [
        // a beat on the landed heading, then the list rises; ends with the heading clear of the nav, five names on screen
        { type: 'scroll', ref: { selector: '.idx', edge: 'top', offset: -300 }, keys: [[0, -591.5], [0.35, -591.5], [1.9, -24], [5.4, 0]] },
        // the pointer meets the first name as it rises and rides it in (targets are re-measured every frame)
        { type: 'pointer', at: 0.35, duration: 1.0, to: { selector: '.idx .row-a', index: 0, x: 760 }, ease: 'inOutCubic' },
        { type: 'pointer', at: 1.6, duration: 0.7, to: { selector: '.idx .row-a', index: 0, x: 900 }, ease: 'inOutSine' },
        { type: 'pointer', at: 2.4, duration: 0.6, to: { selector: '.idx .row-a', index: 1, x: 700 }, ease: 'inOutCubic' },
        { type: 'pointer', at: 3.0, duration: 0.6, to: { selector: '.idx .row-a', index: 1, x: 830 }, ease: 'inOutSine' },
        { type: 'pointer', at: 3.7, duration: 0.6, to: { selector: '.idx .row-a', index: 2, x: 740 }, ease: 'inOutCubic' },
        { type: 'pointer', at: 4.3, duration: 0.5, to: { selector: '.idx .row-a', index: 2, x: 860 }, ease: 'inOutSine' },
        { type: 'click', at: 4.9 },
        // inside the viewer the pointer pushes the live agent graph aside
        { type: 'pointer', at: 5.2, duration: 0.9, to: [1250, 560], ease: 'inOutSine' },
        // the viewer's own Next button (a mouse click: the arrow key would light the keyboard focus ring on Close)
        { type: 'pointer', at: 6.3, duration: 0.7, to: { selector: '.lb-bot button', index: 1 }, ease: 'inOutCubic' },
        { type: 'click', at: 7.05 },
        { type: 'pointer', at: 7.3, duration: 1.8, to: [1000, 720], ease: 'inOutSine' },
      ],
      expect: { selectorVisible: ['.lb.on'] },
    },

    // the mark constructed: pinned, scroll draws it line by line (pivot, the 23.6° slash, eleven points) into a solid
    construction: {
      path: '/',
      storage: { 'dp-intro': '$now' },
      startScroll: { selector: '.con-wrap', edge: 'top', offset: 0 },
      // parked right of the content column, clear of every hover target, the nav and the ribbon
      pointerStart: [1850, 320],
      preroll: 1.9,
      duration: 4.4,
      actions: [
        { type: 'scroll', ref: { progressOf: '.con-wrap' }, keys: [[0, 0], [0.3, 0], [3.8, 1]] },
      ],
    },

    // blueprint on one side of the slash, the live site on the other: the heading rises, then scroll sweeps the live page in
    both: {
      path: '/',
      storage: { 'dp-intro': '$now' },
      startScroll: { selector: '.both-top', edge: 'top', offset: -300 },
      pointerStart: [1850, 320],
      preroll: 1.9,
      duration: 5.2,
      actions: [
        { type: 'scroll', ref: { progressOf: '.bs-pin' }, keys: [[0, -0.333], [0.3, -0.333], [1.4, 0], [4.6, 1]] },
      ],
    },

    // testimonials, one at a time: words rise, the quote lights as it is read, the next cuts in on the slash; then the stats count up
    proof: {
      path: '/',
      storage: { 'dp-intro': '$now' },
      startScroll: { selector: '.qs-pin', edge: 'top', offset: -860 },
      pointerStart: [1850, 320],
      preroll: 1.9,
      duration: 10.4,
      actions: [
        // ~1.9 s a quote at a steady pace, then on through the stats. Each one counts up and fills to ink as it passes
        // a scroll threshold (ScrollFx: count done at cover .45, ink at .55), so the camera keeps going until the last,
        // 5.0 Average rating, has finished: stopping earlier leaves it reading a wrong number ("2.0").
        { type: 'scroll', ref: { progressOf: '.qs-pin' }, keys: [[0, -0.306], [1.2, 0], [7.0, 1], [9.6, 1.588]] },
      ],
    },

    // finale: the footer rises in, the pointer sweeps the email and the letters swell under it
    closing: {
      path: '/',
      storage: { 'dp-intro': '$now' },
      // MATCH CUT: starts on the proof scene's last frame (its trace ends at scrollY 17714, #contact top is 18406)
      // and the pointer where proof left it, so the stats run straight on into the footer as one scroll
      startScroll: { selector: '#contact', edge: 'top', offset: -692 },
      pointerStart: [1850, 320],
      preroll: 1.9,
      duration: 4.2,
      actions: [
        { type: 'scroll', ref: { selector: '#contact', edge: 'top', offset: 0 }, keys: [[0, -692], [0.15, -692], [1.6, 0]] },
        { type: 'pointer', at: 1.0, duration: 0.7, to: { selector: '.ct-mail', ax: 0.08 }, ease: 'inOutCubic' },
        { type: 'pointer', at: 1.7, duration: 2.1, to: { selector: '.ct-mail', ax: 0.93 }, ease: 'inOutSine' },
      ],
    },
  },

  // 12.0 + 9.35 + 4.05 + 4.3 + 9.7 + 4.2 − 3 × 0.3 − 0.25 (dissolve overlaps) = 42.45 s
  timeline: [
    { scene: 'opening', from: 0, to: 12.0, in: { type: 'fadeFrom', color: INK, duration: 0.3 }, label: 'Loader · hero · dive' },
    // match cut: the dive's flash lands on the heading, and the work scene starts on that same frame. The scene holds
    // still for its first 0.35 s; entering at 0.25 keeps a 6-frame settle instead of a stop that reads as a hitch.
    { scene: 'work', from: 0.25, to: 9.6, in: { type: 'cut' }, label: 'Work index · case viewer' },
    { scene: 'construction', from: 0.35, to: 4.4, in: { type: 'dissolve', duration: 0.3 }, label: 'The mark, constructed' },
    { scene: 'both', from: 0, to: 4.3, in: { type: 'dissolve', duration: 0.3 }, label: 'Both sides of the line' },
    { scene: 'proof', from: 0.7, to: 10.4, in: { type: 'dissolve', duration: 0.3 }, label: 'Testimonials · stats' },
    // near-match out of the stats into one continuous scroll. Not a hard cut: the footer heading eases with a lerp,
    // so its position depends on scroll history and lands ~20 px apart; a short dissolve hides that (and the live clock)
    { scene: 'closing', from: 0, to: 4.2, in: { type: 'dissolve', duration: 0.25 }, out: { type: 'fadeTo', color: INK, duration: 0.6 }, label: 'Contact finale' },
  ],

  // the site shows its own type; no overlay captions by default (add { text, from, to } entries to use them)
  captions: [],

  // the nav sits in the top 80 px and the Awwwards ribbon is pinned to the right edge: zooming crops them
  safeEdges: { top: 80, right: 56 },

  // Dribbble post: 1600x1200 canvas, the film at 1440 wide (1440x810), centred, rounded like the reference shot.
  // Canvas is 6 levels under the site's bone (#ECEAE4), the same contrast the reference keeps, so the frame edge still
  // reads over the bone sections instead of dissolving into the background.
  presentation: { background: '#E6E4DE', video: { width: 1440, radius: 20 } },
  output: {
    width: 1600, height: 1200, crf: 14, maxrate: '32M', bufsize: '64M', preset: 'slow',
    // Dribbble: 20 MB per video (help centre, "Creating Dribbble Shots"); one full-length file, two-pass to fit
    platform: { name: 'dribbble', maxBytes: 20_000_000 },
  },
});
