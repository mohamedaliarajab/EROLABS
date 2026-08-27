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
