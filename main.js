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

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch   = matchMedia('(hover: none)').matches;
if (touch) document.body.classList.add('is-touch');
if (reduced) document.body.classList.add('reduced');

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
  xScale = vw < 900 ? .42 : 1;              // tame the lateral travel on phones
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
  if (!reduced) track.style.height = ((N - 1) * LEG * vh + vh) + 'px';
  buildRoute();
  dress();
  field.resize();
  galaxy.size();
  sky.size();
}

/* Nothing may overflow the frame: scale any stop that outgrows it. */
function fitStops() {
  if (reduced) { stops.forEach(s => s.style.removeProperty('--fit')); return; }
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
  const max = Math.max(1, track.offsetHeight - vh);
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

/* ── layers ────────────────────────────────────────────────────── */
const layers = [
  { el: $('#layerBg'),  d: DEPTH.bg  },
  { el: $('#layerMid'), d: DEPTH.mid },
  { el: $('#layerFg'),  d: DEPTH.fg  }
];

/* ── route drawn in world space ────────────────────────────────── */
let routeSvg = null, routePath = null, routeTrail = null, routePulse = null, routeLen = 0;

function buildRoute() {
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
    const d = Math.min(devicePixelRatio || 1, 2);
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
       the field never runs out however far the camera goes. */
    const ox = cam.x * .03, oy = cam.y * .03;
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
        if (dist < R) links.push({ a, b, dist, flow: Math.random() < .22, off: Math.random() });
      }
  }

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
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

      if (l.flow) {                                   // automation, made visible
        const k = ((t * .00016) + l.off) % 1;
        const px = lerp(a.sx, b.sx, k), py = lerp(a.sy, b.sy, k);
        const g = ctx.createRadialGradient(px, py, 0, px, py, 7);
        g.addColorStop(0, 'rgba(120,170,255,.85)'); g.addColorStop(1, 'rgba(120,170,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 7, 0, 7); ctx.fill();
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
    const d = Math.min(devicePixelRatio || 1, 2);
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

  /* One AnalyserNode on the bed, built the first time playback starts (it
     needs a gesture, and createMediaElementSource may only run once). fftSize
     128 is 64 bins; reading the lowest twelve each frame is a rounding error
     next to everything else on screen. */
  const wireAnalyser = () => {
    if (wired) return;
    wired = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ac = new AC();
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
    } catch (e) { /* no analyser: the aurora simply drifts without a beat */ }
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

  audioEnable = async v => {
    on = v;
    if (on) { try { await el.play(); wireAnalyser(); } catch (e) { on = false; } }
    else el.pause();
    apply(); showLevel(); paintState();
  };

  /* Touching either control hands control straight back to the listener:
     the boost drops to 1 at once and is held there briefly, so the slider
     responds immediately instead of fighting a melt that is still fading. */
  const takeControl = () => { lastTouch = performance.now(); boost = 1; };

  btn.addEventListener('click', () => {
    takeControl();
    if (!on && base === 0) { base = .35; slider.value = 35; }        // unmuting from zero
    audioEnable(!on);
  });
  slider.addEventListener('input', () => {
    takeControl();
    base = +slider.value / 100;
    slider.style.setProperty('--v', Math.round(base * 100));
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
const MELT_AFTER = 20000;
let lastActive = performance.now(), meltEl = null, meltT = 0, lastDispWrite = 0;
const meltDisp = $('#meltDisp');

const wake = () => { lastActive = performance.now(); };
['scroll', 'wheel', 'touchmove', 'keydown', 'pointerdown', 'pointermove']
  .forEach(ev => addEventListener(ev, wake, { passive: true }));

function clearMelt() {
  if (!meltEl) return;
  meltEl.classList.remove('melting');
  ['--melt', '--blur', '--sag', '--sagY'].forEach(v => meltEl.style.removeProperty(v));
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
     films sit above the world at body level and are never touched. */
  const el = viewportEl;
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
    const d = Math.min(devicePixelRatio || 1, 2);
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
  const inputs = $$('input[required]', form);
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
    setNote('Every field, so we can come back to you properly.', false);
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
        'Problem they face': v.problem,
        'What they want': v.want,
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
    const d = Math.min(devicePixelRatio || 1, 2);
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
    if (!tick) tick = requestAnimationFrame(paint);
    growTimer = flipFrom(frame, card);
    wake();
    x.focus({ preventScroll: true });
  };

  const hide = () => {
    if (!open) return;
    open = false;
    box.setAttribute('aria-hidden', 'true');
    box.classList.add('closing');
    document.body.classList.remove('filming');
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
  filmsLive = () => {
    cards.forEach(c => {
      if (c.dataset.hoverOnly !== undefined) return;      // hover decides that one
      const v = c.querySelector('video');
      if (!v) return;
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
  const wrap = $('.cfilm');
  if (!wrap) return;
  const v     = wrap.querySelector('video'),
        frost = $('.cfilm-frost', wrap),
        play  = $('.cf-play', wrap),
        seek  = $('.cf-seek', wrap),
        time  = $('.cf-time', wrap);

  // the file's own shape, so the frame is never letterboxed against a guess
  const shape = () => {
    if (v.videoWidth) wrap.style.aspectRatio = v.videoWidth + ' / ' + v.videoHeight;
  };
  v.addEventListener('loadedmetadata', shape);
  shape();

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
  wrap.addEventListener('pointermove', e => {
    const b = wrap.getBoundingClientRect();
    frost.style.setProperty('--mx', (e.clientX - b.left).toFixed(0) + 'px');
    frost.style.setProperty('--my', (e.clientY - b.top).toFixed(0) + 'px');
    frost.style.setProperty('--r', Math.min(b.width * .26, 250).toFixed(0) + 'px');
  }, { passive: true });
  wrap.addEventListener('pointerleave', () => frost.style.setProperty('--r', '0px'));
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
  /* The brief only — the Company A header and the claim under it. The four
     steps used to open too, and the tables, but the steps now say everything
     they have to say on the page and the tables are gone. */
  const BLOCKS = '.case-brief';
  let dwell = null, open = false, srcEl = null, minTimer = null, growTimer = null;

  const show = src => {
    if (open) return;
    minTimer = cancelMinimize(minTimer, glass, shell);
    if (growTimer) { clearTimeout(growTimer); growTimer = null; }
    open = true; srcEl = src;
    const clone = src.cloneNode(true);
    clone.removeAttribute('id');
    clone.hidden = false;
    clone.classList.remove('readable');          // no hover affordance inside the panel
    clone.querySelectorAll('.readable').forEach(n => n.classList.remove('readable'));
    // strip anything that would run twice: a cloned video would play over
    // the original, and a cloned canvas is dead pixels
    clone.querySelectorAll('.cat-media, canvas, video').forEach(n => n.remove());
    body.innerHTML = '';
    body.appendChild(clone);

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
    if (!touch) {
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
      if (e.target.closest('.cat-media')) return;
      clearTimeout(dwell); show(el);
    });
  });

  // same reason as the films: the panel moves, the cursor does not
  x.addEventListener('click', hide);
  scrim.addEventListener('click', hide);
  addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
}

/* ── cursor ────────────────────────────────────────────────────── */
function cursor() {
  const c = $('#cursor'); if (touch || reduced) return;
  let x = 0, y = 0, tx = 0, ty = 0;
  addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; }, { passive: true });
  (function loop() { x = lerp(x, tx, .2); y = lerp(y, ty, .2);
    c.style.transform = `translate(${x}px,${y}px)`; requestAnimationFrame(loop); })();
  document.addEventListener('pointerover', e => {
    c.classList.toggle('is-lg', !!e.target.closest('a,button,.proj,.fill,.pillar'));
  });
}

/* ── nav ───────────────────────────────────────────────────────── */
function nav() {
  const navEl = $('#nav'), burger = $('#burger');
  $$('[data-goto]').forEach(el => el.addEventListener('click', e => {
    e.preventDefault();
    const i = +el.dataset.goto;
    navEl.classList.remove('open'); burger.setAttribute('aria-expanded', 'false');
    if (reduced) { stops[i].scrollIntoView({ behavior: 'smooth' }); return; }
    const max = track.offsetHeight - vh;
    scrollTo({ top: (i / (N - 1)) * max, behavior: 'smooth' });
  }));
  burger.addEventListener('click', () => {
    const open = navEl.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(open));
  });
}

/* ── frame ─────────────────────────────────────────────────────── */
const SECTORS = ['00 / ORIGIN', '01 / ABOUT', '02 / PROJECTS', '03 / CASE STUDIES', '04 / REACH'];
const ARROWS  = ['↘', '↓', '←', '↘'];
const hudSector = $('#hudSector'), hudArrow = $('#hudArrow'), hudCoord = $('#hudCoord'),
      pFill = $('#progressFill'), navLinks = $$('.nav-links a'),
      pHead = $('#progressHead'), pPct = $('#progressPct'),
      navLinksEl = $('#navLinks'), poleEl = $('#pole'), wordmark = $('.wordmark');
let lastSector = -1, lastNavMode = null, lastArrived = -1, nearIdx = -1;
const dists = [];

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
  readScroll();
  cam.x = lerp(cam.x, cam.tx, .09);
  cam.y = lerp(cam.y, cam.ty, .09);

  for (const L of layers)
    L.el.style.transform = `translate3d(${-cam.x * L.d}px,${-cam.y * L.d}px,0)`;

  // proximity → reveal, and cull what's far away
  let heroD = 0, best = 0;
  for (let i = 0; i < N; i++) {
    const dx = (pts[i].x - cam.x) / vw, dy = (pts[i].y - cam.y) / vh;
    const d = dists[i] = Math.hypot(dx, dy);
    if (i === 0) heroD = d;
    if (d < dists[best]) best = i;
    stops[i].classList.toggle('live', d < 1.05);
    /* Fade by distance. Without this, neighbouring stops sit in frame at full
       strength during a leg and the screen reads as several sections piled on
       each other — which is exactly what "mixed up" looks like. Full at a
       third of a viewport, gone by four fifths, so a leg is a crossfade
       between two sections and never a pile of four. */
    stops[i].style.opacity = clamp(1.65 - d * 2.05, 0, 1).toFixed(3);
    stops[i].classList.toggle('hidden', d > 1.4);
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
  auroraUpdate(meltT, t);
  // 7% louder for every second the section is left to melt; back on scroll
  audioRamp(1 + Math.min(meltT / 1000, 72) * .07, dt);
  poleUpdate(t, dt, heroD);
  flowUpdate(t, dt, near === 2 && nearD < 1.2);
  layersUpdate(t, dt, near === 1 && nearD < 1.2);
  numGlow();
  sky.draw(t, heroD);
  galaxy.draw(t, heroD);
  field.draw(t);
  requestAnimationFrame(tick);
}

/* ── boot ──────────────────────────────────────────────────────── */
function boot() {
  $$('[data-split]').forEach(split);
  $$('.case-step').forEach((el, i) => el.style.setProperty('--step', i));
  audioRig(); auroraRig(); layersRig(); enquiry(); reader(); caseFilm(); films(); cursor(); nav(); poleRig(); projFlow();
  measure();
  addEventListener('resize', measure);

  if (reduced) {
    stops.forEach(s => s.classList.add('live'));
    document.body.classList.add('ready', 'nav-bar');   // no mast to wait for
    $('#loader').classList.add('done');
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
      const d = Math.min(devicePixelRatio || 1, 2);
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
    addEventListener('resize', seed);
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
    setTimeout(() => { if (skyRaf) cancelAnimationFrame(skyRaf); }, 300);
  };
  $('#audioOn') ?.addEventListener('click', () => enter(true));
  $('#audioOff')?.addEventListener('click', () => enter(false));

  const t0 = performance.now(), DUR = 1700;
  (function run(now) {
    const k = clamp((now - t0) / DUR, 0, 1);
    const e = 1 - Math.pow(1 - k, 2.2);
    num.textContent = Math.round(e * 100) + '%';
    bar.style.width = (e * 100) + '%';
    if (k < 1) return requestAnimationFrame(run);
    box.classList.add('asks');                 // 100% — hand the choice over
    $('#audioOn')?.focus({ preventScroll: true });
  })(t0);
}

document.fonts?.ready.then(boot).catch(boot) ?? boot();
})();
