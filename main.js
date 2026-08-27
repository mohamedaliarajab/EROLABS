/* ══════════════════════════════════════════════════════════════════
   Ẹ̀RỌ LABS — the travel engine
   Scroll drives a camera along a fixed route through a 2D world.
   Three layers move against that camera at different rates (parallax),
   and the route itself is drawn in world space as the circuit you ride.
   No libraries.
   ══════════════════════════════════════════════════════════════════ */
(() => {
'use strict';

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
    [-38, -26, 'bg', 'glyph'], [72, 34, 'bg', 'num', '01'], [18, 152, 'bg', 'frame'],
    [104, 176, 'bg', 'glyph'], [-4, 262, 'bg', 'num', '03'], [-96, 190, 'bg', 'frame'],
    [-70, 300, 'bg', 'glyph'], [86, 292, 'bg', 'num', '04'], [40, 62, 'bg', 'frame'],
    [-24, 40, 'fg', 'rule'], [96, 130, 'fg', 'rule'], [-62, 244, 'fg', 'rule'],
    [24, 350, 'fg', 'rule'], [110, 236, 'fg', 'rule']
  ];
  for (const [bx, by, where, kind, txt] of seed) {
    if (Math.random() < .18) continue;              // thin it out differently each load
    const x = bx + rnd(-7, 7), y = by + rnd(-6, 6);
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) translate(${(x / 100) * vw * xScale}px,${(y / 100) * vh}px);pointer-events:none`;
    if (kind === 'glyph') {
      el.innerHTML = `<svg width="150" height="150" viewBox="0 0 100 100" style="opacity:.055"><use href="#aperture" color="#fff"/></svg>`;
    } else if (kind === 'num') {
      el.innerHTML = `<span style="font-family:Poppins,sans-serif;font-weight:600;font-size:26vh;line-height:1;letter-spacing:-.05em;color:rgba(255,255,255,.028)">${txt}</span>`;
    } else if (kind === 'frame') {
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
  for (const node of [...el.childNodes]) {
    if (node.nodeName === 'BR') { out.appendChild(node.cloneNode()); continue; }
    if (node.nodeType !== 3) { out.appendChild(node.cloneNode(true)); continue; }
    const units = mode === 'char' ? [...node.textContent] : node.textContent.split(/(\s+)/);
    for (const u of units) {
      if (!u.trim()) { out.appendChild(document.createTextNode(' ')); continue; }
      const wrap = document.createElement('span');
      wrap.className = mode === 'char' ? 'char-w' : 'word-w';
      const inner = document.createElement('span');
      inner.className = mode === 'char' ? 'char' : 'word';
      inner.textContent = u;
      inner.style.setProperty('--i', i++);
      wrap.appendChild(inner); out.appendChild(wrap);
      if (mode === 'word') out.appendChild(document.createTextNode(' '));
    }
  }
  el.textContent = ''; el.appendChild(out);
}

/* ── pillar visuals: abstract, not illustrative ────────────────── */
const VIS = {
  intelligence: `<svg viewBox="0 0 200 90">
    <g stroke="rgba(140,175,255,.35)" fill="none" stroke-width="1">
      <path d="M20 62 L58 26 L100 50 L142 20 L180 44"/><path d="M20 62 L62 70 L100 50 L146 66 L180 44"/>
    </g>
    ${[[20,62,0],[58,26,.3],[100,50,.6],[142,20,.9],[180,44,1.2],[62,70,.45],[146,66,1.05]]
      .map(([x,y,d]) => `<circle cx="${x}" cy="${y}" r="3" fill="url(#gBrand)"><animate attributeName="r" values="2.4;5;2.4" dur="2.8s" begin="${d}s" repeatCount="indefinite"/><animate attributeName="opacity" values=".45;1;.45" dur="2.8s" begin="${d}s" repeatCount="indefinite"/></circle>`).join('')}
  </svg>`,
  automation: `<svg viewBox="0 0 200 90">
    ${[22,45,68].map((y,i) => `
      <line x1="10" y1="${y}" x2="190" y2="${y}" stroke="rgba(255,255,255,.09)" stroke-width="1"/>
      <rect x="0" y="${y-3}" width="16" height="6" rx="3" fill="url(#gBrand)">
        <animate attributeName="x" from="-16" to="196" dur="${2.6+i*.7}s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0;1;1;0" dur="${2.6+i*.7}s" repeatCount="indefinite"/>
      </rect>`).join('')}
  </svg>`,
  design: `<svg viewBox="0 0 200 90">
    <g fill="none" stroke="rgba(255,255,255,.12)" stroke-width="1">
      ${Array.from({length:9},(_,i)=>`<rect x="${16+i*19}" y="24" width="13" height="42" rx="2"/>`).join('')}
    </g>
    <rect x="73" y="14" width="13" height="62" rx="2" fill="url(#gBrandV)" opacity=".9">
      <animate attributeName="x" values="73;130;54;73" dur="6s" repeatCount="indefinite"/>
    </rect>
    <circle cx="100" cy="80" r="2.5" fill="#A625EE"/>
  </svg>`
};
function paintPillars() { $$('.p-vis').forEach(el => el.innerHTML = VIS[el.dataset.vis] || ''); }

/* ── project hover peek ────────────────────────────────────────── */
function peeks() {
  const peek = $('#projPeek'), cv = $('#peekCanvas'), tag = $('.peek-tag', peek);
  if (!cv || touch) return;
  const ctx = cv.getContext('2d');
  let raf = null, tone = '#1E90FF', kind = 'ops', t0 = 0;

  const sizeIt = () => { const r = peek.getBoundingClientRect(); const d = Math.min(devicePixelRatio || 1, 2);
    cv.width = r.width * d; cv.height = r.height * d; ctx.setTransform(d, 0, 0, d, 0, 0); return r; };

  function frame(ts) {
    const r = peek.getBoundingClientRect(), w = r.width, h = r.height;
    if (!t0) t0 = ts; const t = (ts - t0) * .001;
    ctx.fillStyle = '#0A0C13'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = tone; ctx.fillStyle = tone;

    if (kind === 'ops') {                        // stacked bars settling
      for (let i = 0; i < 7; i++) {
        const a = .18 + .1 * Math.sin(t * 1.6 + i);
        ctx.globalAlpha = a;
        ctx.fillRect(w * .12, h * .18 + i * (h * .095), w * (.2 + .55 * Math.abs(Math.sin(t * .8 + i * .6))), h * .05);
      }
    } else if (kind === 'relay') {               // hand-offs firing down a chain
      ctx.globalAlpha = .3; ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) { const y = h * (.24 + i * .18);
        ctx.beginPath(); ctx.moveTo(w * .12, y); ctx.lineTo(w * .88, y); ctx.stroke(); }
      ctx.globalAlpha = 1;
      for (let i = 0; i < 4; i++) { const y = h * (.24 + i * .18);
        const k = ((t * .35 + i * .25) % 1); const x = w * (.12 + .76 * k);
        ctx.beginPath(); ctx.arc(x, y, 3.4, 0, 7); ctx.fill(); }
    } else if (kind === 'signal') {              // scatter resolving into a wedge
      for (let i = 0; i < 46; i++) {
        const a = i * 2.399 + t * .3, rr = (i / 46) * Math.min(w, h) * .42;
        ctx.globalAlpha = .16 + .5 * (i / 46);
        ctx.beginPath(); ctx.arc(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr, 1.9, 0, 7); ctx.fill();
      }
    } else if (kind === 'stage') {               // waveform
      ctx.globalAlpha = .9; ctx.lineWidth = 1.6; ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const y = h / 2 + Math.sin(x * .045 + t * 2.2) * h * .18 * Math.sin(x * .008 + t);
        x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      } ctx.stroke();
    } else {                                     // grid coming into order
      ctx.globalAlpha = .5;
      for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) {
        const p = Math.sin(t * 1.4 + i * .5 + j * .3) * .5 + .5;
        ctx.globalAlpha = .12 + p * .5;
        ctx.fillRect(w * (.14 + i * .16), h * (.18 + j * .19), w * .1 * (.5 + p * .6), h * .1);
      }
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }

  $$('.proj').forEach(li => {
    li.addEventListener('pointerenter', () => {
      tone = li.dataset.tone; kind = li.dataset.glyph; t0 = 0;
      li.style.setProperty('--tone', tone);
      tag.textContent = $('h3', li).textContent;
      peek.classList.add('on'); sizeIt();
      if (!raf) raf = requestAnimationFrame(frame);
    });
    li.addEventListener('pointerleave', () => {
      peek.classList.remove('on');
      if (raf) { cancelAnimationFrame(raf); raf = null; }
    });
    li.style.setProperty('--tone', li.dataset.tone);
  });

  addEventListener('pointermove', e => {
    if (!peek.classList.contains('on')) return;
    peek.style.left = e.clientX + 'px';
    peek.style.top  = e.clientY + 'px';
  }, { passive: true });
}

/* ── audio ─────────────────────────────────────────────────────────
   Ambient bed. Browsers will not start audio without a user gesture, so
   the loader asks before it lets anyone in — that click is the gesture.
   `boost` is driven by the melt: the longer a section is left to drip, the
   louder the room gets. */
let audioEnable = () => {}, audioRamp = () => {};
function audioRig() {
  const el = $('#ambient'), wrap = $('#vol'), btn = $('#volBtn'), slider = $('#volSlider');
  if (!el || !wrap) return;

  let base = +slider.value / 100, on = false, boost = 1;
  const apply = () => { el.volume = clamp(base * boost, 0, 1); };
  const paint = () => {
    slider.style.setProperty('--v', Math.round(base * 100));
    wrap.classList.toggle('muted', !on || base === 0);
    wrap.classList.toggle('boost', on && boost > 1.06);
    btn.setAttribute('aria-pressed', String(!on));
    btn.setAttribute('aria-label', on ? 'Mute' : 'Unmute');
  };

  audioEnable = async v => {
    on = v;
    if (on) { try { await el.play(); } catch (e) { on = false; } }   // blocked: stay honest
    else el.pause();
    apply(); paint();
  };

  btn.addEventListener('click', () => audioEnable(!on));
  slider.addEventListener('input', () => {
    base = +slider.value / 100;
    if (base > 0 && !on) audioEnable(true);
    else { apply(); paint(); }
  });

  audioRamp = (target, dt) => {
    if (!on) { boost = 1; return; }
    boost += (target - boost) * (1 - Math.pow(.90, dt / 16));
    apply();
    wrap.classList.toggle('boost', boost > 1.06);
  };
  paint();
}

/* ── idle melt ─────────────────────────────────────────────────────
   Stop scrolling and the section you stopped on liquefies — and keeps
   liquefying. There is no plateau: `meltT` simply accumulates for as long
   as you leave it alone, and everything downstream is a function of it.

   Two curves do the work. `ramp` (~1.8s) is the initial liquefy. `drift`
   (~14s) never actually arrives, so the smear keeps spreading and the
   section keeps sagging out of frame the longer you stay away.

   Plain pointer movement deliberately does NOT count as activity: the
   cursor lights mean the mouse is almost always drifting, and treating
   that as engagement would mean the melt never fires. */
const MELT_AFTER = 15000;
let lastActive = performance.now(), meltEl = null, meltT = 0, lastDispWrite = 0;
const meltDisp = $('#meltDisp');

const wake = () => { lastActive = performance.now(); };
['scroll', 'wheel', 'touchmove', 'keydown', 'pointerdown']
  .forEach(ev => addEventListener(ev, wake, { passive: true }));

function clearMelt() {
  if (!meltEl) return;
  meltEl.classList.remove('melting');
  ['--melt', '--blur', '--sag', '--sagY'].forEach(v => meltEl.style.removeProperty(v));
  meltEl = null; meltT = 0;
  meltDisp.setAttribute('scale', '0');
}

function writeMelt(el, t, urgent) {
  const s    = meltT / 1000;
  const ramp = 1 - Math.exp(-s / 1.8);       // the initial liquefy, quick
  const soft = 1 - Math.exp(-s / 20);        // blur and stretch, which do settle

  /* The sag has NO ceiling. An asymptote looks identical at 60s and at 180s,
     which reads as the melt having stopped — so the drag carries a linear
     term that just keeps going: roughly 14px a second, for as long as you
     leave it. Given long enough the section drips out of frame entirely. */
  const sag  = 120 * (1 - Math.exp(-s / 6)) + 14 * s;
  const disp = 20 * ramp + 3.2 * s;          // the smear keeps spreading too

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

function melt(t, dt, i) {
  if (reduced || !meltDisp) return;
  const el = stops[i];
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
      rot += vel + dt * .00015 + scrollVel * 8;       // drift + scroll torque
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
  const rows = $$('.proj', stage), list = $('.proj-list', stage);
  let W = 0, H = 0, lanes = [], gates = [], packets = [];

  flowLayout = () => {
    W = stage.offsetWidth; H = stage.offsetHeight;
    if (!W || !H) return;
    const d = Math.min(devicePixelRatio || 1, 2);
    cv.width = W * d; cv.height = H * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);

    // offsetTop, not getBoundingClientRect — the stop carries a scale()
    lanes = rows.map(r => ({ y: list.offsetTop + r.offsetTop + r.offsetHeight / 2, tone: r.dataset.tone }));
    gates = [];
    lanes.forEach((ln, i) => [.26, .48, .70, .88].forEach(f =>
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
      const a = .10 + g.flash * .8;
      ctx.fillStyle = `rgba(190,210,255,${a})`;
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
          if (Math.random() < .3) {                       // hand off to a neighbour
            const dir = Math.random() < .5 ? -1 : 1;
            const next = p.lane + dir;
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
  if (el.dataset.done) return; el.dataset.done = '1';
  const to = +el.dataset.count; const dur = 1400; const t0 = performance.now();
  (function step(now) {
    const k = clamp((now - t0) / dur, 0, 1);
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}

/* ── composer ──────────────────────────────────────────────────── */
function composer() {
  const box = $('#composer'); if (!box) return;
  const hint = $('#composerHint');
  const fills = $$('.fill', box);
  fills.forEach(f => {
    f.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); f.blur(); } });
    f.addEventListener('paste', e => {                        // keep it plain text
      e.preventDefault();
      document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text'));
    });
  });
  $('#sendBrief').addEventListener('click', () => {
    const v = {};
    fills.forEach(f => v[f.dataset.k] = f.textContent.trim());
    if (!v.pain && !v.want) {
      hint.textContent = 'Fill in a blank or two first — even roughly.';
      hint.style.color = '#A625EE';
      fills[2].focus();
      return;
    }
    const body =
`At ${v.company || '[company]'}, my team loses roughly ${v.hours || '[?]'} hours a week to ${v.pain || '[?]'}.
What I'd really like is for ${v.want || '[?]'}.

—
Sent from erolabs.studio`;
    location.href = `mailto:hello@erolabs.studio?subject=${encodeURIComponent('A problem worth solving — ' + (v.company || 'new enquiry'))}&body=${encodeURIComponent(body)}`;
    hint.textContent = 'Opening your mail client…';
    hint.style.color = '';
  });
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
let lastSector = -1, lastNavMode = null, lastArrived = -1;

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
function tick(t) {
  const dt = lastTick ? Math.min(64, t - lastTick) : 16; lastTick = t;
  readScroll();
  cam.x = lerp(cam.x, cam.tx, .09);
  cam.y = lerp(cam.y, cam.ty, .09);

  for (const L of layers)
    L.el.style.transform = `translate3d(${-cam.x * L.d}px,${-cam.y * L.d}px,0)`;

  // proximity → reveal, and cull what's far away
  let near = 0, nearD = Infinity, heroD = 0;
  for (let i = 0; i < N; i++) {
    const dx = (pts[i].x - cam.x) / vw, dy = (pts[i].y - cam.y) / vh;
    const d = Math.hypot(dx, dy);
    if (i === 0) heroD = d;
    if (d < nearD) { nearD = d; near = i; }
    stops[i].classList.toggle('live', d < 1.05);
    stops[i].classList.toggle('hidden', d > 2.4);
  }
  if (near !== lastSector) {
    lastSector = near;
    hudSector.textContent = SECTORS[near];
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

  melt(t, dt, near);
  // 7% louder for every second the section is left to melt; back on scroll
  audioRamp(1 + Math.min(meltT / 1000, 72) * .07, dt);
  poleUpdate(t, dt, heroD);
  flowUpdate(t, dt, near === 2 && nearD < 1.2);
  field.draw(t);
  requestAnimationFrame(tick);
}

/* ── boot ──────────────────────────────────────────────────────── */
function boot() {
  $$('[data-split]').forEach(split);
  $$('.case-step').forEach((el, i) => el.style.setProperty('--step', i));
  audioRig(); paintPillars(); composer(); cursor(); nav(); peeks(); poleRig(); projFlow();
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
  if (forced !== null) {
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

  // loader — a short, honest calibration, not a fake wait
  const bar = $('#loaderBar'), num = $('#loaderCount'), box = $('#loader');
  let entered = false;
  const enter = withAudio => {
    if (entered) return;
    entered = true;
    if (withAudio) audioEnable(true);
    box.classList.add('done');
    document.body.classList.add('ready');
    stops[0].classList.add('live');
  };
  $('#audioOn') ?.addEventListener('click', () => enter(true));
  $('#audioOff')?.addEventListener('click', () => enter(false));

  const t0 = performance.now(), DUR = 1250;
  (function run(now) {
    const k = clamp((now - t0) / DUR, 0, 1);
    const e = 1 - Math.pow(1 - k, 2.2);
    num.textContent = String(Math.round(e * 100)).padStart(2, '0');
    bar.style.width = (e * 100) + '%';
    if (k < 1) return requestAnimationFrame(run);
    box.classList.add('asks');                 // hand the choice over
    $('#audioOn')?.focus({ preventScroll: true });
  })(t0);
}

document.fonts?.ready.then(boot).catch(boot) ?? boot();
})();
