#!/usr/bin/env node
/*
 * Copies the two runtime libraries out of node_modules into renderer/vendor/.
 *
 * The renderer has no bundler and no network — the CSP in index.html is
 * `default-src 'self'`, so a CDN <script> would be blocked, not slow. Both
 * libraries therefore have to sit inside the app bundle as plain files, and
 * `files` in package.json only ships main.js, preload.js and renderer/**.
 *
 * Runs on postinstall so a fresh `npm install` can't leave a stale copy
 * behind, and is safe to re-run.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'renderer', 'vendor');

const FILES = [
  ['vue/dist/vue.global.prod.js', 'vue.global.prod.js'],
  ['marked/marked.min.js', 'marked.min.js'],
];

fs.mkdirSync(OUT, { recursive: true });

for (const [from, to] of FILES) {
  const src = path.join(ROOT, 'node_modules', from);
  if (!fs.existsSync(src)) {
    console.warn(`vendor: ${from} not installed — skipped`);
    continue;
  }
  fs.copyFileSync(src, path.join(OUT, to));
  const kb = (fs.statSync(src).size / 1024).toFixed(0);
  console.log(`vendor: ${to} (${kb} KB)`);
}
