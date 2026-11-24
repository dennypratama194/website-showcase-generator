# Website showcase generator

Give it a URL. Get back one cinematic, 60 fps video of the live site, sized for Dribbble (1600x1200, under 20 MB).

It records the real page in a clean browser, so you see the site's own loader, hero and animations, not a screen
recording with dropped frames. Then it edits, encodes and checks the result.

```bash
git clone https://github.com/dennypratama194/website-showcase-generator
cd website-showcase-generator
npm install
npm run make -- https://your-site.com
```

The video lands in `out/<site>/<site>-showcase.mp4`.

You need Node 20+, ffmpeg and Chrome. Not sure? Run `npm run doctor`. It checks all three and tells you what to install.

## What you get

The first run writes `projects/<site>.config.ts`: the site's own first-visit loader and hero, then a smooth scroll down the
page, on a soft canvas that matches the site's background. That is a good first cut for most sites and takes a few
minutes to render. Want a sharper film? Open that file and add the moves that make the site special: hovers, clicks,
extra scenes, captions. Re-run the same command and it reuses your edits.

| Command | What it does |
|---|---|
| `npm run make -- <url>` | Everything: capture, render, validate, one MP4 |
| `npm run make -- <url> --hd` | Plain 1920x1080 instead of the Dribbble canvas |
| `npm run make -- <site>` | Re-run an existing config (the name of a file in `projects/`) |
| `npm run new -- <url>` | Only write the config, so you can edit before rendering |
| `npm run check -- <site>` | Validate the config and print the timeline |
| `npm run preview -- <site>` | Fast half-size preview |
| `npm run doctor` | Check Node, ffmpeg and Chrome |

Add `--force` to `make` or `new` to regenerate a config you already have.

`examples/` holds a hand-built, 42-second storyboard for [dennypratama.com](https://dennypratama.com): seven scenes,
match cuts, a cover frame. Read it to see what the full config can do.

## Why it looks better than a screen recording

Real-time recording drops frames whenever the page takes longer than 16.7 ms to draw, and WebGL sites do on most
machines. This tool never records in real time. It replaces the page's clock (`performance.now`, `Date`,
`requestAnimationFrame`, timers, and every CSS and Web Animation) and steps it exactly 1/60 s per captured frame, however
long that frame took to draw. The result is a true 60 fps with every frame of every animation, on any computer, with no
GPU needed. Nothing on the site changes; only its clock does.

Mouse and scroll are delivered as real input events, so smooth-scroll libraries and scroll-driven effects react exactly
as they do for a visitor.

Limits: `<video>` elements and animation players that run in a worker are not stepped. If your site leans on them,
capture on a GPU machine with `CAPTURE_GPU=1`.

## Dribbble notes

- Dribbble caps video at 20 MB. The default output is a two-pass encode that lands just under that, and retries if it overshoots.
- Dribbble uses a video's first frame as its thumbnail, which would be the site's loader. Add `cover: { at, duration }`
  to your config to open on a held still of the finished page. Pick `at` with `npm run render -- <site> --stills 5,15`.
  Keep it in a variant config (see `examples/dennypratama-cover.config.ts`) so the base render stays untouched.

## Config reference

`projects/<site>.config.ts`, validated by `npm run check`.

| Field | What it does |
|---|---|
| `url`, `query` | the site, and query params for every scene |
| `viewport`, `deviceScaleFactor` | capture size. 2x, then downsampled, keeps type crisp |
| `scenes.<id>` | `path`, `firstVisit`, `storage`, `startScroll`, `pointerStart`, `preroll`, `duration`, `actions`, `expect` |
| `actions` | `pointer` glides, `scroll` camera keyframes, `click`, `key` |
| `timeline` | shots: `scene`, `from`/`to`, `in` (`cut`, `dissolve`, `fadeFrom`), `out` (`fadeTo`), `camera` |
| `captions` | text, timing, position, font (`npm run fonts -- <site>` pulls the site's own) |
| `safeEdges` | px of fixed UI at the frame edges; camera zooms that would crop into them fail `check` |
| `presentation` | the canvas colour and rounded video frame for a Dribbble-style post |
| `cover`, `variant` | the opening still, and a suffix so variants never overwrite each other |
| `output` | size, CRF, bitrate, preset, optional `audio`, and `platform` (name, size cap) |

`expect` makes a capture fail loudly instead of recording a silent fallback, for example a WebGL hero that quietly
swapped itself for a still image.

Building a hand-made storyboard: read the site's source, list its real interactions, storyboard only those, capture one short
scene (`npm run capture -- <site> <scene>`), look at `out/<site>/clips/stills/<scene>/`, then do the rest. Other tools:
`npm run render -- <site> --stills 5,15` (single composed frames), `npm run validate -- <site> [file.mp4]` (spec checks,
frame inspection, contact sheet), `npm run match` (find the scroll offset that reproduces a frame, for match cuts).

## Use it as a Claude skill

With the Claude skill `website-showcase-video`, you paste a URL and Claude runs all of this for you, reads the site,
and builds the storyboard.

The skill is in [`skills/website-showcase-video/SKILL.md`](skills/website-showcase-video/SKILL.md). Copy that folder into
`~/.claude/skills/` for Claude Code, or upload it as a skill in Claude. It covers the storyboard workflow and the craft
rules learned from real captures: 1440x900 framing at a 16:10 viewport, one continuous take, 1x capture for speed, and
a zero-lag check on the scroll trace so pinned sections never shake.

## Troubleshooting

- **"Not ready"**: run `npm run doctor` and follow what it says.
- **The WebGL hero shows a still image**: some sites check for a GPU before starting. Look for a debug flag in the
  site's source and pass it with `query`, or capture on a GPU machine with `CAPTURE_GPU=1`.
- **A capture is slow**: expected without a GPU. WebGL on software rendering can take minutes per scene. Timing in the video is unaffected.
- **Output over the size cap**: it retries up to four times with a lower bitrate. Shorten the film if it still fails.

## License

MIT
