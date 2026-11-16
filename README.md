# Website showcase generator

Cinematic, frame-accurate showcase videos of real websites. Playwright drives a clean browser on a
**virtual clock**, Remotion cuts the footage together, FFmpeg encodes the delivery file. One config per project.

```
npm run make     -- dennypratama            # everything: capture → render → validate → one video
npm run check    -- dennypratama            # validate config, print the timeline
npm run capture  -- dennypratama [scene…]   # each scene in its own clean browser session
npm run preview  -- dennypratama            # fast half-size preview
npm run render   -- dennypratama            # ProRes master → H.264 1920x1080 60fps
npm run validate -- dennypratama [file.mp4] # spec checks + frame inspection + contact sheet
npm run fonts    -- dennypratama            # only needed for captions: pulls the site's own font files
npm run match    -- <id> <scene> <sel> <x0,x1> <y>  # scroll offset that reproduces a frame (match cuts)
npm run render   -- dennypratama --stills 5,15     # single composed frames, ~1 min, for layout checks
```

The one deliverable is `out/<project>/<project>-showcase.mp4`: with `output.platform` set (Dribbble: 20 MB) it is
the two-pass, size-capped full-length file; otherwise the master.

Output lands in `out/<project>/`: `clips/` (captures + stills + per-scene manifest), `master.mov`,
the delivery MP4, and `validation/` (report, full-size frames, contact sheet).

## Why a virtual clock

Real-time headless recording drops frames whenever a frame takes longer than 16.7 ms to draw. Without a GPU,
WebGL falls to SwiftShader: the dennypratama.com tunnel runs at **2.7 fps** there. Screen recording that gives
you a slideshow.

`src/capture/virtualClock.ts` is injected before any site script and replaces the clock the page reads:
`performance.now`, `Date`, `requestAnimationFrame`, timers, and every CSS animation, CSS transition and
WAAPI animation (paused and stepped by hand, honouring `animation-play-state` so the site's own gating
still works). Each captured frame advances exactly 1/60 s however long it took to render, so the output is a
true 60 fps with every frame of every animation, on any machine. Nothing on the site changes; only its clock does.

Limits: `<video>` elements and Lottie-in-worker players are not stepped (none on this site). If a project
relies on them, capture with `CAPTURE_GPU=1` on a GPU machine and keep the virtual clock for the rest.

## Config (`projects/<id>.config.ts`)

| Field | What it does |
|---|---|
| `url`, `query` | site and query params for every scene (e.g. a site's own debug flag) |
| `viewport`, `deviceScaleFactor` | capture size; 2x then Lanczos-downsampled = crisp type |
| `scenes.<id>` | `path`, `firstVisit` (empty storage), `storage` seeding, `startScroll`, `pointerStart`, `preroll`, `duration`, `actions`, `expect` |
| `actions` | `pointer` glides (element targets re-measured every frame), `scroll` camera keyframes (monotone cubic, real wheel events), `click`, `key` |
| `timeline` | shots: `scene`, `from`/`to`, `in` (`cut`, `dissolve`, `fadeFrom`), `out` (`fadeTo`), `camera` (scale/x/y keyframes + ease + origin) |
| `captions` | `text`, `from`/`to`, `position`, `font` (the site's own, via `npm run fonts`), size, weight, colour |
| `safeEdges` | px of fixed UI at the frame edges; a camera zoom that would crop into them fails `check` |
| `output` | size, CRF, max bitrate, preset, optional `audio` |

`expect` makes a capture fail loudly instead of recording a silent fallback (for example, a WebGL hero that
quietly swapped itself for a still image).

## A new project

1. Read the site's source and list its real interactions: loader, hero, signature moves. Storyboard only those.
2. Copy `projects/dennypratama.config.ts`, change `url`, scenes, actions and timeline.
3. `npm run check`, capture one short scene, look at `out/<id>/clips/stills/<scene>/`, then capture the rest.
4. `npm run preview`, look, adjust, `npm run render`, `npm run validate`.

## GPU capture

`CAPTURE_GPU=1 CHROME_PATH=/path/to/chrome npm run capture -- <id>` launches Chrome with hardware
acceleration. The virtual clock still applies, so the result is identical in timing; a GPU only makes the
capture faster.
