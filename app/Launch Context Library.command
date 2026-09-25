#!/bin/bash
cd "$(dirname "$0")"

# Make sure Homebrew/Node paths are found even in a minimal launch environment
# (double-clicking from Finder does not get your shell's PATH).
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

echo "Working directory: $(pwd)"
echo "Using npm: $(command -v npm || echo 'NOT FOUND')"

ELECTRON_BIN="node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"

if [ ! -f "$ELECTRON_BIN" ]; then
  echo ""
  echo "Electron binary is missing (likely stripped by Gatekeeper/AV). Reinstalling..."
  rm -rf node_modules/electron
  # No version pinned here on purpose: package.json is the one place the
  # version is decided, so a repair can never quietly downgrade the app.
  npm install
fi

if [ -d "node_modules/electron/dist/Electron.app" ]; then
  echo "Ad-hoc signing the Electron binary so macOS stops flagging it..."
  codesign --force --deep --sign - "node_modules/electron/dist/Electron.app" 2>/dev/null
fi

echo ""
echo "Starting Context Library..."
echo ""

npm start
status=$?

echo ""
if [ $status -ne 0 ]; then
  echo "npm start exited with an error (code $status). See output above."
else
  echo "App closed."
fi

echo ""
read -n 1 -s -r -p "Press any key to close this window..."
echo ""
