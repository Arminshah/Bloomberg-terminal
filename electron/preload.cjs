// Exposes the desktop-only data requests the web app uses, made by the main
// process, which (unlike the page) is not limited by browser cross-origin
// rules: Yahoo Finance paths on an allowlist, the US Treasury's daily yield
// curve by year, and policy rates from the Fed, ECB, BoE and Bank of Canada.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('arminDesktop', {
  platform: process.platform,
  yahoo: (path) => ipcRenderer.invoke('yahoo', String(path)),
  treasury: (year) => ipcRenderer.invoke('treasury', Number(year)),
  policy: (source, since) => ipcRenderer.invoke('policy', String(source), String(since)),
});
