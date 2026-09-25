// The renderer has no Node access and file:// defeats fetch(), so every read
// of the library goes through here. This only forwards: main.js owns the
// path checks, the allowlisted schemes, and what a scan is allowed to return.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('library', {
  scan: () => ipcRenderer.invoke('library:scan'),
  read: (relPath) => ipcRenderer.invoke('library:read', String(relPath)),
  reveal: (relPath) => ipcRenderer.invoke('library:reveal', String(relPath)),
  openExternal: (url) => ipcRenderer.invoke('library:openExternal', String(url)),
  pickRoot: () => ipcRenderer.invoke('library:pickRoot'),

  // Fires whenever anything under raw/, personal-wiki/ or outputs/ changes.
  // Returns its own unsubscribe so a re-registering renderer cannot stack
  // duplicate listeners.
  onChanged: (fn) => {
    const handler = (event, payload) => fn(payload);
    ipcRenderer.on('library:changed', handler);
    return () => ipcRenderer.removeListener('library:changed', handler);
  },
});

// Adding to raw/: Carter's own folder, so the app acts on his behalf here and
// nowhere else. Capture writes one markdown file; addFiles copies what he drags
// onto the window.
contextBridge.exposeInMainWorld('capture', {
  preview: (url) => ipcRenderer.invoke('raw:preview', String(url)),
  save: (payload) => ipcRenderer.invoke('raw:capture', payload),
  addFiles: (paths) => ipcRenderer.invoke('raw:addFiles', paths),

  // Electron 32 removed File.path; this is the supported replacement, and it
  // has to be called in the preload because webUtils is not reachable from the
  // renderer's own context.
  pathFor: (file) => webUtils.getPathForFile(file),
});

// The library answering questions about itself. `ask` cannot write; `remember`
// is the one path that records something Carter thinks into personal-wiki/ideas/.
contextBridge.exposeInMainWorld('chat', {
  send: (message, sessionId, mode) => ipcRenderer.invoke('chat:send', message, sessionId, mode),
  stop: () => ipcRenderer.invoke('chat:stop'),

  // Kept in a file by the main process, not localStorage. See the note there.
  saveThread: (data) => ipcRenderer.invoke('thread:save', data),
  loadThread: () => ipcRenderer.invoke('thread:load'),

  onEvent: (fn) => {
    const handler = (event, payload) => fn(payload);
    ipcRenderer.on('chat:event', handler);
    return () => ipcRenderer.removeListener('chat:event', handler);
  },
});

// Sync is the one operation that causes a write, and it does not happen here:
// main.js runs Claude Code headless in the library folder. This forwards the
// controls and the progress stream.
contextBridge.exposeInMainWorld('sync', {
  probe: () => ipcRenderer.invoke('sync:probe'),
  recheck: () => ipcRenderer.invoke('sync:recheck'),
  models: () => ipcRenderer.invoke('sync:models'),
  start: (model, target) => ipcRenderer.invoke('sync:start', model, target),
  cancel: () => ipcRenderer.invoke('sync:cancel'),

  onEvent: (fn) => {
    const handler = (event, payload) => fn(payload);
    ipcRenderer.on('sync:event', handler);
    return () => ipcRenderer.removeListener('sync:event', handler);
  },
});
