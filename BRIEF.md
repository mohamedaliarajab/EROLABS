# Ẹ̀rọ Labs — the site, as built

A reference spec of everything the site is as of **Satisfied 1** (29 Aug 2026).
Written as a brief: hand this to someone and they could rebuild it.

---

## The brand

**Ẹ̀rọ Labs** — a technology and innovation studio. *We Build What's Next.*
Intelligence meets automation meets design. Ẹ̀rọ is Yoruba for *machine*: the
thing that does the work for you.

It must read as a creative technology lab, not a corporate IT company —
futuristic, experimental, minimal but visually powerful, premium, immersive.
Never generic AI imagery: no robots, no floating brains.

## Palette and type

Lifted from the wordmark. A single committed dark world — no light theme.

```
ground     #010205   ink        #EDEFF4   blue    #1E90FF
raised     #06070C   ink-2      #8F97A8   indigo  #3F5BFF
                     ink-3      #565E70   violet  #A625EE
                     violet-ink #C36BFF   warn    #FF6B8A
```

- **Sora** — display at weight **200**, never heavier; body at 300. Weight, not
  size, is what makes large type feel bulky.
- **IBM Plex Mono** 300 — every label, index, readout and HUD element.
- **Poppins** 600 — the wordmark alone, because it has to match the logo.

One unit governs scale: `--u: min(1vw, 1.72vh)`, so every section fits both
axes of any viewport.

## The core mechanic

Not a stack of sections. **One 2D world with a camera in it.** Scroll drives the
camera along a fixed route between five stops, positioned in percent of
viewport:

```
hero (0,0)  ─↓↘─  about (62,104)  ─↓─  projects (62,214)
                                        ─←─  cases (-44,220)
                                        ─↓↘─  reach (30,330)
```

Reading ↓↘ ↓ ← ↓↘, exactly as briefed.

- **Three layers** move against the camera at different rates: background
  0.30–0.58, foreground 1.16–1.54, content 1.0. Paint order is bg → fg →
  content, so content is always topmost and nothing decorative crosses type.
- **Dwell**: each leg parks for its first and last 17%, then eases across. That
  is what makes it read as travelling between places.
- **Inertia**: the camera lerps toward its scroll target at 0.09/frame.
- **Sections fade by distance** (`1.65 − d × 2.05`), so a leg is a crossfade
  between two and never a pile of four.
- **Every stop auto-fits** its frame; anything over 88% of viewport height is
  scaled down rather than clipped.

**The route is drawn in world space** as a Catmull-Rom spline — one continuous
curve, no elbows — with a glowing trail that draws to your exact scroll
position. The white pulse riding it is you. It fades to 0.10 when parked, so it
never competes with the section you are reading.

**A different world every load**: layer depths, a ±3vw nudge on each stop, the
set dressing, the node field, the mast's facing. The route itself is never
randomised.

## The sections

**The loader** — a cosmos, not a progress bar. A twinkling starfield under
three drifting aurora wings; the aperture at the centre with orbit rings, a
white halo beating lub-dub and a core drifting between blue and violet. Below
it *Preparing your experience*, a bar whose gradient flows independently of the
fill with a hard light riding the leading edge, the percentage, and — only at
100% — *Experience ready*. Then the audio choice, each button lit by a
blue-to-violet edge on hover.

Choosing either **collapses the whole screen into the mark**: everything
spirals inward and shrinks, the singularity flares, the veil lifts, and the
hero is already arriving underneath by the time the flash peaks — one movement
through, not a fade between two screens.

**Hero** — the wordmark (rebuilt in HTML/SVG, the Ọ lifted out as the studio's
aperture mark). A **Milky Way** baked once into a texture, drifting, belonging
to the hero alone. The **orbiting mast**: the four rooms and the aperture
circling a vertical axis in CSS 3D — this is the real navigation here, and the
top menu stays hidden and inert until the mast has faded. Idle drift, drag
momentum, scroll torque. A **progress rail** across the top: brand gradient
flowing independently of your scrolling, a headlight at the leading edge, and
the percentage riding along in faint grey.

**01 About** — *Work on Autopilot.* Intelligence • Automation • Design. Then
**the layers demo**: a diagram of an operation with three toggles. Nothing on,
it is a manual operation — stations scattered, work wandering, some lost.
Automation lays the rails and the six stations light left to right.
Intelligence puts a decision at each junction, beating lub-dub. Design resolves
the scatter into something legible. Three relative meters and a caption follow.

**02 Projects** — *Things We've Brought to Life.* Three categories, each with a
film and explanatory copy. Behind them, seven lanes of packets running through
gates and rerouting to neighbours — work being handed off, not a decorative
loop.

**03 Case Studies** — *The Problem. The Process. The Result.* Company A,
facility management, Lagos. A four-step spine, a film, and three tabbed tables
(Hours, Errors, Return) including the stress test. Short copy on the page, the
full text one hover away.

**04 Reach Us** — *Got a Problem Worth Solving?* Five required fields, **Send
Enquiry**, then *Problem received, we will solve it* for five seconds before
handing back a clean form.

## The interactions

- **Reading view** — dwell 420ms on a dense block, or click it, and it lifts
  into a glass panel at 75% × 75% with the page blurred behind. A stage at the
  bottom animates to match what is being read. Close with the X, the scrim,
  Escape, or by moving the pointer out.
- **Films** — the pointer drifts each one inside its frame; a click opens it at
  75% with a seek bar and pause, restarting from the top. Both overlays shrink
  back onto the block they came from.
- **Cursor lights** — sparks emitted by *movement*, never position. Hold still
  and the field goes dark.

## When the page is left alone

The signature behaviour. After **20 seconds** with no scroll, click, key or
cursor movement:

1. **The whole screen melts** — turbulence displacement, blur, drained colour,
   and a sag with no ceiling, so it keeps dragging for as long as you leave it.
   The onset is deliberately invisible: 0.7px in the first second.
2. **Five seconds later the aurora rises** — real curtains of blue and violet
   in a fragment shader, brightening on the music.
3. **The audio swells** 7% per second, and the volume slider rides up with it.

Any activity restores everything. Overlays never melt — they sit above the
world and stay crisp.

## Audio

*Echoes Without Words*, looping. The loader asks **Sound on / Sound off** before
letting anyone in — that click is the gesture browsers require. Volume lives in
the nav, left of the CTA.

## Build

No frameworks, no build step, no dependencies beyond a Google Fonts link.
`index.html`, `styles.css`, `main.js`, plus `build.mjs` which inlines them and
guards the structure. Reduced motion is a real fallback, not a disabled site.

---

## Still open before launch

- The client is **Company A** throughout; the real name appears nowhere.
- The case-study figures are a **model, not measured results** — the badge
  saying so was removed on request, so nothing on the page qualifies them now.
- Project naming, the domain, and activating enquiry delivery (one confirmation
  click on the first submission).
- Social links are `href="#"`.
