/* Inlines the stylesheet and engine into two self-contained outputs:
     dist/index.html      — full document; audio and film stay separate files
     dist/artifact.html   — one file for Claude Artifacts

   The three films are 40 MB, so they cannot go in the artifact (16 MB cap).
   There, each <video> becomes its poster as an <img> — the cards still look
   and parallax the same, and no lightbox opens onto an empty frame.        */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const css  = readFileSync('styles.css', 'utf8');
const js   = readFileSync('main.js', 'utf8');
const mp3  = readFileSync('audio/ambient.mp3');

/* Structural guard. A mis-sliced edit once closed a <section> early and left
   three stops parented to <body> instead of the parallax layer — they stopped
   moving with the camera and the site looked like the scroll engine had
   broken. Cheap to check, expensive to miss. */
{
  const count = (re) => (html.match(re) || []).length;
  const open = count(/<section\b/g), close = count(/<\/section>/g);
  const stops = count(/<section class="stop"/g);
  const divO = count(/<div\b/g), divC = count(/<\/div>/g);
  const problems = [];
  if (open !== close) problems.push(`<section> ${open} vs </section> ${close}`);
  if (divO !== divC) problems.push(`<div> ${divO} vs </div> ${divC}`);
  if (stops !== 5) problems.push(`expected 5 .stop sections, found ${stops}`);
  if (open !== stops) problems.push(`${open - stops} <section> that is not a stop`);
  if (problems.length) {
    console.error('index.html structure is wrong:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
}

/* CSS guard. Editing this stylesheet by slicing between two markers has twice
   now carried away rules that happened to sit between them — a stray brace
   once killed every rule after line 394, and the shooting star's animation was
   removed by an edit that was only meant to replace the arrows beside it. Both
   were invisible until someone looked at the page.

   Braces catch the first. This list catches the second: anything named here is
   load-bearing and cannot quietly vanish. Add to it when you build something
   whose absence would not throw. */
{
  const required = [
    '@keyframes lyStar', '@keyframes filmGrow', '@keyframes filmShrink',
    '@keyframes lyPulse', '@keyframes lyIdle', '@keyframes ldBeat', '@keyframes ringSpin',
    '.ly-cue', '.layers.switched .ly-cue', '.cfilm-frost', '.cfilm-ring', '.filmbox-frame', '.reader-glass',
    '.stop-num', '#sky', '#galaxy', '#grain',
  ];
  const open = (css.match(/{/g) || []).length, close = (css.match(/}/g) || []).length;
  const missing = required.filter(sel => !css.includes(sel));
  const problems = [];
  if (open !== close) problems.push(`unbalanced braces: { ${open} vs } ${close}`);
  if (missing.length) problems.push(`missing: ${missing.join(', ')}`);
  if (problems.length) {
    console.error('styles.css is wrong:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
}

const inlined = html
  .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${css}\n</style>`)
  .replace('<script src="main.js"></script>', `<script>\n${js}\n</script>`);

mkdirSync('dist/audio', { recursive: true });
mkdirSync('dist/media', { recursive: true });
writeFileSync('dist/index.html', inlined);
copyFileSync('audio/ambient.mp3', 'dist/audio/ambient.mp3');
for (const f of readdirSync('media')) copyFileSync(`media/${f}`, `dist/media/${f}`);

// ── artifact: one file ────────────────────────────────────────────────────
const head = inlined.slice(inlined.indexOf('<title>'), inlined.indexOf('</head>'));
const body = inlined.slice(inlined.indexOf('<body>') + 6, inlined.lastIndexOf('</body>'));
let artifact = (head.replace(/<title>.*?<\/title>/, '<title>Ẹ̀rọ Labs</title>') + '\n' + body)
  .replace('src="audio/ambient.mp3"', `src="data:audio/mpeg;base64,${mp3.toString('base64')}"`);

artifact = artifact.replace(
  /<video src="media\/([a-z-]+)\.mp4"[\s\S]*?poster="media\/(poster-[a-z-]+\.jpg)"[\s\S]*?><\/video>/g,
  (_, name, poster) => {
    const b64 = readFileSync(`media/${poster}`).toString('base64');
    return `<img src="data:image/jpeg;base64,${b64}" alt="${name} film — still">`;
  });

writeFileSync('dist/artifact.html', artifact);

const mb = n => (n / 1048576).toFixed(2) + ' MB';
const media = readdirSync('media').reduce((n, f) => n + readFileSync(`media/${f}`).length, 0);
console.log(`dist/index.html    ${mb(inlined.length)}  + audio ${mb(mp3.length)} + media ${mb(media)}`);
console.log(`dist/artifact.html ${mb(artifact.length)}  (cap 16 MB — films replaced by posters)`);
