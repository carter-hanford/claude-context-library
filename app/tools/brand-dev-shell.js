#!/usr/bin/env node
/*
 * Puts the product name in the macOS menu bar during a dev run.
 *
 * The menu bar's first item — the bold one next to the Apple logo — is drawn
 * by macOS from the running application bundle's CFBundleName. It is not the
 * Electron menu's own label, and setting `app.setName()` does not move it.
 * That trips people up because app.setName() *does* fix everything else:
 * app.name, the userData folder, and the label Electron reports back if you
 * ask it. Reading it back from Electron therefore proves nothing about what
 * you actually see on screen.
 *
 * A packaged build has no problem: electron-builder writes CFBundleName from
 * `productName`. But `npm start` boots the stock Electron.app out of
 * node_modules, whose bundle is named "Electron" — so that is what the menu
 * bar said.
 *
 * This rewrites CFBundleName and CFBundleDisplayName in that local bundle.
 * Only those two keys: CFBundleExecutable names the binary on disk, and
 * CFBundleIdentifier is what macOS keys permissions and preferences off.
 * Changing either breaks something for no gain.
 *
 * It runs on postinstall, because `npm install` replaces node_modules and
 * would quietly undo it. Re-running is safe and does nothing when the name is
 * already right.
 *
 * macOS only; a no-op everywhere else, since Windows and Linux take the menu
 * name from the window and app.setName() already covers those.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PRODUCT_NAME = require('../package.json').productName;
const PLIST = path.join(
  __dirname, '..', 'node_modules', 'electron', 'dist',
  'Electron.app', 'Contents', 'Info.plist'
);

function read(key) {
  try {
    return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, PLIST], {
      encoding: 'utf8',
    }).trim();
  } catch (e) {
    return null;
  }
}

function write(key, value) {
  execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, PLIST]);
}

function main() {
  if (process.platform !== 'darwin') return;

  // No Electron installed yet (a --production install, or CI without dev
  // dependencies). Nothing to brand, and nothing worth failing over.
  if (!fs.existsSync(PLIST)) return;

  const keys = ['CFBundleName', 'CFBundleDisplayName'];
  const changed = [];

  for (const key of keys) {
    if (read(key) === PRODUCT_NAME) continue;
    write(key, PRODUCT_NAME);
    changed.push(key);
  }

  if (!changed.length) {
    console.log(`dev shell already reads "${PRODUCT_NAME}" in the menu bar`);
    return;
  }

  // macOS caches bundle metadata. Touching the bundle makes Launch Services
  // pick the new name up on the next launch instead of some later one.
  try {
    execFileSync('/usr/bin/touch', [path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app')]);
  } catch (e) {
    // A stale cache costs one extra relaunch. Not worth failing an install.
  }

  console.log(`menu bar will read "${PRODUCT_NAME}" (set ${changed.join(', ')})`);
}

try {
  main();
} catch (e) {
  // This is a cosmetic dev convenience. It must never break `npm install`.
  console.warn('could not rename the dev shell:', e.message);
}
