#!/usr/bin/env node
/*
 * Performance budget gate (docs/03). CI fails the build if exceeded:
 *   - initial JS bundle (the entry chunk from index.html)  < 500 KB gzipped
 *   - any async route chunk                                 < 150 KB gzipped
 *   - CSS                                                   < 100 KB gzipped
 *
 * "The build test": a scared 20-year-old in Kathmandu on 4G should not wait.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const DIST = 'dist';
const ASSETS = join(DIST, 'assets');
const KB = 1024;
const INITIAL_JS_MAX = 500 * KB;
const ROUTE_JS_MAX = 150 * KB;
const CSS_MAX = 100 * KB;

function gz(path) {
  return gzipSync(readFileSync(path)).length;
}
function fmt(n) {
  return `${(n / KB).toFixed(1)} KB`;
}

let html;
try {
  html = readFileSync(join(DIST, 'index.html'), 'utf8');
} catch {
  console.error('No dist/index.html — run `vite build` first.');
  process.exit(1);
}

// The entry chunk is the module script referenced by index.html.
const entryMatch = html.match(/src="\/assets\/([^"]+\.js)"/);
const entry = entryMatch ? entryMatch[1] : null;

const files = readdirSync(ASSETS);
const failures = [];
let entryGz = 0;

for (const f of files) {
  const size = gz(join(ASSETS, f));
  if (f.endsWith('.css')) {
    if (size > CSS_MAX) failures.push(`CSS ${f}: ${fmt(size)} > ${fmt(CSS_MAX)}`);
  } else if (f.endsWith('.js')) {
    if (f === entry) {
      entryGz = size;
      if (size > INITIAL_JS_MAX) failures.push(`entry ${f}: ${fmt(size)} > ${fmt(INITIAL_JS_MAX)}`);
    } else if (size > ROUTE_JS_MAX) {
      failures.push(`chunk ${f}: ${fmt(size)} > ${fmt(ROUTE_JS_MAX)}`);
    }
  }
}

console.log(`Entry chunk: ${entry ?? '(unknown)'} — ${fmt(entryGz)} gz (budget ${fmt(INITIAL_JS_MAX)})`);
if (failures.length) {
  console.error('\nPerformance budget EXCEEDED:');
  for (const line of failures) console.error('  ✗ ' + line);
  process.exit(1);
}
console.log('Performance budget OK.');
