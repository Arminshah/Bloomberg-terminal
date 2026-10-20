// Exposes the desktop-only data requests the web app uses, made by the main
// process, which (unlike the page) is not limited by browser cross-origin
// rules: Yahoo Finance paths on an allowlist, the US Treasury's daily yield
// curve by year, official rates, calendars and bond yields from central banks
// and finance ministries (fixed sources named by key), FRED release dates
// and series from a fixed list, SEC EDGAR files by kind and CIK, Kraken
// tickers, candles and order books for a fixed list of crypto pairs, analyst
// research from Financial Modeling Prep, news from fixed sources and Alpaca's
// IEX quotes, each for a validated ticker.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('arminDesktop', {
  platform: process.platform,
  yahoo: (path) => ipcRenderer.invoke('yahoo', String(path)),
  treasury: (year) => ipcRenderer.invoke('treasury', Number(year)),
  official: (source, since) => ipcRenderer.invoke('official', String(source), String(since)),
  fred: (kind, arg, from) => ipcRenderer.invoke('fred', String(kind), String(arg), String(from ?? '')),
  sec: (kind, arg) => ipcRenderer.invoke('sec', String(kind), String(arg ?? '')),
  kraken: (kind, arg, n) => ipcRenderer.invoke('kraken', String(kind), String(arg ?? ''), Number(n ?? 0)),
  coingecko: () => ipcRenderer.invoke('coingecko'),
  eod: (provider, ticker, from, to) => ipcRenderer.invoke('eod', String(provider), String(ticker), String(from), String(to)),
  analysts: (kind, symbol) => ipcRenderer.invoke('analysts', String(kind), String(symbol)),
  finnhubResearch: (kind, symbol) => ipcRenderer.invoke('finnhub-research', String(kind), String(symbol)),
  equibles: (kind, symbol) => ipcRenderer.invoke('equibles', String(kind), String(symbol)),
  tipranks: (kind, ticker) => ipcRenderer.invoke('tipranks', String(kind), String(ticker)),
  assistant: (messages) => ipcRenderer.invoke('assistant', messages),
  finnhub: (kind, symbol) => ipcRenderer.invoke('finnhub', String(kind), String(symbol)),
  nasdaq: (kind, symbol) => ipcRenderer.invoke('nasdaq', String(kind), String(symbol)),
  finra: (kind, symbol) => ipcRenderer.invoke('finra', String(kind), String(symbol)),
  alphavantage: (kind, symbol) => ipcRenderer.invoke('alphavantage', String(kind), String(symbol)),
  earningsCalendar: (source, from, to) => ipcRenderer.invoke('earnings-calendar', String(source), String(from), String(to)),
  news: (source, arg) => ipcRenderer.invoke('news', String(source), String(arg ?? '')),
  alpaca: (kind, symbols) => ipcRenderer.invoke('alpaca', String(kind), String(symbols)),
  optionChain: (arg) => ipcRenderer.invoke('option-chain', arg),
  // The provider switches as they were when this page loaded (YAHOO_PRICES_ENABLED, KRAKEN_ENABLED).
  settings: ipcRenderer.sendSync('providers:settings-sync'),
  // Provider status and credentials: values can be saved or cleared, never read back.
  providersStatus: () => ipcRenderer.invoke('providers:status'),
  providersSet: (name, value) => ipcRenderer.invoke('providers:set', String(name), String(value)),
  providersClear: (name) => ipcRenderer.invoke('providers:clear', String(name)),
  providersImport: (text) => ipcRenderer.invoke('providers:import', String(text)),
  providersSelfTest: () => ipcRenderer.invoke('providers:selftest'),
  // The top bar's REFRESH: answers the main process kept from before it are asked for again (electron/refresh.cjs).
  refresh: () => ipcRenderer.invoke('refresh'),
  yahooConsent: () => ipcRenderer.invoke('yahoo:consent'),
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
