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
