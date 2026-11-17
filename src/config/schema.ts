/**
 * Project configuration for the showcase generator. One file per portfolio project
 * (see projects/*.config.ts). Everything a new project needs is declared here:
 * which scenes to capture, how the pointer and scroll move in each, how the shots
 * are cut together, camera moves, captions and export settings.
 */

/** A point in CSS pixels, or an element resolved in the page when the action starts. */
export type Point =
  | [number, number]
  | {
      selector: string;
      /** nth match, default 0 */
      index?: number;
      /** anchor inside the element's box, 0..1 (default 0.5) */
      ax?: number;
      ay?: number;
      /** fixed offset in CSS px, after the anchor */
      dx?: number;
      dy?: number;
      /** clamp the resolved x/y to an absolute value instead (useful to keep the pointer in a column) */
      x?: number;
      y?: number;
    };

export type Ease = 'linear' | 'inOutSine' | 'inOutCubic' | 'outCubic' | 'inCubic' | 'inOutQuart' | 'outQuart' | 'outExpo';

export type Action =
  /** Glide the pointer to a point. The site sees real pointermove events every frame. */
  | { type: 'pointer'; at: number; duration: number; to: Point; ease?: Ease }
  /**
   * Scroll camera: keyframes [sceneTime, value], interpolated with a monotone cubic so speed stays smooth
   * across keys. Delivered as real wheel events, so smooth-scroll libraries (Lenis) and scroll-scrubbed
   * effects respond exactly as they do for a person. `ref` decides what a value means:
   *  - 'start': CSS px relative to the scroll position when recording starts
   *  - { selector, edge, offset }: CSS px relative to that element edge sitting at the viewport top
   *  - { progressOf }: 0..1 progress through a tall element (0 = top at viewport top, 1 = bottom at viewport bottom)
   */
  | {
      type: 'scroll';
      ref: 'start' | { selector: string; edge?: 'top' | 'bottom'; offset?: number } | { progressOf: string };
      keys: [number, number][];
    }
  | { type: 'click'; at: number; target?: Point }
  | { type: 'key'; at: number; key: string };

export type Scene = {
  /** path on the site, appended to project.url */
  path: string;
  /** extra query params for this scene (merged over project.query) */
  query?: Record<string, string>;
  /** clean first visit: empty storage, so first-visit loaders play */
  firstVisit?: boolean;
  /** localStorage to seed before any page script runs (e.g. a "seen the intro" flag) */
  storage?: Record<string, string | '$now'>;
  /** instant scroll before recording starts */
  startScroll?: { selector: string; edge?: 'top' | 'bottom'; offset?: number } | number;
  /** where the pointer rests before the first action */
  pointerStart?: Point;
  /** seconds simulated before frame 0 is recorded (lets reveals or layout settle) */
  preroll?: number;
  /** recorded length in seconds */
  duration: number;
  actions: Action[];
  /** fail the capture unless these hold when recording ends (catches silent fallbacks) */
  expect?: { rootClassIncludes?: string[]; rootClassExcludes?: string[]; selectorVisible?: string[] };
  /** CSS selector whose class list is checked by `expect` (default html + first child of body) */
  rootSelector?: string;
};

export type CameraKey = { scale?: number; x?: number; y?: number };

export type Shot = {
  scene: string;
  /** in/out points inside the captured scene, seconds */
  from: number;
  to: number;
  /** how this shot arrives. Overlapping transitions shorten the timeline by their duration. */
  in?: { type: 'cut' } | { type: 'dissolve'; duration: number } | { type: 'fadeFrom'; color: string; duration: number };
  out?: { type: 'fadeTo'; color: string; duration: number };
  /** virtual camera across the shot; scale > 1 crops, so check `safeEdges` */
  camera?: { from: CameraKey; to: CameraKey; ease?: Ease; origin?: [number, number] };
  label?: string;
};

export type Caption = {
  text: string;
  /** seconds on the final timeline */
  from: number;
  to: number;
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | 'center';
  /** font family name as declared by the site (downloaded by `npm run fonts`) */
  font?: string;
  size?: number;
  weight?: number;
  color?: string;
  letterSpacing?: string;
  uppercase?: boolean;
};

export type Project = {
  id: string;
  url: string;
  /** query params added to every scene URL */
  query?: Record<string, string>;
  viewport: { width: number; height: number };
  /** capture pixel density. 2 keeps type crisp after downscaling and leaves room for camera moves */
  deviceScaleFactor: number;
  fps: number;
  /** requires a WebGL context that is not software-rendered when true and CAPTURE_GPU=1 */
  webgl?: boolean;
  scenes: Record<string, Scene>;
  timeline: Shot[];
  /** total length the timeline must add up to (seconds); validated */
  duration: number;
  captions?: Caption[];
  /** px at the frame edges that hold fixed UI; a camera move that crops into them fails validation */
  safeEdges?: { top?: number; right?: number; bottom?: number; left?: number };
  /**
   * Present the film inside a larger canvas (a Dribbble-style post): a background colour, with the video placed in a
   * rounded frame. Without it the footage fills the output. output.width/height are then the canvas size.
   */
  presentation?: {
    background: string;
    /** video frame size in output px; height follows the capture's aspect ratio when omitted */
    video: { width: number; height?: number; radius: number; x?: number; y?: number };
  };
  /**
   * A still cover held at the very start, so feeds that show the first frame as a thumbnail (Dribbble) show the
   * finished page instead of a black loader. `at` is the film time (s) of the frame to freeze; the whole film,
   * audio included, then plays after it, untouched.
   */
  cover?: { at: number; duration: number };
  /** suffix for every output file name, so a variant never overwrites the base renders */
  variant?: string;
  output: {
    width: number;
    height: number;
    crf: number;
    maxrate: string;
    bufsize: string;
    preset: string;
    /** optional audio file (relative to the project) to lay under the video; sites rarely ship any */
    audio?: string;
    /**
     * Size-capped platform exports cut from the same master, two-pass encoded to land just under `maxBytes`
     * (Dribbble: 20 MB per video). `chapters` (final-timeline seconds) split the film into separate uploads,
     * each with the full byte budget, for platforms that stack several videos in one post.
     */
    platform?: { name: string; maxBytes: number; width?: number; chapters?: { name: string; from: number; to: number }[] };
  };
};

export const defineProject = (p: Project) => p;
