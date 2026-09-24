// One-off offscreen render: draws tools/icon-source.html to a 1024x1024 PNG
// (with real alpha) using Electron itself, writes it to build/icon.png, then
// exits. build/ is generated and not committed; the packaging scripts run this
// first, so a fresh clone can still package.
// Run with: npm run icon
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    useContentSize: true,
    frame: false,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
  });

  win.webContents.on('did-fail-load', (e, code, desc) => console.log('[did-fail-load]', code, desc));

  win.loadFile(path.join(__dirname, 'icon-source.html'));

  win.webContents.on('did-finish-load', () => {
    setTimeout(async () => {
      const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
      const out = path.join(__dirname, '..', 'build', 'icon.png');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, image.toPNG());
      console.log('wrote build/icon.png', image.getSize());
      app.quit();
    }, 300);
  });
});
