// =============================================================================
//  scripts/check-icons.mjs — CI guard: every icon referenced in the UI resolves
//
//  Scans the source for `fa-*` icon names and asserts each one maps to a real
//  inline SVG in src/icons.js (no silent fallback dots). Also fails if any
//  decorative emoji sneaks back into the shipped source. Keeps the "flat SVG
//  icons only, no emoji" invariant enforced on every push.
//
//  Usage:  node scripts/check-icons.mjs
// =============================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { svgIcon } from '../src/icons.js';

let failures = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); failures++; };
const ok = (m) => console.log(`  ✓ ${m}`);

// Collect source files to scan.
function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'dist' || e.startsWith('.')) continue;
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, acc);
    else if (/\.(js|html)$/.test(p)) acc.push(p);
  }
  return acc;
}

const files = ['index.html', ...walk('src')];
const text = files.map((f) => readFileSync(f, 'utf8')).join('\n');

// 1. Icon coverage.
const names = [...new Set([...text.matchAll(/fa-([a-z0-9-]+)/g)].map((m) => m[1]))]
  .filter((n) => !['solid', 'spin', 'fw'].includes(n));
const missing = names.filter((n) => !svgIcon(n));
if (missing.length) fail(`icons with no SVG (fall back to dot): ${missing.join(', ')}`);
else ok(`all ${names.length} referenced icons resolve to inline SVG`);

// 2. No decorative emoji in shipped source (arrows/·/box-drawing are allowed).
const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}]/u;
const offenders = [];
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((ln, i) => { if (emoji.test(ln)) offenders.push(`${f}:${i + 1}`); });
}
if (offenders.length) fail(`emoji found in source: ${offenders.slice(0, 8).join(', ')}`);
else ok('no decorative emoji in shipped source');

// 3. Font Awesome CDN must not be referenced (we ship inline SVG).
if (/font-awesome|fontawesome/i.test(text)) fail('Font Awesome CDN reference still present');
else ok('no Font Awesome CDN dependency');

console.log('');
if (failures) { console.error(`ICON/ASSET CHECK FAILED: ${failures} issue(s).`); process.exit(1); }
console.log('ICON/ASSET CHECK PASSED.');
