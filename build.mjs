/* Inlines styles.css + main.js into two self-contained outputs:
     dist/index.html      — full document, drop on any static host
     dist/artifact.html   — same page, shaped for Claude Artifacts (no doc wrapper)
   Run: node build.mjs                                                        */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const css  = readFileSync('styles.css', 'utf8');
const js   = readFileSync('main.js', 'utf8');

const inlined = html
  .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${css}\n</style>`)
  .replace('<script src="main.js"></script>', `<script>\n${js}\n</script>`);

mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', inlined);

// artifact form: strip the document wrapper, keep title/fonts/style/markup/script
const head = inlined.slice(inlined.indexOf('<title>'), inlined.indexOf('</head>'));
const body = inlined.slice(inlined.indexOf('<body>') + 6, inlined.lastIndexOf('</body>'));
writeFileSync('dist/artifact.html',
  head.replace(/<title>.*?<\/title>/, '<title>Ẹ̀rọ Labs</title>') + '\n' + body);

const kb = n => (n / 1024).toFixed(1) + ' KB';
console.log(`dist/index.html    ${kb(inlined.length)}`);
console.log(`dist/artifact.html ${kb((head + body).length)}`);
