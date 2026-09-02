# Ẹ̀rọ Labs — handoff

Written 2 Sep 2026, at the point the repo went up to GitHub. This is the
**state of play**, not a description of the site. For how the site actually
behaves read, in this order:

1. `BRIEF.md` — what the site is, section by section. Start here.
2. `README.md` — how it is built, and why each mechanism is the way it is.
3. This file — what is done, what is pending, and what will bite you.

> **`README.md` has one stale passage.** It says the enquiry email is
> `hello@erolabs.studio` in two places. That is no longer true — see
> *Constraints* below. Everything else in it is current.

---

## Where things stand

| | |
|---|---|
| Repo | `git@github.com:mohamedaliarajab/EROLABS.git` (SSH — HTTPS has no stored credential) |
| Branch | `main`, 81 commits, fully pushed |
| Latest | `226bec3` — the mobile progress-rail fix |
| Tracked | 19 files; `dist/`, `node_modules/`, `.DS_Store` ignored |

### Checkpoint tags

| Tag | Date | What it is |
|---|---|---|
| `v1-checkpoint` | 27 Aug | before the Active Theory homepage pass |
| `satisfied-1` | 29 Aug | approved state |
| `satisfied-2` | 29 Aug | approved state |
| `satisfied-3` | 29 Aug | checkpoint |
| `satisfied-4` | 30 Aug | checkpoint — last approved desktop look |

`satisfied-4` is the reference for **desktop**. Everything after it is mobile-only
work that was required to change nothing on desktop.

---

## Constraints that must not be broken

These came from the client directly and several were repeated. Treat them as hard.

- **The client is "Company A".** The real name appears nowhere in the source and
  must stay that way. Do not reintroduce it, even in a comment.
- **Enquiry email is `mohamedali.a.rajab@gmail.com`** — `main.js:25`, feeding
  `ENQUIRY_ENDPOINT` on line 26. This was an explicit instruction. The address is
  **not displayed** on the contact section, also by instruction. `README.md` still
  claims `hello@erolabs.studio`; that is wrong, ignore it.
- **Desktop is frozen.** All the mobile work was done under a repeated, explicit
  "change nothing on desktop". Any mobile fix must be inside a `max-width:700px`
  / `max-height:520px` guard or a `body.flat` branch. Verify desktop is untouched
  before committing.
- **Diagnose before fixing.** Repeatedly requested. Measure and explain the cause
  first; do not go straight to an edit.

---

## The desktop/mobile split (the last big piece of work)

The site is a **camera on a route**: one 2D world, five `.stop` sections at world
coordinates, three parallax layers moving against a lerped camera. `#track` is a
tall spacer that gives the journey its scroll length.

That mechanic is **desktop and iPad only**. Phones get a plain top-down scroll.

**One source of truth**, in `main.js`:

```js
const FLAT_MQ = matchMedia('(max-width:700px), (max-height:520px)');
const isFlat  = () => reduced || FLAT_MQ.matches;
```

`flat` = static stacked layout (phones, and any very short viewport).
`calm`/`reduced` = animation off, honouring `prefers-reduced-motion`.
These are different things and conflating them caused real bugs.

Functions with a `flat` branch — change one, check the others:

| Function | Flat behaviour |
|---|---|
| `measure()` | `xScale = 1`; `#track` height removed |
| `readScroll()` | progress measured against `document.scrollHeight`, not `#track` |
| `buildRoute()` | skipped entirely, route SVG hidden |
| `tick()` | stop distance from `getBoundingClientRect`, not world coords |
| `nav()` | `scrollIntoView`, because `#track` is `display:none` |
| `boot()` | `applyMode()` reconciles mode **before** first `measure()` |

The boot reconcile matters: `flat` is latched at parse time, before the viewport
is final. Without it the first measure runs in the wrong mode.

**Phone header**: hides on scroll, returns at top. The burger is replaced by a
Back-to-top button. Scoped to phones only — tablets and iPads keep the burger.

---

## Gotchas that already cost time

Each of these was a real bug. They will recur if the cause is forgotten.

**Two sources of truth for mobile mode.** The original code branched on resize
events that never fired while `matchMedia` already matched. This was the root
cause of most mobile breakage. Keep `FLAT_MQ` as the only authority.

**`nav()` branching on `reduced` instead of `flat`.** In flat mode `#track` is
`display:none`, so `max = 0 - vh` went **negative** and every menu item scrolled
to the top. The menu appeared broken on all phones and tablets.

**iPad Air sections piling up.** An `xScale = vw < 900 ? .42 : 1` compression
collapsed the Projects↔Cases separation from 1.06 to 0.45 viewports, leaving both
at 73% opacity simultaneously. iPad Pro (1024px) sat above the threshold, which
made it look device-specific when it was arithmetic. `xScale` is now always 1.

**Progress rail jumping to 100%.** `max = Math.max(1, 0 - 844) = 1`, so any
scroll read as complete. Same `#track`-is-hidden root cause as `nav()`.

**Mid-word line breaks** ("What's Nex / t"). `split()` makes every glyph an
inline-block, and adjacent inline-blocks are independent break opportunities —
`word-break` cannot help. Fixed by wrapping each word in `.word-g{white-space:nowrap}`.

**Angular morph motion.** `animation-timing-function` applies **per segment**, so
an eased curve brakes at every waypoint. Fixed with `linear` plus a Bézier
sampled uniformly **in time** (sampling uniformly along the curve instead leaves
the last third crawling).

**The ground was not black.** `#grain` was adding +12/255 to every pixel. Fixed
with `mix-blend-mode: overlay` plus a black-point in `bake()`. Overlay cannot
lift pure black; normal blend can.

**Seek bars looked broken but never were.** `SimpleHTTPRequestHandler` ignores
`Range`, so `video.seekable` was `0..0` and every `currentTime` clamped to zero.
`serve.py` now serves `206 Partial Content`. Netlify handles ranges, so this only
ever affected local preview — which is where all testing happens.

**Slicing CSS by hand removed load-bearing rules — twice.** `build.mjs` now has a
CSS guard: brace balance plus a list of selectors that must survive
(`@keyframes lyStar`, `filmGrow`, `filmShrink`, `lyPulse`, `ldBeat`, `.cfilm-frost`,
`.stop-num`, `#sky`, `#galaxy`, `#grain`, and others). It has been proven to bite.
Do not bypass it.

**Assert on every string replacement.** One `.display` edit silently no-opped
because an earlier replacement had already changed the matched text.

---

## Layout primitives

- **`--u: min(1vw, 1.72vh)`** — the scale unit, respecting both axes. Rebased per
  breakpoint band (a tablet band, and a phone band at `max-width:700px`).
- **`fitStops()`** — measures each section and sets `--fit` so nothing exceeds 88%
  of viewport height. If `--fit` drops below ~0.8, cut copy rather than let it
  shrink further.
- **`#cases .xl`** is `5.86u` rather than the usual `4.5u`. That is deliberate
  pre-compensation for that stop's `--fit`, solved from two measured
  `(size, fit)` pairs because size feeds back into fit. Do not "tidy" it.

**Type**: Sora (display) / Manrope (body) / IBM Plex Mono (mono), plus EB Garamond
for the hero dictionary entry only and Poppins for the wordmark only.

---

## Environment limits on this machine

- **No ffmpeg, no Homebrew.** Video re-encoding is blocked. `ffmpeg-static` from
  npm downloads but is SIGKILLed by the sandbox. `avconvert` presets cannot
  compress meaningfully — only 568×320 actually shrinks.
- **The preview pane suspends rAF, transitions, scroll and media**, and returns
  black screenshots. It also cannot emulate below ~700px CSS width. Workaround:
  fixed-size iframes (CSS `vw`/`vh` resolve to the iframe box), and read
  `transition:none` targets rather than mid-flight computed values.
- **Upload is slow** — measured 32 KB/s with ~8.7% packet loss during the push.
  A 99 MB push took roughly 50 minutes and needed SSH keepalives plus chunking.

---

## Outstanding

**Deferred by choice**
- [ ] **OG image + favicon set.** `og:image` needs an absolute URL and there is no
      domain yet. Capture `?stop=0` at 1200×630 when there is one.
- [ ] **Video compression.** Four films, ~55 MB total. Blocked on ffmpeg.

**Before launch**
- [ ] Project naming — Studio OS, Change Note, Signal, Release Room, Showroom are
      placeholders describing real work generically. Confirm what may be named.
- [ ] Domain.
- [ ] **Activate FormSubmit delivery** — send one enquiry from the live site and
      click the confirmation link. Until that click, nothing arrives.
- [ ] Three social links are still `href="#"`.
- [ ] **The case-study figures are modelled, not measured.** The
      "Modelled, not measured" badge was removed on request, so nothing on the
      page currently qualifies them. This is a claims-accuracy risk worth a
      decision before publishing.

**Worth considering**
- [ ] **`media/` is 55 MB inside git history, permanently.** Every re-encode adds
      another ~55 MB and another slow push. Git LFS, or serving the films from
      Netlify and dropping them from the repo, would fix this. It is a history
      rewrite, so it needs an explicit go-ahead.
- [ ] Real-device testing. Nearly all mobile work was verified numerically, not
      visually, because the preview pane cannot render phone widths.
- [ ] `.case-track` / `.case-step` CSS is dead (~15 rules), left in place
      deliberately.
- [ ] `dist/media/meteor.png` is a stale build artifact — not in `media/`, not
      referenced by any source file. Run `rm -rf dist && node build.mjs` before
      deploying so `dist/` matches current source.

---

## Commands

```bash
python3 serve.py          # local preview — no-store headers + byte ranges
node build.mjs            # inline CSS/JS into dist/
git push                  # SSH remote, already configured
```
