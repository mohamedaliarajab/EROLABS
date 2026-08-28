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

## The films

`media/intelligence.mp4`, `automation.mp4`, `design.mp4` — the three cuts from
`../video-kit`, mapped as that kit's README specifies (`mind` → intelligence,
`reel` → automation, `design` → design). 1920x1080, ~31s each, silent, ~13 MB
apiece. Posters are JPEG at 1280px (~60 KB each); the PNGs they came from were
2.2 MB and would have delayed the first frame.

- **Parallax**: the pointer drifts the film inside its frame (`--px`/`--py` on
  the card), so the card has depth without the layout moving.
- **They only decode while Projects is on screen** — `filmsLive()` is called
  from the frame loop when the nearest stop changes, not every frame.
- **Clicking lifts the film to 75% of the viewport.** The `<video>` element is
  *moved* into the lightbox and moved back on close, so playback is never
  interrupted and a second decode is never started.
- **The lightbox lives at body level, outside `#viewport`** — which is what
  keeps a film crisp and playing while the page behind it melts. Verified: with
  the Projects stop sagging 300px, the film frame's transform is unchanged.
- Close with the X, the scrim, Escape, or moving the pointer out — armed only
  once the pointer has been inside. Closing calls `clearMelt()` and `wake()`.

**The artifact cannot carry them.** 40 MB of film against a 16 MB cap, so
`build.mjs` swaps each `<video>` for its poster as an `<img>`. The cards look
and parallax identically there, and no lightbox opens onto an empty frame.
`case.mp4` (115s) and `case-reel.mp4` (32s) are still waiting in the kit for
`data-slot="case-company-a"`.

## The reading view

Dense blocks are legible at a glance but hard to actually read at the size the
frame allows. Dwelling on one for 420ms (or clicking it) lifts it into a glass
panel at 75% x 75% of the viewport — headings go from ~11px to ~39px, body from
~11px to ~18px — and blurs everything behind it. Close with the X, the scrim,
or Escape.

Applied to the case study only — the brief, the four steps, the figures strip
and the three tables, 9 blocks. **About and Projects are deliberately
excluded**; those sections have their own plans. Don't add them back unasked.

**The glass** is a heavy backdrop blur with saturation pushed past 1, a
specular sheen drifting across the top, and light/dark inset lines for
thickness. A conic sweep clipped to the border ring runs the outline — spun
with `rotate()` rather than an animated `@property` angle, so it works
everywhere.

**Closing**: the X, the scrim, Escape, or moving the pointer out of the panel.
That last one only arms once the pointer has actually been *inside* — opening
from a block near the screen edge leaves the cursor outside the panel, and
without the guard the same motion that opened it would close it.

**Whatever the copy does not fill becomes a stage.** The panel is large and
the text rarely reaches the bottom, so `.reader-body` is `flex: 0 1 auto` and
`.reader-stage` takes everything left over — short blocks get a large animation,
long ones (the tables) shrink it to its `min-height` and scroll the body
instead. Verified: a table panel gives 479px of body, 144px of stage, inside a
675px glass, with nothing overflowing.

Each block declares `data-vis`, and the stage draws to suit:

| mode | block | what it shows |
|------|-------|----------------|
| `scatter` | Problem | jobs drifting, links flickering, some simply lost |
| `measure` | Process | a caliper sweeping a timeline; four segments matter |
| `route` | Solution | a packet through five stages, with an escalation arc |
| `steady` | Result | a calm wave and one steady mark a month |
| `climb` | brief, figures, tables | bars rising to a trend line |

Three details that matter:

- **The block is cloned, not moved.** Reparenting a node out of the world would
  wreck the camera layout it sits in. The clone drops `.cat-media`, `canvas`
  and `video`, since a cloned video would play over the original and a cloned
  canvas is dead pixels.
- **The melt never touches the panel.** Only the page melts. A panel — or a
  film — sits above the world at body level and stays crisp; it is not part of
  what the camera is travelling through. Whatever is lifted is only affected
  once it is back in place.
- **Closing counts as activity.** It calls `clearMelt()` and `wake()`, so a
  melt that crept in while reading is gone the moment the panel closes, exactly
  as if you had scrolled.

A dwell rather than an instant hover, because a full-screen takeover on a
twitch of the mouse would be intolerable.

## The case study

Company A, facility management, Lagos. Four steps on a drawn spine (Problem,
Process, Solution, Result), then a film slot beside three tabbed tables —
Hours, Errors, Return. Only one table is in the DOM flow at a time, which is
what keeps the section inside its frame.

**The figures are a model, not measured results.** The on-page badge saying so
was removed on request — so nothing on the page now states it. If these are ever
shown to a client as measured outcomes, that is a claim the page no longer
qualifies.

**The film sits in the head row**, in the space the badge left, as a small
looping thumbnail rather than a block in the layout — the densest stop on the
site gains a film without gaining a pixel of height. It is `preload="none"` and
plays only on hover, so its 14 MB is fetched only when someone looks at it.
`case-reel.mp4` (32s, web weight) is the cut in use; the kit's `case.mp4` is the
115s cut at 33 MB if you would rather have it.

**Short on the page, whole in the panel.** Each step carries a two-line
`.cs-short` and the full `.cs-full` hidden beside it; the reading view swaps
them. That took the track from 305px to 162px and the section's `--fit` from
0.74 to 0.86 — table text from 8.7px to 10.1px — without losing a word.

**On density.** This is the tightest stop on the site: `--fit` sits near 0.80
at 1440x900, which is why the reading view exists — any block can be opened at
a comfortable size. Worth understanding before editing it — `fitStops` scales the
whole section uniformly, so **raising a font size does not make text bigger on
screen**, it just lowers the fit by the same factor. The only way to make the
tables more legible is to spend less height on everything around them. That is
why the film slot is modest and the section heading runs a step smaller than
the others. If the video needs to be larger, move the tables behind a toggle
rather than shrinking the type.

## The enquiry form

Five required fields — company, email, phone, the problem, the outcome.
Submitting shows "Problem received, we will solve it" letter by letter over a
violet bloom, holds for five seconds against a draining bar, then hands back
a cleared form for the next enquiry.

**It only claims to have received something when it has.** Delivery goes to
FormSubmit, which needs no account and no key — it emails whatever it receives
to the address in the endpoint URL, and its `/ajax/` route answers with CORS so
the page never navigates. If the POST fails, the form says so and offers the
email address instead; a confirmation for an enquiry that went nowhere is worse
than any error message.

**One-time activation, and nothing is delivered until it is done:** the first
submission makes FormSubmit send a confirmation link to `ENQUIRY_EMAIL`. Open
it once and every enquiry after that arrives in seconds. To route through Make
instead, set `ENQUIRY_WEBHOOK` at the top of `main.js` — it takes precedence
and posts plain JSON.

**No boxes anywhere.** The inputs are borderless and transparent; the
travelling glow beneath and the label colour are the focus indicator, so the
global focus ring is suppressed on them. Chrome's autofill is the one thing
that will draw a solid background and override the violet text — it is
defeated with a 600000s `background-color` transition plus
`-webkit-text-fill-color`, which is genuinely the only reliable way.

Validation is inline and specific: empty fields and a malformed email get
different messages, the offending field takes focus, and the error colour
(`--warn`) is deliberately not the brand accent.

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

Stop scrolling for twenty seconds and the section you stopped on liquefies —
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

Tuning: `MELT_AFTER` (20000ms) and the two coefficients in `sag`. Mobile
drops the displacement for blur alone — a filter over a full section is too
expensive there. Reduced motion skips it entirely.

## Audio

`audio/ambient.mp3` — "Echoes Without Words", 1.91 MB, 4:10, looping.
CBR 64kbps, 44.1kHz stereo, encoded from the 45.7 MB WAV.

Two encoding notes, since this Mac has no ffmpeg, lame or sox:

- `afconvert` (built into macOS) lists MP3 as a file type but **cannot
  encode it** — CoreAudio ships an MP3 decoder only. LAME came from the
  `lameenc` Python wheel in a throwaway venv.
- **CBR, not VBR, deliberately.** VBR at q7 was slightly smaller (1.87 MB)
  and better sounding, but `lameenc` writes no Xing header — so players
  derive duration from the first frame and got **357s for a 250s track**,
  43% wrong. With `loop` on the audio element that matters. CBR needs no
  header and the browser reports 249.89s against a 249.84s source.

Feed LAME 44.1kHz, not the original 48kHz: below ~96kbps it silently drops
to MPEG-2 and halves the output rate to 24kHz, which caps the bandwidth
around 12kHz and takes the air off an ambient pad. `set_out_sample_rate`
pins it.

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

## Aurora

Five seconds after a melt begins, an aurora rises behind the world: curtains
of blue and violet streaming up from below the frame, folding and drifting,
brightening on the low end of the music.

It is a **fragment shader**, because real curtains need noise flowing along
the rays and there is no honest way to fake that with gradients. Layered
value-noise FBM in fan coordinates (angle across the curtain, radius along
it), so the folds stretch the way they should.

Two things keep it cheap:

- **It renders at 45% resolution** and CSS scales it up. An aurora is all
  soft edges, so the upscale *is* the blur — free, where a real blur pass
  would not be. At 1440x900 that is a 648x405 draw, too fast to time
  reliably.
- **It does not exist when it is not showing.** `display: none` until a melt
  is well under way, and the analyser is only sampled while it is on screen.

**Hue rides its own slow noise field**, not the curtain's brightness. Driving
colour from the curtain value puts everything at the violet end, because that
value is high wherever a curtain is — measured 29% blue / 25% violet with the
separate field, versus almost no blue without it.

No WebGL, or a lost context, falls back to the three gradient blobs in
`#aurora.no-gl`.

## The meteor

`media/meteor.png` (900px, 442 KB — the supplied artwork resampled from
1.4 MB). It crosses about 2.5s after the aurora has risen, then again every
7–12s, taking ~1.15s corner to corner.

The artwork already carries its own plasma trail, so the work here is *speed*:

- **Motion blur** is seven echoes drawn back along the path with rising alpha
  under `globalCompositeOperation = 'lighter'`.
- **A plasma bloom** trails the head on a radial gradient that breathes.
- **Sparks** are thrown off the head against the direction of travel and drawn
  as short lines along their own velocity, so they streak rather than dot.
- Rotation is derived: the artwork's own head direction (`atan2(380,-720)`) is
  subtracted from the path angle, which came out at **-2.4°** — the supplied
  art already points along this diagonal, so it flies head-first with almost no
  correction. Change the path and the rotation follows.

**Layering is deliberate**: the canvas is `z-index: 7` — in front of the page
and the aurora, behind the reading panel (60) and the film (70). A zoomed film
or text panel is never behind it.

Nothing renders between passes; the canvas is `display: none`.

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

**The Projects flow** (`projFlow()`) is seven lanes of packets running left to
right through gates. A packet reaching a gate has a 30% chance of rerouting to
a neighbouring lane, and the diagonal it takes is the whole point — that is
work being handed off between systems, not a decorative loop. Lanes are evenly
spaced rather than pinned to DOM rows, so the substrate keeps running whatever
the section above it is made of. It only animates while Projects is on screen.

**Projects itself is three categories** — Automation, Intelligence, Design —
each with a 16:9 slot waiting for a video. Drop a `<video>` (or `<img>`) into
`.cat-media` and the placeholder label and sweep hide themselves via `:has()`;
nothing else needs changing. Use `muted playsinline loop autoplay` if it should
play on its own — browsers refuse unmuted autoplay.

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
- [ ] **The case study is a MODEL, not measured results.** It carries a
      "Modelled, not measured" badge for exactly that reason — figures are
      built from observed volumes and rates, not from post-deployment
      measurement. Do not quietly drop that badge; if the engagement is later
      measured, replace the numbers and then change the label.
- [ ] **The client is "Company A" throughout.** The real name appears nowhere
      in the source. Keep it that way unless they consent in writing.
- [ ] **Email** is `hello@erolabs.studio` in two places — `index.html` footer
      and the `mailto:` in `composer()` in `main.js`.
- [ ] **Social links** are `href="#"`.
- [ ] **Activate delivery**: send one enquiry from the live site and click the
      confirmation link FormSubmit emails to `ENQUIRY_EMAIL`. Until then
      nothing arrives. Note the address sits in the page source — it is
      already public in the footer, but FormSubmit can issue an alias
      endpoint after activation if you would rather it were not.
- [ ] **OG image** — none set. Capture `?stop=0` at 1200×630.
