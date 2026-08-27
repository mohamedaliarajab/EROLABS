/* Inlines the stylesheet and engine into two self-contained outputs:
     dist/index.html      — full document; audio stays a separate file
     dist/artifact.html   — one file, audio embedded, for Claude Artifacts
   Run: node build.mjs                                                        */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const css  = readFileSync('styles.css', 'utf8');
const js   = readFileSync('main.js', 'utf8');
const mp3  = readFileSync('audio/ambient.mp3');

const inlined = html
  .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${css}\n</style>`)
  .replace('<script src="main.js"></script>', `<script>\n${js}\n</script>`);

mkdirSync('dist/audio', { recursive: true });
writeFileSync('dist/index.html', inlined);
// kept as a file here: a 4MB data URI in the markup would block parsing, and
// a separate file gets cached across visits
copyFileSync('audio/ambient.mp3', 'dist/audio/ambient.mp3');

// the artifact has to be a single file, so the audio rides along as base64
const head = inlined.slice(inlined.indexOf('<title>'), inlined.indexOf('</head>'));
const body = inlined.slice(inlined.indexOf('<body>') + 6, inlined.lastIndexOf('</body>'));
const artifact = (head.replace(/<title>.*?<\/title>/, '<title>Ẹ̀rọ Labs</title>') + '\n' + body)
  .replace('src="audio/ambient.mp3"', `src="data:audio/mpeg;base64,${mp3.toString('base64')}"`);
writeFileSync('dist/artifact.html', artifact);

const mb = n => (n / 1048576).toFixed(2) + ' MB';
console.log(`dist/index.html    ${mb(inlined.length)}  + audio/ambient.mp3 ${mb(mp3.length)}`);
console.log(`dist/artifact.html ${mb(artifact.length)}  (cap 16 MB)`);
