// Exposes the desktop-only data requests the web app uses, made by the main
// process, which (unlike the page) is not limited by browser cross-origin
// rules: Yahoo Finance paths on an allowlist, the US Treasury's daily yield
// curve by year, official rates, calendars and bond yields from central banks
// and finance ministries (fixed sources named by key), and FRED release dates
// and series from a fixed list.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('arminDesktop', {
  platform: process.platform,
  yahoo: (path) => ipcRenderer.invoke('yahoo', String(path)),
  treasury: (year) => ipcRenderer.invoke('treasury', Number(year)),
  official: (source, since) => ipcRenderer.invoke('official', String(source), String(since)),
  fred: (kind, arg, from) => ipcRenderer.invoke('fred', String(kind), String(arg), String(from ?? '')),
  // Provider status and credentials: values can be saved or cleared, never read back.
  providersStatus: () => ipcRenderer.invoke('providers:status'),
  providersSet: (name, value) => ipcRenderer.invoke('providers:set', String(name), String(value)),
  providersClear: (name) => ipcRenderer.invoke('providers:clear', String(name)),
  providersSetting: (name, value) => ipcRenderer.invoke('providers:setting', String(name), value === true),
  streamOpen: () => ipcRenderer.invoke('stream:open'),
  streamSend: (msg) => ipcRenderer.invoke('stream:send', String(msg)),
  streamClose: () => ipcRenderer.invoke('stream:close'),
  onStream: (cb) => {
    const handler = (_event, kind, data) => cb(String(kind), typeof data === 'string' ? data : undefined);
    ipcRenderer.on('stream', handler);
    return () => ipcRenderer.removeListener('stream', handler);
  },
});
