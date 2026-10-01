# Ẹ̀rọ Labs — the whole site

The complete current state, at tag **`final-5.0`** (30 Sep 2026), plus the work
committed after it. Sections 14–17 cover everything added since `final`: Our Work,
the Ask us panel, the idle melt and the performance pass.

This is the document to read first. `BRIEF.md` describes the site as it stood at
`satisfied-1` and is still accurate on the visual system and the core mechanic;
`README.md` explains the build and has two known-stale passages (noted below);
`HANDOFF.md` describes a session that is now finished and is superseded by this
file.

---

## 1 · What it is

**Ẹ̀rọ Labs** — a technology and innovation studio. *We Build What's Next.*
Intelligence meets automation meets design. *Ẹ̀rọ* is Yoruba for **machine**:
the thing that does the work for you.

It must read as a creative technology lab, not a corporate IT company. Never
generic AI imagery — no robots, no floating brains.

---

## 2 · The core mechanic

Not a stack of sections. **One 2D world with a camera in it.** Scroll drives the
camera along a fixed route between five stops, positioned in percent of viewport:

```
hero (0,0)  ─↓↘─  about (62,104)  ─↓─  howwework (62,214)
                                        ─←─  cases (-44,220)
                                        ─↓↘─  reach (30,330)
```

- **Three layers** move against the camera at different rates. Content is always
  topmost, so nothing decorative crosses type.
- **Dwell** — each leg parks for its first and last 17%, then eases across. That
  is what makes it read as travelling between places rather than sliding.
- **Inertia** — the camera lerps toward its scroll target at 0.09/frame.
- **The route is drawn in world space** as one continuous Catmull-Rom spline. The
  white pulse riding it is you.
- **A different world every load** — layer depths, a ±3vw nudge per stop, the set
  dressing. The route itself is never randomised.

**This mechanic is desktop and iPad only.** Phones get a plain top-down scroll.
See §7.

---

## 3 · The five stops

### 00 · Hero
"We Build What's Next." / *Intelligence meets automation meets design.* Below it,
the Yoruba dictionary entry for **Ẹ̀rọ**, set in EB Garamond as a quotation from
another kind of document. A rotating mast (`#pole`) carries the four rooms as a
decorative twin of the header nav.

### 01 · About Us — "Work on Autopilot"
The strongest copy on the site sits here: *"If your business spends hours copying,
pasting, forwarding, updating and chasing tasks, we can automate it."* Below, a
three-layer toggle demo with live meters for manual effort, errors and throughput.

### 02 · How We Work
Three categories — **Intelligence**, **Automation**, **Design** — each with a
looping film and a paragraph. Renamed from "Projects": the old heading promised
"Things We've Brought to Life" over what are service categories, and the section
did not keep that promise.

### 03 · Case Studies — "The Problem. The Process. The Result."
**Two studies, switchable in place.** See §4.

### 04 · Reach Us — "Got a Problem Worth Solving?"
The enquiry form. See §5.

---

## 4 · The case studies

Both live in the same stop and **only one is ever in flow**, so the section costs
what one study costs. This matters more here than anywhere: `#cases` is the most
compressed stop on the site.

| | Study 1 | Study 2 |
|---|---|---|
| Sector | Freight logistics, Lagos | Architecture & urban design, Lagos |
| Ref | `SYSTEM-RECON-LOG-2026-NGA` | `SYSTEM-RECON-ARC-2026-NGA` |
| Scale | 64 vehicles, 14 FMCG clients, ~1,200 documents/month | 28 developments, 18 senior staff, ~800 emails/week |
| Figures | 42 hrs · 0.2% · 5 days | 18 hrs · 0% · 2 min |
| Film | `media/case.mp4` | `media/case-2.mp4` |
| Full study | `#caseFull1` | `#caseFull2` |

### Three ways to switch, one behaviour

The same pill-and-travelling-ring control appears in three places, and all three
move the page as well, so wherever you close, you land on what you were reading:

1. **On the page** — beside the client line, under a white "Press to switch
   between case studies". One button per study, each pointing at the other, so
   there is no shared state: the button you can see always names where you are not.
2. **In the reading panel** — opposite the close button. Changes study in place.
3. **In the film frame** — top right. Changes film in place.

### The blurred client name

Real type, blurred to `.26em` — calibrated so word shapes survive but the name
does not. **The string under the blur is deliberate nonsense.** A real name
there, the client's or a stand-in, would be readable to anyone who opened the
inspector, which is the whole point of the NDA. There is no company name
anywhere in `index.html`, `main.js` or `styles.css`.

### Traps

- **`data-count` drives the count-up**, not the text node. Change both, or drop
  `data-count` to make a figure literal.
- **`countUp` marks a figure done the first time it is asked**, and it is asked
  whenever the camera reaches this stop — including for the study that is hidden.
  `cases()` un-marks and re-runs the incoming figures on every swap.
- **`#cases .xl` is `5.86u`**, not the usual `4.5u`. Deliberate pre-compensation
  for this stop's `--fit`, solved from two measured `(size, fit)` pairs because
  size feeds back into fit. Do not tidy it.

---

## 5 · The enquiry form

Seven required fields: `company`, `email`, `phone`, `problem`, `service`,
`budget`, `request`.

| Field | Options |
|---|---|
| **Service** | Automation · Website · Branding · More than one · Not sure yet |
| **Budget** | Tier A ₦1.5M–3.5M · Tier B ₦3.5M–7.5M · Tier C ₦7.5M+ |
| **We request a** | Phone call · Meeting · Zoom meeting |

### How the choosers work

A real `<select>` stays in the form and is the source of truth — FormData,
validation and a script-less page all keep working. What it cannot do is look
like this page: the popup is OS chrome and no stylesheet reaches inside it. So
`selects()` paints a listbox over it and the native control goes out of sight.

Everything the browser was doing for free is put back by hand: keyboard (arrows,
Home/End, Enter, Escape), outside-click, aria state, and a flip upward when the
panel would run past the bottom of the frame.

### The one cross-field rule

**"More than one"** or **"Not sure yet"** sets Budget to **"To be discussed"** and
holds it — `disabled`, not merely unclickable, or it would still be reachable by
tab. Choosing a single service hands the field back with whatever tier was picked
before. Everyone else names a tier: that question is the qualifier and it keeps
its teeth.

"To be discussed" is **created when it becomes the answer and removed when it
stops being one**, so it never appears in the list, in the native `<select>`, or
in the markup. It must exist as a real option while held, because a `<select>`
cannot carry a value it has no option for.

> **Enquiries do not arrive yet.** `ENQUIRY_EMAIL` is
> `mohamedali.a.rajab@gmail.com` (`main.js:25`), feeding FormSubmit. The very
> first submission triggers a confirmation link that must be clicked **once**,
> from the live site. Until then, every enquiry is silently lost. The address is
> deliberately **not displayed** on the page.

---

## 6 · The reading panel

Dwell on or click a dense block and it lifts into a glass panel at 75% of the
viewport, everything behind it blurred, growing out of the block it quotes the
way the films do.

- **`data-read`** lets a block name what it opens. The case brief is a summary of
  a much longer study: the brief is what grows, but the panel fills with the study.
- **A block carrying `data-cue`** opens on click only, never on a hover dwell —
  the cursor becomes a white disc reading "Click to read more", and it has to be
  telling the truth. `data-cue=""` opts an element *out* of the disc.
- **The scroll rail** — the native bar is hidden and replaced by a floating oval
  that rides the scroll, white through violet to blue, capped so it reads as an
  oval rather than a scrollbar. It can be dragged, and pressing the track jumps
  there. Its hit area is wider than the visible track, because a 4px target is
  not one you can grab. It is a *sibling* of the scrolling body, not a child.

---

## 7 · Desktop / mobile

**One source of truth**, in `main.js`:

```js
const FLAT_MQ = matchMedia('(max-width:700px), (max-height:520px)');
const isFlat  = () => reduced || FLAT_MQ.matches;
```

`flat` = static stacked layout (phones, and any very short viewport).
`reduced` = animation off, honouring `prefers-reduced-motion`. **These are
different things**, and conflating them caused real bugs.

Functions with a `flat` branch — change one, check the others:

| Function | Flat behaviour |
|---|---|
| `measure()` | `xScale = 1`; `#track` height removed |
| `readScroll()` | progress measured against `document.scrollHeight` |
| `buildRoute()` | skipped entirely, route SVG hidden |
| `tick()` | stop distance from `getBoundingClientRect` |
| `nav()` | `scrollIntoView`, because `#track` is `display:none` |
| `boot()` | `applyMode()` reconciles mode **before** first `measure()` |
| `fitStops()` | no `--fit` at all — a section may be taller than the phone |

**Phone header** hides on scroll and returns at top; the burger is replaced by a
back-to-top button. Scoped to phones only.

---

## 8 · Layout primitives

- **`--u: min(1vw, 1.72vh)`** — the scale unit, respecting both axes. Rebased per
  breakpoint band.
- **`fitStops()`** — measures each section and sets `--fit` so nothing exceeds 88%
  of viewport height, clamped at `0.6`. **If `--fit` drops below ~0.8, cut copy
  rather than let it shrink further.**

Measured at 1440×900, tag `final`:

| Stop | `--fit` |
|---|---|
| hero · about · howwework | 1 |
| **cases** | **0.704** |
| **reach** | **0.813** |

> Any `--fit` reading is meaningless without the viewport height beside it. A
> short viewport legitimately produces `0.6` — that is the clamp working, not a
> regression.

**Type**: Sora (display) / Manrope (body) / IBM Plex Mono (labels), plus
EB Garamond for the hero dictionary entry only and Poppins for the wordmark only.

---

## 9 · The films

Five, all **1280×720** H.264, `preload="metadata"` on desktop.

| File | Size | What it is |
|---|---|---|
| `intelligence.mp4` | 2.3 MB | Category film |
| `automation.mp4` | 2.3 MB | Category film |
| `design.mp4` | 2.3 MB | Category film |
| `case.mp4` | 2.2 MB | Freight study, 30s |
| `case-2.mp4` | 2.1 MB | Studio study, 30s |

**They were 1920×1080 at up to 3.7 Mbps — 62 MB in total — until 30 Sep.** That is
broadcast bitrate for flat motion graphics never seen larger than a card, and it
was by a wide margin the heaviest thing on the site. Re-encoded with
`AVAssetExportSession` at the 720p preset under a per-file ceiling
(`fileLengthLimit`), which needs no ffmpeg; `media/` went 60 MB → 12 MB with no
visible loss. The script is `shrink.swift` in the session scratchpad.

### On a phone, one at a time

`filmsLive()` plays every film on a live stop. On a desktop the three About films
are a composition and all three belong on screen. On a phone that was three
simultaneous downloads and three H.264 decodes on the device least able to spare
either — and it starved everything else sharing the connection.

In flat mode now: `preload` is set to `none` (nothing is fetched until it plays),
and only the film nearest the middle of the screen plays, re-chosen twice a second
as you scroll. **The choice is sticky** — a card must be an eighth of a screen
closer before it takes over — because two cards sitting equally near would
otherwise trade places on every pass, and each trade is a pause and a play that
throws away what had been fetched. That was a visible flicker.

### The two case films were generated on this machine

There is **no ffmpeg and no Homebrew** here, so they were built with CoreGraphics
drawing each frame and AVFoundation (`AVAssetWriter`) encoding them, set in the
site's own Sora and IBM Plex Mono pulled from Google Fonts. Both follow the same
structure as the category films — hex nodes, dashed rails, travelling light
packets, corner brackets, telemetry readout, run bar — and are built as one board
crossed by a camera, which is what the site itself does.

Renderer and fonts live in the session scratchpad, not the repo. To rebuild:
`swiftc -O -o film film.swift && ./film video fonts out.mp4` (~30s for 900 frames).

**Posters** — 1280×720 JPEG, 50–85 KB, via the tested pipeline:

```bash
qlmanage -t -s 1600 -o /tmp media/case.mp4
sips -s format jpeg -s formatOptions 80 -z 720 1280 /tmp/case.mp4.png --out media/poster-case.jpg
```

### The play that has to be asked twice

Moving a video in the DOM interrupts it, and a `play()` asked on the same tick is
**dropped before the frame is painted**. This applies to expanding a film, to
switching one in the frame, and to revealing a case study that was `display:none`.
One more ask ~260 ms later is idempotent — playing a playing film is a no-op —
and it is the ask that lands the first time. Removing any of these will make
playback look intermittent.

---

## 10 · Build and deploy

```bash
python3 serve.py    # local preview — no-store headers + byte ranges
node build.mjs      # inline CSS/JS into dist/ — the guards run here
git push            # SSH remote, already configured
```

`build.mjs` has **two guards, both proven to bite**:

1. **CSS guard** — brace balance plus a list of selectors that must survive
   (`@keyframes lyStar`, `filmGrow`, `filmShrink`, `lyPulse`, `ldBeat`,
   `.cfilm-frost`, `.stop-num`, `#sky`, `#galaxy`, `#grain`, and others).
   Slicing CSS by hand removed load-bearing rules twice.
2. **Structure guard** — every `<section>` must be a stop. This is why the case
   study's sub-blocks are `<div class="cf-sec">`, not `<section>`.

Run `rm -rf dist && node build.mjs` before deploying so `dist/` matches source.

### Netlify

`netlify.toml` sets `no-cache` on `/*.js` and `/*.css`, and a year on `/audio/*`.

> **There is no rule for `/media/*`.** The films fall back to Netlify's default
> and revalidate rather than cache, so a returning visitor — or one who replays a
> film — can re-pull 10–14 MB. Add the same block `/audio/*` has. This is the
> highest-value performance fix available and it is two lines.

---

## 11 · First-load weight

Measured 30 Sep: **~0.71 MB across 15 requests**, DOMContentLoaded 577 ms, load
1.8 s. The 12 MB of film is *not* on the critical path — `preload="metadata"`
fetches headers only, and on a phone `preload="none"` fetches nothing at all.

Cross-origin font files report zero transfer without `Timing-Allow-Origin`, so
the true figure is somewhat higher. Fonts and their CSS are the largest
measurable slice (~261 KB) across five families; **EB Garamond serves one line
and Poppins serves only the wordmark**, so subsetting those two is the biggest
remaining win.

---

## 12 · Constraints that must not be broken

- **The client names never appear in source.** Not the real ones, not stand-ins.
- **The enquiry address is `mohamedali.a.rajab@gmail.com`** and is **not
  displayed** on the page. The form is the only route.
- **Diagnose before fixing.** Measure and explain the cause first.
- **The browser never talks to Notion, Make or any API directly** — always through
  a server, or the token leaks.

---

## 13 · Environment limits on this machine

- **No ffmpeg, no Homebrew.** `ffmpeg-static` from npm downloads but is SIGKILLed
  by the sandbox. Swift + AVFoundation is the working encoder (§9).
- **The preview pane suspends rAF, transitions, scroll and media**, and returns
  black screenshots of this page. Workarounds: render the site inside a
  fixed-size iframe on a probe page (CSS `vw`/`vh` resolve to the iframe box), or
  build a static component probe that loads `styles.css` and hand-writes the
  post-enhancement DOM.
- **The pane cannot emulate below ~700px CSS width** — use the 390×844 iframe.
- **Upload has been measured at 32 KB/s** with packet loss.

---

## 14 · Our Work

Not in the menu, by instruction. The way in is a vertical pill in the left gutter
on a desktop and a quiet chip in the bottom corner on a phone, carried on every
stop. It opens the reading panel with four category tabs: **Websites** has four
projects, **Automation / Dashboards / Apps** each say *Coming soon*.

Each tile is a plain link — screenshot, the client's own logo and name, the address
it opens, `target="_blank"` with `rel="noopener noreferrer"`.

### It was a live preview for two days, and that is worth knowing

Between 29 and 30 Sep the tiles opened the real site in an iframe inside the
panel, with arrows between projects and a loading line. It worked, and it was
removed: a whole second website loading inside this one is a cost no amount of
preconnecting fixes, and the client sites each run their own entrance sequences
(Doculand counts from 0 %, Craneshore holds at 100 %, Studio24 waits behind a
door) which happen *after* the document arrives.

Two findings from it that still matter if it is ever revived:

- **A refused frame and a loaded one are identical to JavaScript.** Both fire
  `load`, both throw `SecurityError` on `contentWindow.location`, both report
  `contentDocument` null and `length` 0. Tested against github.com and
  example.com side by side. So embeddability cannot be detected, only declared.
- **`interstyleceramics.com` sends `X-Frame-Options: SAMEORIGIN`** and will never
  embed. It was dropped from the grid for that reason.

### The thumbnails

1440×900 screenshots taken with the system's own WebKit (`shots.swift`, scratchpad)
— there is no Homebrew here — captured **mid-page rather than at the top**, because
these heroes are sparse, still animating, or behind a door. Studio24 and Doculand
would not composite in an offscreen window and were taken with a render service
instead. The logos are each site's own favicon or mark, fetched from the site.

---

## 15 · Ask us

A scripted FAQ panel, not a model. It gates on name, company, email and phone
before any question, answers from a fixed list, and removes each question once it
has been read. The last option is always their own words.

Three ways a conversation reaches the inbox, and the subject line says which:

| How | Subject | Trigger |
|---|---|---|
| Sent | `Question <ref>` | they press send |
| Unfinished | `Unfinished <ref>` | two minutes of silence |
| Unfinished | `Unfinished <ref>` | the tab closes |

The last one leaves by `navigator.sendBeacon` — a `fetch` is killed mid-flight
when the page goes away. **`pagehide`, not `visibilitychange`:** hiding fires on
every tab switch and would fill the inbox with people who merely looked away.

Still gated on the same FormSubmit activation as the enquiry form (§18). Until
that click, none of this is delivered.

---

## 16 · The idle melt

Thirty seconds without scroll, pointer or key and the page gives way: turbulence
displacement, blur, drained colour, and a sag that keeps going for as long as it
is left alone. Any input recovers it in under a second.

Two things changed on 28 Sep:

- **It runs on phones and pads.** It used to bail on `touch || flat`. In flat mode
  it melts **the section in view, not `#viewport`** — there `#viewport` *is* the
  document, so filtering it would rasterise every stop at once, and its sag would
  move the scroll under a reading thumb. No displacement map on a phone either:
  the turbulence is the expensive half.
- **The fixed chrome melts with it.** The launchers, the wordmark, the telemetry,
  the progress rail and the open Ask us panel are at body level, outside
  `#viewport`, which is why they used to sit crisp on top of a page that had
  given way. They take it now under their own `--cmelt` / `--cblur`, because
  `--melt` and `--blur` would inherit into the reading panel and drip the very
  thing being read. No sag for chrome: a top bar sliding 300 px down parks itself
  mid-screen.

The reading view and the film frame stay out of it — thirty still seconds is an
ordinary amount to spend on a paragraph.

---

## 17 · The performance pass (30 Sep)

Everything here was measured, not assumed.

- **Canvas resolution.** `#sky` and `#field` were drawn at 2× device pixels and
  repainted every frame — about 15 million pixels a second for 1–2 px glows and
  hairlines on black. One device pixel each now.
- **Cadence.** The background canvases run at a third of the frames on a phone and
  half on a desktop. The camera lerps at .09 a frame and stars breathe over
  seconds; nobody can see the difference.
- **Per-frame style writes.** Stop opacity was written for all five stops every
  frame — five whole-section style invalidations for a number usually identical to
  the one already there. Written only when it moves by more than .006 now.
- **Two threshold oscillations, both of which read as flickering.** `live` was a
  bare comparison at 1.05 — exactly where a phone rests between sections — so it
  added and removed on alternate frames, restarting every entrance animation
  inside that section. It is 1.00 on, 1.12 off. The cull (`hidden`) is 1.45 on,
  1.30 off; without that, hiding and re-showing a section makes the browser throw
  away its decoded images and decode them again.

Measured across a 5,600 px scroll at phone size afterwards: **8 `live` transitions,
0 hidden transitions, 8 play/pause events** — one per section and one per film,
which is the theoretical minimum.

---

## 18 · Outstanding

### Blocking launch

- [ ] **Activate FormSubmit** — send one enquiry from the live site and click the
      confirmation link. Until that click, nothing arrives. *Five minutes, and it
      is the single highest-leverage item on this list.*
- [ ] **Domain.** Blocks the above, and blocks the OG image.
- [ ] **OG image + favicon set.** Every share on WhatsApp or LinkedIn currently
      unfurls as a grey box with a bare URL. Capture `?stop=0` at 1200×630.
- [ ] **Three social links are still `href="#"`.**

### Soon

- [ ] **`/media/*` cache header** in `netlify.toml` (§10). Still absent. Now that
      the films are 2 MB rather than 14, a week (`max-age=604800`) is the sane
      value — *not* `immutable`, because the filenames are not versioned and a
      replaced film would be stranded in caches.
- [ ] **The case-study figures are unqualified.** Both studies assert specific
      numbers under a "verified / audit" framing. If they are modelled rather
      than measured, the framing has outrun the evidence. A decision, not a bug.
- [ ] **Real-device testing.** Still the largest gap. Everything is verified
      numerically at 375×812 and 390×844; the only phone report so far was
      "glitches and flickering", which traced to the two threshold oscillations
      in §17. The performance pass has not been confirmed on hardware.

### Worth deciding

- [ ] **`media/` is 12 MB; `.git` is 131 MB.** The working tree is fixed but
      history still holds every version of the old 62 MB of film. `git gc` packs
      the loose objects and is safe; going below what those blobs compress to
      needs a history rewrite, which means an explicit go-ahead on a branch that
      has already been pushed.
- [ ] **Content gaps**: the hero is abstract where stop 01 is concrete; nothing
      says *who this is for* (no industries or company shapes); the budget tiers
      ask visitors to price themselves without ever anchoring what a tier buys.
- [x] ~~`.case-track` / `.case-step` CSS is dead~~ — removed 1 Oct, along with
      `.case-claim`, `.case-lower`, `.cd-bar`, `.foot-mail` and the `.case-step`
      loop in `main.js`. Nothing on the page used any of them.

---

## 19 · Checkpoints

| Tag | Date | What it is |
|---|---|---|
| `v1-checkpoint` | 27 Aug | before the Active Theory homepage pass |
| `satisfied-1` … `satisfied-3` | 29 Aug | approved states |
| `satisfied-4` | 30 Aug | last approved desktop look before this session |
| `pre-edits` | 2 Sep | before the case study / video / reach work |
| `final` | 2 Sep | two case studies, the enquiry choosers, both films, the scroll rail |
| `final-2` | Sep | — |
| `final-3.0` | Sep | the design pass; nothing scaled down any more |
| `final-4.0` | 28 Sep | Our Work, Ask us, the melt reaching the whole frame |
| `final-4.1` | 28 Sep | the mobile frame budget |
| **`final-5.0`** | **30 Sep** | **Our Work with live previews** (since replaced by plain links) |

### Known-stale docs

- **`README.md`** says the enquiry email is `hello@erolabs.studio` (it is not) and
  refers to a `composer()` function and a `mailto:` link on the last page. Neither
  exists — the function is `enquiry()`, and there is no `mailto:` in the source.
  Everything else in it is current.
- **`HANDOFF.md`** describes the session that produced `pre-edits` and is
  superseded by this file.
