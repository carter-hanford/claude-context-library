#!/usr/bin/env node
/*
 * Builds "Context Library.app", points it at the live source, and installs it
 * to /Applications so it can be pinned to the Dock.
 *
 * The point of the middle step: `electron-builder --dir` freezes the renderer
 * into Resources/app.asar, so a Dock-pinned copy would drift the moment
 * anything here changed and would need re-packaging after every edit. Electron
 * looks for Resources/app.asar first and falls back to a Resources/app
 * directory, so replacing the archive with a symlink to this project makes the
 * installed app read the working tree at every launch. Edit a file, relaunch
 * from the Dock, and the change is there.
 *
 * What that costs: the installed app is not self-contained. It depends on this
 * folder staying where it is. Moving or deleting the project breaks the Dock
 * icon, and the app is not portable to another machine. For a personal tool
 * that is the right trade; for something shipped, drop the symlink step and
 * re-run this on each release instead.
 *
 * Re-run after: an Electron version bump, an icon change, or anything in the
 * `build` block of package.json. Plain source edits need no re-run.
 *
 * Usage: npm run install:app
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PRODUCT = require('../package.json').productName;
const LIB_ROOT = path.resolve(ROOT, '..');
const DEST = path.join('/Applications', `${PRODUCT}.app`);

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });

function findBuilt() {
  const dist = path.join(ROOT, 'dist');
  for (const dir of fs.existsSync(dist) ? fs.readdirSync(dist) : []) {
    const candidate = path.join(dist, dir, `${PRODUCT}.app`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function main() {
  if (process.platform !== 'darwin') {
    console.error('install-app is macOS only. On Windows use `npm run dist:win`.');
    process.exit(1);
  }

  console.log('› packaging');
  run('npx', ['electron-builder', '--dir'], { stdio: 'pipe' });

  const built = findBuilt();
  if (!built) {
    console.error('could not find the packaged .app under dist/');
    process.exit(1);
  }

  // Swap the frozen archive for a link to the working tree.
  const resources = path.join(built, 'Contents', 'Resources');
  const asar = path.join(resources, 'app.asar');
  const live = path.join(resources, 'app');
  if (fs.existsSync(asar)) fs.rmSync(asar, { force: true });
  fs.rmSync(path.join(resources, 'app.asar.unpacked'), { recursive: true, force: true });
  if (fs.existsSync(live)) fs.rmSync(live, { recursive: true, force: true });
  fs.symlinkSync(ROOT, live);
  console.log(`› linked ${path.relative(built, live)} -> ${ROOT}`);

  // Rewriting the bundle invalidates the ad-hoc signature electron-builder
  // applied, and an app with a broken signature is killed on launch rather
  // than merely warned about.
  console.log('› re-signing');
  try {
    run('codesign', ['--force', '--deep', '--sign', '-', built], { stdio: 'pipe' });
  } catch (e) {
    console.warn('  codesign failed; the app may refuse to launch');
  }

  console.log(`› installing to ${DEST}`);
  fs.rmSync(DEST, { recursive: true, force: true });
  run('ditto', [built, DEST], { stdio: 'pipe' });

  /* Tell the installed copy which library to open. In a dev run the default is
     the parent of this folder; from /Applications the bundle's own parent is
     /Applications, so the app would otherwise open its picker on first launch.
     Writing the remembered root skips that, and the picker still works if the
     library ever moves. */
  const stateDir = path.join(os.homedir(), 'Library', 'Application Support', PRODUCT);
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'library-root.json'), JSON.stringify({ root: LIB_ROOT }, null, 2));
  console.log(`› library root set to ${LIB_ROOT}`);

  console.log(`\n${PRODUCT} installed. Source edits go live on the next launch.`);
}

main();
