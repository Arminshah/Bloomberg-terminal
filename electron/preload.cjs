// Exposes the one desktop-only capability the web app uses: Yahoo Finance
// requests made by the main process, which (unlike the page) is not limited by
// browser cross-origin rules. Only Yahoo chart, search and profile paths pass.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('arminDesktop', {
  platform: process.platform,
  yahoo: (path) => ipcRenderer.invoke('yahoo', String(path)),
});
