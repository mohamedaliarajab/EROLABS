/* ══════════════════════════════════════════════════════════════════
   Ẹ̀RỌ LABS — the travel engine
   Scroll drives a camera along a fixed route through a 2D world.
   Three layers move against that camera at different rates (parallax),
   and the route itself is drawn in world space as the circuit you ride.
   No libraries.
   ══════════════════════════════════════════════════════════════════ */
(() => {
'use strict';

/* ═══ WHERE ENQUIRIES GO ═══════════════════════════════════════════
   A web page cannot put mail on the wire by itself — something has to
   accept the POST and send it. This posts to FormSubmit, which needs no
   account and no key: it emails whatever it receives to the address in the
   URL, and its /ajax/ endpoint answers with CORS so the page never
   navigates away.

   ONE-TIME STEP, and enquiries do not arrive until it is done: the very
   first submission makes FormSubmit send a confirmation link to
   ENQUIRY_EMAIL. Open it once, and from then on every enquiry lands in
   that inbox within seconds.

   To route through Make instead, put the webhook URL in ENQUIRY_WEBHOOK —
   it takes precedence and the enquiry is posted to it as plain JSON.     */
const ENQUIRY_EMAIL    = 'mohamedali.a.rajab@gmail.com';
const ENQUIRY_ENDPOINT = 'https://formsubmit.co/ajax/' + ENQUIRY_EMAIL;
const ENQUIRY_WEBHOOK  = '';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp  = (a, b, t) => a + (b - a) * t;
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/* Two different ideas used to share one flag. `reduced` meant both "do not
   animate" and "lay this out statically", which is why a phone could not have
   one without the other. They are separate now:

     reduced — no animation. Only ever from prefers-reduced-motion.
     flat    — no camera: the stops stack and the page scrolls down normally.

   A phone gets `flat` alone, so it keeps the starfield, the glows, the film
   morphs and the type reveals — the mood is not the route. Someone who asked
   for reduced motion gets both. Desktop matches neither, so every rule and
   branch below is invisible to it. */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch   = matchMedia('(hover: none)').matches;
/* ONE source of truth for the mode, and it is the same query the stylesheet
   uses. This used to be a `flat` boolean recomputed inside a resize handler
   that diffed innerWidth — and resize does not fire reliably when a device is
   switched in devtools, so CSS would flip to the phone layout while JS still
   believed it was a desktop. The camera kept running and positioning stops
   absolutely while the stylesheet had already put them in flow: sections piled
   on top of each other, and #track kept a stale 5328px height.

   matchMedia's change event fires on device switches, rotation and window
   resizes alike. Because the query text is identical to the stylesheet's,
   the two can no longer disagree.

   700px, not 900: phones go flat, tablets keep the journey. A Pro Max is 430
   wide and an iPad mini is 744, so the gap is comfortable. The height clause
   catches landscape phones, where there is not enough room for a camera that
   travels a screen per leg. */
const FLAT_MQ = matchMedia('(max-width:700px), (max-height:520px)');
const isFlat  = () => reduced || FLAT_MQ.matches;
let   flat    = isFlat();
if (touch) document.body.classList.add('is-touch');
if (reduced) document.body.classList.add('reduced');
if (flat) document.body.classList.add('flat');

/* ── geometry ──────────────────────────────────────────────────── */
const stops = $$('.stop');
const N = stops.length;
const DWELL = .17;          // share of each leg spent parked at a stop
const LEG   = 1.55;         // viewport-heights of scroll per leg
const rnd = (a, b) => a + Math.random() * (b - a);

/* Every load lays the world out a little differently: layer depths, a
   nudge on each stop, and the set dressing are all re-rolled. The ROUTE
   is never randomised — the journey stays ↓↘ ↓ ← ↓↘ exactly as briefed. */
const DEPTH  = { bg: rnd(.30, .58), mid: 1, fg: rnd(1.16, 1.54) };
const jitter = stops.map(() => ({ x: rnd(-3.2, 3.2), y: rnd(-2.4, 2.4) }));

let vw = 0, vh = 0, xScale = 1, pts = [];

function measure() {
  // A zero-size viewport (hidden tab, display:none container) would bake
  // nonsense into --fit. Wait for real dimensions; resize brings us back.
  if (!innerWidth || !innerHeight) return;
  vw = innerWidth; vh = innerHeight;
  /* The lateral travel is no longer compressed. This used to squash x to .42
     under 900px to tame the camera on a phone — but phones run flat now, and
     under 900 the only things left are tablets, which have the room and need
     the separation.

     Compressing x does not just shorten the journey, it moves the stops closer
     together in the world, and the fade is distance-based: Projects and Case
     Studies sit 1.06 viewports apart, which at .42 collapses to 0.45, and
     1.65 - 0.45*2.05 leaves BOTH on screen at 73%. That is the pile-up on iPad
     Air and iPad mini. At full scale they separate to 0.00. iPad Pro was always
     above the threshold, which is why it alone looked right. */
  xScale = 1;
  pts = stops.map((s, i) => ({
    x: ((+s.dataset.x + jitter[i].x) / 100) * vw * xScale,
    y: ((+s.dataset.y + jitter[i].y) / 100) * vh,
    el: s
  }));
  pts.forEach(p => {
    p.el.style.setProperty('--wx', p.x + 'px');
    p.el.style.setProperty('--wy', p.y + 'px');
  });
  fitStops();
  flowLayout();
  // and it is cleared on the way into flat mode — left behind, a stale desktop
  // height keeps the page scrollable far past its content
  if (flat) track.style.removeProperty('height');
  else track.style.height = ((N - 1) * LEG * vh + vh) + 'px';
  buildRoute();
  dress();
  field.resize();
  galaxy.size();
  sky.size();
  dropFlatMids();
}

/* Nothing may overflow the frame: scale any stop that outgrows it. */
function fitStops() {
  // Nothing is fitted to a single screen in flat mode — a section is allowed
  // to be taller than the phone and simply scroll, which is the whole point.
  if (flat) { stops.forEach(s => s.style.removeProperty('--fit')); return; }
  for (const s of stops) {
    s.style.setProperty('--fit', 1);
    const h = s.offsetHeight;
    const f = h > vh * .88 ? Math.max((vh * .88) / h, .6) : 1;
    s.style.setProperty('--fit', +f.toFixed(4));
  }
}

/* ── camera ────────────────────────────────────────────────────── */
const track = $('#track');
const cam = { x: 0, y: 0, tx: 0, ty: 0 };
let progress = 0, leg = 0, legT = 0, scrollVel = 0;

function readScroll() {
  // measure() bails on a zero-size viewport, which leaves the world
  // unmeasured — reading a camera target from it would throw and take the
  // rest of boot with it. A resize brings us back.
  if (!pts.length) return;
  /* What the scroll is measured against depends on what is scrolling. The
     camera reads its position from #track, the tall spacer that gives the
     journey its length. Flat mode has no track — it is display:none with its
     height cleared — so track.offsetHeight is 0 and this came out as
     Math.max(1, -844) = 1, which put the progress rail at 100% on the very
     first pixel of scroll. In flat mode the page itself is the track. */
  const max = flat
    ? Math.max(1, document.documentElement.scrollHeight - innerHeight)
    : Math.max(1, track.offsetHeight - vh);
  const prev = progress;
  progress = clamp(scrollY / max, 0, 1);
  scrollVel = progress - prev;
  const p = progress * (N - 1);
  leg = clamp(Math.floor(p), 0, N - 2);
  const raw = p - leg;
  // hold at each end of the leg, then ease across — travel, not sliding
  legT = easeInOut(clamp((raw - DWELL) / (1 - DWELL * 2), 0, 1));
  cam.tx = lerp(pts[leg].x, pts[leg + 1].x, legT);
  cam.ty = lerp(pts[leg].y, pts[leg + 1].y, legT);
}

/* ── settling ──────────────────────────────────────────────────────
   The camera target came straight off raw scroll position, so a flick handed
   it a stop two legs away and the ride there was over before it could be
   read — and because the lift is a function of leg progress, the zoom went
   with it.

   The first attempt at a fix was a timed tween on an in-out curve, and it
   felt worse: an in-out curve starts at zero velocity, but the page is still
   coasting when scrolling "stops", so it braked and then set off again. That
   is the jerk.

   There is no tween here at all. While the visitor is not touching it the
   page is simply pulled toward the nearest stop every frame, and the strength
   of that pull fades in over a third of a second — so it takes hold
   underneath the momentum instead of interrupting it, and decays to nothing
   as it arrives. Exponential, so it never overshoots and never has to stop.

   A flick that overshot by two legs is pulled back to one — one gesture, one
   page — while a deliberate scroll of three or more is left alone, because at
   that distance it was the intent. Nothing runs on a phone: flat mode is an
   ordinary scrolling page. */
let fromLeg = -1, lastInput = 0, seekIdx = -1, seekAt = 0;

const maxScroll = () => Math.max(1, track.offsetHeight - vh);
const legAt = y => (y / maxScroll()) * (N - 1);

/* Where a gesture should come to rest. The clamp is the one-gesture-one-page
   rule: a flick that overshot by two legs is pulled back to one, while a
   deliberate scroll of three or more is left alone. */
const destFor = () => {
  let idx = Math.round(legAt(scrollY));
  if (fromLeg >= 0 && Math.abs(idx - fromLeg) <= 2)
    idx = clamp(idx, fromLeg - 1, fromLeg + 1);
  return (clamp(idx, 0, N - 1) / (N - 1)) * maxScroll();
};

/* Ask to be somewhere. This is what nav and the proof link use, and it
   outranks the gesture rules entirely — pressing a menu item is not a scroll,
   it is a destination, and it must not be clamped to one leg from wherever
   you happened to be standing. */
const seekStop = i => {
  seekIdx = clamp(i | 0, 0, N - 1);
  seekAt = performance.now();
  fromLeg = -1;                      // a gesture anchor has no say in a seek
};

/* Scroll input only. pointerdown is NOT here: a click on a menu item fires
   one, which used to arm the anchor at the stop being left — and the clamp
   then forbade the destination. Every two-leg jump landed one short of where
   it was asked to go, which is what made it look inconsistent rather than
   simply broken. */
['wheel', 'touchmove', 'keydown'].forEach(ev =>
  addEventListener(ev, () => {
    const now = performance.now();
    if (now - lastInput > 260) fromLeg = Math.round(legAt(scrollY));   // new gesture
    lastInput = now;
    seekIdx = -1;                    // taking the wheel cancels a seek
  }, { passive: true }));

/* A press anywhere stops the pull without arming anything — grabbing the
   scrollbar should never be fought, but it is not a gesture with a leg of
   origin either. */
addEventListener('pointerdown', () => { lastInput = performance.now(); seekIdx = -1; }, { passive: true });

/* Called at the end of every frame, once the camera has been placed. */
function settle(t) {
  if (flat || reduced || !pts.length) return;

  /* A seek drives itself rather than handing off to the browser's smooth
     scroll. One code path, one easing, and nothing to fight: a native smooth
     scroll and this pull would each be writing scroll position on the same
     frames. */
  if (seekIdx >= 0) {
    const gap = (seekIdx / (N - 1)) * maxScroll() - scrollY;
    if (Math.abs(gap) < .6) {
      scrollTo(0, scrollY + gap);
      seekIdx = -1; fromLeg = -1; lastActive = lastInput;
      return;
    }
    const k = clamp((t - seekAt) / 260, 0, 1);
    scrollTo(0, scrollY + gap * (.03 + .1 * easeInOut(k)));
    return;
  }

  const idle = t - lastInput;
  if (idle < 90) return;                              // still their gesture
  const gap = destFor() - scrollY;
  if (Math.abs(gap) < .6) {
    if (gap !== 0) { scrollTo(0, scrollY + gap); fromLeg = -1; lastActive = lastInput; }
    return;
  }
  const ramp = clamp((idle - 90) / 320, 0, 1);        // the pull fades in
  scrollTo(0, scrollY + gap * (.014 + .072 * easeInOut(ramp)));
}

/* ── layers ────────────────────────────────────────────────────── */
const layers = [
  { el: $('#layerBg'),  d: DEPTH.bg  },
  { el: $('#layerMid'), d: DEPTH.mid },
  { el: $('#layerFg'),  d: DEPTH.fg  }
];

/* ── route drawn in world space ────────────────────────────────── */
let routeSvg = null, routePath = null, routeTrail = null, routePulse = null, routeLen = 0;

function buildRoute() {
  /* The route is the camera's path, and it is sized to the whole world — 1102px
     across on a 390px phone. It lives in .layer-mid, which flat mode has to keep
     visible because the stops are in it, and body.flat #viewport turns off the
     overflow:hidden that was containing it. So on a phone it escaped and made
     the document twice the width of the screen: the page slid sideways and the
     content left the frame. Nothing to draw when there is no camera. */
  if (flat) { if (routeSvg) routeSvg.style.display = 'none'; return; }
  if (routeSvg) routeSvg.style.removeProperty('display');
  const pad = Math.max(vw, vh) * .55;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const h = Math.max(...ys) - Math.min(...ys) + pad * 2;

  if (!routeSvg) {
    routeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    routeSvg.setAttribute('class', 'route-svg');
    routeSvg.style.cssText = 'position:absolute;left:50%;top:50%;z-index:0;pointer-events:none;overflow:visible';
    routeSvg.innerHTML = `
      <defs>
        <linearGradient id="gRoute" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1E90FF"/><stop offset="100%" stop-color="#A625EE"/>
        </linearGradient>
        <filter id="fGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <path class="r-base"  fill="none" stroke="rgba(255,255,255,.07)" stroke-width="1" stroke-dasharray="2 10" stroke-linecap="round"/>
      <path class="r-trail" fill="none" stroke="url(#gRoute)" stroke-width="1.4" stroke-linecap="round" filter="url(#fGlow)"/>
      <circle class="r-pulse" r="3.5" fill="#fff" filter="url(#fGlow)"/>`;
    $('#layerMid').prepend(routeSvg);
    routePath  = routeSvg.querySelector('.r-base');
    routeTrail = routeSvg.querySelector('.r-trail');
    routePulse = routeSvg.querySelector('.r-pulse');
  }

  routeSvg.setAttribute('width', w);
  routeSvg.setAttribute('height', h);
  routeSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  routeSvg.style.transform = `translate(${minX}px,${minY}px)`;

  /* One continuous Catmull-Rom spline through the stops. Per-segment
     beziers meeting at a shared point still kink, because their tangents
     disagree — this matches tangents across every joint, so the line reads
     as a single sweeping route instead of a folded elbow. */
  const P = pts.map(p => [p.x - minX, p.y - minY]);
  let d = `M${P[0][0]} ${P[0][1]}`;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || P[i + 1];
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6}`
       + ` ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6}`
       + ` ${p2[0]} ${p2[1]}`;
  }
  routePath.setAttribute('d', d);
  routeTrail.setAttribute('d', d);
  routeLen = routePath.getTotalLength();
  routeTrail.style.strokeDasharray = routeLen;
}

/* ── the milky way ─────────────────────────────────────────────────
   Baked once into an offscreen texture — a diagonal band of overlapping
   blue, violet and white blobs, dust lanes cut back out of it, and a few
   thousand stars weighted toward the band. Per frame it is one transformed
   drawImage plus a handful of live twinkles, so a galaxy that drifts and
   breathes costs about as much as a gradient. */
const galaxy = (() => {
  const cv = $('#galaxy');
  if (!cv) return { size(){}, draw(){} };
  const ctx = cv.getContext('2d');
  let tex = null, W = 0, H = 0, twinkle = [];

  function bake() {
    const w = 1500, h = 950, ang = -.44;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const c = off.getContext('2d');
    const along = t => ({
      x: w / 2 + Math.cos(ang) * t.a - Math.sin(ang) * t.c,
      y: h / 2 + Math.sin(ang) * t.a + Math.cos(ang) * t.c
    });

    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 190; i++) {                       // the band itself
      const p = along({ a: (Math.random() - .5) * w * 1.6,
                        c: (Math.random() - .5) * h * .40 * (.45 + Math.random()) });
      const r = 70 + Math.random() * 240;
      const k = Math.random();
      const col = k < .44 ? '52,104,255' : k < .78 ? '146,70,255' : '206,222,255';
      /* A few bright cores against a mostly-dark band reads as contrast; the
         same light spread evenly over every blob reads as haze. */
      const core = Math.random() < .16
        ? .055 + Math.random() * .075
        : .006 + Math.random() * .016;
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, `rgba(${col},${core.toFixed(3)})`);
      g.addColorStop(.42, `rgba(${col},${(core * .30).toFixed(3)})`);
      g.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = g;
      c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.fill();
    }

    c.globalCompositeOperation = 'destination-out';       // dust lanes
    for (let i = 0; i < 58; i++) {
      const p = along({ a: (Math.random() - .5) * w * 1.4,
                        c: (Math.random() - .5) * h * .16 });
      const r = 40 + Math.random() * 150;
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, `rgba(0,0,0,${(.34 + Math.random() * .50).toFixed(2)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.fill();
    }

    /* Black point. No single blob is bright, but 190 of them overlap, and the
       union was holding the whole sky a couple of levels off #000. Clipping the
       bottom of the alpha range and rescaling what survives drops the haze
       without touching the bright cores — those are the band. Stars are drawn
       after this line, so they keep every bit of their range. */
    const FLOOR = .04;
    const im = c.getImageData(0, 0, w, h), pix = im.data;
    for (let i = 3; i < pix.length; i += 4) {
      const a = pix[i] / 255;
      pix[i] = a <= FLOOR ? 0 : Math.round(255 * (a - FLOOR) / (1 - FLOOR));
    }
    c.putImageData(im, 0, 0);

    c.globalCompositeOperation = 'lighter';               // stars, densest in the band
    for (let i = 0; i < 2800; i++) {
      const inBand = Math.random() < .72;
      const p = inBand
        ? along({ a: (Math.random() - .5) * w * 1.7,
                  c: (Math.random() - .5) * h * .34 * Math.random() })
        : { x: Math.random() * w, y: Math.random() * h };
      const b = Math.random();
      const r = b > .988 ? 2.4 : b > .94 ? 1.25 : .55;
      const k = Math.random();
      const col = k < .30 ? '150,190,255' : k < .52 ? '190,160,255' : '240,246,255';
      /* Three tiers rather than two, and the gap between them widened: the
         faint majority sink toward the ground while the few bright ones go
         almost to white. That separation is what contrast actually is. */
      const bright = b > .988 ? .85 + Math.random() * .15
                   : b > .94  ? .34 + Math.random() * .30
                              : .04 + Math.random() * .13;
      c.fillStyle = `rgba(${col},${bright.toFixed(2)})`;
      c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.fill();
      if (b > .988) {                                  // a halo on the brightest
        const h = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 5);
        h.addColorStop(0, `rgba(${col},.30)`);
        h.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = h;
        c.beginPath(); c.arc(p.x, p.y, r * 5, 0, 7); c.fill();
      }
    }
    tex = off;
  }

  const size = () => {
    const d = Math.min(devicePixelRatio || 1, 1.25);      // it is all soft light
    W = innerWidth; H = innerHeight;
    cv.width = W * d; cv.height = H * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    if (!tex) bake();
    twinkle = Array.from({ length: 46 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: .8 + Math.random() * 1.5, ph: Math.random() * 7,
      sp: .4 + Math.random() * 1.1
    }));
  };

  const draw = (t, heroD) => {
    if (!tex || !W) return;
    ctx.clearRect(0, 0, W, H);
    // the hero's sky, and only the hero's — gone by the time you have left it
    const near = clamp(1 - heroD / .8, 0, 1);
    // (heroD is scroll-derived in flat mode — see tick())
    if (near <= .002) return;
    /* Global alpha scales everything equally, so it lifts the band into view
       without touching the contrast ratio — the darks stay dark relative to
       the stars. */
    ctx.globalAlpha = near * .714;   // .68 +5%: cores, stars and lanes together

    /* The drift was 8.5e-6 per ms, which after ten seconds is sin(0.00026) —
       arithmetically static. It needs to be four orders larger to read as
       movement at this scale. */
    const scale = Math.max(W / tex.width, H / tex.height) * 1.30;
    const d = t * .00006;
    const breathe = 1 + Math.sin(d * .6) * .035;
    ctx.save();
    ctx.translate(W / 2 - cam.x * .05, H / 2 - cam.y * .05);
    ctx.rotate(d * .012 + Math.sin(d * .35) * .05);       // a wheel that keeps turning
    ctx.scale(scale * breathe, scale * breathe);
    ctx.translate(Math.sin(d * .5) * 95, Math.cos(d * .38) * 62);
    ctx.drawImage(tex, -tex.width / 2, -tex.height / 2);
    ctx.restore();

    ctx.globalCompositeOperation = 'lighter';             // the live twinkles
    for (const s of twinkle) {
      const a = .18 + .55 * Math.pow(Math.max(0, Math.sin(t * .0009 * s.sp + s.ph)), 3);
      ctx.fillStyle = `rgba(226,238,255,${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  };

  return { size, draw };
})();

/* ── sky ────────────────────────────────────────────────────────────
   The loader's starfield, carried into the rest of the site. Same density,
   same three size tiers, same three colours, same twinkle curve — so crossing
   from the loader into the site reads as one continuous sky rather than two
   different ones.

   It fades UP exactly as the galaxy fades out. The hero already has the
   galaxy's 2,800 baked stars; doubling a second field on top of them would
   make the one screen that is already the busiest busier still, and would
   leave every other stop bare the moment the galaxy went. */
const sky = (() => {
  const cv = $('#sky');
  if (!cv) return { size() {}, draw() {} };
  const ctx = cv.getContext('2d');
  let stars = [], W = 0, H = 0;

  const size = () => {
    /* One device pixel per CSS pixel, not two. These are 1–2px glows on a
       black field: at 2x on a retina screen the canvas is four times the area
       for a difference nobody can point to, and it is repainted every frame.
       The fill rate saved here is the single biggest cost on this page. */
    const d = Math.min(devicePixelRatio || 1, 1);
    W = vw; H = vh;
    cv.width = W * d; cv.height = H * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    stars = Array.from({ length: Math.round(W * H / 4200) }, () => {
      const b = Math.random(), c = Math.random();
      return {
        x: Math.random() * W, y: Math.random() * H,
        r: b > .975 ? 1.8 : b > .82 ? 1.05 : .55,
        ph: Math.random() * 7, sp: .5 + Math.random() * 1.5,
        col: c < .3 ? '150,190,255' : c < .55 ? '205,165,255' : '236,243,255'
      };
    });
  };

  const draw = (t, heroD) => {
    if (!W) return;
    ctx.clearRect(0, 0, W, H);
    const veil = clamp((heroD - .45) / .40, 0, 1);
    if (veil <= .002) return;                    // the hero keeps its own sky
    ctx.globalAlpha = veil;
    /* A hair of parallax. Pinned exactly to the glass, stars read as a sticker
       on the screen rather than a sky you are travelling under. Wrapped, so
       the field never runs out however far the camera goes.

       Flat mode has no camera to lag behind, so the parallax comes off the
       scroll instead — the sky drifts at a fraction of the page's speed. This
       is the whole of the journey that survives on a phone, and it is the
       cheapest depth there is: without it the stars sit flat on the glass and
       the page stops feeling like somewhere you are moving through. */
    const ox = flat ? 0 : cam.x * .03;
    const oy = flat ? scrollY * .18 : cam.y * .03;
    for (const s of stars) {
      const a = reduced ? .5
        : .18 + .70 * Math.pow(Math.max(0, Math.sin(t * .0008 * s.sp + s.ph)), 2);
      ctx.fillStyle = `rgba(${s.col},${a.toFixed(3)})`;
      const x = ((s.x - ox) % W + W) % W, y = ((s.y - oy) % H + H) % H;
      ctx.beginPath(); ctx.arc(x, y, s.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  return { size, draw };
})();

/* ── field: fixed world nodes, precomputed links, riding pulses ─── */
const field = (() => {
  const cv = $('#field'), ctx = cv.getContext('2d', { alpha: true });
  let nodes = [], links = [], dpr = 1, lastT = 0;
  const mouse = { x: -9e9, y: -9e9 };
  /* Cursor lights. Sparks are emitted by MOVEMENT only and burn out in
     ~700ms, so a cursor sitting still leaves the field completely dark. */
  let sparks = [], glow = 0, px = 0, py = 0, pt = 0;

  function build() {
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const pad = Math.max(vw, vh) * .85;
    const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad;
    const y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;

    const count = vw < 900 ? 58 : 112;
    nodes = Array.from({ length: count }, () => ({
      x: x0 + Math.random() * (x1 - x0),
      y: y0 + Math.random() * (y1 - y0),
      d: .5 + Math.random() * .9,          // parallax depth
      r: .7 + Math.random() * 1.5,
      ph: Math.random() * Math.PI * 2
    }));

    links = [];
    const R = Math.min(vw, vh) * .46;
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        if (Math.abs(a.d - b.d) > .34) continue;
        const dx = a.x - b.x, dy = a.y - b.y, dist = Math.hypot(dx, dy);
        if (dist < R) links.push({ a, b, dist, flow: Math.random() < .08, off: Math.random() });
      }
  }

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 1);   // hairlines on black: see the note in sky
    cv.width = vw * dpr; cv.height = vh * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }

  function draw(t) {
    const dt = lastT ? Math.min(64, t - lastT) : 16; lastT = t;
    ctx.clearRect(0, 0, vw, vh);
    const cx = vw / 2, cy = vh / 2;

    for (const n of nodes) {
      n.sx = n.x - cam.x * n.d + cx;
      n.sy = n.y - cam.y * n.d + cy;
      const mdx = n.sx - mouse.x, mdy = n.sy - mouse.y, md = Math.hypot(mdx, mdy);
      if (md < 150) { const f = (1 - md / 150) * 26; n.sx += (mdx / md) * f; n.sy += (mdy / md) * f; }
    }

    ctx.lineWidth = 1;
    for (const l of links) {
      const { a, b } = l;
      if ((a.sx < -200 && b.sx < -200) || (a.sx > vw + 200 && b.sx > vw + 200)) continue;
      if ((a.sy < -200 && b.sy < -200) || (a.sy > vh + 200 && b.sy > vh + 200)) continue;
      const o = (1 - l.dist / (Math.min(vw, vh) * .46)) * .2;
      ctx.strokeStyle = `rgba(150,175,255,${o})`;
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();

      /* Automation, made visible — but quietly. This was on 22% of the links
         at better than twice this speed, which put a few dozen bright lights
         crossing the screen at any moment: the background competing with the
         section in front of it. A quarter as many, moving at a drift rather
         than a dart, and dimmer. It should be noticed on the second look, not
         the first. */
      if (l.flow) {
        const k = ((t * .00007) + l.off) % 1;
        const px = lerp(a.sx, b.sx, k), py = lerp(a.sy, b.sy, k);
        const g = ctx.createRadialGradient(px, py, 0, px, py, 6);
        g.addColorStop(0, 'rgba(120,170,255,.52)'); g.addColorStop(1, 'rgba(120,170,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 6, 0, 7); ctx.fill();
      }
    }

    for (const n of nodes) {
      if (n.sx < -40 || n.sx > vw + 40 || n.sy < -40 || n.sy > vh + 40) continue;
      const tw = .38 + Math.sin(t * .001 + n.ph) * .3;
      ctx.fillStyle = `rgba(200,215,255,${tw * .9})`;
      ctx.beginPath(); ctx.arc(n.sx, n.sy, n.r, 0, 7); ctx.fill();
    }

    // ── cursor lights ──
    ctx.globalCompositeOperation = 'lighter';
    if (glow > .012) {
      const g = ctx.createRadialGradient(px, py, 0, px, py, 110);
      g.addColorStop(0, `rgba(90,140,255,${glow * .17})`);
      g.addColorStop(1, 'rgba(90,140,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 110, 0, 7); ctx.fill();
    }
    glow *= Math.pow(.9, dt / 16);

    for (const s of sparks) {
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vx *= .97; s.vy *= .97;
      s.life -= dt / 700;
      if (s.life <= 0) continue;
      const r = 16 * s.life + 2;
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      g.addColorStop(0, `rgba(${s.c},${.42 * s.life})`);
      g.addColorStop(1, `rgba(${s.c},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, 7); ctx.fill();
    }
    sparks = sparks.filter(s => s.life > 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  addEventListener('pointermove', e => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    const now = performance.now(), gap = Math.max(1, now - pt);
    const dx = e.clientX - px, dy = e.clientY - py;
    const speed = Math.hypot(dx, dy) / gap;          // px per ms
    if (pt && speed > .06 && gap < 200) {
      glow = Math.min(1.4, glow + speed * .5);
      const emit = Math.min(4, 1 + (speed * 1.7 | 0));
      for (let k = 0; k < emit; k++) {
        const f = k / emit;
        sparks.push({
          x: px + dx * f, y: py + dy * f,
          vx: (dx / gap) * .07 + (Math.random() - .5) * .06,
          vy: (dy / gap) * .07 + (Math.random() - .5) * .06,
          life: 1,
          c: Math.random() < .5 ? '30,144,255' : '150,60,238'
        });
      }
      if (sparks.length > 150) sparks.splice(0, sparks.length - 150);
    }
    px = e.clientX; py = e.clientY; pt = now;
  }, { passive: true });
  return { resize, draw };
})();

/* ── world set dressing ────────────────────────────────────────── */
function dress() {
  const bg = $('#layerBg'), fg = $('#layerFg');
  bg.innerHTML = ''; fg.innerHTML = '';
  const seed = [
    [18, 152, 'bg', 'frame'], [-96, 190, 'bg', 'frame'], [40, 62, 'bg', 'frame'],
    [-24, 40, 'fg', 'rule'], [96, 130, 'fg', 'rule'], [-62, 244, 'fg', 'rule'],
    [24, 350, 'fg', 'rule'], [110, 236, 'fg', 'rule']
  ];
  for (const [bx, by, where, kind] of seed) {
    if (Math.random() < .18) continue;              // thin it out differently each load
    const x = bx + rnd(-7, 7), y = by + rnd(-6, 6);
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) translate(${(x / 100) * vw * xScale}px,${(y / 100) * vh}px);pointer-events:none`;
    if (kind === 'frame') {
      el.innerHTML = `<div style="width:46vw;height:34vh;border:1px solid rgba(255,255,255,.045);border-radius:8px"></div>`;
    } else {
      el.innerHTML = `<div style="width:24vw;height:1px;background:linear-gradient(90deg,transparent,rgba(120,160,255,.28),transparent)"></div>`;
    }
    (where === 'bg' ? bg : fg).appendChild(el);
  }
}

/* ── split text ────────────────────────────────────────────────── */
let splitIndex = 0;
function split(el) {
  const mode = el.dataset.split;
  const out = document.createDocumentFragment();
  let i = 0;
  const unit = (txt, cls) => {
    const wrap = document.createElement('span');
    wrap.className = cls === 'char' ? 'char-w' : 'word-w';
    const inner = document.createElement('span');
    inner.className = cls;
    inner.textContent = txt;
    inner.style.setProperty('--i', i++);
    wrap.appendChild(inner);
    return wrap;
  };
  for (const node of [...el.childNodes]) {
    if (node.nodeName === 'BR') { out.appendChild(node.cloneNode()); continue; }
    if (node.nodeType !== 3) { out.appendChild(node.cloneNode(true)); continue; }
    for (const piece of node.textContent.split(/(\s+)/)) {
      if (!piece.trim()) { if (piece) out.appendChild(document.createTextNode(' ')); continue; }
      if (mode === 'char') {
        /* Each glyph becomes its own inline-block, and adjacent inline-blocks
           are independent break opportunities — so the browser is free to break
           a line INSIDE a word, and did: "What's Nex / t.". The word's glyphs go
           in one nowrap box to make the word atomic again. word-break and
           overflow-wrap cannot fix this, because by the time the line breaker
           runs there is no word left to keep together, only a row of boxes. */
        const g = document.createElement('span');
        g.className = 'word-g';
        for (const ch of [...piece]) g.appendChild(unit(ch, 'char'));
        out.appendChild(g);
      } else {
        out.appendChild(unit(piece, 'word'));
        out.appendChild(document.createTextNode(' '));
      }
    }
  }
  el.textContent = ''; el.appendChild(out);
}

/* ── the layers ────────────────────────────────────────────────────
   About's three words as a working system rather than three illustrations.
   With nothing switched on the diagram is what a manual operation actually
   is: stations scattered, jobs wandering between them, some dropped, nothing
   legible. Each layer changes what the picture DOES —

     Automation   lays the rails: work moves on its own, and quickly
     Intelligence puts a decision at each junction: it stops going the wrong way
     Design       resolves the scatter into something a person can run

   The meters are relative, not invented figures — effort and errors fall,
   throughput rises, and the caption says what that combination actually is. */
const LY_STATIONS = [
  { mess: [.10, .70], neat: [.07, .50], label: 'In' },
  { mess: [.30, .18], neat: [.28, .50], label: 'Read' },
  { mess: [.44, .84], neat: [.50, .24], label: 'Route' },
  { mess: [.64, .26], neat: [.50, .76], label: 'Do' },
  { mess: [.80, .76], neat: [.72, .50], label: 'Check' },
  { mess: [.93, .34], neat: [.93, .50], label: 'Done' }
];
const LY_EDGES = [[0,1],[1,2],[1,3],[2,4],[3,4],[4,5]];
const LY_NEXT  = { 0:[1], 1:[2,3], 2:[4], 3:[4], 4:[5], 5:[] };

const LY_NOTES = {
  0: 'Every job is walked by hand. Nothing is connected, nothing decides, and nobody can see the state of it.',
  1: 'It knows where each job should go — but someone still has to carry it there, one at a time.',
  2: 'The rails are in and work moves on its own. Nothing is deciding at the junctions, so some of it goes the wrong way and some is lost.',
  3: 'Work routes itself, and correctly. It still is not legible to anyone who has to run it.',
  4: 'It looks organised. Underneath, every hand-off is still being done by a person.',
  5: 'Clear and correctly sorted, and still entirely manual.',
  6: 'Fast and legible — still guessing at every junction.',
  7: 'A system someone can actually run: connected, decided, and visible. This is the whole of it.'
};

/* A heartbeat is two thumps, not a sine — a strong one followed by a softer
   one, then a rest. Two gaussians on a 1.35s cycle give that shape. */
const heartbeat = t => {
  const p = (t / 1.35) % 1;
  const thump = (at, w) => Math.exp(-Math.pow((p - at) / w, 2));
  return Math.min(1, thump(.07, .05) + thump(.28, .062) * .62);
};

let layersUpdate = () => {};
function layersRig() {
  const box = $('#layers');
  if (!box) return;
  const cv = $('#lyCanvas'), note = $('#lyNote');
  const bars = { effort: $('#lyEffort'), errors: $('#lyErrors'), flow: $('#lyFlow') };
  const ctx = cv.getContext('2d');
  const want = { intel: 0, auto: 0, design: 0 };
  const L = { intel: 0, auto: 0, design: 0 };
  let W = 0, H = 0, jobs = [];
  // one light per station, and a clock so they come up in order
  const lit = LY_STATIONS.map(() => 0);
  let cascadeAt = 0;

  const size = () => {
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const d = Math.min(devicePixelRatio || 1, 1.5);
    W = r.width; H = r.height;
    cv.width = W * d; cv.height = H * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
  };

  const pos = i => {
    const s = LY_STATIONS[i];
    return {
      x: (s.mess[0] + (s.neat[0] - s.mess[0]) * L.design) * W,
      y: (s.mess[1] + (s.neat[1] - s.mess[1]) * L.design) * H
    };
  };

  const spawn = () => ({
    at: 0, to: 1, k: 0, life: 1,
    wrong: Math.random() < (1 - L.intel) * .45,     // no decision: it can go wrong
    wob: Math.random() * 7, lane: Math.random()
  });

  const applyState = () => {
    const effort = 1 - (want.auto * .55 + want.intel * .20 + want.design * .08);
    const errors = 1 - (want.intel * .72 + want.auto * .18);
    const flow   = .18 + want.auto * .46 + want.intel * .22 + want.design * .14;
    bars.effort.style.width = (effort * 100).toFixed(1) + '%';
    bars.errors.style.width = (errors * 100).toFixed(1) + '%';
    bars.flow.style.width   = (flow   * 100).toFixed(1) + '%';
    note.textContent = LY_NOTES[(want.intel ? 1 : 0) | (want.auto ? 2 : 0) | (want.design ? 4 : 0)];
  };

  $$('.ly-t', box).forEach(btn => btn.addEventListener('click', () => {
    const k = btn.dataset.k;
    want[k] = want[k] ? 0 : 1;
    btn.setAttribute('aria-pressed', String(!!want[k]));
    if (k === 'auto') cascadeAt = performance.now();   // the rails come up in order
    // the cue is an instruction, and it has been followed
    box.classList.toggle('switched', !!(want.intel || want.auto || want.design));
    applyState();
  }));

  layersUpdate = (t, dt, live) => {
    if (!W) size();
    if (!live || !W) return;
    for (const k in L) L[k] += (want[k] - L[k]) * (1 - Math.pow(.90, dt / 16));

    if (jobs.length < 7 && Math.random() < .05 + L.auto * .06) jobs.push(spawn());

    ctx.clearRect(0, 0, W, H);

    // the rails, or the absence of them
    ctx.lineWidth = 1;
    for (const [a, b] of LY_EDGES) {
      const p = pos(a), q = pos(b);
      const reach = Math.min(lit[a], lit[b]);           // a rail exists once both ends do
      ctx.strokeStyle = `rgba(150,180,255,${(.05 + L.auto * .10 + reach * .26).toFixed(3)})`;
      ctx.setLineDash(reach > .5 ? [] : [3, 7]);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    }
    ctx.setLineDash([]);

    // the work itself
    for (const j of jobs) {
      const p = pos(j.at), q = pos(j.to);
      j.k += (.004 + L.auto * .011) * (dt / 16);
      if (j.k >= 1) {
        j.k = 0; j.at = j.to;
        const opts = LY_NEXT[j.at];
        if (!opts || !opts.length) { j.life = 0; }
        else if (opts.length > 1) {
          const right = j.lane < .5 ? opts[0] : opts[1];
          j.to = j.wrong && Math.random() < (1 - L.intel) ? opts[j.lane < .5 ? 1 : 0] : right;
        } else j.to = opts[0];
        if (Math.random() < (1 - L.intel) * .10) j.life = 0;   // dropped, unnoticed
      }
      if (j.life <= 0) continue;

      // without rails it does not travel in a straight line
      const wob = (1 - L.auto) * 14 * Math.sin(t * .003 + j.wob);
      const nx = -(q.y - p.y), ny = (q.x - p.x);
      const len = Math.hypot(nx, ny) || 1;
      const x = p.x + (q.x - p.x) * j.k + (nx / len) * wob;
      const y = p.y + (q.y - p.y) * j.k + (ny / len) * wob;

      const col = L.design > .5
        ? (j.lane < .5 ? '90,160,255' : '176,90,255')
        : '150,160,190';
      ctx.fillStyle = `rgba(${col},${(.35 + L.design * .55).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 7); ctx.fill();
      if (L.auto > .3) {                                  // a trail, once it has rails
        const g = ctx.createLinearGradient(x - (q.x - p.x) * .06, y - (q.y - p.y) * .06, x, y);
        g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(1, `rgba(${col},${(L.auto * .5).toFixed(2)})`);
        ctx.strokeStyle = g; ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x - (q.x - p.x) * .06, y - (q.y - p.y) * .06);
        ctx.lineTo(x, y); ctx.stroke();
      }
    }
    jobs = jobs.filter(j => j.life > 0);

    /* Switching automation on runs the line: each station lights 150ms after
       the one to its left, so you watch the rails come up rather than having
       them simply appear. Switching off, they all fall together. */
    const STAGGER = 150;
    LY_STATIONS.forEach((st, i) => {
      const target = want.auto && (t - cascadeAt) > i * STAGGER ? 1 : 0;
      const rate = target ? .12 : .2;
      lit[i] += (target - lit[i]) * (1 - Math.pow(1 - rate, dt / 16));
    });

    // the stations
    LY_STATIONS.forEach((st, i) => {
      const p = pos(i);
      const isJunction = (LY_NEXT[i] || []).length > 1;
      const on = lit[i];

      if (on > .01) {                                   // the light itself
        const r = 15 + on * 5 + Math.sin(t * .004 + i) * 1.5;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, `rgba(130,180,255,${(.50 * on).toFixed(3)})`);
        g.addColorStop(.55, `rgba(140,90,255,${(.20 * on).toFixed(3)})`);
        g.addColorStop(1, 'rgba(120,80,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(224,238,255,${(.92 * on).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3 + on * .8, 0, 7); ctx.fill();
      }

      ctx.strokeStyle = `rgba(200,215,255,${(.14 + L.design * .30 + on * .45).toFixed(2)})`;
      ctx.lineWidth = 1 + on * .6;
      ctx.beginPath(); ctx.arc(p.x, p.y, 7 + L.design * 2, 0, 7); ctx.stroke();
      if (isJunction && L.intel > .05) {                  // a decision, once there is one
        const hb = heartbeat(t * .001), a = L.intel;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const R = (7 + hb * 12) * 3.2;                    // the glow breathes
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
        g.addColorStop(0,   `rgba(255,255,255,${(.90 * a).toFixed(3)})`);
        g.addColorStop(.14, `rgba(246,251,255,${(.62 * a * (.45 + hb * .55)).toFixed(3)})`);
        g.addColorStop(.38, `rgba(190,220,255,${(.30 * a * (.35 + hb * .65)).toFixed(3)})`);
        g.addColorStop(.70, `rgba(110,170,255,${(.14 * a * (.25 + hb * .75)).toFixed(3)})`);
        g.addColorStop(1,   'rgba(90,150,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, 7); ctx.fill();
        // the white core, which is what actually reads as a beat
        ctx.fillStyle = `rgba(255,255,255,${(.95 * a).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.4 + hb * 2.6, 0, 7); ctx.fill();
        ctx.restore();
      }
      if (L.design > .25) {
        ctx.fillStyle = `rgba(200,212,235,${((L.design - .25) * .9).toFixed(2)})`;
        ctx.font = '500 9px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(st.label.toUpperCase(), p.x, p.y + 22);
      }
    });
  };

  size();
  applyState();
}

/* ── projects: work moving through the machine ─────────────────────
   Lanes of packets running left to right through gates, rerouting to a
   neighbouring lane as they pass. The diagonal is the point: this is work
   being handed off, not a decorative loop. Lanes are evenly spaced rather
   than pinned to DOM rows, so the substrate keeps running whatever the
   section above it is made of. Only animates while Projects is on screen. */
let audioEnable = () => {}, audioRamp = () => {};
function audioRig() {
  const el = $('#ambient'), wrap = $('#vol'), btn = $('#volBtn'), slider = $('#volSlider');
  if (!el || !wrap) return;

  let base = +slider.value / 100, on = false, boost = 1, lastTouch = 0, wired = false;

  /* A page may not start audio without a gesture, and entering the site is no
     longer one — there is no door to click any more. Both the play attempt and
     the analyser wait on the first thing the visitor actually does. */
  const WAKE = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

  /* One AnalyserNode on the bed, built the first time playback starts (it
     needs a gesture, and createMediaElementSource may only run once). fftSize
     128 is 64 bins; reading the lowest twelve each frame is a rounding error
     next to everything else on screen. */
  let waitingForGesture = false;
  const wireAnalyser = () => {
    if (wired) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { wired = true; return; }
      const ac = new AC();
      /* createMediaElementSource DISCONNECTS the element from the speakers and
         routes it into this graph. A context built outside a user gesture
         starts suspended, and resume() cannot lift that on its own — so wiring
         here played the bed into a dead graph: element running, currentTime
         advancing, the control honestly showing unmuted, and silence. Which is
         why muting and unmuting fixed it: the click was the gesture.

         So the graph is only built once a context can actually run. Until
         then the element stays on the default output, where it is audible. */
      if (ac.state === 'suspended') {
        ac.close();
        if (!waitingForGesture) {
          waitingForGesture = true;
          const go = () => {
            WAKE.forEach(ev => removeEventListener(ev, go));
            waitingForGesture = false;
            wireAnalyser();
          };
          WAKE.forEach(ev => addEventListener(ev, go, { passive: true }));
        }
        return;
      }
      wired = true;
      const an = ac.createAnalyser();
      an.fftSize = 128; an.smoothingTimeConstant = .82;
      ac.createMediaElementSource(el).connect(an);
      an.connect(ac.destination);                      // or the page goes silent
      const bins = new Uint8Array(an.frequencyBinCount);
      ac.resume?.();
      beatLevel = () => {
        an.getByteFrequencyData(bins);
        let sum = 0;
        for (let i = 0; i < 12; i++) sum += bins[i];
        return sum / (12 * 255);
      };
    } catch (e) { wired = true; /* no analyser: the aurora drifts without a beat */ }
  };

  const effective = () => clamp(base * boost, 0, 1);
  const apply = () => { el.volume = effective(); };

  /* The slider shows the volume you can actually hear, not the setting
     behind it — so when a melt pushes the level up, the thumb rides up with
     it. Without this the sound swells while the control sits still, which
     reads as a broken slider. */
  const showLevel = () => {
    const v = Math.round(effective() * 100);
    if (+slider.value !== v) slider.value = v;
    slider.style.setProperty('--v', v);
  };
  const paintState = () => {
    wrap.classList.toggle('muted', !on || base === 0);
    wrap.classList.toggle('boost', on && boost > 1.06);
    btn.setAttribute('aria-pressed', String(!on));
    btn.setAttribute('aria-label', on ? 'Mute' : 'Unmute');
  };

  let armed = false;

  /* Unmuting an element that is already playing is governed by the same
     policy as starting one, so this has to wait for a real activation.
     A wheel is not one — Chrome counts pointerdown, keydown and touchstart,
     and scrolling past on a trackpad counts for nothing. */
  const ACTIVATE = ['pointerdown', 'keydown', 'touchstart', 'touchend', 'click'];
  const armUnmute = () => {
    if (armed) return;
    armed = true;
    const go = () => {
      ACTIVATE.forEach(ev => removeEventListener(ev, go));
      armed = false;
      el.muted = false;
      if (el.paused) el.play().catch(() => {});
      wireAnalyser();                 // a context can run now, so build it
      apply(); showLevel(); paintState();
    };
    ACTIVATE.forEach(ev => addEventListener(ev, go, { passive: true }));
  };

  audioEnable = async v => {
    on = v;
    if (on) {
      el.muted = false;
      try { await el.play(); wireAnalyser(); }
      catch (e) {
        /* No browser will start UNMUTED audio without a user activation, and
           entering the site is no longer one — there is no door to click. But
           muted autoplay is always allowed. So the bed starts muted and plays
           from the moment the page opens; the first press or keystroke lifts
           the mute. The sound is running the whole time, only its output is
           waiting, which is why the control is right to read as on. */
        el.muted = true;
        try { await el.play(); armUnmute(); }
        catch (e2) { on = false; el.muted = false; }
      }
    }
    else el.pause();
    apply(); showLevel(); paintState();
  };

  /* Touching either control hands control straight back to the listener:
     the boost drops to 1 at once and is held there briefly, so the slider
     responds immediately instead of fighting a melt that is still fading. */
  const takeControl = () => { lastTouch = performance.now(); boost = 1; };

  btn.addEventListener('click', () => {
    takeControl();
    el.muted = false;                 // this click IS the activation
    armed = false;
    if (!on && base === 0) { base = .35; slider.value = 35; }        // unmuting from zero
    audioEnable(!on);
  });
  slider.addEventListener('input', () => {
    takeControl();
    base = +slider.value / 100;
    slider.style.setProperty('--v', Math.round(base * 100));
    /* Moving this IS the activation, so it lifts a waiting mute. Without
       this the bed was already `on` and playing muted, so the branch below
       fell through to a repaint and the sound never arrived — dragging the
       volume did nothing at all. */
    if (base > 0 && el.muted) { el.muted = false; armed = false; wireAnalyser(); }
    if (base > 0 && !on) audioEnable(true);
    else { apply(); paintState(); }
  });

  audioRamp = (target, dt) => {
    if (!on) { boost = 1; return; }
    if (performance.now() - lastTouch < 1200) { boost = 1; apply(); return; }
    boost += (target - boost) * (1 - Math.pow(.90, dt / 16));
    apply(); showLevel();
    wrap.classList.toggle('boost', boost > 1.06);
  };

  showLevel(); paintState();
}

/* ── aurora ─────────────────────────────────────────────────────────
   Comes up five seconds after a melt begins and brightens on the low end
   of the music. The drift is pure CSS on three gradient blobs, so the only
   per-frame work here is one opacity write. When it is not showing the
   layer is display:none and costs nothing at all. */
let auroraUpdate = () => {}, beatLevel = () => 0;

/* The aurora is a fragment shader: real curtains need noise that flows along
   the rays, and there is no honest way to fake that with gradients. It draws
   at ~45% resolution and is scaled up by CSS — an aurora is all soft edges,
   so the upscale IS the blur, for free. Off-screen it does not render at all.
   No WebGL (or a lost context) falls back to the gradient blobs.            */
const AURORA_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2  u_res;
uniform float u_time;
uniform float u_beat;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ v += a * vnoise(p); p *= 2.02; a *= 0.5; }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  uv.x *= u_res.x / u_res.y;                       // keep the rays square

  // a fan springing from below the frame, the way a real curtain hangs
  vec2 c = vec2(0.5 * u_res.x / u_res.y, -0.55);
  vec2 d = uv - c;
  float ang = atan(d.x, d.y);
  float rad = length(d);

  float t = u_time * 0.055;

  // noise stretched along the ray and tight across it = curtain folds
  float n  = fbm(vec2(ang * 3.4 + t * 1.15, rad * 1.30 - t * 2.2));
  n += 0.55 * fbm(vec2(ang * 7.1 - t * 0.85, rad * 2.35 - t * 3.1));
  n /= 1.55;

  float curtain = smoothstep(0.30, 0.86, n);
  float fade    = smoothstep(1.45, 0.10, rad) * smoothstep(0.02, 0.30, rad);
  float edge    = 1.0 - smoothstep(0.85, 1.35, abs(ang));   // fan width
  float glow    = curtain * fade * edge;

  vec3 blue   = vec3(0.118, 0.565, 1.000);          // #1E90FF
  vec3 violet = vec3(0.651, 0.145, 0.933);          // #A625EE

  /* Hue rides its own slow field rather than the curtain's brightness, so
     the sky gets distinct bands of blue and of violet. Drive it off n and
     everything lands violet, because n is high wherever a curtain is. */
  float hue = fbm(vec2(ang * 1.7 + t * 0.5, rad * 0.7 - t * 0.35));
  vec3 col = mix(blue, violet, smoothstep(0.34, 0.66, hue));
  col += vec3(0.62, 0.82, 1.0) * pow(glow, 4.0) * 1.15;      // white-hot cores

  float a = glow * (0.72 + u_beat * 0.5);
  gl_FragColor = vec4(col * a, a);
}`;

const AURORA_VERT = `
attribute vec2 p;
void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

function auroraRig() {
  const wrap = $('#aurora'), cv = $('#auroraCanvas');
  if (!wrap || reduced) return;

  let gl = null, prog = null, uRes = null, uTime = null, uBeat = null, ok = false;
  try {
    gl = cv.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true,
                                  powerPreference: 'low-power' });
    if (gl) {
      const build = (type, src) => {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
        return sh;
      };
      prog = gl.createProgram();
      gl.attachShader(prog, build(gl.VERTEX_SHADER, AURORA_VERT));
      gl.attachShader(prog, build(gl.FRAGMENT_SHADER, AURORA_FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      uRes  = gl.getUniformLocation(prog, 'u_res');
      uTime = gl.getUniformLocation(prog, 'u_time');
      uBeat = gl.getUniformLocation(prog, 'u_beat');
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      ok = true;
    }
  } catch (e) { ok = false; }

  if (!ok) wrap.classList.add('no-gl');
  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); ok = false; wrap.classList.add('no-gl'); });

  let cw = 0, chh = 0;
  const sizeIt = () => {
    const w = Math.max(2, Math.round(vw * .45)), h = Math.max(2, Math.round(vh * .45));
    if (w === cw && h === chh) return;
    cw = w; chh = h; cv.width = w; cv.height = h;
    if (ok) { gl.viewport(0, 0, w, h); gl.uniform2f(uRes, w, h); }
  };

  let lvl = 0, shown = false;
  auroraUpdate = (meltMs, t) => {
    const s = meltMs / 1000 - 5;                       // five seconds after the melt
    const fade = s <= 0 ? 0 : clamp(1 - Math.exp(-Math.pow(s / 4, 2)), 0, 1);

    if (fade < .004) {
      if (shown) { shown = false; wrap.classList.remove('on'); wrap.style.opacity = '0'; lvl = 0; }
      return;
    }
    if (!shown) { shown = true; wrap.classList.add('on'); sizeIt(); }

    lvl += (beatLevel() - lvl) * .2;                   // sampled only while visible
    wrap.style.opacity = fade.toFixed(3);

    if (!ok) return;
    sizeIt();
    gl.uniform1f(uTime, t * .001);
    gl.uniform1f(uBeat, lvl);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
}

/* ── idle melt ─────────────────────────────────────────────────────
   Stop scrolling and the section you stopped on liquefies — and keeps
   liquefying. There is no plateau: `meltT` simply accumulates for as long
   as you leave it alone, and everything downstream is a function of it.

   Two curves do the work. `ramp` (~1.8s) is the initial liquefy. `drift`
   (~14s) never actually arrives, so the smear keeps spreading and the
   section keeps sagging out of frame the longer you stay away.

   Any cursor movement counts as being here, not just scroll or click — the
   melt is for a page that has genuinely been left alone. */
const MELT_AFTER = 30000;      // half a minute of being left alone
let lastActive = performance.now(), meltEl = null, meltT = 0, lastDispWrite = 0;
const meltDisp = $('#meltDisp');

const wake = () => { lastActive = performance.now(); };
['scroll', 'wheel', 'touchmove', 'keydown', 'pointerdown', 'pointermove']
  .forEach(ev => addEventListener(ev, wake, { passive: true }));

function clearMelt() {
  if (!meltEl) return;
  meltEl.classList.remove('melting');
  ['--melt', '--blur', '--sag', '--sagY'].forEach(v => meltEl.style.removeProperty(v));
  document.body.classList.remove('melting');
  ['--cmelt', '--cblur'].forEach(v => document.body.style.removeProperty(v));
  meltEl = null; meltT = 0;
  meltDisp.setAttribute('scale', '0');
}

function writeMelt(el, t, urgent) {
  const s = meltT / 1000;

  /* The onset must be invisible. A plain exponential like 1-e^(-s/1.8) is
     already 67% deep two seconds in — you watch it arrive, which defeats
     the whole idea. These curves leave zero with zero SLOPE, so the first
     few seconds genuinely read as nothing happening, and the melt only
     becomes apparent once you have long since stopped paying attention. */
  const gate = 1 - Math.exp(-Math.pow(s / 8, 2.5));   // the slow opener
  const ramp = 1 - Math.exp(-Math.pow(s / 6, 2.2));   // the liquefy itself
  const soft = (1 - Math.exp(-s / 20)) * gate;        // blur and stretch

  /* Still no ceiling: past the opening, the linear term keeps dragging for
     as long as you leave it, so the melt never appears to have finished. */
  const sag  = (120 + 14 * s) * gate;
  const disp = 20 * ramp + 3.2 * s * gate;

  meltEl = el;
  el.classList.add('melting');
  el.style.setProperty('--melt', ramp.toFixed(3));
  el.style.setProperty('--blur', (2.2 * ramp + 8 * soft).toFixed(2) + 'px');
  el.style.setProperty('--sag',  sag.toFixed(1) + 'px');
  el.style.setProperty('--sagY', (1 + 1.2 * soft).toFixed(3));

  /* The chrome — marker, launcher, wordmark, telemetry, the rail — is fixed at
     body level, which is the whole reason it used to ride out the melt while
     the page gave way beneath it. It takes the melt now, under its own names:
     --melt and --blur would inherit down into the reading panel and drip the
     very thing someone is reading.

     No sag for the chrome. The page can afford to drip off the bottom because
     there is more of it; a top bar sliding 300px down just parks itself in
     the middle of the screen, and a launcher that leaves the frame cannot be
     found by the person it is there for. */
  const b = document.body;
  b.classList.add('melting');
  b.style.setProperty('--cmelt', ramp.toFixed(3));
  b.style.setProperty('--cblur', (1.6 * ramp + 5 * soft).toFixed(2) + 'px');

  /* No turbulence map on a phone or a pad — see melt(). */
  if (flat) return;

  /* The transform above is composited and free. The displacement map is not
     — it re-rasterises the whole section — so it is written at ~15fps, and
     not at all once the section has dripped past the bottom of the frame
     where no one can see it. The sag keeps moving regardless. */
  if (sag > vh * 1.4) return;
  if (urgent || t - lastDispWrite > 66) {
    lastDispWrite = t;
    meltDisp.setAttribute('scale', disp.toFixed(1));
  }
}

const viewportEl = $('#viewport');
function melt(t, dt) {
  if (reduced || !meltDisp) return;
  /* rAF is suspended while the tab is hidden, so on return `t - lastActive`
     can be minutes. Treat a long frame gap as coming back to the page and
     restart the countdown, rather than snapping straight to a deep melt. */
  if (dt > 500) { lastActive = t; meltT = 0; }
  /* The whole screen melts, not whichever section happens to be nearest —
     the effect is the page giving way, and the page is all of it. Panels and
     films sit above the world at body level and are never touched.

     Flat mode is the exception, and has to be. There #viewport IS the
     document — every stop stacked in normal flow — so filtering it would
     rasterise the entire page at once for a blur that only ever shows one
     screen of it, and its translateY sag would shove the page down and move
     the scroll out from under a reading thumb. The section in view melts
     instead: one screen's worth, bounded, and it looks the same. */
  const el = flat ? (stops[nearIdx] || viewportEl) : viewportEl;
  if (meltEl && meltEl !== el) clearMelt();

  if (t - lastActive < MELT_AFTER) {
    if (meltT <= 0) return;
    // recover fast, and at the same speed however deep the melt had got
    meltT = meltT * Math.pow(.80, dt / 16) - dt;
    if (meltT < 12) { clearMelt(); return; }
    writeMelt(el, t, true);
    return;
  }
  meltT += dt;                                // no latch: it keeps going
  /* The blur is re-rasterised on every write, and it grows by a fraction of a
     pixel per frame. Twenty writes a second is indistinguishable from sixty
     and costs a third as much — which matters here, because unlike everything
     else on this page the melt runs for as long as the phone is left alone. */
  if (flat && fno % 3) return;
  writeMelt(el, t, false);
}

/* ── the mast ──────────────────────────────────────────────────────
   The studio's four rooms orbit one vertical axis. Items in front are
   bright and large; items swinging behind the pole dim and recede.
   Idle drift + drag momentum + a torque kick from scrolling. */
let poleUpdate = () => {};
function poleRig() {
  const pole = $('#pole'), stage = $('#poleStage');
  if (!pole || !stage || reduced) return;
  const items = $$('.orbit', stage);
  const n = items.length;

  let rot = Math.random() * Math.PI * 2;      // a different face forward each load
  let vel = 0, dragging = false, lastX = 0;

  /* A press is a click until it travels far enough to be a drag. Capturing
     the pointer up front would retarget pointerup to the mast and the
     button's click would never fire — so we capture only once dragging is
     real, and swallow the click that trails a genuine drag. */
  let down = false, moved = false, held = false, downX = 0, downY = 0, swallow = false;

  pole.addEventListener('pointerdown', e => {
    down = true; moved = false; held = false;
    downX = e.clientX; downY = e.clientY; lastX = e.clientX; vel = 0;
  });
  addEventListener('pointermove', e => {
    if (!down) return;
    if (!moved && Math.hypot(e.clientX - downX, e.clientY - downY) > 5) {
      moved = true; dragging = true;
      pole.classList.add('dragging');
      try { pole.setPointerCapture(e.pointerId); held = true; } catch {}
    }
    if (moved) { rot += (e.clientX - lastX) * .008; vel = (e.clientX - lastX) * .008; }
    lastX = e.clientX;
  }, { passive: true });
  const release = e => {
    if (!down) return;
    down = false; dragging = false;
    pole.classList.remove('dragging');
    if (held) { try { pole.releasePointerCapture(e.pointerId); } catch {} held = false; }
    if (moved) swallow = true;
  };
  addEventListener('pointerup', release);
  addEventListener('pointercancel', release);
  pole.addEventListener('click', e => {
    if (!swallow) return;
    swallow = false;
    e.preventDefault(); e.stopPropagation();
  }, true);

  poleUpdate = (t, dt, heroD) => {
    if (!dragging) {
      vel *= Math.pow(.94, dt / 16);                  // momentum bleeds off
      rot += vel + dt * .0001725 + scrollVel * 8;     // drift +15% + scroll torque
    }
    // the mast belongs to the hero; it fades as you leave
    const fade = clamp(1 - (heroD - .3) / .5, 0, 1);
    pole.style.opacity = fade.toFixed(3);
    pole.style.pointerEvents = fade > .55 ? 'auto' : 'none';
    if (fade <= .01) return;

    const R = Math.max(60, pole.clientWidth * .33);
    const spacing = pole.clientHeight / (n + 1.3);
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2;
      const x = Math.sin(a) * R, z = Math.cos(a) * R;
      const y = (i - (n - 1) / 2) * spacing;
      const depth = (z + R) / (R * 2);                // 0 = behind, 1 = in front
      items[i].style.transform =
        `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${z.toFixed(1)}px) translate(-50%,-50%)`;
      items[i].style.opacity = (.14 + depth * .86).toFixed(3);
    }
  };
}

/* ── projects: work moving through the machine ─────────────────────
   Five lanes, one per project, with packets running left to right through
   gates. A packet reaching a gate sometimes reroutes to a neighbouring
   lane — the diagonal is the point: this is work being handed off, not a
   decorative loop. */

let flowUpdate = () => {}, flowLayout = () => {};
function projFlow() {
  const stage = $('.proj-stage'), cv = $('#projFlow');
  if (!stage || !cv) return;
  const ctx = cv.getContext('2d');
  const TONES = ['#1E90FF', '#3F5BFF', '#6A46F5', '#8E33F0', '#A625EE'];
  const LANES = 7;
  let W = 0, H = 0, lanes = [], gates = [], packets = [];

  flowLayout = () => {
    W = stage.offsetWidth; H = stage.offsetHeight;
    if (!W || !H) return;
    const d = Math.min(devicePixelRatio || 1, 1.5);
    cv.width = W * d; cv.height = H * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);

    lanes = Array.from({ length: LANES }, (_, i) => ({
      y: H * (i + .5) / LANES,
      tone: TONES[i % TONES.length]
    }));
    gates = [];
    lanes.forEach((ln, i) => [.22, .44, .66, .86].forEach(f =>
      gates.push({ x: W * f, y: ln.y, lane: i, flash: 0 })));
    packets = [];
    for (let i = 0; i < lanes.length; i++)
      for (let k = 0; k < 2; k++)
        packets.push({ lane: i, x: Math.random() * W, y: lanes[i].y,
                       sp: .022 + Math.random() * .045, seen: -1 });
  };

  flowUpdate = (t, dt, live) => {
    if (!live || !lanes.length) return;
    ctx.clearRect(0, 0, W, H);

    for (const g of gates) {
      g.flash *= Math.pow(.90, dt / 16);
      ctx.fillStyle = `rgba(190,210,255,${.08 + g.flash * .75})`;
      ctx.fillRect(g.x - .5, g.y - 5, 1, 10);
    }

    for (const p of packets) {
      p.x += p.sp * dt;
      if (p.x > W + 30) { p.x = -30; p.seen = -1; p.sp = .022 + Math.random() * .045; }

      for (let gi = 0; gi < gates.length; gi++) {
        const g = gates[gi];
        if (g.lane !== p.lane || gi === p.seen) continue;
        if (Math.abs(p.x - g.x) < 6) {
          g.flash = 1; p.seen = gi;
          if (Math.random() < .3) {                     // hand off to a neighbour
            const next = p.lane + (Math.random() < .5 ? -1 : 1);
            if (next >= 0 && next < lanes.length) p.lane = next;
          }
        }
      }
      p.y += (lanes[p.lane].y - p.y) * (1 - Math.pow(.992, dt));

      const tone = lanes[p.lane].tone;
      const g = ctx.createLinearGradient(p.x - 26, 0, p.x + 3, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, tone);
      ctx.strokeStyle = g; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x - 26, p.y); ctx.lineTo(p.x, p.y); ctx.stroke();

      ctx.fillStyle = tone;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, 7); ctx.fill();
    }
  };
}

/* ── counters ──────────────────────────────────────────────────── */
function countUp(el) {
  if (el.dataset.done || !el.dataset.count) return;    // literal figures stay literal
  el.dataset.done = '1';
  const to = +el.dataset.count; const dur = 1400; const t0 = performance.now();
  (function step(now) {
    const k = clamp((now - t0) / dur, 0, 1);
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}

/* ── enquiry ───────────────────────────────────────────────────────
   Every field is required. On success the form gives way to the
   confirmation, which holds for five seconds and then hands back a clean
   form for the next enquiry.

   Delivery is a Netlify Form (data-netlify on the markup, POSTed here as
   AJAX so the page never navigates). If that POST fails — running locally,
   or deployed somewhere that is not Netlify — we say so and offer the email
   instead. Showing "Problem received" for an enquiry that went nowhere
   would be worse than any error message.                                 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function enquiry() {
  const stage = $('.eq-stage'), form = $('#enquiry'), note = $('#eqNote'), msg = $('#eqDoneMsg');
  if (!stage || !form) return;
  // selects are required fields as much as the inputs are, and a <select>
  // is not an <input> — leaving it out of this list let an empty chooser
  // through the gate entirely.
  const inputs = $$('input[required],select[required]', form);
  let timer = null, busy = false;

  // split the confirmation so it can arrive letter by letter
  if (msg && !msg.dataset.split) {
    msg.dataset.split = '1';
    const text = msg.textContent;
    msg.textContent = '';
    [...text].forEach((c, i) => {
      const sp = document.createElement('span');
      sp.className = 'dchar';
      sp.textContent = c === ' ' ? ' ' : c;
      sp.style.setProperty('--i', i);
      msg.appendChild(sp);
    });
  }

  const setNote = (text, warn) => {
    note.textContent = text;
    note.classList.toggle('warn', !!warn);
  };
  inputs.forEach(f => f.addEventListener('input', () => {
    f.closest('.eq-field').classList.remove('invalid');
  }));

  const check = () => {
    let first = null, why = '';
    for (const f of inputs) {
      const v = f.value.trim();
      const ok = v && (f.type !== 'email' || EMAIL_RE.test(v));
      f.closest('.eq-field').classList.toggle('invalid', !ok);
      if (!ok && !first) {
        first = f;
        why = !v ? 'Every field is needed — we cannot come back to you without them.'
                 : 'That email address does not look right.';
      }
    }
    if (first) { setNote(why, true); first.focus(); }
    return !first;
  };

  const reset = () => {
    stage.classList.remove('sent');
    form.reset();
    inputs.forEach(f => f.closest('.eq-field').classList.remove('invalid'));
    setNote('All fields are required, so we can come back to you properly.', false);
    busy = false;
  };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (busy || !check()) return;
    busy = true;
    setNote('Sending…', false);

    try {
      const v = {};
      new FormData(form).forEach((val, k) => { if (k !== '_honey') v[k] = val; });

      const payload = ENQUIRY_WEBHOOK ? {
        ...v,
        sentAt: new Date().toISOString(),
        source: location.hostname || 'local'
      } : {
        _subject: 'New enquiry — ' + v.company,
        _template: 'table',
        _captcha: 'false',
        Company: v.company,
        Email: v.email,
        Phone: v.phone,
        Service: v.service,
        Budget: v.budget || '—',
        Package: v.package || '—',
        'Problem they face': v.problem,
        'They request': v.request,
        Sent: new Date().toLocaleString()
      };

      const res = await fetch(ENQUIRY_WEBHOOK || ENQUIRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(res.status);
    } catch (err) {
      busy = false;
      setNote('That did not send. Please try again in a moment.', true);
      return;
    }

    stage.classList.add('sent');
    clearTimeout(timer);
    timer = setTimeout(reset, 5000);      // hand back a clean form
  });
}

/* ── the two choosers ──────────────────────────────────────────────
   A native popup is drawn by the operating system, in the operating system's
   colours, and no stylesheet reaches inside it. So the <select> keeps its
   job — it is what FormData reads and what check() validates — and a listbox
   is painted over the top of it.

   Everything the browser was doing for free then has to be put back by hand:
   keyboard, outside-click, aria state, and a flip upward when the panel would
   run past the bottom of the frame. #viewport is overflow:hidden, so a panel
   that overruns is cut off rather than scrolled to.

   Type-ahead is deliberately not implemented — three options, and a wrong
   guess about which letter starts which tier is worse than no shortcut. */
function selects() {
  const all = [];

  $$('.eq-sel').forEach((wrap, w) => {
    const sel = $('select', wrap);
    if (!sel) return;
    const opts = [...sel.options].filter(o => !o.disabled);
    if (!opts.length) return;
    const ph = sel.options[0].textContent;      // the placeholder's own words

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'eq-sel-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    const lab = sel.getAttribute('aria-labelledby');
    if (lab) btn.setAttribute('aria-labelledby', lab);
    const val = document.createElement('span');
    val.className = 'eq-sel-val';
    const caret = document.createElement('i');
    caret.className = 'eq-sel-caret';
    caret.setAttribute('aria-hidden', 'true');
    /* the travelling outline. A real element rather than a pseudo because the
       idiom needs two boxes — one masked to the rim, one spinning inside it —
       and a pseudo-element cannot have a pseudo-element of its own. Same
       construction as .reader-ring. */
    const ring = document.createElement('i');
    ring.className = 'eq-sel-ring';
    ring.setAttribute('aria-hidden', 'true');
    btn.append(ring, val, caret);

    const menu = document.createElement('div');
    menu.className = 'eq-sel-menu';
    menu.setAttribute('role', 'listbox');
    if (lab) menu.setAttribute('aria-labelledby', lab);
    const items = opts.map((o, i) => {
      const b = document.createElement('button');
      b.type = 'button';                        // never a submit — it is inside the form
      b.className = 'eq-sel-opt';
      b.id = 'eqOpt' + w + '-' + i;
      b.setAttribute('role', 'option');
      b.tabIndex = -1;
      b.textContent = o.textContent;
      b.dataset.v = o.value;
      menu.appendChild(b);
      return b;
    });

    wrap.append(btn, menu);
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');
    wrap.classList.add('on');

    let cue = -1;
    const isOpen = () => wrap.classList.contains('open');

    const paint = () => {
      const chosen = sel.value;
      val.textContent = chosen || ph;
      wrap.classList.toggle('empty', !chosen);
      items.forEach(b => b.setAttribute('aria-selected', String(b.dataset.v === chosen)));
    };

    const markCue = i => {
      cue = clamp(i, 0, items.length - 1);
      items.forEach((b, n) => b.classList.toggle('cue', n === cue));
      btn.setAttribute('aria-activedescendant', items[cue].id);
    };

    const close = back => {
      if (!isOpen()) return;
      wrap.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      btn.removeAttribute('aria-activedescendant');
      items.forEach(b => b.classList.remove('cue'));
      cue = -1;
      if (back) btn.focus();
    };

    const open = () => {
      if (isOpen()) return;
      all.forEach(s => { if (s.wrap !== wrap) s.close(false); });
      /* The stop is scaled by --fit, so the panel's laid-out height is not its
         height on screen. getBoundingClientRect is, and it reads correctly
         while the panel is only visibility:hidden. */
      const r = btn.getBoundingClientRect();
      const h = menu.getBoundingClientRect().height;
      wrap.classList.toggle('up', r.bottom + h + 24 > innerHeight);
      wrap.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      markCue(Math.max(0, items.findIndex(b => b.dataset.v === sel.value)));
    };

    const choose = i => {
      const b = items[i];
      if (!b) return;
      sel.value = b.dataset.v;
      paint();
      /* the same events the native control fires, so the invalid-clearing
         listener in enquiry() needs to know nothing about any of this */
      sel.dispatchEvent(new Event('input',  { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      close(true);
    };

    btn.addEventListener('click', () => isOpen() ? close(false) : open());
    items.forEach((b, i) => b.addEventListener('click', () => choose(i)));

    wrap.addEventListener('keydown', e => {
      const on = isOpen();
      switch (e.key) {
        case 'Escape':    if (on) { e.preventDefault(); close(true); } break;
        case 'Enter':
        case ' ':         e.preventDefault(); on ? choose(cue) : open(); break;
        case 'ArrowDown': e.preventDefault(); on ? markCue(cue + 1) : open(); break;
        case 'ArrowUp':   e.preventDefault(); on ? markCue(cue - 1) : open(); break;
        case 'Home':      if (on) { e.preventDefault(); markCue(0); } break;
        case 'End':       if (on) { e.preventDefault(); markCue(items.length - 1); } break;
        case 'Tab':       close(false); break;
      }
    });

    paint();
    all.push({ wrap, btn, sel, close, paint });
  });

  if (!all.length) return;

  /* "Start with Starter" and its siblings live in the reading panel, which is
     a clone — so this is delegated, and it drives the real controls rather
     than a copy of them: set the two answers, let the cross-field rule run,
     shut the panel the way Escape does and travel to the form. */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    const svc = all.find(s => s.sel.name === 'service');
    const pk  = all.find(s => s.sel.name === 'package');
    if (!svc || !pk) return;
    svc.sel.value = 'Social Media Management';
    svc.sel.dispatchEvent(new Event('change', { bubbles: true }));
    svc.paint();
    pk.sel.value = b.dataset.pick;
    pk.paint();
    dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    setTimeout(() => $('.nav-cta')?.click(), 240);
  });

  document.addEventListener('pointerdown', e => {
    all.forEach(s => { if (!s.wrap.contains(e.target)) s.close(false); });
  });

  /* ── the one cross-field rule ───────────────────────────────────
     More than one service is not a tier, it is a conversation. So the budget
     is answered for them and held there — disabled, not merely unclickable,
     or it would still be reachable by tab.

     Going back to a single service hands the field over again with whatever
     tier they had picked before, rather than making them find it twice. That
     memory is cleared on reset, or a fresh form would come back carrying the
     last person's answer. */
  const service = all.find(s => s.sel.name === 'service');
  const budget  = all.find(s => s.sel.name === 'budget');
  const pack    = all.find(s => s.sel.name === 'package');
  if (!service || !budget) return;

  /* Social Media Management is a monthly retainer with published figures, so
     a project tier is the wrong question to ask about it. The package chooser
     takes the budget's place in the grid — only ever one of the two is in it,
     so the three columns hold. Disabled, not merely hidden: a disabled field
     is skipped by validation and by FormData alike, where a hidden required
     one would block the send with nothing on screen to explain why. */
  const SOCIAL = 'Social Media Management';
  const swap = social => {
    if (!pack) return;
    pack.wrap.hidden = !social;
    pack.sel.disabled = !social;
    budget.wrap.hidden = social;
    budget.sel.disabled = social;
    if (!social && pack.sel.value) { pack.sel.value = ''; pack.paint(); }
    pack.close(false);
  };

  const AUTO = 'To be discussed';
  let held = '';                       // the last tier they chose themselves
  let autoOpt = null;

  /* The held answer is not one of the tiers, so it is not in the markup: the
     option is made when it becomes the answer and taken away again when it
     stops being one. Shipping it in the <select> instead would put it in the
     native list — visible in the moment before this runs, and permanently
     with no script — which is the one place a value nobody can choose has no
     business being. It has to be a real option regardless, because a <select>
     cannot hold a value it has no option for.

     Order matters on the way out: removing the selected option would blank
     the field, so the tier goes back first. */
  /* Two answers mean the budget is not a tier yet. "More than one" is a scope
     that has to be scoped; "Not sure yet" is someone who cannot honestly pick a
     service, and so cannot honestly pick a price either. Everyone else names a
     tier — that question is the qualifier and it keeps its teeth. */
  const OPEN = ['More than one', 'Not sure yet'];

  const sync = () => {
    const social = service.sel.value === SOCIAL;
    swap(social);
    if (social) return;          // the budget is out of the grid; its rule is moot
    const many = OPEN.includes(service.sel.value);
    if (many) {
      if (budget.sel.value && budget.sel.value !== AUTO) held = budget.sel.value;
      if (!autoOpt) { autoOpt = new Option(AUTO, AUTO); budget.sel.add(autoOpt); }
      budget.sel.value = AUTO;
    } else {
      if (budget.sel.value === AUTO) budget.sel.value = held;
      if (autoOpt) { autoOpt.remove(); autoOpt = null; }
    }
    budget.close(false);
    budget.wrap.classList.toggle('locked', many);
    budget.btn.disabled = many;
    // a held answer is a filled field: clear any flag it was carrying
    if (many) budget.wrap.classList.remove('invalid');
    budget.paint();
  };

  budget.sel.addEventListener('change', () => {
    if (budget.sel.value !== AUTO) held = budget.sel.value;
  });
  service.sel.addEventListener('change', sync);
  /* reset fires BEFORE the values go back, so the repaint waits a tick —
     otherwise the button keeps showing the answer the form no longer holds */
  const form = $('#enquiry');
  if (form) form.addEventListener('reset', () => setTimeout(() => {
    held = '';
    swap(false);
    if (autoOpt) { autoOpt.remove(); autoOpt = null; }
    budget.wrap.classList.remove('locked');
    budget.btn.disabled = false;
    all.forEach(s => s.paint());
  }, 0));
}

/* ── the strip that animates to match what is being read ───────────
   Each block declares data-vis, and the panel draws to suit: chaos for the
   problem, a caliper for the mapping, a routed packet for the solution, a
   calm pulse for the result, bars for the figures. */
const readerVis = (() => {
  const cv = $('#readerVis');
  if (!cv) return { start(){}, stop(){}, size(){} };
  const ctx = cv.getContext('2d');
  let raf = null, mode = 'steady', t0 = 0, W = 0, H = 0, pts = [];

  const size = () => {
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const d = Math.min(devicePixelRatio || 1, 1.5);
    W = r.width; H = r.height;
    cv.width = W * d; cv.height = H * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
  };

  const lerpc = (a, b, k) => `rgba(${Math.round(a[0]+(b[0]-a[0])*k)},${Math.round(a[1]+(b[1]-a[1])*k)},${Math.round(a[2]+(b[2]-a[2])*k)},`;
  const BLUE = [30,144,255], VIOLET = [166,37,238];

  function draw(ts) {
    if (!t0) t0 = ts;
    const t = (ts - t0) / 1000, mid = H / 2;
    ctx.clearRect(0, 0, W, H);

    /* PROBLEM — jobs drifting with nothing holding them; some simply lost */
    if (mode === 'scatter') {
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 6 || p.x > W - 6) p.vx *= -1;
        if (p.y < 6 || p.y > H - 6) p.vy *= -1;
        p.life -= .0016;
        if (p.life <= 0) { p.life = 1; p.x = Math.random() * W; p.y = Math.random() * H; }
      }
      ctx.lineWidth = 1;                              // links that keep breaking
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > 108) continue;
          const flick = .5 + .5 * Math.sin(t * 2.4 + i * .7 + j);
          ctx.strokeStyle = `rgba(255,130,160,${(1 - d / 108) * .16 * flick})`;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      for (const p of pts) {
        const fade = Math.min(1, p.life * 3);
        ctx.fillStyle = `rgba(255,${120 + p.warm * 90},${150 + p.warm * 60},${.30 * fade})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.4 + p.warm * 1.6, 0, 7); ctx.fill();
      }

    /* PROCESS — every hand-off measured; four of them actually mattered */
    } else if (mode === 'measure') {
      const N = 12, pad = W * .05, span = W - pad * 2, seg = span / N;
      const keep = [2, 5, 8, 10];
      ctx.strokeStyle = 'rgba(255,255,255,.13)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad, mid); ctx.lineTo(W - pad, mid); ctx.stroke();
      const sweep = pad + span * ((t * .18) % 1);
      for (let i = 0; i < N; i++) {
        const x0 = pad + i * seg, x1 = x0 + seg * .82, cx = (x0 + x1) / 2;
        const hit = sweep > cx, k = keep.includes(i);
        const h = (k ? 34 : 14) * (hit ? 1 : .32);
        ctx.strokeStyle = k ? `rgba(140,180,255,${hit ? .85 : .3})` : `rgba(200,215,255,${hit ? .3 : .12})`;
        ctx.lineWidth = k ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(x0, mid); ctx.lineTo(x0, mid - h);
        ctx.lineTo(x1, mid - h); ctx.lineTo(x1, mid); ctx.stroke();
        if (k && hit) {
          ctx.fillStyle = 'rgba(160,195,255,.9)';
          ctx.beginPath(); ctx.arc(cx, mid - h - 6, 2.6, 0, 7); ctx.fill();
        }
      }
      ctx.strokeStyle = '#8FB6FF'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(sweep, mid - 46); ctx.lineTo(sweep, mid + 18); ctx.stroke();
      ctx.fillStyle = 'rgba(143,182,255,.95)';
      ctx.beginPath(); ctx.arc(sweep, mid, 3.4, 0, 7); ctx.fill();

    /* SOLUTION — the email arrives, routes, escalates if ignored, closes on a photo */
    } else if (mode === 'route') {
      const pad = W * .07, span = W - pad * 2, stages = 5;
      const gx = i => pad + span * (i / (stages - 1));
      ctx.strokeStyle = 'rgba(255,255,255,.11)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad, mid); ctx.lineTo(W - pad, mid); ctx.stroke();

      const k = (t * .17) % 1, px = pad + span * k;
      for (let i = 0; i < stages; i++) {
        const x = gx(i), near = Math.max(0, 1 - Math.abs(px - x) / 40);
        ctx.strokeStyle = `rgba(190,210,255,${.16 + near * .8})`;
        ctx.lineWidth = 1 + near;
        ctx.beginPath(); ctx.arc(x, mid, 9 + near * 5, 0, 7); ctx.stroke();
        if (near > .5) {
          ctx.fillStyle = `rgba(200,225,255,${(near - .5) * 1.4})`;
          ctx.beginPath(); ctx.arc(x, mid, 3, 0, 7); ctx.fill();
        }
      }
      // the escalation arc, drawn as the packet passes the third stage
      const esc = Math.max(0, 1 - Math.abs(px - gx(2)) / 90);
      if (esc > 0) {
        ctx.strokeStyle = `rgba(166,37,238,${esc * .7})`; ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(gx(2), mid);
        ctx.quadraticCurveTo((gx(2) + gx(3)) / 2, mid - H * .30, gx(3), mid);
        ctx.stroke();
      }
      const grad = ctx.createLinearGradient(px - 60, 0, px + 6, 0);
      grad.addColorStop(0, 'rgba(120,170,255,0)'); grad.addColorStop(1, '#B57BFF');
      ctx.strokeStyle = grad; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(px - 60, mid); ctx.lineTo(px, mid); ctx.stroke();
      ctx.fillStyle = '#D08BFF';
      ctx.beginPath(); ctx.arc(px, mid, 3.4, 0, 7); ctx.fill();

    /* RESULT — it simply runs, month after month */
    } else if (mode === 'steady') {
      ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, 'rgba(30,144,255,.12)'); g.addColorStop(.5, '#6FA5FF');
      g.addColorStop(1, 'rgba(166,37,238,.16)');
      ctx.strokeStyle = g; ctx.beginPath();
      for (let x = 0; x <= W; x += 3) {
        const y = mid + Math.sin(x * .018 - t * 1.6) * (H * .16)
                      * (.45 + .55 * Math.sin(x * .0045 + t * .4));
        x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      for (let i = 0; i < 12; i++) {                 // one steady mark a month
        const x = W * ((i + .5) / 12);
        const pulse = Math.max(0, Math.sin(t * 1.4 - i * .5));
        ctx.fillStyle = `rgba(190,215,255,${.18 + pulse * .7})`;
        ctx.beginPath(); ctx.arc(x, mid + H * .30, 2.2 + pulse * 2.2, 0, 7); ctx.fill();
      }

    /* FIGURES — the line goes up and stays up */
    } else {
      const n = 26, bw = W / n, base = H - 10;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const target = .28 + .62 * (i / (n - 1)) + Math.sin(i * 1.7) * .05;
        const p = Math.min(1, Math.max(0, t * .8 - i * .05));
        const h = (base - 12) * target * (1 - Math.pow(1 - p, 3));
        const g = ctx.createLinearGradient(0, base, 0, base - h);
        g.addColorStop(0, lerpc(BLUE, VIOLET, i / n) + '.20)');
        g.addColorStop(1, lerpc(BLUE, VIOLET, i / n) + '.95)');
        ctx.fillStyle = g;
        ctx.fillRect(i * bw + bw * .26, base - h, bw * .46, h);
      }
      ctx.strokeStyle = 'rgba(255,255,255,.30)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const target = .28 + .62 * (i / (n - 1)) + Math.sin(i * 1.7) * .05;
        const p = Math.min(1, Math.max(0, t * .8 - i * .05));
        const h = (base - 12) * target * (1 - Math.pow(1 - p, 3));
        const x = i * bw + bw * .49, y = base - h;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }
  const frame = ts => { draw(ts); raf = requestAnimationFrame(frame); };

  return {
    size,
    start(m) {
      mode = m || 'steady'; t0 = 0;
      size();
      pts = Array.from({ length: 42 }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - .5) * 1.1, vy: (Math.random() - .5) * .9,
        life: Math.random(), warm: Math.random()
      }));
      draw(performance.now());
      if (!raf) raf = requestAnimationFrame(frame);
    },
    stop() { if (raf) cancelAnimationFrame(raf); raf = null; ctx.clearRect(0, 0, W, H); }
  };
})();

/* ── the morph ─────────────────────────────────────────────────────
   Opening and closing a film is one continuous movement between two places on
   the page, not a panel appearing over it. Both directions are the same FLIP:
   measure the card, express it as a transform on the overlay, and let one
   transition carry the overlay between that and its resting size.

   Three things make it read as one motion rather than a dialog:

   Geometry comes from offsetWidth, never getBoundingClientRect, because the
   overlay is usually already mid-transform when we are asked to measure it.
   A rect is the TRANSFORMED box, so scaling against it compounds whatever is
   already applied — which is exactly the case when you close a film that is
   still opening. Layout size is stable, so an interrupted flight simply
   retargets from wherever it currently is.

   The scale is uniform, taken from width. Card and frame are both 16:9, so a
   separate vertical factor buys nothing and any rounding difference between
   the two shows up as a squash.

   And the easing is the site's own --ease, not the Material curve that was
   here before. Everything else on this page — the camera, the reveals, the
   overlays — decelerates on cubic-bezier(.22,1,.36,1). A film that arrives on
   a different curve is the thing that feels bolted on. */
/* linear, deliberately. The arc's shape and its easing both live in the
   keyframes — the samples are spaced evenly in time and it is WHERE each one
   sits on the curve that decelerates the panel. Any timing function here would
   be applied to every segment on top of that, braking into each waypoint and
   pulling out of it again, which is exactly the stutter that read as angular. */
const MORPH = 'linear';
const MORPH_IN = 1800, MORPH_OUT = 1000;

/* Both directions of the flight. The overlay is driven by a keyframe animation
   rather than a transition because the path is not a straight line: it leaves
   the card, drifts LEFT and part-way up while it grows, and only then settles
   into the middle of the screen. A transition can only interpolate A to B, so
   the detour has to live in a keyframe.

   The card's geometry is handed to the CSS as --fx/--fy/--fs and the keyframes
   do the rest, which keeps the shape of the movement in the stylesheet next to
   everything else that describes how this site moves.

   Closing starts from --fromT, the CURRENT resolved matrix, not from the
   centre. Close a film that is still opening and it flies back from wherever
   it had got to; anchoring 0% at the centre would snap it there first. */
function morphFrom(el, src, dir) {
  const b = src && src.getBoundingClientRect();
  if (!b || !b.width || !el.offsetWidth || reduced) return null;
  /* Clamped, and this is a deliberate trade. A strict morph starts at the
     source's real size, which is 0.72 for the case film (810px into 1120) but
     0.30 for a project card (339px) — the same animation, but one grows 1.4x
     and the other 3.3x, so page 2 read as a pop where page 3 read as a drift.
     A floor makes every film emerge at the same rate. The cost is that a small
     card's panel starts larger than the card itself; it still starts centred
     on it, so it reads as emerging from that spot rather than from that box. */
  const s = Math.max(.62, b.width / el.offsetWidth);
  const dx = (b.left + b.width / 2) - innerWidth / 2;
  const dy = (b.top + b.height / 2) - innerHeight / 2;
  const here = getComputedStyle(el).transform;
  el.style.setProperty('--fx', dx.toFixed(1) + 'px');
  el.style.setProperty('--fy', dy.toFixed(1) + 'px');
  el.style.setProperty('--fs', s.toFixed(4));
  el.style.setProperty('--fromT', here && here !== 'none' ? here : 'translate(-50%,-50%) scale(1)');
  el.style.animation = 'none';
  void el.offsetWidth;                       // commit, or the restart is ignored
  const dur = dir === 'in' ? MORPH_IN : MORPH_OUT;
  el.style.animation = `film${dir === 'in' ? 'Grow' : 'Shrink'} ${dur}ms ${MORPH} forwards`;
  return dur;
}

function flipFrom(el, src) {
  const dur = morphFrom(el, src, 'in');
  if (!dur) return null;
  return setTimeout(() => {
    el.style.animation = '';
    ['--fx', '--fy', '--fs', '--fromT'].forEach(k => el.style.removeProperty(k));
  }, dur + 40);
}

/* Shrink an overlay back onto the element it was lifted from — measured at
   the moment of closing, so if the page has melted and drifted it returns to
   where the block actually is now. */
function minimizeTo(el, src, done) {
  const dur = morphFrom(el, src, 'out');
  if (!dur) { done(); return; }
  return setTimeout(() => {
    el.style.animation = '';
    ['--fx', '--fy', '--fs', '--fromT'].forEach(k => el.style.removeProperty(k));
    done();
  }, dur);
}

/* Re-opening while a previous panel is still shrinking used to let the old
   animation's callback strip .on from the NEW panel: the body kept its blur
   class and the shell went display:none, leaving the page blurred with
   nothing on it and no way out. Cancel the pending close and wipe whatever
   inline state it left behind. */
function cancelMinimize(timer, el, shell) {
  if (timer) clearTimeout(timer);
  shell.classList.remove('closing');
  el.style.animation = '';
  el.style.transition = ''; el.style.transform = '';
  el.style.opacity = ''; el.style.transformOrigin = '';
  ['--fx', '--fy', '--fs', '--fromT'].forEach(k => el.style.removeProperty(k));
  return null;
}

/* ── the films ─────────────────────────────────────────────────────
   Each card carries its film. The pointer drifts it inside its frame for a
   little depth, and a click lifts it into a frame at 75% of the viewport.

   The video element is MOVED into the lightbox and moved back on close, so
   playback continues uninterrupted and no second decode is ever started.
   Because the lightbox lives at body level it is outside the world, which is
   what keeps a film crisp and running while the page behind it melts.      */
let filmsLive = () => {};
/* cases() owns which study is on show; the reading panel needs to move it
   too, so that closing the panel leaves the page on what was being read. */
let showCase = () => {};
function films() {
  const box = $('#filmbox');
  if (!box) return;
  const slot  = $('#filmSlot'), cap = $('#filmCap'),
        frame = $('.filmbox-frame', box), x = $('.filmbox-x', box),
        scrim = $('.filmbox-scrim', box);
  // img covers the artifact build, where posters stand in for the films —
  // the parallax still runs, and show() simply returns when there is no video
  const cards = $$('.cat-media').filter(c => c.querySelector('video,img'));
  if (!cards.length) return;

  const play = $('#fbPlay'), seek = $('#fbSeek'), time = $('#fbTime');
  let open = false, current = null, home = null, tick = null,
      minTimer = null, growTimer = null;
  /* A film that has been lifted out but not yet put back. Cancelling a close
     also cancels the callback that would have returned it, so the handover has
     to be explicit or a card comes back empty. */
  let pending = null;
  const sendHome = () => {
    if (!pending) return;
    const { v, card } = pending;
    pending = null;
    if (!card.contains(v)) card.insertBefore(v, card.firstChild);
    v.loop = true;                        // back to wallpaper
    card.classList.remove('lifted');
    card.style.removeProperty('background-image');
    v.currentTime = 0;
    if (card.dataset.hoverOnly === undefined &&
        card.closest('.stop')?.classList.contains('live')) v.play().catch(() => {});
  };

  const clock = n => {
    if (!isFinite(n)) n = 0;
    const m = Math.floor(n / 60), sec = Math.floor(n % 60);
    return m + ':' + String(sec).padStart(2, '0');
  };
  const paint = () => {
    if (!current) return;
    const d = current.duration || 0;
    if (!seeking) {
      const k = d ? (current.currentTime / d) * 1000 : 0;
      seek.value = k;
      seek.style.setProperty('--v', k / 10);
    }
    time.textContent = clock(current.currentTime) + ' / ' + clock(d);
    play.classList.toggle('paused', current.paused);
    tick = requestAnimationFrame(paint);
  };

  const show = card => {
    if (open) return;
    const v = card.querySelector('video');
    if (!v) return;
    sendHome();                          // whatever was mid-close goes back first
    minTimer = cancelMinimize(minTimer, frame, box);
    if (growTimer) { clearTimeout(growTimer); growTimer = null; }
    open = true; current = v; home = card;
    cap.textContent = card.dataset.cap || card.closest('.cat')?.querySelector('h3')?.textContent || '';
    v.style.removeProperty('transform');
    /* The film is MOVED into the frame, so the card it left would otherwise
       blink to an empty slot for the whole flight. Wearing its own poster, it
       still reads as the thing the film came out of. */
    const poster = v.getAttribute('poster');
    if (poster) card.style.backgroundImage = `url("${poster}")`;
    card.classList.add('lifted');
    slot.appendChild(v);
    box.classList.add('on');
    box.setAttribute('aria-hidden', 'false');
    document.body.classList.add('filming');
    /* Looping is right for a film playing ambiently in a card — it is wallpaper,
       and it should never stop. It is wrong once someone has opened it to watch:
       a viewer wants it to end. So the loop comes off on the way in and goes
       back on when the film returns to its card.

       Nothing else is needed for the button: paint() already derives the icon
       from v.paused every frame, and an ended video reports paused, so it flips
       to play by itself. play() on an ended video rewinds and starts again,
       and the next frame flips the icon back to pause. */
    v.loop = false;
    v.currentTime = 0;                    // expanded, it starts from the top
    v.play().catch(() => {});
    /* Moving a video in the DOM interrupts it, and the play asked on the same
       tick is dropped before the frame has been painted. Asking once more is
       idempotent — playing a playing film is a no-op. */
    setTimeout(() => { if (current === v) v.play().catch(() => {}); }, 260);
    if (!tick) tick = requestAnimationFrame(paint);
    paintSwap();
    growTimer = flipFrom(frame, card);
    wake();
    x.focus({ preventScroll: true });
  };

  const swapBtn = $('#fbSwap');

  /* The switcher only means anything on a case-study film. */
  const paintSwap = () => {
    if (!swapBtn) return;
    const item = home && home.closest('.case-item');
    swapBtn.hidden = !item;
    if (!item) return;
    const other = item.dataset.case === '1' ? '2' : '1';
    swapBtn.dataset.to = other;
    $('span', swapBtn).textContent = 'Case study ' + other;
  };

  /* Change which film is in the frame, without the close-and-reopen flight.
     show() cannot do this — it returns early when the box is already open,
     and the whole point here is that it stays open. The film that is leaving
     is handed straight back to its card rather than going through hide(),
     which would shrink the frame onto it. */
  const swapFilm = card => {
    if (!open || !card || card === home) return;
    const v = card.querySelector('video');
    if (!v) return;
    if (current && home) {
      current.pause();
      current.loop = true;                 // back to wallpaper
      current.currentTime = 0;
      if (!home.contains(current)) home.insertBefore(current, home.firstChild);
      home.classList.remove('lifted');
      home.style.removeProperty('background-image');
    }
    current = v; home = card;
    cap.textContent = card.dataset.cap || '';
    const poster = v.getAttribute('poster');
    if (poster) card.style.backgroundImage = `url("${poster}")`;
    card.classList.add('lifted');
    slot.appendChild(v);
    v.loop = false;
    v.currentTime = 0;
    v.play().catch(() => {});
    /* Same trap as the swap on the page: this film's card was display:none
       until a moment ago, so the first play is dropped before it is painted.
       Asking again once it has a box is idempotent. */
    setTimeout(() => { if (current === v) v.play().catch(() => {}); }, 260);
    if (!tick) tick = requestAnimationFrame(paint);
    paintSwap();
    wake();
  };

  swapBtn?.addEventListener('click', e => {
    e.stopPropagation();
    const n = swapBtn.dataset.to;
    const card = $('.case-item[data-case="' + n + '"] .cfilm');
    if (!card) return;
    showCase(+n);          // the page behind follows, so closing lands on it
    swapFilm(card);
  });

  const hide = () => {
    if (!open) return;
    open = false;
    box.setAttribute('aria-hidden', 'true');
    box.classList.add('closing');
    document.body.classList.remove('filming');
    if (swapBtn) swapBtn.hidden = true;
    clearMelt();                          // closing counts as activity
    wake();
    const v = current, card = home;
    current = null; home = null;
    if (tick) { cancelAnimationFrame(tick); tick = null; }
    /* Closing while still opening: kill the grow's cleanup timer or it fires
       mid-shrink and strips the transform the shrink is riding on. */
    if (growTimer) { clearTimeout(growTimer); growTimer = null; }
    pending = (v && card) ? { v, card } : null;
    // shrink the frame back onto its card, then hand the film back
    minTimer = minimizeTo(frame, card, () => {
      minTimer = null;
      sendHome();
      if (open) return;                    // a newer film is already playing
      box.classList.remove('on', 'closing');
    });
  };

  let seeking = false;
  play.addEventListener('click', e => {
    e.stopPropagation();
    if (!current) return;
    current.paused ? current.play().catch(() => {}) : current.pause();
    play.classList.toggle('paused', current.paused);
  });
  ['pointerdown', 'keydown'].forEach(ev => seek.addEventListener(ev, () => { seeking = true; }));
  ['pointerup', 'pointercancel', 'keyup', 'change'].forEach(ev =>
    seek.addEventListener(ev, () => { seeking = false; }));
  seek.addEventListener('input', e => {
    e.stopPropagation();
    if (!current || !current.duration) return;
    current.currentTime = (+seek.value / 1000) * current.duration;
    seek.style.setProperty('--v', +seek.value / 10);
  });

  cards.forEach(card => {
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--px', ((e.clientX - r.left) / r.width - .5).toFixed(3));
      card.style.setProperty('--py', ((e.clientY - r.top) / r.height - .5).toFixed(3));
    }, { passive: true });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--px', 0);
      card.style.setProperty('--py', 0);
    });
    card.addEventListener('click', e => {
      e.stopPropagation();
      /* A card carrying its own seek bar must not open on every click, or
         scrubbing it throws you into the expanded view. */
      if (card.dataset.expandOnly !== undefined && !e.target.closest('[data-expand]')) return;
      show(card);
    });
  });

  /* No hover-out close. The flight lasts 1.8s and bows left on its way to the
     centre, so the frame routinely travels out from under a stationary cursor
     — pointerleave then fired on a panel the viewer had only just opened.
     Closing is deliberate now: the X, the scrim, or Escape. */
  x.addEventListener('click', e => { e.stopPropagation(); hide(); });
  scrim.addEventListener('click', hide);
  addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });

  cards.filter(c => c.dataset.hoverOnly !== undefined).forEach(c => {
    c.addEventListener('pointerenter', () => {
      const v = c.querySelector('video');
      if (v) v.play().catch(() => {});
    });
    c.addEventListener('pointerleave', () => {
      const v = c.querySelector('video');
      if (v) { v.pause(); v.currentTime = 0; }
    });
  });

  // decode only where the camera actually is
  /* On a phone nothing is fetched until it is played, and only one plays at a
     time. The About stop carries three films: on a desktop they are a
     composition and all three belong on screen, but on a phone they are three
     H.264 streams downloading and decoding at once, on the device least able
     to spare the bandwidth, the battery or the memory — and only one of them
     can be in front of you anyway. It also starves everything else on the
     connection, which is why the Our Work previews crawled on mobile. */
  if (flat) $$('video').forEach(v => { v.preload = 'none'; });

  /* Sticky, and it has to be. Two cards sitting almost equally near the middle
     would otherwise trade places every time this ran, and each trade is a
     pause and a play — which, with preload off, throws away what had been
     fetched and starts again. That is a second source of flickering, and it
     was mine. A new card has to be a clear eighth of a screen closer before
     it takes over. */
  let playing = null;
  const nearestCard = () => {
    const mid = c => {
      const r = c.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return Infinity;   // not on screen
      return Math.abs(r.top + r.height / 2 - innerHeight / 2);
    };
    let best = null, bestD = Infinity;
    cards.forEach(c => {
      if (c.closest('[hidden]')) return;
      const d = mid(c);
      if (d < bestD) { bestD = d; best = c; }
    });
    if (playing && playing !== best && !playing.closest('[hidden]')) {
      const held = mid(playing);
      if (held < bestD + innerHeight * .125) return playing;      // not enough in it
    }
    playing = best;
    return best;
  };

  filmsLive = () => {
    const only = flat ? nearestCard() : null;
    /* The one in front of you is the one about to be pressed, so it gets its
       headers fetched — tens of kilobytes, not the film. Without this, a tap
       pays for a metadata round trip before the first byte of video is even
       requested, which is most of what "slow to start" actually is. The rest
       stay at none and cost nothing. */
    if (flat && only) {
      const v = only.querySelector('video');
      if (v && v.preload !== 'metadata') v.preload = 'metadata';
      cards.forEach(c => {
        if (c === only) return;
        const o = c.querySelector('video');
        if (o && o.preload !== 'none' && o.paused) o.preload = 'none';
      });
    }
    cards.forEach(c => {
      if (c.dataset.hoverOnly !== undefined) return;      // hover decides that one
      const v = c.querySelector('video');
      if (!v) return;
      // the case study that is not on show is display:none — playing it costs
      // a decode nobody can see, and it competes with the one you can
      if (c.closest('[hidden]')) { v.pause(); return; }
      if (flat) { c === only ? v.play().catch(() => {}) : v.pause(); return; }
      c.closest('.stop')?.classList.contains('live')
        ? v.play().catch(() => {}) : v.pause();
    });
    // a film the viewer watched to the end stays ended; the camera moving on
    // is not a reason to start it over
    if (open && current && !current.ended) current.play().catch(() => {});
  };
}

/* ── the case film ─────────────────────────────────────────────────
   The film sits below the line at the full width of it, frosted over, with a
   hole that opens at the cursor. Two things are deliberate here.

   The frost is a backdrop-filter masked by a radial gradient: at radius 0 the
   gradient resolves to its last stop everywhere, so the plate covers the whole
   film; as the radius grows a soft-edged hole opens under the pointer. That is
   cheaper and steadier than compositing two copies of the video.

   And it carries its own seek bar rather than borrowing the expanded view's,
   because the film is now something you watch in place — the expanded view is
   the option, not the only way to see it. */
function caseFilm() {
  /* Two case studies means two of these. This read $('.cfilm') and wired the
     first one only, so the second study's player rendered but its play button,
     seek bar and frost were dead. */
  $$('.cfilm').forEach(caseFilmOne);
}

function caseFilmOne(wrap) {
  const v     = wrap.querySelector('video'),
        frost = $('.cfilm-frost', wrap),
        play  = $('.cf-play', wrap),
        seek  = $('.cf-seek', wrap),
        time  = $('.cf-time', wrap);
  if (!v || !play || !seek || !time) return;

  /* The frame's shape is the stylesheet's call, not the file's. This used to
     write an inline aspect-ratio from the video's own 1920x1080 — which both
     overrode the CSS and, because it fires on loadedmetadata, landed AFTER
     fitStops() had measured the stop. The section was sized against a box that
     then grew underneath it. object-fit:cover crops to whatever ratio the CSS
     asks for, so nothing is letterboxed or stretched either way. */

  const clock = n => {
    if (!isFinite(n)) n = 0;
    return Math.floor(n / 60) + ':' + String(Math.floor(n % 60)).padStart(2, '0');
  };
  let seeking = false, raf = null;
  const paint = () => {
    const d = v.duration || 0;
    if (!seeking) {
      const k = d ? (v.currentTime / d) * 1000 : 0;
      seek.value = k;
      seek.style.setProperty('--v', k / 10);
    }
    time.textContent = clock(v.currentTime) + ' / ' + clock(d);
    play.classList.toggle('paused', v.paused);
    raf = requestAnimationFrame(paint);
  };
  raf = requestAnimationFrame(paint);

  play.addEventListener('click', e => {
    e.stopPropagation();
    v.paused ? v.play().catch(() => {}) : v.pause();
  });
  ['pointerdown', 'keydown'].forEach(ev => seek.addEventListener(ev, () => { seeking = true; }));
  ['pointerup', 'pointercancel', 'keyup', 'change'].forEach(ev =>
    seek.addEventListener(ev, () => { seeking = false; }));
  seek.addEventListener('input', e => {
    e.stopPropagation();
    if (!v.duration) return;
    v.currentTime = (+seek.value / 1000) * v.duration;
    seek.style.setProperty('--v', +seek.value / 10);
  });

  // ── the hole in the frost ──
  /* --r is a registered custom property, so the browser interpolates it and
     the open/close is a plain CSS transition. Driving it from a rAF lerp
     instead meant the hole simply never opened whenever the frame loop was
     throttled — a background tab, a hidden window — because every write to it
     lived inside the loop. */
  if (touch || reduced) return;
  const area = wrap;
  area.addEventListener('pointermove', e => {
    const b = wrap.getBoundingClientRect();
    frost.style.setProperty('--mx', (e.clientX - b.left).toFixed(0) + 'px');
    frost.style.setProperty('--my', (e.clientY - b.top).toFixed(0) + 'px');
    frost.style.setProperty('--r', Math.min(b.width * .26, 250).toFixed(0) + 'px');
  }, { passive: true });
  area.addEventListener('pointerleave', () => frost.style.setProperty('--r', '0px'));
}

/* ── the two case studies ──────────────────────────────────────────
   Both live in the same stop and only one is ever in flow, so the section
   costs what one study costs — which matters here more than anywhere: #cases
   is the most compressed stop on the site, and anything that adds real height
   pushes --fit toward its floor.

   Three things have to be handed over on a swap, and each was a bug before it
   was a line here:
     · the outgoing film keeps playing and audibly nothing, but it keeps
       decoding, so it is paused and rewound;
     · countUp marks a figure done the first time it is asked, and it is asked
       whenever the camera reaches this stop — including for the study that was
       hidden at the time. Its numbers would sit at 0 for ever. The incoming
       figures are un-marked and re-run;
     · fitStops measured the section against whichever study was showing, so
       the frame has to be re-measured after the swap, not before.            */
function cases() {
  const items = $$('.case-item');
  if (items.length < 2) return;

  const show = n => {
    items.forEach(it => {
      const on = it.dataset.case === String(n);
      it.hidden = !on;
      it.classList.toggle('swapped', on);
      const v = it.querySelector('video');
      if (v && !on) { v.pause(); v.currentTime = 0; }
      if (on) {
        // a figure that was counted while hidden never showed the count
        $$('.stat', it).forEach(b => { delete b.dataset.done; if (b.dataset.count) b.textContent = '0'; });
        $$('.stat', it).forEach(countUp);
      }
    });
    fitStops();
    /* filmsLive() alone did not start the incoming film: it is asked to play
       an element that was display:none a moment earlier, and the play is
       dropped. A tick later the element has a box and it takes. The direct
       call is what actually starts it; filmsLive still runs so the outgoing
       one is parked the same way the camera would park it. */
    const start = () => {
      const live = items.find(i => !i.hidden);
      const v = live && live.querySelector('video');
      if (v && live.closest('.stop')?.classList.contains('live')) v.play().catch(() => {});
    };
    /* Asked on the same tick, the first play of a film that has been
       display:none since load is simply dropped — it has not been painted
       yet, and play() resolves without the film ever starting. It takes on
       every swap after that, which is what made it look intermittent. Asking
       twice is idempotent and costs nothing: playing a playing film is a
       no-op, and the second ask is the one that lands the first time. */
    setTimeout(() => { filmsLive(); start(); }, 0);
    setTimeout(start, 260);
  };

  showCase = show;

  $$('.case-swap').forEach(btn => btn.addEventListener('click', e => {
    /* the button sits inside .case-brief, whose own click opens the reading
       panel — without this, switching studies also opened one */
    e.stopPropagation();
    show(+btn.dataset.swap);
  }));
}

/* ── reading view ──────────────────────────────────────────────────
   Dwell on a dense block and it lifts out into a glass panel at 75% of the
   viewport, with everything behind it blurred. Closing counts as activity,
   so a melt that crept in while reading is cleared on the way out.       */
function reader() {
  const shell = $('#reader');
  if (!shell || reduced) return;
  const glass = $('.reader-glass', shell),
        body  = $('#readerBody'),
        x     = $('.reader-x', shell),
        scrim = $('.reader-scrim', shell);
  /* The case study only. About and Projects each have their own plan for
     these blocks, so they are deliberately not part of the reading view. */
  /* The brief only. It no longer shows itself in the panel either — it carries
     data-read, so the panel fills with the full study instead. */
  /* .sm-plans joins them for the same reason .work-open did: it carries
     data-read, so it is a way into the panel rather than something the panel
     shows. Adding the selector is the whole integration — the cue, the grow
     from source, the rail, Escape and the scrim all come with it. */
  const BLOCKS = '.case-brief, .work-open, .sm-plans';
  let dwell = null, open = false, srcEl = null, minTimer = null, growTimer = null;

  const swapBtn = $('.reader-swap', shell);
  const rail = $('.reader-rail', shell), thumb = $('.reader-thumb', shell);

  /* The rail is a sibling of the body, not a child: a child of a scrolling
     box scrolls with it, and this has to stay put. So its box is copied from
     the body's whenever the content changes. */
  let liveTimer = null;
  const paintRail = () => {
    if (!rail || !thumb) return;
    rail.style.top = body.offsetTop + 'px';
    rail.style.height = body.offsetHeight + 'px';
    const h = body.clientHeight, sh = body.scrollHeight;
    if (sh <= h + 2) { rail.classList.add('idle'); return; }
    rail.classList.remove('idle');
    /* Capped, not just floored: proportional height on a short study makes a
       long bar, and this is meant to read as an oval riding the scroll rather
       than as a scrollbar. */
    const th = Math.min(Math.max(h * (h / sh), 26), 64);
    thumb.style.height = th + 'px';
    thumb.style.transform = 'translateY(' + (body.scrollTop / (sh - h)) * (h - th) + 'px)';
  };

  /* Take hold of it, or press the track to jump. `offset` is where in the
     thumb the finger went down, so it does not snap its top to the cursor. */
  const scrollFromY = (clientY, offset) => {
    const r = rail.getBoundingClientRect(), th = thumb.offsetHeight;
    const travel = r.height - th, span = body.scrollHeight - body.clientHeight;
    if (travel <= 0 || span <= 0) return;
    const top = clamp(clientY - r.top - offset, 0, travel);
    body.scrollTop = (top / travel) * span;
  };
  let dragOff = -1;
  thumb?.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    dragOff = e.clientY - thumb.getBoundingClientRect().top;
    thumb.setPointerCapture(e.pointerId);
    rail.classList.add('live', 'grabbing');
  });
  thumb?.addEventListener('pointermove', e => {
    if (dragOff >= 0) scrollFromY(e.clientY, dragOff);
  });
  const endDrag = e => {
    if (dragOff < 0) return;
    dragOff = -1;
    try { thumb.releasePointerCapture(e.pointerId); } catch (_) {}
    rail.classList.remove('grabbing');
  };
  thumb?.addEventListener('pointerup', endDrag);
  thumb?.addEventListener('pointercancel', endDrag);
  // pressing the track puts the oval where you pressed
  rail?.addEventListener('pointerdown', e => {
    if (e.target === thumb) return;
    e.preventDefault();
    scrollFromY(e.clientY, thumb.offsetHeight / 2);
  });
  body.addEventListener('scroll', () => {
    paintRail();
    rail?.classList.add('live');
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => rail?.classList.remove('live'), 480);
  }, { passive: true });
  addEventListener('resize', paintRail);


  /* A block may name what it opens. The case brief is a summary of a much
     longer study: the brief is what grows (flipFrom and readerVis still
     measure and read `src`), but what the panel fills with is the study.
     Separate from show() because the panel can change study in place. */
  const fill = src => {
    const target = src.dataset.read ? $(src.dataset.read) : src;
    const clone = (target || src).cloneNode(true);
    clone.removeAttribute('id');
    clone.hidden = false;
    clone.classList.remove('readable');          // no hover affordance inside the panel
    clone.querySelectorAll('.readable').forEach(n => n.classList.remove('readable'));
    // strip anything that would run twice: a cloned video would play over
    // the original, and a cloned canvas is dead pixels
    clone.querySelectorAll('.cat-media, canvas, video').forEach(n => n.remove());
    body.innerHTML = '';
    body.appendChild(clone);
    body.scrollTop = 0;                          // a new study starts at its top
    setTimeout(paintRail, 0);                    // its height decides the thumb

    // the switcher means nothing on a block that is not a case study
    const item = src.closest('.case-item');
    if (!swapBtn) return;
    swapBtn.hidden = !item;
    if (!item) return;
    const other = item.dataset.case === '1' ? '2' : '1';
    swapBtn.dataset.to = other;
    $('span', swapBtn).textContent = 'Case study ' + other;
  };

  /* Category switching inside the panel. Delegated, because fill() clones
     whatever it is showing — a listener bound to the markup in the page would
     be left behind on the original every time the panel opens. */
  body.addEventListener('click', e => {
    const tab = e.target.closest('.work-tab');
    if (!tab) return;
    e.stopPropagation();
    $$('.work-tab', body).forEach(t => {
      const on = t === tab;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', String(on));
    });
    const grid = $('.work-grid', body);
    if (grid) grid.dataset.show = tab.dataset.cat;
  });

  swapBtn?.addEventListener('click', e => {
    e.stopPropagation();
    const n = swapBtn.dataset.to;
    const next = $('.case-item[data-case="' + n + '"] .case-brief');
    if (!next) return;
    showCase(+n);        // the page behind moves too, so closing lands on it
    srcEl = next;        // and the shrink returns to the block now on show
    fill(next);
    readerVis.start(next.dataset.vis);
  });

  const show = src => {
    if (open) return;
    minTimer = cancelMinimize(minTimer, glass, shell);
    if (growTimer) { clearTimeout(growTimer); growTimer = null; }
    open = true; srcEl = src;
    fill(src);

    shell.classList.add('on');
    shell.setAttribute('aria-hidden', 'false');
    document.body.classList.add('reading');
    readerVis.start(src.dataset.vis);
    // the panel grows out of the block it is quoting, as the films do
    growTimer = flipFrom(glass, src);
    wake();
    x.focus({ preventScroll: true });
  };

  const hide = () => {
    if (!open) return;
    open = false;
    shell.setAttribute('aria-hidden', 'true');
    shell.classList.add('closing');
    document.body.classList.remove('reading');
    readerVis.stop();
    clearMelt();          // closing counts as activity, exactly like a scroll
    wake();
    // shrink back onto the block it came from, measured now — if the page has
    if (growTimer) { clearTimeout(growTimer); growTimer = null; }
    // melted and drifted, it returns to where that block actually is
    minTimer = minimizeTo(glass, srcEl, () => {
      minTimer = null;
      if (open) return;                    // something newer opened; leave it
      shell.classList.remove('on', 'closing');
      srcEl = null;
      body.innerHTML = '';
    });
  };

  $$(BLOCKS).forEach(el => {
    el.classList.add('readable');
    if (!touch && !el.dataset.cue) {
      el.addEventListener('pointerenter', () => {
        if (open) return;
        clearTimeout(dwell);
        dwell = setTimeout(() => show(el), 420);   // a dwell, not a twitch
      });
      el.addEventListener('pointerleave', () => clearTimeout(dwell));
      // a film sitting inside a readable block owns its own hover and click
      el.addEventListener('pointermove', e => {
        if (e.target.closest('.cat-media')) clearTimeout(dwell);
      }, { passive: true });
    }
    el.addEventListener('click', e => {
      if (e.target.closest('.cat-media, .case-swap')) return;
      clearTimeout(dwell); show(el);
    });
  });

  // same reason as the films: the panel moves, the cursor does not
  x.addEventListener('click', hide);
  scrim.addEventListener('click', hide);
  addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
}

/* ── ask us ────────────────────────────────────────────────────────
   A fixed set of questions matched to fixed answers. There is no model here
   and no API key, which is the point: a bot that can invent a price is a
   liability on a site selling seven-figure engagements. The questions live in
   one array; editing them is editing this list.

   An answer with `a: null` is not shown. Three of them are unanswered because
   they are commitments only the studio can make — support terms, what each
   tier actually buys, and whether work happens outside Lagos. Fill the string
   in and the question appears. */
const ASK = [
  { q: 'What do you actually do?',
    a: 'We build the systems that do your admin. If your team spends hours copying, pasting, forwarding, chasing and re-typing between tools, we replace that with something that does it by itself — and tells you when something needs a person.' },

  { q: 'Does this mean we let people go?',
    a: 'It has not in the work we have done. In both builds the people doing the manual work went back to the work they were hired for — the freight team to fleet management, the studio’s coordinators to projects instead of chasing updates. What goes away is the retyping, not the role.' },

  { q: 'Do we have to change our tools?',
    a: 'No — that is the point. We build the relay between the tools you already pay for. Email, spreadsheets, whatever your team already opens: the system works with those rather than replacing them.' },

  { q: 'How long does it take?',
    a: 'A single workflow is usually live within a few weeks. Both of our documented builds were stable and measured inside 45 to 60 days.' },

  { q: 'Who have you built this for?',
    a: 'A freight logistics and maritime consortium, and a commercial architecture studio — both in Lagos, both under NDA, so the names are withheld. The numbers and the systems are in the Case Studies section of this site.' },

  /* ── awaiting the studio's own answers ──
     Each of these is a commitment, not a description. Write the answer and it
     appears in the list; leave it null and it stays out. */
  { q: 'What does it cost?',                 a: null },
  { q: 'What happens when something breaks?', a: null },
  { q: 'Do you work outside Lagos?',          a: null }
];

/* How long the panel waits before it speaks again, and before it gives up.
   The nudge is a prompt, not a nag: it fires once after an answer and is
   cancelled the moment the visitor does anything. */
const ASK_NUDGE_MS = 15000;
const ASK_CLOSE_MS = 120000;

function chat() {
  const box = $('#chat'), openBtn = $('#chatOpen'), closeBtn = $('#chatX'),
        log = $('#chatLog'), foot = $('#chatFoot');
  if (!box || !openBtn) return;

  const asked = [];                 // the transcript, in order
  let gated = false, sent = false, who = null, note = null;
  let nudgeT = null, idleT = null;

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const scroll = () => { log.scrollTop = log.scrollHeight; };

  const say = (side, text) => {
    const row = el('div', 'chat-row ' + side);
    row.appendChild(el('p', 'chat-msg', text));
    log.appendChild(row);
    scroll();
  };

  /* ── the clocks ───────────────────────────────────────────────────
     Anything the visitor does resets both. Two minutes of nothing closes the
     panel and posts what was said: an abandoned conversation is still a lead,
     and the questions they opened say what they were weighing even when they
     never typed a word. */
  const stopClocks = () => { clearTimeout(nudgeT); clearTimeout(idleT); nudgeT = idleT = null; };
  const alive = () => {
    clearTimeout(nudgeT); nudgeT = null;
    clearTimeout(idleT);
    idleT = setTimeout(giveUp, ASK_CLOSE_MS);
  };
  const nudgeSoon = () => {
    clearTimeout(nudgeT);
    nudgeT = setTimeout(() => {
      if (sent || box.hidden) return;
      say('them', 'Is there anything else we can assist you with?');
    }, ASK_NUDGE_MS);
  };

  const giveUp = async () => {
    if (sent || box.hidden) return;
    stopClocks();
    /* Nothing to send if they never said who they were — there would be no
       one to reply to. */
    if (gated) {
      const ref = await post('', true);
      say('them', ref
        ? 'We will close this for now. We have your details and will come back to you — your reference is ' + ref + '.'
        : 'We will close this for now. Do come back to us.');
    } else {
      say('them', 'We will close this for now. Do come back when it suits you.');
    }
    foot.innerHTML = '';
    setTimeout(() => show(false), 2600);
  };

  /* ── the question pills ── */
  /* A question that has been answered drops out of the list, so what is left
     is only what is still unread. The last option is always their own words —
     it sits in the list rather than under it, because it is a choice like the
     others, not an afterthought. */
  const pills = () => {
    foot.innerHTML = '';
    const live = ASK.filter(x => x.a && !asked.includes(x.q));
    const wrap = el('div', 'chat-pills');
    live.forEach(x => {
      const b = el('button', 'chat-pill', x.q);
      b.type = 'button';
      b.addEventListener('click', () => pick(x));
      wrap.appendChild(b);
    });
    const own = el('button', 'chat-pill chat-pill-own',
      live.length ? 'Something else — let me write it' : 'Tell us what you need');
    own.type = 'button';
    own.addEventListener('click', () => { alive(); freeText('Tell us what you need.'); });
    wrap.appendChild(own);
    foot.appendChild(wrap);
  };

  const pick = x => {
    alive();
    asked.push(x.q);
    say('me', x.q);
    setTimeout(() => {
      say('them', x.a);
      pills();
      nudgeSoon();                  // a beat of quiet, then an offer
    }, 340);
  };

  /* ── who is asking ── */
  const FIELDS = [
    { k: 'name',    label: 'Your name',   type: 'text',  auto: 'name' },
    { k: 'company', label: 'Company',     type: 'text',  auto: 'organization' },
    { k: 'email',   label: 'Email',       type: 'email', auto: 'email' },
    { k: 'phone',   label: 'Phone',       type: 'tel',   auto: 'tel' }
  ];

  const gate = () => {
    foot.innerHTML = '';
    const form = el('form', 'chat-form');
    FIELDS.forEach(f => {
      const lab = el('label', 'chat-field');
      lab.appendChild(el('span', 'chat-fk', f.label));
      const i = document.createElement('input');
      i.type = f.type; i.name = f.k; i.required = true; i.autocomplete = f.auto;
      i.addEventListener('input', alive);
      lab.appendChild(i);
      form.appendChild(lab);
    });
    note = el('p', 'chat-note', 'All four, so we can come back to you.');
    const send = el('button', 'chat-send', 'Start');
    send.type = 'submit';
    form.appendChild(send); form.appendChild(note);

    form.addEventListener('submit', e => {
      e.preventDefault();
      alive();
      const v = {};
      new FormData(form).forEach((val, k) => { v[k] = String(val).trim(); });
      const missing = FIELDS.find(f => !v[f.k]);
      if (missing) { warn(missing.label + ' is needed before we can start.'); return; }
      if (!EMAIL_RE.test(v.email)) { warn('That email address does not look right.'); return; }
      who = v; gated = true;
      say('me', v.name + ' · ' + v.company);
      setTimeout(() => {
        say('them', 'Thank you, ' + v.name.split(' ')[0] + '. What can we help with?');
        pills();
      }, 320);
    });
    foot.appendChild(form);
    form.querySelector('input')?.focus({ preventScroll: true });
  };

  const warn = text => { if (!note) return; note.textContent = text; note.classList.add('warn'); };

  /* ── free text ── */
  const freeText = prompt => {
    foot.innerHTML = '';
    /* The way out sits above the box, not under it. Someone who picks
       "something else" and then thinks better of it should see the way back
       before they start writing — under the Send button it is found only by
       people who have already typed the paragraph they wanted to avoid.

       Hidden once every prepared question has been read, because then there
       is nothing to go back to. */
    if (ASK.some(x => x.a && !asked.includes(x.q))) {
      const back = el('button', 'chat-more chat-back', '← Back to the questions');
      back.type = 'button';
      back.addEventListener('click', () => { alive(); pills(); });
      foot.appendChild(back);
    }
    const form = el('form', 'chat-form');
    const lab = el('label', 'chat-field');
    lab.appendChild(el('span', 'chat-fk', prompt));
    const ta = document.createElement('textarea');
    ta.rows = 3; ta.name = 'message'; ta.required = true;
    ta.placeholder = 'What is taking too much time?';
    ta.addEventListener('input', alive);
    lab.appendChild(ta);
    form.appendChild(lab);
    note = el('p', 'chat-note', 'It comes straight to us.');
    const send = el('button', 'chat-send', 'Send');
    send.type = 'submit';
    form.appendChild(send); form.appendChild(note);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      alive();
      const msg = ta.value.trim();
      if (!msg) { warn('Tell us what you need first.'); return; }
      send.disabled = true;
      note.classList.remove('warn'); note.textContent = 'Sending…';
      say('me', msg);
      const ref = await post(msg, false);
      if (!ref) { send.disabled = false; warn('That did not send. Please try again in a moment.'); return; }
      stopClocks();
      foot.innerHTML = '';
      say('them', 'Thank you — we will get back to you in the next 24 hours. Your reference is ' + ref + '.');
      foot.appendChild(el('p', 'chat-done', 'Reference ' + ref));
    });
    foot.appendChild(form);
    ta.focus({ preventScroll: true });
  };

  /* ── what gets sent ──
     One shape, three ways out: they press send, the clock runs out, or the
     tab goes away. The subject says which, so an unfinished one is obvious in
     the inbox without opening it. */
  const makeRef = () => 'ASK-' + new Date().toISOString().slice(5, 10).replace('-', '') + '-' +
                        String(Math.floor(Math.random() * 9000) + 1000);

  const bodyFor = (msg, ref, how) => JSON.stringify({
    _subject: 'Ẹ̀rọ Labs — ' + (how === 'sent' ? 'Question' : 'Unfinished') + ' ' + ref +
              ' — ' + (who ? who.company : 'unknown'),
    _template: 'table',
    _captcha: 'false',
    Reference: ref,
    Status: how === 'sent'   ? 'Sent by them'
          : how === 'closed' ? 'Closed the tab before sending'
          :                    'Left without sending — closed after two minutes',
    Name: who ? who.name : '',
    Company: who ? who.company : '',
    Email: who ? who.email : '',
    Phone: who ? who.phone : '',
    'They read': asked.length ? asked.join('  ·  ') : '(none)',
    'In their words': msg || '(nothing written)',
    Sent: new Date().toLocaleString()
  });

  /* Returns the reference, or null if it did not go. */
  const post = async (msg, auto) => {
    if (sent) return null;
    const ref = makeRef();
    try {
      const res = await fetch(ENQUIRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: bodyFor(msg, ref, auto ? 'timeout' : 'sent')
      });
      if (!res.ok) throw new Error(res.status);
    } catch (err) { return null; }
    sent = true;
    return ref;
  };

  /* The tab is going away. A fetch would be killed mid-flight, so this hands
     the payload to the browser to deliver after the page is gone.

     pagehide, not visibilitychange: hiding fires every time someone switches
     tab, and sending on that would fill the inbox with duplicates of people
     who simply looked away and came back. The cost is that a few mobile
     closes are missed — better than that. */
  const onGone = () => {
    if (sent || !gated || !navigator.sendBeacon) return;
    try {
      const blob = new Blob([bodyFor('', makeRef(), 'closed')], { type: 'application/json' });
      if (navigator.sendBeacon(ENQUIRY_ENDPOINT, blob)) sent = true;
    } catch (e) { /* nothing useful to do on the way out */ }
  };
  addEventListener('pagehide', onGone);

  /* ── open and close ── */
  const start = () => {
    if (log.children.length) return;
    say('them', 'Hello. Before we start — who are we speaking to?');
    gate();
  };
  const show = on => {
    box.hidden = !on;
    document.body.classList.toggle('asking', on);
    openBtn.setAttribute('aria-expanded', String(on));
    if (on) { start(); scroll(); alive(); }
    else stopClocks();
  };
  openBtn.addEventListener('click', () => show(box.hidden));
  closeBtn.addEventListener('click', () => show(false));
  box.addEventListener('pointerdown', alive);
  addEventListener('keydown', e => { if (e.key === 'Escape' && !box.hidden) show(false); });
}

/* ── the social system, switched on ────────────────────────────────
   The About stop does not describe what the layers do, it lets you switch
   them on and watch the meters move. This is the same demo for the same
   reason: eight services listed as eight pills is a menu, and nobody buys a
   menu. Switched on one at a time, with the rhythm climbing, the leads
   appearing and the hours falling away, the argument makes itself — and the
   point lands that it is the combination that works, not any one part.

   It plays itself through once when the stop is reached and hands over the
   instant anyone touches it, because a demo that keeps driving while you are
   trying to use it is a video, not a control. */
const SM_SAY = [
  'A month planned in advance, so nothing goes out because somebody panicked.',
  'Posts written to that plan, in your voice, before the week starts.',
  'Designed to look like you — not like a template with your logo dropped on it.',
  'Published on time, whether or not anybody remembered it was Tuesday.',
  'Comments and messages answered while the interest is still warm.',
  'The people asking about buying are captured, not lost somewhere in an inbox.',
  'What worked and what did not, post by post, in numbers you can read.',
  'Next month is built from this month\'s numbers rather than from a hunch.'
];
const SM_ALL = 'Eight parts, one system — and none of it is on your desk.';
/* Switching a stage OFF is the more persuasive half, so it gets its own line.
   Nobody is moved by a list of what they would receive; they are moved by
   recognising the week they are already having. */
const SM_LOSE = [
  'With no plan, the month is whatever somebody thinks of on the day.',
  'Nothing gets written, so nothing goes out.',
  'It ships looking like a template with your logo dropped on it.',
  'Written and never published — the most ordinary way this fails.',
  'People ask, nobody answers, and they go somewhere that does.',
  'The ones ready to buy are left sitting unread in an inbox.',
  'You keep posting with no idea which of it is working.',
  'Next month repeats this month, including the parts that did not work.'
];
const SM_NODES = ['PLAN','WRITE','DESIGN','POST','REPLY','CAPTURE','MEASURE','IMPROVE'];
let smUpdate = () => {};
/* A chain, not a checklist. Posting needs every stage up to PUBLISH; a lead
   needs every stage up to CAPTURE. Averaging these — which is what this did
   at first — quietly tells a client that six of eight buys them 75% of the
   result. It does not. Work stops dead at the first gap, so the reading has
   to stop dead there too. That is the entire argument for hiring anyone. */
/* Who it takes, stage by stage. A hard hat is our team, a robot is our
   system. Three stages need nobody at all — which is exactly the part a
   client is paying for and the part they can never quite picture. */
const SM_CREW = [
  [1, 1],   // PLAN     judgement, on the numbers the system gathered
  [1, 1],   // WRITE    drafted by the system, finished by a person
  [1, 1],   // DESIGN   made by a person, varied by the system
  [0, 1],   // POST     nobody. it publishes itself
  [1, 1],   // REPLY    answered in seconds, escalated when it is real
  [0, 1],   // CAPTURE  nobody. the buyer is caught on the way past
  [0, 1],   // MEASURE  nobody. it counts itself
  [1, 1]    // IMPROVE  a decision, taken on what the month actually did
];
const SM_RHYTHM = [0, 1, 2, 3];          // plan, write, design, publish
const SM_LEADS  = [0, 1, 2, 3, 4, 5];    // ...and answered, and captured

function socialRig() {
  const rig = $('#smRig'), host = $('#social');
  if (!rig || !host) return;
  const btns = $$('.ly-t', rig);
  const bar = { r: $('#smRhythm'), l: $('#smLeads'), t: $('#smTime') };
  const note = $('#smNote');
  if (!btns.length || !note || !bar.r) return;
  const OFF = note.textContent;
  const on = new Set();
  let touched = false, demo = null, last = null, lastOn = true, revert = 0;

  /* The first stage that is missing. Everything downstream of it is theory. */
  const firstGap = () => {
    for (let i = 0; i < btns.length; i++) if (!on.has(i)) return i;
    return -1;
  };

  const paint = () => {
    /* A chain reads as its weakest link, not its average. Miss one stage and
       the number it feeds goes to nothing, however much of the rest is on. */
    const chain = set => set.every(i => on.has(i)) ? 1 : 0;
    const built = set => set.filter(i => on.has(i)).length / set.length;
    /* Not quite nothing: a broken chain still produces the ghost of an effort,
       and showing a flat zero would look like the control was broken rather
       than the process. It shows what was put in, at a fifth of its value — 
       which is roughly what unfinished work is worth. */
    bar.r.style.width = Math.round((chain(SM_RHYTHM) || built(SM_RHYTHM) * .2) * 100) + '%';
    bar.l.style.width = Math.round((chain(SM_LEADS) || built(SM_LEADS) * .12) * 100) + '%';
    /* Hours falls rather than fills, and never reaches nothing: somebody still
       approves the month. Claiming zero would be the one dishonest number on
       the page. */
    bar.t.style.width = Math.round(100 - (on.size / btns.length) * 88) + '%';
    rig.classList.toggle('full', on.size === btns.length);
    /* What it says, in order of what matters most to hear: the finished
       system, then nothing at all, then — whatever you just did — where the
       work is still stopping. Switching a stage on shows what it buys for a
       moment, and then the line goes back to the gap, because the gap is
       still the fact. */
    const gap = firstGap();
    const settled = gap < 0 ? SM_ALL : on.size ? SM_LOSE[gap] : OFF;
    note.textContent = last === null ? settled
                     : lastOn && gap >= 0 ? SM_SAY[last]
                     : settled;
    clearTimeout(revert);
    if (last !== null && lastOn && gap >= 0) revert = setTimeout(() => {
      note.textContent = firstGap() < 0 ? SM_ALL : SM_LOSE[firstGap()];
    }, 2600);
  };

  const set = (i, state) => {
    state ? on.add(i) : on.delete(i);
    last = i; lastOn = state;
    if (!state && !on.size) last = null;        // nothing on is its own sentence
    btns[i].setAttribute('aria-pressed', String(state));
    paint();
  };

  const hand = () => { touched = true; clearInterval(demo); demo = null; };
  btns.forEach((b, i) => b.addEventListener('click', () => {
    hand();
    set(i, b.getAttribute('aria-pressed') !== 'true');
  }));

  const play = () => {
    if (touched || demo || on.size) return;
    let i = 0;
    demo = setInterval(() => {
      if (touched || i >= btns.length) { clearInterval(demo); demo = null; return; }
      set(i++, true);
    }, 820);
  };

  /* Reduced motion gets the finished state rather than the performance: the
     argument is the combination, and that is visible standing still. */
  /* ── the chain ──────────────────────────────────────────────────
     The same picture the About stop draws, making a different argument. Work
     moves left to right through eight stations and returns along an arc
     underneath, because this is a loop: what you learn in MEASURE is what you
     plan next month from. The loop only closes when every station is lit.

     A station that is off is a hole in the floor. Work reaching it drops out
     of the band and fades, and it keeps dropping for as long as the gap is
     there. That is the entire case for the service, and it is better watched
     than read: switch one off and you see exactly where your week goes. */
  const cv = $('#smCanvas');
  if (cv && !reduced) {
    const ctx = cv.getContext('2d');
    let W = 0, H = 0, spawnAt = 0, lost = 0, lostAt = 0, leads = 0, chips = [];
    let trip = null, hx = null, tp = null;
    let cold = 0, coldAt = 0;
    let queue = SM_NODES.map(() => 0);
    const pulse = SM_NODES.map(() => 0);   // a station flares as work leaves it
    const lit = SM_NODES.map(() => 0);        // eased, so stations come up rather than blink

    const size = () => {
      const r = cv.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      const d = Math.min(devicePixelRatio || 1, 1.5);
      W = r.width; H = r.height;
      cv.width = W * d; cv.height = H * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      measure();
      return true;
    };
    addEventListener('resize', () => { size(); });

    /* The stations sit under the toggles that switch them, read from the
       buttons themselves rather than spaced evenly across the canvas. Even
       spacing left the chain narrower than the row above it and the two read
       as unrelated; measured, every station lands under its own tag however
       the row lays out. Falls back to even spacing when the toggles wrap,
       which they do on a phone. */
    const PAD = 30;
    let cols = null;
    const measure = () => {
      const base = cv.getBoundingClientRect();
      const rects = btns.map(b => b.getBoundingClientRect());
      const oneRow = rects.every(r => Math.abs(r.top - rects[0].top) < 2);
      if (!oneRow || !base.width) { cols = null; return; }
      let c = rects.map(r => r.left - base.left + r.width / 2);
      /* If the row sits even slightly outside the canvas — a wider screen, a
         font that loaded late, a reflow nobody predicted — the whole chain is
         squeezed back inside rather than its end stations being clamped on
         top of each other or drawn past the edge. Scaled, it still reads as
         the same chain and every station keeps its label. Clamping one node
         at a time was not enough: it kept the last one visible but left the
         rail running off the edge to meet it. */
      const lo = 18, hi = base.width - 18;
      const a = Math.min(...c), z = Math.max(...c);
      if (a < lo || z > hi) {
        const k = (hi - lo) / Math.max(1, z - a);
        c = c.map(v => lo + (v - a) * k);
      }
      cols = c;
    };
    /* Measured once at startup is measured too early. The row is laid out in
       a fallback font, the mono face arrives a beat later, every tag changes
       width and the chain is left pointing at where they used to be — which
       is why the last station drifted off the end while the first still
       looked right. Re-read when the fonts land, and once a second while the
       stop is on screen, which costs eight rect reads and fixes any reflow
       this cannot predict. */
    document.fonts?.ready.then(() => { size(); });
    let remeasuredAt = 0;
    /* Clamped into the canvas whatever the measurement says. If the row ever
       overflows its column again, the chain compresses to fit instead of
       drawing its last stations off the edge — a squeezed chain is a layout
       bug, a severed one looks like the page is broken. */
    const nx = i => cols ? cols[i]
                         : PAD + (i * (W - PAD * 2)) / (SM_NODES.length - 1);
    const ny = () => H * .54;
    const tone = i => {                        // blue at the start, violet by the end
      const k = i / (SM_NODES.length - 1);
      return [Math.round(30 + 136 * k), Math.round(144 - 107 * k), Math.round(255 - 17 * k)];
    };

    smUpdate = (t, dt, live) => {
      if (!live) return;
      if (!W && !size()) return;
      if (t - remeasuredAt > 1000) {
        remeasuredAt = t;
        const r = cv.getBoundingClientRect();
        if (Math.abs(r.width - W) > 1 || Math.abs(r.height - H) > 1) size();
        else measure();
      }
      ctx.clearRect(0, 0, W, H);
      const step = dt / 16;

      SM_NODES.forEach((_, i) => {
        const want = on.has(i) ? 1 : 0;
        lit[i] += (want - lit[i]) * (1 - Math.pow(.86, step));
      });
      const closed = Math.min(...lit);
      /* Switched on is not the same as working, and that distinction is the
         whole argument. A stage downstream of a gap is paid for and idle:
         nothing reaches it, so it produces nothing. It is drawn as what it
         is — present, lit, and starved — rather than as healthy. Everything
         past the break greys out and the line between them goes dead, which
         is the point made in one look and without a word. */
      let flow2 = 1;
      const reach = lit.map(l => (flow2 = Math.min(flow2, l > .5 ? 1 : 0)));
      const gapAt = reach.indexOf(0);

      // the rails
      for (let i = 0; i < SM_NODES.length - 1; i++) {
        const carries = reach[i] && reach[i + 1];
        const both = Math.min(lit[i], lit[i + 1]);
        ctx.strokeStyle = carries
          ? `rgba(150,180,255,${(.10 + both * .32).toFixed(3)})`
          : 'rgba(126,138,166,.26)';          // a line with nothing on it
        ctx.lineWidth = 1;
        ctx.setLineDash(carries ? [] : [2, 7]);
        ctx.beginPath(); ctx.moveTo(nx(i), ny()); ctx.lineTo(nx(i + 1), ny()); ctx.stroke();
      }
      // the return — only a real line once every station is lit
      ctx.strokeStyle = `rgba(166,37,238,${(.05 + closed * .40).toFixed(3)})`;
      ctx.setLineDash(closed > .75 ? [] : [3, 7]);
      ctx.beginPath();
      ctx.moveTo(nx(SM_NODES.length - 1), ny());
      ctx.bezierCurveTo(nx(SM_NODES.length - 1) + 20, H * .97, nx(0) - 20, H * .97, nx(0), ny());
      ctx.stroke();
      ctx.setLineDash([]);

      /* The stations. Each flares as work leaves it, so the eye follows the
         work rather than scanning the row. */
      SM_NODES.forEach((label, i) => {
        const x = nx(i), y = ny(), l = lit[i], f = pulse[i], alive = reach[i];
        pulse[i] = Math.max(0, f - .035 * step);
        /* Colour is reserved for the part that is actually running. Past the
           break everything is the same cold grey, so the eye reads the chain
           as ending there. */
        const [r, g, b2] = alive ? tone(i) : [128, 138, 160];
        if (l > .02 && alive) {
          ctx.fillStyle = `rgba(${r},${g},${b2},${(l * .14 + f * .26).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(x, y, 8 + l * 4 + f * 8, 0, 7); ctx.fill();
        }
        /* An unlit station has to look OFF, not absent. At 16% alpha on black
           it simply disappeared and the chain read as cut at that point —
           which is what it was mistaken for. It is a visible empty socket
           now: clearly there, clearly not running. The difference between
           having a stage and not having it is the argument, and it only
           works if you can see both. */
        ctx.strokeStyle = `rgba(${r},${g},${b2},${(alive ? .24 + l * .66 : .46).toFixed(3)})`;
        ctx.lineWidth = 1.2 + (alive ? f : 0);
        ctx.beginPath(); ctx.arc(x, y, 5.4 + f * 1.6, 0, 7); ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${(alive ? .14 + l * .86 : .22).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill();
        /* On a phone the eight stations have about 39px each and CAPTURE
           alone measures 38, so the labels would sit on top of one another.
           They alternate above and below the rail instead, which gives each
           one the width of two — the row stays readable rather than becoming
           a grey smear. */
        const tight = W < 520;
        ctx.font = (tight ? 9 : 11) + 'px ui-monospace,monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(190,205,235,${(alive ? .30 + l * .58 : .46).toFixed(2)})`;
        ctx.fillText(label, x, tight ? (i % 2 ? y + 52 : y + 38) : y + 40);
        /* The break itself, marked where it happens. */
        if (i === gapAt && on.size) {
          ctx.strokeStyle = 'rgba(190,200,225,.5)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x - 4.5, y - 4.5); ctx.lineTo(x + 4.5, y + 4.5);
          ctx.moveTo(x + 4.5, y - 4.5); ctx.lineTo(x - 4.5, y + 4.5);
          ctx.stroke();
        }

        /* The backlog: work arriving at a stage nobody runs does not vanish
           politely, it stacks up until the pile tips over. */
        /* The pile. These were small orange dots, which read as insects and
           belonged to no other part of this site. They are what they actually
           are now: finished posts, stacked up unpublished, drawn in the same
           cold grey as everything else that is not running. */
        const q = queue[i];
        if (q) for (let n = 0; n < q; n++) {
          const wob = Math.sin(t * .0022 + i * 2 + n) * 1.1;
          const py = y - 19 - n * 7;
          /* A breath of light on them. Everything else on this page is lit
             from behind; flat rectangles read as a rendering mistake rather
             than as waiting work. The glow is cool and faint — enough to
             belong here, not enough to look like it is working. */
          ctx.globalAlpha = .24 + n * .08;
          ctx.shadowColor = 'rgba(140,168,230,.75)';
          ctx.shadowBlur = 7 + n;
          ctx.fillStyle = 'rgba(18,23,38,.92)';
          ctx.strokeStyle = 'rgba(168,184,225,.72)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(x - 7 + wob, py - 2.5, 14, 5, 1.5);
          else ctx.rect(x - 7 + wob, py - 2.5, 14, 5);
          ctx.fill(); ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        }
      });

      /* ── one post, and the crew who make it ───────────────────────
         Eight dots moving at once showed throughput. It did not show the
         thing a buyer is actually trying to work out: who does all this, and
         how much of it lands on me. So there is one post now, and you watch
         it being made — and at every station the people doing the work walk
         on, do it, and stay.

         A hard hat is our team. A robot is our system. Most stations need
         both; publishing, capture and measurement need no one at all. By the
         time the post is finished the whole crew is standing along the chain,
         and the client has not appeared once, because the client never does.
         That is the argument, and nobody has to read a word of it. */
      const WORK = 760, HOP = 0.014;

      /* The post itself, gaining a little more of itself at every station: a
         caption at WRITE, a picture at DESIGN, a live pip at POST, a reply
         bubble at REPLY, a chart at MEASURE. */
      const card = (x, y, st, alpha) => {
        const w = W < 520 ? 18 : 26, h = W < 520 ? 13 : 19;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(12,16,28,.96)';
        ctx.strokeStyle = st >= 3 ? 'rgba(150,230,190,.85)' : 'rgba(150,180,255,.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, 3);
        else ctx.rect(x - w / 2, y - h / 2, w, h);
        ctx.fill(); ctx.stroke();
        if (st >= 2) {
          ctx.fillStyle = 'rgba(120,140,255,.6)';
          ctx.fillRect(x - w / 2 + 2.5, y - h / 2 + 2.5, 7, h - 5);
        }
        if (st >= 1) {
          const lx = x - w / 2 + (st >= 2 ? 11.5 : 3), lw = st >= 2 ? 8 : 19;
          ctx.fillStyle = 'rgba(205,218,245,.75)';
          ctx.fillRect(lx, y - 3, lw, 1.4);
          ctx.fillRect(lx, y + 1, lw * .66, 1.4);
        }
        if (st >= 4) {
          ctx.fillStyle = 'rgba(130,255,180,.95)';
          ctx.beginPath(); ctx.arc(x + w / 2 - 3, y - h / 2 + 3, 1.7, 0, 7); ctx.fill();
        }
        if (st >= 5) {
          ctx.fillStyle = 'rgba(255,255,255,.85)';
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(x - 4, y - h / 2 - 10, 12, 7, 2);
          else ctx.rect(x - 4, y - h / 2 - 10, 12, 7);
          ctx.fill();
          ctx.beginPath(); ctx.moveTo(x - 1, y - h / 2 - 3); ctx.lineTo(x + 2.5, y - h / 2 - 3);
          ctx.lineTo(x - 1, y - h / 2 - .4); ctx.closePath(); ctx.fill();
        }
        if (st >= 7) {
          ctx.fillStyle = 'rgba(166,120,255,.9)';
          for (let n = 0; n < 3; n++) ctx.fillRect(x - 6 + n * 4.5, y + h / 2 + 2, 2.6, 2 + n * 2.4);
        }
        ctx.globalAlpha = 1;
      };

      /* ── the two of them ──────────────────────────────────────────
         One specialist, one machine. The machine keeps station beside the
         post. The specialist does not walk and does not jog — when a stage
         needs judgement he arrives, and when it does not he stops dead where
         he stands, lights down, and waits. Arriving is instant and visible:
         he breaks up into scanlines, the beam closes, and he reassembles at
         the station that called him.

         Three of the eight stages never call. Watching someone stand frozen
         while the machine finishes the job on its own is the argument this
         section exists to make. */
      const FIG = W < 520 ? 1.7 : 2.7;
      const FY = () => ny() - (14 + 13 * FIG);

      const laptop = (x, y, k, col, glow) => {
        ctx.strokeStyle = col; ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(x - 4.6 * k, y); ctx.lineTo(x - 3.4 * k, y - 4.6 * k);
        ctx.lineTo(x + 4.2 * k, y - 4.6 * k); ctx.lineTo(x + 4.6 * k, y);
        ctx.closePath(); ctx.stroke();
        ctx.fillStyle = glow;
        ctx.fillRect(x - 3.5 * k, y - 4 * k, 7.4 * k, 3.4 * k);
        ctx.strokeStyle = col;
        ctx.beginPath();
        ctx.moveTo(x - 6 * k, y + .6 * k); ctx.lineTo(x + 6 * k, y + .6 * k); ctx.stroke();
      };

      const hands = (x, y, k, col, phase) => {
        ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
        const l = Math.sin(phase) * .9 * k, r = Math.sin(phase + 2.1) * .9 * k;
        ctx.beginPath();
        ctx.moveTo(x - 3.8 * k, y - 3.6 * k); ctx.lineTo(x - 2.2 * k, y - .2 * k + l);
        ctx.moveTo(x + 3.8 * k, y - 3.6 * k); ctx.lineTo(x + 2.2 * k, y - .2 * k + r);
        ctx.stroke(); ctx.lineCap = 'butt';
      };

      /* The arrival. Scanlines eat the figure from the bottom up, a column of
         light closes over the spot, and it runs backwards where he lands. */
      const beam = (x, y, k, p, col) => {
        const w = 9 * k * (1 - Math.abs(p - .5) * 2);
        const g = ctx.createLinearGradient(x, y - 10 * k, x, y + 21 * k);
        g.addColorStop(0, 'rgba(150,200,255,0)');
        g.addColorStop(.5, col);
        g.addColorStop(1, 'rgba(150,200,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - w / 2, y - 10 * k, w, 31 * k);
      };

      const scan = (x, y, k, p) => {            // cuts the body into slats
        ctx.save();
        ctx.beginPath();
        const n = 9, h = 31 * k / n;
        for (let i = 0; i < n; i++) {
          const on = (i / n) < p;
          if (on) ctx.rect(x - 9 * k, y - 10 * k + i * h, 18 * k, h * .72);
        }
        ctx.clip();
      };

      /* Named where they stand. A key at the foot of the band meant looking
         away from the figures to find out who they were, and at that size it
         was unreadable anyway. The name sits over each of them, centred, in
         their own colour, so the swatches are not needed at all. */
      const nameOver = (x, y, k, text, col) => {
        ctx.font = '600 ' + (W < 520 ? 8 : 10) + 'px ui-monospace,monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = col;
        ctx.fillText(text, x, y - 9.5 * k);
      };

      const human = (x, y, a, mode, type) => {
        const k = FIG, ink = `rgba(240,234,218,${(.96 * a).toFixed(2)})`;
        const work = mode === 'work';
        const bob = work ? Math.sin(t * .01) * .4 : 0;      // still when paused
        ctx.save();
        ctx.translate(x, y + bob);
        ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 1.5;

        ctx.beginPath(); ctx.arc(0, 0, 3 * k, 0, 7); ctx.stroke();           // head
        ctx.beginPath();                                                      // headset band
        ctx.arc(0, -.4 * k, 3.9 * k, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
        ctx.beginPath();                                                      // ear cup
        ctx.arc(-3.5 * k, -.2 * k, 1.15 * k, 0, 7); ctx.fill();
        ctx.beginPath();                                                      // mic boom
        ctx.moveTo(-3.3 * k, .6 * k);
        ctx.quadraticCurveTo(-2.4 * k, 3 * k, -.7 * k, 2.6 * k); ctx.stroke();
        ctx.beginPath();                                                      // collar
        ctx.moveTo(-2.2 * k, 4.6 * k); ctx.lineTo(0, 6 * k); ctx.lineTo(2.2 * k, 4.6 * k);
        ctx.stroke();
        ctx.beginPath();                                                      // torso
        ctx.moveTo(-4.4 * k, 8 * k);
        ctx.quadraticCurveTo(-4.2 * k, 4.6 * k, 0, 4.3 * k);
        ctx.quadraticCurveTo(4.2 * k, 4.6 * k, 4.4 * k, 8 * k);
        ctx.lineTo(3 * k, 13.4 * k); ctx.lineTo(-3 * k, 13.4 * k);
        ctx.closePath(); ctx.stroke();
        ctx.globalAlpha = .45 * a;                                            // a seam
        ctx.beginPath(); ctx.moveTo(0, 6.2 * k); ctx.lineTo(0, 13 * k); ctx.stroke();
        ctx.globalAlpha = 1;

        if (work) {
          laptop(0, 10.4 * k, k, ink, `rgba(150,200,255,${(.55 * a).toFixed(2)})`);
          hands(0, 10.4 * k, k, ink, t * .03);
        } else {
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-3.4 * k, 6.8 * k); ctx.lineTo(-4.5 * k, 12.4 * k);
          ctx.moveTo(3.4 * k, 6.8 * k); ctx.lineTo(4.5 * k, 12.4 * k);
          ctx.stroke(); ctx.lineCap = 'butt';
        }
        ctx.lineCap = 'round'; ctx.lineWidth = 1.7;                           // legs, planted
        ctx.beginPath();
        ctx.moveTo(-1.4 * k, 13.4 * k); ctx.lineTo(-1.8 * k, 20 * k);
        ctx.moveTo(1.4 * k, 13.4 * k); ctx.lineTo(1.8 * k, 20 * k);
        ctx.moveTo(-3 * k, 20 * k); ctx.lineTo(-.6 * k, 20 * k);
        ctx.moveTo(3 * k, 20 * k); ctx.lineTo(.6 * k, 20 * k);
        ctx.stroke(); ctx.lineCap = 'butt';
        ctx.restore();

        nameOver(x, y, k, 'OUR TEAM', `rgba(244,238,224,${(.92 * a).toFixed(2)})`);
        if (!work && type) {                                                  // standing by
          ctx.font = (W < 520 ? 7 : 8.5) + 'px ui-monospace,monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = `rgba(240,234,218,${(.55 * a).toFixed(2)})`;
          ctx.fillText('STANDING BY', x, y + 25.5 * k);
        }
      };

      const robot = (x, y, a, work) => {
        const k = FIG, ink = `rgba(205,196,232,${(.95 * a).toFixed(2)})`;
        const trim = `rgba(178,126,255,${(.95 * a).toFixed(2)})`;
        const bob = work ? Math.sin(t * .02) * .45 : 0;
        ctx.save();
        ctx.translate(x, y + bob);
        ctx.lineWidth = 1.5;

        ctx.strokeStyle = ink;                                               // antenna
        ctx.beginPath(); ctx.moveTo(0, -5.4 * k); ctx.lineTo(0, -3.2 * k); ctx.stroke();
        ctx.fillStyle = trim;
        ctx.beginPath(); ctx.arc(0, -6.1 * k, .9 * k, 0, 7); ctx.fill();
        ctx.strokeStyle = ink;                                               // dome head
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-3.8 * k, -3.2 * k, 7.6 * k, 6 * k, 2.4 * k);
        else ctx.rect(-3.8 * k, -3.2 * k, 7.6 * k, 6 * k);
        ctx.stroke();
        ctx.fillStyle = work                                                  // the eye
          ? `rgba(132,255,200,${(.95 * a).toFixed(2)})`
          : `rgba(178,126,255,${(.55 * a).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(1.3 * k, -.4 * k, 1.5 * k, 0, 7); ctx.fill();
        ctx.strokeStyle = ink;
        ctx.beginPath(); ctx.arc(-1.5 * k, -.4 * k, 1.1 * k, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 2.8 * k); ctx.lineTo(0, 4 * k); ctx.stroke();

        ctx.beginPath();                                                      // shoulder caps
        ctx.arc(-4.2 * k, 5.6 * k, 1.7 * k, 0, 7);
        ctx.arc(4.2 * k, 5.6 * k, 1.7 * k, 0, 7); ctx.stroke();
        ctx.beginPath();                                                      // chassis
        if (ctx.roundRect) ctx.roundRect(-3.4 * k, 4 * k, 6.8 * k, 8.4 * k, 1.8 * k);
        else ctx.rect(-3.4 * k, 4 * k, 6.8 * k, 8.4 * k);
        ctx.stroke();
        ctx.strokeStyle = trim; ctx.globalAlpha = .7 * a;                     // chest plate
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-1.9 * k, 5.6 * k, 3.8 * k, 3.2 * k, .8 * k);
        else ctx.rect(-1.9 * k, 5.6 * k, 3.8 * k, 3.2 * k);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = work ? `rgba(132,255,200,${(.9 * a).toFixed(2)})` : `rgba(178,126,255,${(.4 * a).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(0, 10.6 * k, .8 * k, 0, 7); ctx.fill();      // status light
        ctx.strokeStyle = ink;

        if (work) {
          laptop(0, 10.8 * k, k, ink, `rgba(132,255,200,${(.5 * a).toFixed(2)})`);
          hands(0, 10.8 * k, k, ink, t * .042);
        } else {
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-4.4 * k, 6.8 * k); ctx.lineTo(-5.4 * k, 11.8 * k);
          ctx.moveTo(4.4 * k, 6.8 * k); ctx.lineTo(5.4 * k, 11.8 * k);
          ctx.stroke(); ctx.lineCap = 'butt';
        }
        ctx.lineWidth = 1.7; ctx.lineCap = 'round';                           // legs and feet
        ctx.beginPath();
        ctx.moveTo(-1.7 * k, 12.4 * k); ctx.lineTo(-2 * k, 18.6 * k);
        ctx.moveTo(1.7 * k, 12.4 * k); ctx.lineTo(2 * k, 18.6 * k);
        ctx.moveTo(-3.3 * k, 18.6 * k); ctx.lineTo(-.8 * k, 18.6 * k);
        ctx.moveTo(3.3 * k, 18.6 * k); ctx.lineTo(.8 * k, 18.6 * k);
        ctx.stroke(); ctx.lineCap = 'butt';
        ctx.restore();
        nameOver(x, y, k, 'OUR SYSTEM', `rgba(196,154,255,${(.95 * a).toFixed(2)})`);
      };

      const escort = (cx, stage, busy, moving) => {
        const k = FIG, near = 12 * k;
        const needH = (SM_CREW[stage] || [1, 1])[0];
        if (hx === null) hx = cx - near;

        /* He is called, he is not followed. While a stage runs without him he
           stays exactly where he last stood — he does not drift along behind
           the post at a polite distance, which is what he was doing and which
           made him look like an assistant rather than the person you call
           when something needs deciding.

           So a destination only exists when a stage that needs judgement has
           the post in front of it. Then he goes out in scanlines and comes
           back in them, at the station that called him. */
        if (needH && busy) {
          const want = cx - near;
          if (!tp && Math.abs(want - hx) > 3) tp = { p: 0, to: want };
        }
        if (tp) {
          tp.p += .055 * step;
          if (tp.p >= .5 && hx !== tp.to) hx = tp.to;
          if (tp.p >= 1) tp = null;
        }
        const p = tp ? tp.p : 1;
        const vis = tp ? Math.abs(p - .5) * 2 : 1;            // gone at the midpoint

        if (tp) beam(hx, FY(), k, p, `rgba(150,200,255,${(.35 * (1 - vis)).toFixed(2)})`);
        ctx.save();
        if (tp) scan(hx, FY(), k, vis);
        human(hx, FY(), needH ? 1 : .52,
              busy && needH ? 'work' : 'idle', !tp && !needH);
        ctx.restore();

        robot(cx + near, FY(), 1, busy);

        /* What kind of work this is, said at the station where it happens. */
        ctx.font = (W < 520 ? 7 : 8.5) + 'px ui-monospace,monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = needH ? 'rgba(205,214,240,.62)' : 'rgba(132,255,200,.68)';
        ctx.fillText(needH ? 'PEOPLE + SYSTEM' : 'FULLY AUTOMATED', cx, ny() + 22);
      };

      if (!trip && t - spawnAt > 1100) {
        trip = { i: 0, k: 0, st: 0, phase: 'work', wt: 0, dead: 0 };
      }

      queue = SM_NODES.map(() => 0);
      if (trip) {
        const at = trip.i;
        if (trip.dead) {                           // it never got past the gap
          trip.dead += .7 * step;
          card(nx(at), ny() + trip.dead * 5, trip.st, Math.max(0, 1 - trip.dead / 16));
          escort(nx(at), at, false, false);         // standing over work they cannot finish
          queue[at] = 1;
          if (trip.dead > 16) { trip = null; spawnAt = t; lost++; lostAt = t; }
        } else if (lit[at] < .4) {
          trip.dead = .01;
        } else if (trip.phase === 'work') {
          trip.wt += dt;
          card(nx(at), ny(), trip.st, 1);
          escort(nx(at), at, true, false);
          if (trip.wt > WORK) {
            trip.st = Math.max(trip.st, at + 1);
            pulse[at] = 1;
            if (at === 5) chips.push({ x: nx(5), y: ny(), vy: .35, life: 1 });
            if (at >= SM_NODES.length - 1) {       // round the arc and start again
              trip = null; spawnAt = t;
            } else { trip.phase = 'move'; trip.k = 0; trip.wt = 0; trip.i = at + 1; }
          }
        } else {
          trip.k += HOP * step;
          const from = nx(at - 1), to = nx(at);
          const cx = from + (to - from) * trip.k;
          card(cx, ny(), trip.st, 1);
          escort(cx, at, false, true);              // carried, not teleported
          if (trip.k >= 1) { trip.phase = 'work'; trip.wt = 0; }
        }
      }

      /* Leads, and leads going cold. A lead is not a trophy, it is somebody
         waiting for an answer: with REPLY or CAPTURE missing nothing new
         arrives AND what you already have drains away while you watch. The
         number coming down is the argument. */
      const warm = SM_LEADS.every(i => on.has(i));
      if (!warm && leads > 0) {
        cold += dt;
        if (cold > 1400) { cold = 0; leads--; coldAt = t; }
      } else if (warm) cold = 0;

      for (const c of chips) {
        c.y += c.vy * step; c.vy += .035 * step;
        if (c.y >= ny() + 42) { c.life = 0; leads++; continue; }
        ctx.fillStyle = 'rgba(130,255,180,.9)';
        ctx.beginPath(); ctx.arc(c.x, c.y, 2.6, 0, 7); ctx.fill();
      }
      chips = chips.filter(c => c.life > 0);

      const trayX = nx(5), trayY = ny() + (W < 520 ? 64 : 58);
      const chilling = !warm && leads > 0;
      const hue = chilling ? '206,170,150' : '130,255,180';
      const flash = chilling ? Math.max(0, 1 - (t - coldAt) / 900) : 0;
      ctx.textAlign = 'center';
      ctx.font = '11px ui-monospace,monospace';
      ctx.strokeStyle = `rgba(${hue},${(leads ? .45 : .16) + flash * .4})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(trayX - 42, trayY - 11, 84, 16, 3);
      else ctx.rect(trayX - 42, trayY - 11, 84, 16);
      ctx.stroke();
      ctx.fillStyle = `rgba(${hue},${leads || !on.size ? .95 : .55})`;
      ctx.fillText(
        chilling ? leads + ' GOING COLD'
        : leads ? leads + (leads === 1 ? ' LEAD' : ' LEADS')
        : on.size ? 'NO RESULT'
        : 'LEADS',
        trayX, trayY);

      if (lost) {
        const fade = Math.max(.4, 1 - (t - lostAt) / 4000);
        ctx.textAlign = 'left';
        ctx.fillStyle = `rgba(176,186,210,${(fade * .8).toFixed(2)})`;
        ctx.fillText(lost + (lost === 1 ? ' POST NEVER WENT OUT' : ' POSTS NEVER WENT OUT'), 2, H - 3);
      }
    };
    size();
  }

  if (reduced) { btns.forEach((_, i) => set(i, true)); return; }

  if (host.classList.contains('live')) play();
  new MutationObserver(() => { if (host.classList.contains('live')) play(); })
    .observe(host, { attributes: true, attributeFilter: ['class'] });
}

/* ── cursor ────────────────────────────────────────────────────── */
function cursor() {
  const c = $('#cursor'); if (touch || reduced) return;
  let x = 0, y = 0, tx = 0, ty = 0;
  addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; }, { passive: true });
  (function loop() { x = lerp(x, tx, .2); y = lerp(y, ty, .2);
    c.style.transform = `translate(${x}px,${y}px)`; requestAnimationFrame(loop); })();
  const label = $('.cur-t', c);
  document.addEventListener('pointerover', e => {
    /* data-cue is an invitation with words on it, so it wins over the plain
       enlargement — otherwise a link inside the block would shrink the disc
       back mid-sentence. */
    const el = e.target.closest('[data-cue]');
    /* data-cue="" opts an element OUT of the disc — the swap button sits
       inside the brief and would otherwise inherit "click to read more",
       which is not what pressing it does. */
    const cue = el && el.dataset.cue ? el.dataset.cue : '';
    if (label) label.textContent = cue;
    c.classList.toggle('is-read', !!cue);
    c.classList.toggle('is-lg', !cue && !!e.target.closest('a,button,.proj,.fill,.pillar'));
  });
}

/* ── nav ───────────────────────────────────────────────────────── */
function nav() {
  const navEl = $('#nav'), burger = $('#burger');
  $$('[data-goto]').forEach(el => el.addEventListener('click', e => {
    e.preventDefault();
    const i = +el.dataset.goto;
    navEl.classList.remove('open'); burger.setAttribute('aria-expanded', 'false');
    /* Flat, not reduced. #track is display:none in flat mode and measure()
       never gives it a height, so track.offsetHeight is 0 and `max` comes out
       NEGATIVE — every menu item scrolled you to the top of the page instead
       of to its section. This is the mast on the hero and the burger menu on
       every phone and tablet, so it was the whole navigation. */
    if (flat) {
      stops[i].scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    if (reduced) { scrollTo(0, (i / (N - 1)) * (track.offsetHeight - vh)); return; }
    seekStop(i);
  }));
  /* Phones: the header is a top-of-page thing, and this is the way back to it.
     The class is toggled only when the threshold is actually crossed, so a
     scroll costs one comparison per frame's worth of events and nothing else.
     Only the phone media query reads .scrolled, so this is inert everywhere
     else — a tablet and a desktop toggle a class nobody styles. */
  const toTop = $('#toTop');
  toTop?.addEventListener('click', () => {
    if (flat || reduced) { scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); return; }
    seekStop(0);
  });
  let atTop = true;
  addEventListener('scroll', () => {
    const now = scrollY <= 40;
    if (now === atTop) return;
    atTop = now;
    document.body.classList.toggle('scrolled', !now);
  }, { passive: true });

  burger.addEventListener('click', () => {
    const open = navEl.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(open));
  });
}

/* ── frame ─────────────────────────────────────────────────────── */
const SECTORS = ['00 / ORIGIN', '01 / ABOUT', '02 / HOW WE WORK', '03 / CASE STUDIES',
                 '04 / SOCIAL', '05 / REACH'];
const ARROWS  = ['↘', '↓', '←', '↘', '↘'];
const hudSector = $('#hudSector'), hudArrow = $('#hudArrow'), hudCoord = $('#hudCoord'),
      pFill = $('#progressFill'), navLinks = $$('.nav-links a'),
      pHead = $('#progressHead'), pPct = $('#progressPct'),
      navLinksEl = $('#navLinks'), poleEl = $('#pole'), wordmark = $('.wordmark');
let lastSector = -1, lastNavMode = null, lastArrived = -1, nearIdx = -1;
const lastOp = [];
let lastFilmPick = 0;
const dists = [];

/* Frame counter, for the work a phone does not need done sixty times a second.
   See the foot of tick(). */
let fno = 0;

/* Where each stop sits in the document, in flat mode.
   This used to be five getBoundingClientRect() calls per frame — three hundred
   a second, each one a forced synchronous layout, and all five taken straight
   after the loop above has written transforms to the parallax layers. That is
   the textbook way to make a phone stutter while doing nothing.

   The positions only change when the page reflows, so they are cached and
   refreshed twice a second: twelve reads a second instead of three hundred,
   and still self-healing if a font or an image lands late and moves things. */
let flatMid = [], flatMidAt = -1e9;
const flatMids = t => {
  if (flatMid.length === N && t - flatMidAt < 400) return flatMid;
  flatMidAt = t;
  flatMid = stops.map(el => {
    const r = el.getBoundingClientRect();
    return r.top + scrollY + r.height / 2;
  });
  return flatMid;
};
const dropFlatMids = () => { flatMidAt = -1e9; };

/* Off the hero, the mast is gone and nothing says the wordmark is the way
   back. So on each new arrival a star shoots along a rail beneath it. */
function flashWordmark() {
  if (!wordmark || reduced) return;
  wordmark.classList.remove('shoot');
  void wordmark.offsetWidth;            // restart, rather than ignore a re-add
  wordmark.classList.add('shoot');
}
wordmark?.addEventListener('animationend', e => {
  if (e.animationName === 'trailWake') wordmark.classList.remove('shoot');
});

let lastTick = 0;
/* ── section numerals ───────────────────────────────────────────────
   01–04 sit at 3% white so they read as watermark rather than content. They
   now lift toward 8% as the cursor approaches — five points of white, which is
   what "5% brighter" can mean here that is actually perceptible: five percent
   OF the alpha would be .030 → .0315, a change no display resolves.

   Distance is measured to the glyph's box, not its centre. These are enormous
   characters, so centre distance would keep the number dark while the cursor
   sat directly on top of it. Rects are read only for live stops — at most two
   in frame — because reading layout every frame for all five would thrash
   against the transforms the same loop has just written. */
const numGlow = (() => {
  const nums = $$('.stop-num');
  if (!nums.length || touch) return () => {};
  let mx = -9e9, my = -9e9;
  addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; }, { passive: true });
  const cur = nums.map(() => 0);
  return () => {
    const reach = Math.min(vw, vh) * .55;
    nums.forEach((n, i) => {
      const stop = n.closest('.stop');
      let want = 0;
      if (stop && stop.classList.contains('live')) {
        const b = n.getBoundingClientRect();
        const dx = Math.max(b.left - mx, 0, mx - b.right);
        const dy = Math.max(b.top - my, 0, my - b.bottom);
        want = clamp(1 - Math.hypot(dx, dy) / reach, 0, 1);
      }
      // lerped, not transitioned: --near is rewritten every frame and a CSS
      // transition on top of that only ever lags behind the pointer
      cur[i] = lerp(cur[i], want, .12);
      n.style.setProperty('--near', cur[i].toFixed(3));
    });
  };
})();

function tick(t) {
  const dt = lastTick ? Math.min(64, t - lastTick) : 16; lastTick = t;
  fno++;
  readScroll();
  cam.x = lerp(cam.x, cam.tx, .09);
  cam.y = lerp(cam.y, cam.ty, .09);

  for (const L of layers)
    L.el.style.transform = `translate3d(${-cam.x * L.d}px,${-cam.y * L.d}px,0)`;

  // proximity → reveal, and cull what's far away
  const mids = flat ? flatMids(t) : null;
  let heroD = 0, best = 0;
  for (let i = 0; i < N; i++) {
    let d;
    if (flat) {
      /* No camera to measure against, so a stop's distance is how far its
         middle sits from the middle of the screen, counted in screens. Same
         units as the camera metric, which is what lets `live`, the sector
         readout, the mast fade and the per-section updates below all carry on
         working without knowing which mode they are in. */
      d = Math.abs(mids[i] - (scrollY + vh / 2)) / vh;
    } else {
      const dx = (pts[i].x - cam.x) / vw, dy = (pts[i].y - cam.y) / vh;
      d = Math.hypot(dx, dy);
    }
    dists[i] = d;
    if (i === 0) heroD = d;
    if (d < dists[best]) best = i;
    /* Hysteresis, for the same reason the cull below has it. This was a bare
       threshold, so a stop left sitting at 1.05 — which is exactly where a
       phone rests between two sections — added and removed `live` on
       alternate frames. Every add restarts the entrance animations inside
       that section, which is the flickering. */
    const wasLive = stops[i].classList.contains('live');
    if (!wasLive && d < 1.00) stops[i].classList.add('live');
    else if (wasLive && d > 1.12) stops[i].classList.remove('live');
    /* Fade by distance. Without this, neighbouring stops sit in frame at full
       strength during a leg and the screen reads as several sections piled on
       each other — which is exactly what "mixed up" looks like. Full at a
       third of a viewport, gone by four fifths, so a leg is a crossfade
       between two sections and never a pile of four.

       Flat mode wants none of it: the sections are stacked in normal flow and
       you are meant to scroll past them, so fading the one above out as you
       read the one below would just be losing content. */
    if (!flat) {
      /* Written only when it moves. This ran every frame for all five stops,
         and each write invalidates the style of an entire section — five full
         style recalculations a frame for a number that is usually identical
         to the one already there. */
      const o = clamp(1.65 - d * 2.05, 0, 1);
      if (Math.abs(o - (lastOp[i] ?? -1)) > .006) {
        lastOp[i] = o;
        stops[i].style.opacity = o.toFixed(3);
      }
      /* Hysteresis on the cull, and this is the blinking. A stop parked near
         the threshold crossed it on alternate frames, and every crossing hid
         and re-showed a whole section — which makes the browser throw away
         its decoded images and decode them again. That is the flicker. */
      const hid = stops[i].classList.contains('hidden');
      if (!hid && d > 1.45) stops[i].classList.add('hidden');
      else if (hid && d < 1.30) stops[i].classList.remove('hidden');
    }
  }
  /* Hysteresis, and it matters more than it looks. The camera lerps toward
     its target and never exactly arrives, so if you stop scrolling roughly
     between two stops the nearest one can swap every single frame. melt()
     clears itself whenever the focused stop changes, so that flip-flop reset
     meltT to zero forever and the idle effects could never start. A stop now
     only loses focus when another is clearly closer. */
  if (nearIdx < 0 || (best !== nearIdx && dists[best] < dists[nearIdx] - .08)) nearIdx = best;
  const near = nearIdx, nearD = dists[near];
  if (near !== lastSector) {
    lastSector = near;
    hudSector.textContent = SECTORS[near];
    filmsLive();                       // films follow the camera, not the frame
    navLinks.forEach((a, k) => a.classList.toggle('on', k + 1 === near));
    if (near === 3) $$('.stat').forEach(countUp);
  }

  // fire on arrival, not at the midpoint where `near` flips over
  if (nearD < .35 && near !== lastArrived) {
    lastArrived = near;
    if (near !== 0) flashWordmark();
  }

  /* In flat mode the sector rarely changes, but which film is in front of you
     changes constantly as you scroll — so the choice is re-made on a timer
     rather than on arrival. Twice a second, five rect reads: cheap next to the
     decode it prevents. */
  if (flat && t - lastFilmPick > 450) { lastFilmPick = t; filmsLive(); }

  hudArrow.textContent = ARROWS[Math.min(leg, ARROWS.length - 1)];
  hudCoord.textContent =
    `X${cam.x < 0 ? '−' : '+'}${String(Math.abs(Math.round(cam.x))).padStart(4, '0')} ` +
    `Y${cam.y < 0 ? '−' : '+'}${String(Math.abs(Math.round(cam.y))).padStart(4, '0')}`;
  // top rail: the fill, its head, and the readout riding along with it
  const pct = progress * 100;
  pFill.style.width = pct + '%';
  pHead.style.width = pct + '%';
  pPct.textContent = Math.round(pct) + '%';
  pHead.classList.toggle('at-start', progress < .04);
  pHead.classList.toggle('at-end', progress > .96);

  // The mast IS the navigation on the hero. Once it has faded out, the top
  // menu takes over — only ever one of the two is live, for pointer and
  // keyboard alike.
  const barMode = heroD > .78;
  if (barMode !== lastNavMode) {
    lastNavMode = barMode;
    document.body.classList.toggle('nav-bar', barMode);
    navLinksEl.inert = !barMode;
    if (poleEl) poleEl.inert = barMode;
  }

  /* The route belongs to the journey, not to the destination. Parked at a
     stop it drops right back so the section owns the screen; in transit it
     comes up to full. */
  if (routeSvg) {
    const moving = clamp((nearD - .16) / .34, 0, 1);
    routeSvg.style.opacity = (.10 + moving * .9).toFixed(3);
  }
  if (routeTrail) {
    const L = routeLen * progress;
    routeTrail.style.strokeDashoffset = routeLen - L;
    const pt = routePath.getPointAtLength(L);
    routePulse.setAttribute('cx', pt.x); routePulse.setAttribute('cy', pt.y);
  }

  melt(t, dt);
  settle(t);
  if (!flat || fno % 3 === 0) auroraUpdate(meltT, t);
  // 7% louder for every second the section is left to melt; back on scroll
  audioRamp(1 + Math.min(meltT / 1000, 72) * .07, dt);
  /* The mast is a static column in flat mode — body.flat .orbit pins every
     transform with !important — so everything poleUpdate writes there is
     thrown away before it is painted. */
  if (!flat) poleUpdate(t, dt, heroD);
  flowUpdate(t, dt, near === 2 && nearD < 1.2);
  smUpdate(t, dt, near === 4 && nearD < 1.2);
  layersUpdate(t, dt, near === 1 && nearD < 1.2);
  numGlow();

  /* Four full-screen canvases, repainted every frame. On a desktop they are
     riding a camera that moves continuously, so every frame is a new picture
     and the cost is the point. In flat mode there is no camera: the field's
     nodes are pinned to it and cannot move at all, and the sky, the galaxy
     and the aurora only breathe. Repainting roughly four million pixels sixty
     times a second to animate a twinkle is most of a phone's frame budget
     spent on a picture that is all but identical to the last one.

     So on a phone they run on a third of the frames — twenty a second, which
     is more than a drifting gradient or a blinking star needs — and the field,
     which is the most expensive and the least alive of them, on a sixth. */
  /* Cadence, on a desktop too. The camera lerps at .09 a frame and the stars
     breathe over seconds; thirty repaints a second of the background is
     indistinguishable from sixty and leaves the other half of the budget to
     the thing that actually has to be smooth, which is the scroll. */
  const every = flat ? 3 : 2;
  if (fno % every === 0) { sky.draw(t, heroD); galaxy.draw(t, heroD); }
  if (fno % (flat ? 6 : 2) === 0) field.draw(t);
  requestAnimationFrame(tick);
}

/* ── boot ──────────────────────────────────────────────────────── */
function boot() {
  $$('[data-split]').forEach(split);
  audioRig(); auroraRig(); layersRig(); enquiry(); selects(); reader(); caseFilm(); cases(); films(); cursor(); nav(); poleRig(); projFlow(); chat(); socialRig();

  /* Mode comes from the media query, not from measuring the window. Size
     changes still need a re-measure, and iOS fires resize continuously while
     its URL bar collapses — each one re-running flowLayout, buildRoute, dress
     and an O(n^2) node-field rebuild mid-scroll — so a height-only change
     smaller than the bar is ignored. */
  const applyMode = () => {
    const now = isFlat();
    if (now === flat) return;
    flat = now;
    document.body.classList.toggle('flat', flat);
    // whatever the other mode wrote on the stops has to go, or a section
    // arrives in flat mode still faded out from wherever the camera left it
    stops.forEach(x => { x.style.removeProperty('opacity'); x.classList.remove('hidden'); });
    measure();
  };
  FLAT_MQ.addEventListener('change', applyMode);
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', applyMode);

  let rw = innerWidth, rh = innerHeight, rt = null;
  addEventListener('resize', () => {
    const widthMoved   = Math.abs(innerWidth - rw) > 1;
    const heightJumped = Math.abs(innerHeight - rh) > 120;
    if (!widthMoved && !heightJumped) return;
    rw = innerWidth; rh = innerHeight;
    clearTimeout(rt);
    rt = setTimeout(() => { applyMode(); measure(); }, 120);
  });

  /* Reconcile before the first measure. `flat` is latched when the script
     parses, and at that moment the viewport is not always final — a phone is
     still settling its URL bar, an iframe may not be laid out yet. The media
     query flips before boot() can attach a listener, so that first change event
     is missed and the wrong mode sticks for the life of the page. Asking again
     here costs nothing and closes the window. */
  applyMode();
  measure();
  /* iOS fires resize continuously while the URL bar collapses, and every one of
     them used to re-run the whole measure pipeline mid-scroll — flowLayout,
     buildRoute, dress, and an O(n^2) rebuild of the node field. A height-only
     change smaller than the bar is not a new viewport, so it is ignored; width
     changes and real rotations still go through, debounced.

     Crossing the flat threshold (rotating a tablet, dragging a window narrow)
     switches mode live, and clears the inline opacity and .hidden that the
     camera path leaves on the stops — otherwise a section could arrive in flat
     mode still faded out from wherever the camera had been. */


  if (reduced) {
    stops.forEach(s => s.classList.add('live'));
    document.body.classList.add('nav-bar');            // no mast to wait for
    /* The loader used to be skipped outright here, which is why it "does not
       show" for anyone with Reduce Motion switched on — a common setting, and
       one plenty of people leave on permanently. Whether the site makes sound
       is not a motion preference, so the loader is shown; it just skips the
       animated fill and goes straight to 100% and straight to the choice. */
    const L = $('#loader');
    $('#loaderBar').style.width = '100%';
    $('#loaderCount').textContent = '100%';
    L.classList.add('asks');
    const go = withAudio => {
      if (withAudio) audioEnable(true);
      L.classList.add('done');
      document.body.classList.add('ready');
    };
    $('#audioOn')?.addEventListener('click', () => go(true));
    $('#audioOn')?.focus({ preventScroll: true });
    $$('.stat').forEach(countUp);
    return;
  }
  // ?stop=N — land directly on a stop, painted on the first frame.
  // Used for preview captures and OG images.
  const forced = new URLSearchParams(location.search).get('stop')
    ?? (location.hash.match(/stop=(\d+)/)?.[1] ?? null);
  if (forced !== null && pts.length) {
    const i = clamp(+forced | 0, 0, N - 1);
    scrollTo(0, (i / (N - 1)) * (track.offsetHeight - vh));
    readScroll();
    cam.x = cam.tx; cam.y = cam.ty;
    stops[i].classList.add('live');
    document.body.classList.add('still', 'ready');
    $('#loader').classList.add('done');
    $$('.stat').forEach(countUp);
    tick(performance.now());        // one complete frame, synchronously
    return;
  }

  navLinksEl.inert = true;        // the mast has the floor until the hero exits
  requestAnimationFrame(tick);

  // ── loader ──
  const bar = $('#loaderBar'), num = $('#loaderCount'), box = $('#loader');

  // a starfield behind the aurora wings, twinkling on its own short loop
  const sky = $('#ldStars');
  let skyRaf = null;
  if (sky) {
    const sx = sky.getContext('2d');
    let stars = [], sw = 0, sh = 0;
    const seed = () => {
      if (!innerWidth || !innerHeight) return;
      const d = Math.min(devicePixelRatio || 1, 1.5);
      sw = innerWidth; sh = innerHeight;
      sky.width = sw * d; sky.height = sh * d;
      sx.setTransform(d, 0, 0, d, 0, 0);
      stars = Array.from({ length: Math.round(sw * sh / 4200) }, () => {
        const b = Math.random();
        const c = Math.random();
        return {
          x: Math.random() * sw, y: Math.random() * sh,
          r: b > .975 ? 1.8 : b > .82 ? 1.05 : .55,
          ph: Math.random() * 7, sp: .5 + Math.random() * 1.5,
          col: c < .3 ? '150,190,255' : c < .55 ? '205,165,255' : '236,243,255'
        };
      });
    };
    seed();
    /* A phone fires resize continuously while its URL bar collapses, and every
       one of those re-ran seed(): setting canvas.width CLEARS the canvas, and
       the stars were given new random positions each time. That is the flicker
       on the loader — the whole sky being thrown away and redrawn somewhere
       else, several times a second, for a viewport that has not meaningfully
       changed. Width changes and real rotations still go through. */
    addEventListener('resize', () => {
      if (Math.abs(innerWidth - sw) < 2 && Math.abs(innerHeight - sh) < 140) return;
      seed();
    });
    (function twinkle(t) {
      if (sw) {
        sx.clearRect(0, 0, sw, sh);
        for (const s of stars) {
          const a = .18 + .70 * Math.pow(Math.max(0, Math.sin(t * .0008 * s.sp + s.ph)), 2);
          sx.fillStyle = `rgba(${s.col},${a.toFixed(3)})`;
          sx.beginPath(); sx.arc(s.x, s.y, s.r, 0, 7); sx.fill();
        }
      }
      skyRaf = requestAnimationFrame(twinkle);
    })(0);
  }

  /* The world arrives: pulled back far enough to see all five stops and the
     route, then flown into the hero. The class is removed on animationend,
     and on a timer regardless — whatever happens, the world settles. */
  const arrive = () => {
    if (flat) return;
    const vp = $('#viewport');
    document.body.classList.add('arriving');
    let off = false;
    const end = () => {
      if (off) return; off = true;
      document.body.classList.remove('arriving');
      vp.removeEventListener('animationend', end);
    };
    vp.addEventListener('animationend', end);
    setTimeout(end, 3400);
  };

  let entered = false;
  const enter = withAudio => {
    if (entered) return;
    entered = true;
    if (withAudio) audioEnable(true);

    /* Straight to the hero. The loader lifts in a quarter second: long enough
       not to flash white, short enough to read as a cut rather than a
       transition you have to sit through. */
    document.body.classList.add('ready');
    stops[0].classList.add('live');
    box.classList.add('done');
    arrive();
    setTimeout(() => { if (skyRaf) cancelAnimationFrame(skyRaf); }, 300);
  };
  $('#audioOn')?.addEventListener('click', () => enter(true));

  const t0 = performance.now(), DUR = 1700;
  (function run(now) {
    const k = clamp((now - t0) / DUR, 0, 1);
    const e = 1 - Math.pow(1 - k, 2.2);
    num.textContent = Math.round(e * 100) + '%';
    bar.style.width = (e * 100) + '%';
    if (k < 1) return requestAnimationFrame(run);
    /* One door, and it is not a question. A first visit cannot have sound
       without a user activation — no browser will start audible media on its
       own until a site has earned engagement, which by definition it has not
       on a first visit. This click IS that activation, so it is the only way
       the bed can be playing when the world arrives. Muting afterwards is a
       control in the nav, which is where a preference belongs rather than in
       a dialog before anyone has seen anything. */
    box.classList.add('asks');
    $('#audioOn')?.focus({ preventScroll: true });
  })(t0);
}

document.fonts?.ready.then(boot).catch(boot) ?? boot();
})();
