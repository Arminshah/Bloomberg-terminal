/**
 * Folds the `--mode single` build into one self-contained HTML document:
 * scripts and styles inlined (fonts are already data URIs). Writes
 * dist-single/armin-terminal.html (full document) and
 * dist-single/armin-terminal.fragment.html (head/body wrappers removed, for
 * hosts that supply their own document skeleton).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../dist-single/', import.meta.url).pathname;
let html = readFileSync(join(dir, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+\.css)"[^>]*>/g, (_, href) => {
  const css = readFileSync(join(dir, href), 'utf8');
  return `<style>${css}</style>`;
});

let scripts = '';
html = html.replace(/<script type="module"[^>]*src="\.?\/?([^"]+\.js)"[^>]*><\/script>/g, (_, src) => {
  const js = readFileSync(join(dir, src), 'utf8').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
  scripts += `<script type="module">${js}</script>`;
  return '';
});
// A replacer function: a plain string would expand $' and $& sequences found in the minified code.
html = html.replace('</body>', () => `${scripts}</body>`);
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');

writeFileSync(join(dir, 'armin-terminal.html'), html);

const title = /<title>[\s\S]*?<\/title>/.exec(html)?.[0] ?? '<title>Armin Terminal</title>';
const head = html.slice(0, html.indexOf('<body>'));
const styles = [...head.matchAll(/<style>[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n');
const body = html.slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('</body>'));
writeFileSync(join(dir, 'armin-terminal.fragment.html'), `${title}\n${styles}\n${body.trim()}\n`);

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(`armin-terminal.html ${kb(html)}`);
