# Ẹ̀rọ Labs

Immersive scroll site for the studio. No frameworks, no build step, no
dependencies — three files and a `<link>` to Google Fonts.

```
index.html    markup + copy
styles.css    the whole visual system
main.js       the travel engine
build.mjs     optional: inlines everything into dist/
netlify.toml  deploy config
```

Open `index.html` over any static server (`python3 -m http.server 4173`).
Opening it via `file://` works too, minus the fonts.

## The travel engine

The page is **not** a stack of sections. It is one 2D world with a camera
in it. Scroll drives the camera along a fixed route:

```
          (0,0) hero
             ↓↘
        (62,104) about
             ↓
        (62,214) projects
             ←
       (-44,220) case studies
             ↓↘
        (30,330) reach us
```

Coordinates live on each `<section class="stop">` as `data-x` / `data-y`,
in **percent of viewport** (`data-x="62"` = 62vw right of origin). Move a
stop by editing those two numbers — the route line, the HUD readout, the
nav jump targets and the parallax all follow automatically. Nothing else
needs touching.

Three layers translate against that camera at different rates, which is
where the depth comes from:

| layer       | rate  | paints | holds                                |
|-------------|-------|--------|--------------------------------------|
| `.layer-bg` | 0.45× | 1st    | ghost numerals, frames, faint glyphs |
| `.layer-fg` | 1.34× | 2nd    | thin light rules that streak past    |
| `.layer-mid`| 1.00× | 3rd    | the route line, then all content     |

Note the paint order: "foreground" describes how *fast* that layer moves,
not what covers what. Content is always the topmost layer, and inside it
the route line sits at `z-index: 0` with every `.stop` at `1` — so nothing
decorative ever crosses type.

## The mast

The hero's right column is a vertical axis with the studio's four rooms —
and the aperture mark — orbiting it. Pure CSS 3D, no WebGL: `.pole` holds
the `perspective`, `.pole-stage` has `transform-style: preserve-3d`, and
`poleUpdate()` writes each item's `translate3d(x, y, z)` every frame. Depth
drives opacity, so items swinging behind the pole dim and recede.

**The mast is the real navigation on the hero** — not a decorative twin.
Only ever one menu is live at a time:

| where you are        | live menu | the other one            |
|----------------------|-----------|--------------------------|
| hero (`heroD ≤ .78`) | the mast  | top menu `inert`, faded  |
| anywhere else        | top menu  | mast `inert`, opacity 0  |

The swap is driven by `heroD` in the frame loop and applied with the `inert`
attribute, so pointer and keyboard agree — you can never tab into a menu you
cannot see. Reduced motion skips the mast and shows the top menu outright.

It spins from three sources, which is what stops it feeling mechanical:

| source        | where                                  |
|---------------|----------------------------------------|
| idle drift    | `dt * .00015` — always turning slowly  |
| drag          | pointer down anywhere on the mast      |
| scroll torque | `scrollVel * 8` — it spins as you leave |

**Click vs drag.** A press stays a click until it travels more than 5px,
at which point it becomes a drag. This matters more than it sounds: calling
`setPointerCapture` on `pointerdown` retargets `pointerup` to the mast, so
the browser fires `click` on the mast instead of the button and navigation
silently dies. So capture happens only once a drag is real, and the click
trailing a genuine drag is swallowed in the capture phase.

Each orbit item is centred by its **own** transform (`translate3d(...)
translate(-50%,-50%)`), not by an inner span. If the inner element carries
the centring, the visible label shifts but the button's hit box stays put,
and you end up clicking empty space down-right of the text.

The mast belongs to the hero and fades out as the camera travels away
(`heroD` in the frame loop). The header nav is the keyboard-accessible
twin — mast items are `tabindex="-1"` and the stage is `aria-hidden`, so
screen readers get one clean set of links, not two.

## Back to top

On the hero the mast makes navigation obvious. Off it, the mast is gone and
nothing says the wordmark is the way home — so on **each new arrival** a
star shoots along a rail beneath it. It fires on arrival (`nearD < .35`),
not at the midpoint where the nearest-stop index flips, so it plays while
you are looking at the section rather than mid-flight between two.

It never fires on the hero, where the mast is already doing that job.

Hovering the wordmark holds the rail steady, so the affordance is still
there after the animation has passed, and `title="Back to top"` covers the
case where someone missed both.

## The progress rail

A 3px rail across the top of the viewport. The fill is the brand gradient
laid out at `220%` width and scrolled by a 7s `flow` animation, so the
colour moves through the bar independently of your scrolling — it reads as
alive even when the page is still.

The head throws a beam ahead of itself — a soft radial flare on a 1.9s
pulse, plus a hard white tick with a double glow, so the leading edge reads
as a light travelling the bar rather than a bar simply getting longer.

The head of the fill carries a small white tick and the percentage, in the
faint grey (`--ink-3`) so it never competes with content. The label flips
side near either end (`.at-start` / `.at-end`) so it can't clip off screen.

## A different world every load

Re-rolled on each visit, in `main.js`:

- **layer depths** — `bg` between 0.30–0.58, `fg` between 1.16–1.54, so the
  parallax separation is never quite the same
- **stop jitter** — each stop shifts up to ±3.2vw / ±2.4vh
- **set dressing** — positions jittered, and ~18% of elements dropped
- **node field** — positions, depths and which links carry pulses
- **mast rotation** — a different face toward you on arrival

The **route is never randomised**. Stop order and direction are fixed, so
the journey always reads ↓↘ ↓ ← ↓↘ exactly as briefed — only the world
around it changes.

## The idle melt

Stop scrolling for fifteen seconds and the section you stopped on liquefies —
and keeps liquefying. `meltT` simply accumulates for as long as you leave it
alone, and everything else is a function of it. Any scroll, click, key or
drag brings it back in about 0.4s, at the same speed however deep the melt
had got.

Two shapes matter, and both were wrong on the first attempt.

**The onset has to be invisible.** A plain exponential like `1 - e^(-s/1.8)`
is 67% deep two seconds in — you watch it arrive, which defeats the point.
Every curve now leaves zero with zero *slope*:

```
gate = 1 - e^(-(s/8)^2.5)      the slow opener
sag  = (120 + 14*s) * gate     no ceiling past the opening
```

**The tail must never settle.** An asymptote looked identical at 60s and
180s, which reads as the melt having stopped. The linear term keeps it
alive; given long enough the section drips out of frame entirely.

| melting | sag     | displacement | stretch |
|---------|---------|--------------|---------|
| 1s      | 0.7px   | 0.4          | 1.00    |
| 3s      | 13px    | 4.7          | 1.01    |
| 8s      | 147px   | 33           | 1.25    |
| 20s     | 400px   | 84           | 1.76    |
| 60s     | 960px   | 212          | 2.14    |
| 2min    | 1800px  | 404          | 2.20    |

The two curves converge by about 12s, so the long drag is unchanged — only
the opening is different. With `MELT_AFTER` at 15s, nothing is visible until
roughly 18 seconds of stillness.

Blur and stretch do settle, deliberately. Unbounded blur gets expensive and
unbounded stretch turns to mush; the sense of continuous motion comes from
the sag, which is the part you actually watch.

Three performance decisions hold this together:

- **The filter only exists while melting.** `.melting` is added and removed
  by the engine, so a page in normal use computes `filter: none` and pays
  nothing.
- **The transform is free, the filter is not.** The sag is a composited
  transform written every frame; the displacement map re-rasterises the
  whole section, so it is written at ~15fps. At this speed nobody can tell.
- **Once the section has dripped past the bottom of the frame** the
  displacement stops being written at all — nobody can see a smear that is
  off-screen. The sag keeps moving regardless, so nothing appears to stall.

Tuning: `MELT_AFTER` (15000ms) and the two coefficients in `sag`. Mobile
drops the displacement for blur alone — a filter over a full section is too
expensive there. Reduced motion skips it entirely.

## Audio

`audio/ambient.mp3` — 3.0 MB, 4:11, looping, ~64kbps.

Browsers refuse to start audio without a user gesture, so the loader **asks
before it lets anyone in**: it runs its calibration to 100%, then offers
"Sound on" / "Sound off". Either choice enters the site; the click is the
gesture. If `play()` is still refused the rig quietly reverts to muted
rather than showing a control that lies about its state.

After that, volume lives in the nav, to the left of the CTA: a mute toggle
and a slider whose fill shows the level in brand blue. Mobile keeps the
toggle and drops the slider.

**The slider shows what you can hear**, not the setting behind it — so when
a melt pushes the level up, the thumb rides up with it. Without that the
sound swells while the control sits still, which reads as a broken slider.
Touching either control hands control straight back: `boost` drops to 1 at
once and is held there for 1.2s, so the slider responds immediately instead
of fighting a melt that is still fading.

**The melt drives the volume.** For every second a section is left to drip,
the bed gets 7% louder:

```
volume = base × (1 + 0.07 × secondsMelting)
```

At the default 0.35 base that reaches full at about 26s into the melt — so
roughly 41s of stillness. Scrolling returns it to base over ~0.3s. The
boost is eased rather than stepped, and the speaker icon turns violet while
it is running, so the change is visibly attributable to something rather
than seeming like a fault.

The audio ships as a separate file on the real site — cacheable across
visits, and a 4 MB data URI in the markup would block parsing. Only the
single-file artifact build embeds it as base64.

## Two overlay rules worth keeping

Both of these produced bugs that looked like "the buttons don't work":

- **The custom cursor must outrank every overlay.** `body { cursor: none }`
  hides the real pointer, so if `.cursor` (z-index 101) ever sits below
  something — the loader was z-index 100 — you are aiming blind. The clicks
  land fine; you just cannot see where.
- **`visibility` is transitioned, `pointer-events` is not.** `#loader.done`
  fades over 0.7s, and for that whole time a `visibility: visible` overlay
  keeps swallowing clicks across the entire viewport. `pointer-events: none`
  in the same rule takes effect immediately.

## Cursor lights

Sparks are emitted by *movement*, never by position: the pointer handler
measures px/ms between events and only emits above `0.06`. Each spark
carries a fraction of the cursor's velocity, drifts, and burns out in
700ms under `globalCompositeOperation = 'lighter'`. A soft halo tracks the
cursor with its alpha tied to recent speed, decaying `0.9` per frame.

Hold the cursor still and the field goes completely dark within about a
second. That is the intended behaviour, not a bug.

## Type

Display is **Sora at weight 200**, never heavier. Weight, not size, is what
makes large type feel bulky — the headlines are big and light on purpose.
**IBM Plex Mono 300** carries every label, index and readout. Poppins 600 is
loaded for one thing only: the wordmark, which has to match the logo.

There are no cards anywhere. Structure comes from hairlines, mono labels and
whitespace, so the black ground and the canvas stay the loudest things on
screen.

**Dwell.** Each leg of the journey spends its first and last 17% parked at
a stop (`DWELL`), then eases across the middle. That is what makes it feel
like travelling between places rather than sliding a panel. Raise `DWELL`
for longer pauses, lower it for a more continuous glide.

**Leg length.** `LEG = 1.55` viewport-heights of scroll per leg. Lower it
and the site gets shorter and faster.

**Inertia.** The camera lerps toward its scroll target at `0.09`/frame, so
it arrives with weight instead of snapping. This is the single number that
most changes how "premium" the movement feels — try `0.06` for heavier.

## Things worth knowing

**Every stop auto-fits its frame.** `fitStops()` measures each section and
scales it down if it would overflow the viewport (`--fit`). This is why you
can add a paragraph without anything getting clipped. It also means a very
long section quietly shrinks — if `--fit` drops below ~0.8, cut copy rather
than letting it shrink further.

**The route is one continuous spline.** Stops are joined with a Catmull-Rom
curve converted to beziers, which matches tangents across every joint. Per-
segment beziers meeting at a shared point still kink, because their tangents
disagree — that produced a hard elbow through the middle of Projects.

**The route recedes when you arrive.** Its opacity is driven by `nearD`: 0.10
parked at a stop, up to 1.0 mid-transit. It marks the journey, so it has no
business competing with a section you are actually reading.

**The Projects flow** (`projFlow()`) is five lanes, one per project, with
packets running left to right through gates. A packet reaching a gate has a
30% chance of rerouting to a neighbouring lane, and the diagonal it takes is
the whole point — that is work being handed off between systems, not a
decorative loop. Lanes are measured with `offsetTop` rather than
`getBoundingClientRect`, because the stop carries a `scale()` and rects come
back in scaled pixels while the canvas is sized in layout pixels. It only
animates while Projects is on screen.

**The route line is the automation metaphor.** It's generated in `buildRoute()`
from the same coordinates the camera uses, and the glowing trail draws itself
to exactly your scroll position. The white pulse riding it is you.

**The node field** (`#field` canvas) is world-space, not screen-space — nodes
have fixed positions and their links are computed once at load, so panning
past them reveals genuine structure rather than random noise. Cursor pushes
them aside within 150px.

**`?stop=N` / `#stop=N`** lands the camera directly on stop N with entrance
animations disabled. Handy for screenshots and OG images.

**Reduced motion** is a real fallback, not a disabled site: `prefers-reduced-motion`
collapses the world into an ordinary vertical document with everything visible.
Worth testing before launch (macOS: System Settings → Accessibility → Display →
Reduce motion).

**Mobile** scales lateral travel to 42% (`xScale`) so the horizontal legs stay
legible on a narrow screen, and the hover-preview panel is disabled on touch.

## Before this goes live

- [ ] **Logo** — the wordmark is rebuilt in HTML/SVG (`.wordmark` in `index.html`,
      the aperture as `<symbol id="aperture">`). It is a close match, not the
      original vector. Drop in the real SVG if you have it.
- [ ] **Project names** are placeholders describing real work generically —
      Studio OS, Change Note, Signal, Release Room, Showroom. Confirm what you
      want named publicly before publishing; no client is currently identified.
- [ ] **The case study** is one composite story with illustrative numbers
      (94%, 9 hours). Replace with a real engagement and real figures.
- [ ] **Email** is `hello@erolabs.studio` in two places — `index.html` footer
      and the `mailto:` in `composer()` in `main.js`.
- [ ] **Social links** are `href="#"`.
- [ ] **The contact composer** builds a `mailto:`, so enquiries land in whatever
      mail client the visitor has. If you want them captured server-side instead,
      a Netlify Form or a Make webhook drops straight into `#sendBrief`.
- [ ] **OG image** — none set. Capture `?stop=0` at 1200×630.
