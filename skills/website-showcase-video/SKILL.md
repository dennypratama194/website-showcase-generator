---
name: "website-showcase-video"
description: "Make a cinematic Dribbble showcase video of a live website from its URL: one 1600x1200 MP4 under 20 MB, using the site's real loader, hero and signature interactions."
---

# Website showcase video

Input: a website URL (optionally its repo). Output: **one video**, `<id>-showcase.mp4`: 1600x1200 canvas, the film at
1440x900 centred on a warm canvas with 20 px corners, 60 fps, H.264 High, under 20 MB (Dribbble's per-video cap).
Capture at a 16:10 viewport (`viewport: { width: 1920, height: 1200 }`) so the 1440-wide film is 900 tall; a 16:9
viewport gives 810. Edit the film as one continuous take (no dissolves between sections); if it must be split into
scenes, join them with a hard cut at a still frame (nothing moving, pointer parked) so the join is invisible.
It opens on a 0.5 s cover (the fully loaded homepage) so the Dribbble thumbnail is never a black loader.
No chapters, no extra cuts. Typical length 30-45 s.

## Tooling

The generator (Playwright capture on a virtual clock + Remotion + FFmpeg, TypeScript) lives at
`https://github.com/dennypratama194/website-showcase-generator`. Clone it (shallow) into the working directory and run
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i`. If the repo is unreachable, ask the user to attach
`showcase-generator.tgz` and extract it. Chrome at `/usr/bin/google-chrome` (override with `CHROME_PATH`).
Read its README once. Reference config: `examples/dennypratama.config.ts` (copy it into `projects/`, never edit it for a new site; it predates the 16:10 and 1x defaults above, so change its viewport and deviceScaleFactor).

Commands (from the generator folder):
- `npm run check -- <id>` validate config, print timeline (instant)
- `npm run capture -- <id> [scene ...]` each scene in its own clean browser session
- `npm run render -- <id> --stills 5,15,30` composed frames in ~1 min, for layout checks and picking the cover
- `npm run make -- <id> [scene ...]` capture → render → validate → `out/<id>/<id>-showcase.mp4`
- `npm run match -- <id> <scene> <selector> <x0,x1> <glyphTopY>` scroll offset that reproduces a frame
- `npx tsx tests/dry.ts <id> <scene> <frames> <dpr>` no-screenshot run that writes the per-frame trace

Speed: capture at `deviceScaleFactor: 1`. The film is 1440 wide, so a 1920 capture already oversamples it; 2x costs
~1.3 s/frame on a 2-core machine against ~0.25 s/frame at 1x (a 40 s film: ~50 min vs ~10 min). Split the film into
scenes and capture them in parallel processes, and when revising, re-capture only the scenes that changed.
Capture costs more while WebGL is on screen. Run long captures in the background and poll;
start with the shortest scene to prove the config.

## Workflow

Set up a task list. Tell the user the length and storyboard before the long captures; otherwise proceed.

1. **Inspect the real site.** Read the repo if given; otherwise read the live DOM and scripts. List the loader,
   hero, and every signature interaction (pinned/scrubbed sections, hover previews, viewers, counters, footer
   effects). Measure each section's document top and height at 1920x1200 (`tests/measure.ts`). Never invent
   functionality and never redraw UI.
2. **Find fallbacks.** Look for code that disables effects on software GPUs, reduced motion, small screens or
   first-visit flags (e.g. a `?tunnel=force` debug flag, `gl-fail` classes, a "seen intro" localStorage key).
   Use the site's own flags only, and put the expected live-path classes in `expect` so a silent fallback fails
   the capture. Check the WebGL renderer string and real-time fps once (`npm run probe`) and record it.
3. **Storyboard from what exists**: first-visit loader (one clean session, recorded complete) → hero with a
   pointer move → the signature scroll moves → selected work → proof (testimonials/stats) → footer/contact as
   the closing identity. Include every section a client would care about; ask the user before dropping one.
4. **Write `projects/<id>.config.ts`**: scenes (path, `firstVisit` or seeded `storage`, `startScroll`,
   `pointerStart`, `preroll`, `duration`, `actions`), timeline shots (`from`/`to`, `cut`/`dissolve`/`fadeFrom`/
   `fadeTo`), `safeEdges` for fixed UI at the frame edges, `presentation: { background, video: { width: 1440,
   radius: 20 } }`, `output: { width: 1600, height: 1200, ..., platform: { name: 'dribbble', maxBytes: 20_000_000 } }`.
   Canvas colour: if the site has a light base colour, use it darkened ~6 levels per channel so the frame edge
   still reads over light sections; on dark sites use a warm off-white such as #E6E4DE.
   Add `cover: { at: <film seconds>, duration: 0.5 }` (set `at` in step 7). Dribbble uses a video's first frame
   as its thumbnail and offers no separate poster upload for video blocks, so the cover lives in the video.
   `npm run check` must pass before capturing.
5. **Capture** the shortest scene, inspect `out/<id>/clips/stills/<scene>/` and the `<scene>.trace.json`
   (pointer sent vs seen, wheel intended vs received, scrollY, hovered element), then the rest.
6. **Look at frames, not just logs.** Contact sheets of the stills for every scene before rendering.
7. **Pick the cover frame.** `render --stills` at several moments after the hero has finished revealing and
   before the first big move. Choose the frame where every hero element is fully in (no mid-fade text), the
   signature visual reads at its best angle, and the cursor sits clear of it. Look at it at full size, set
   `cover.at`. The render saves it as a lossless PNG (`out/<id>/<id>-cover-f<frame>.png`), holds it, and shifts
   the whole film (shots, captions, audio) by the exact cover frame count. Use a hard cut into the film; no
   transition.
8. **Render and validate**: `npm run make -- <id>` (or `render` then `validate --capped`). Inspect the contact
   sheet and representative full-size frames for blur, cropping, missing animation and glitches. Check frame 0
   is the cover (not black) and frame `cover frames` is the film's first frame. Never call it done before the
   actual MP4 passes validation and has been looked at.
9. **Deliver only** `out/<id>/<id>-showcase.mp4` (plus the cover PNG if useful), with one line on what is in
   it and any decision the user should know about.

To add a cover to an already-rendered project without touching its outputs, use a variant config:
`{ ...base, variant: 'cover', cover: { at, duration: 0.5 } }` (see `examples/dennypratama-cover.config.ts`).
It reuses the captures and suffixes every output with `-cover`.

## Craft rules (each one came from a real failure)

- **Accidental hovers.** Park the pointer where no interactive element passes under it while the page
  scrolls (beside the content column, below the nav, clear of fixed badges). Route glides so they never
  cross other hover targets. Element targets are re-measured every frame and held until the next pointer
  action, so the pointer rides an item while the page scrolls.
- **Keyboard focus rings.** Prefer clicking the site's own buttons over key presses; a key press switches
  the page to focus-visible and lights a focus ring.
- **Scroll-scrubbed counters/reveals.** The final value depends on scroll position. Keep scrolling until every
  counter has finished, and read the numbers in the last frame: a half-counted stat is a false claim on screen.
- **Match cuts.** When one scene ends where the next begins, start the next scene on the identical frame:
  take the final `scrollY` from the previous scene's trace (or `npm run match` on a glyph row), start the
  pointer where the last one stopped, and give returning-visit intros enough `preroll` (~1.9 s) for the nav to
  finish arriving. Verify by differencing the two frames. If something eased by a lerp lands differently
  (position depends on scroll history), use a 0.2-0.3 s dissolve instead of a hard cut.
- **Scroll lag reads as shake.** Chrome applies wheel scrolling asynchronously, so a frame can be shot before the
  page moves (trace: wheel Σ intended runs ahead of scrollY, then catches up next frame). It shows as a 1-2 frame
  up-and-down jitter, worst in pinned sections. After every capture, count trace frames where |intended - scrollY| > 1;
  it must be zero. For a page you control, add a capture-only flag that applies wheel deltas synchronously
  (non-passive wheel listener: preventDefault, accumulate deltaY, scrollBy the rounded step, carry the fraction) and
  pins by transform (ScrollTrigger `pinType: 'transform'`). Verify with `tests/dry.ts` before the long capture.
- **Pages that build layout after load** (GSAP pins, late-mounted sections) change the page height after the engine
  jumps to `startScroll`, so the jump gets clamped. Build pins synchronously at load, and prefer selector-based
  `startScroll` and scroll refs over absolute pixel values.
- **Holds read as hitches.** A fully frozen run right after a cut looks like a stall: trim into it.
- **Camera zooms crop fixed UI** (nav, badges pinned to the edge). Let movement come from scroll paths, the
  site's own 3D camera and the pointer; `safeEdges` makes `check` reject crops into fixed UI.
- **Live clocks** on the site show each capture's real time; mention it if it shows across a cut.
- **Trim dead air**: blank starts of pinned sections and long static holds after an animation finishes.

## What the engine already guarantees (do not re-solve)

Virtual clock (performance.now, Date, rAF, timers, CSS/WAAPI animations stepped per frame), the browser
animation timeline frozen in real time (Animation.setPlaybackRate 0, so async React commits cannot play
transitions during slow screenshots), input delivery confirmed before each frame, wheel deltas closed-loop
(Chrome scales CDP wheel deltas by DPR until the first scaled screenshot), document-relative screenshot clips,
stale stills cleared per run, Lanczos resample from the capture size, two-pass size-capped encode with retry on
overshoot. Limits: `<video>` elements and worker-driven players are not stepped; mention it if a site relies on them.

## Delivery

One MP4. Report: length, sections shown in order, the cover frame chosen, the file size against the 20 MB cap,
and anything the user should decide (a section left out, a fallback flag used, a site issue noticed). Remind
them to keep the video block as the shot thumbnail on upload, so the cover shows and hover plays the film.
Do not commit, push or deploy anything on the site.