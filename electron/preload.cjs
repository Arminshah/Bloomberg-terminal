// Exposes the desktop-only data requests the web app uses, made by the main
// process, which (unlike the page) is not limited by browser cross-origin
// rules: Yahoo Finance paths on an allowlist, the US Treasury's daily yield
// curve by year, official rates, calendars and bond yields from central banks
// and finance ministries (fixed sources named by key), FRED release dates
// and series from a fixed list, SEC EDGAR files by kind and CIK (and 13F
// holdings read from a filing), tickers for CUSIPs from OpenFIGI, Kraken
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
  secPay: (path) => ipcRenderer.invoke('sec-pay', String(path)),
  secText: (kind, path, names) => ipcRenderer.invoke('sec-text', String(kind), String(path), Array.isArray(names) ? names.map(String) : []),
  sec13f: (cik, accession, part) => ipcRenderer.invoke('sec-13f', String(cik), String(accession), String(part)),
  openfigi: (codes) => ipcRenderer.invoke('openfigi', Array.isArray(codes) ? codes.map(String) : []),
  openfigiListings: (ticker) => ipcRenderer.invoke('openfigi-listings', String(ticker)),
  usaspending: (kind, arg) => ipcRenderer.invoke('usaspending', String(kind), String(arg)),
  imf: (kind, arg) => ipcRenderer.invoke('imf', String(kind), String(arg ?? '')),
  congressGov: (kind, arg) => ipcRenderer.invoke('congress-gov', String(kind), String(arg ?? '')),
  congress: (kind, arg) => ipcRenderer.invoke('congress', String(kind), String(arg ?? '')),
  kraken: (kind, arg, n) => ipcRenderer.invoke('kraken', String(kind), String(arg ?? ''), Number(n ?? 0)),
  coingecko: () => ipcRenderer.invoke('coingecko'),
  eod: (provider, ticker, from, to) => ipcRenderer.invoke('eod', String(provider), String(ticker), String(from), String(to)),
  eia: (kind) => ipcRenderer.invoke('eia', String(kind)),
  bea: (kind) => ipcRenderer.invoke('bea', String(kind)),
  cftc: (kind, report, mode, code) => ipcRenderer.invoke('cftc', String(kind), String(report), String(mode), code == null ? undefined : String(code)),
  fiscal: (kind) => ipcRenderer.invoke('fiscal', String(kind)),
  massiveDividends: (ticker) => ipcRenderer.invoke('massive-dividends', String(ticker)),
  analysts: (kind, symbol, fresh) => ipcRenderer.invoke('analysts', String(kind), String(symbol), fresh === true),
  finnhubResearch: (kind, symbol, fresh) => ipcRenderer.invoke('finnhub-research', String(kind), String(symbol), fresh === true),
  tipranks: (kind, ticker) => ipcRenderer.invoke('tipranks', String(kind), String(ticker)),
  assistant: (messages) => ipcRenderer.invoke('assistant', messages),
  docAsk: (docPath, question) => ipcRenderer.invoke('doc-ask', docPath, question),
  finnhub: (kind, symbol) => ipcRenderer.invoke('finnhub', String(kind), String(symbol)),
  nasdaq: (kind, symbol) => ipcRenderer.invoke('nasdaq', String(kind), String(symbol)),
  nasdaqOptions: (symbol, assetClass) => ipcRenderer.invoke('nasdaq-options', String(symbol), String(assetClass)),
  spdrHoldings: (fund) => ipcRenderer.invoke('spdr-holdings', String(fund)),
  eurex: (product, busdate) => ipcRenderer.invoke('eurex', String(product), String(busdate ?? '')),
  asic: (kind, date, version) => ipcRenderer.invoke('asic', String(kind), String(date ?? ''), String(version ?? '')),
  indexMembers: (kind, arg) => ipcRenderer.invoke('index-members', String(kind), String(arg ?? '')),
  finra: (kind, symbol) => ipcRenderer.invoke('finra', String(kind), String(symbol)),
  estimateHistory: (kind, symbol) => ipcRenderer.invoke('estimate-history', String(kind), String(symbol)),
  finvizPeers: (symbol) => ipcRenderer.invoke('finviz-peers', String(symbol)),
  analystActions: (symbol) => ipcRenderer.invoke('analyst-actions', String(symbol)),
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
  /** The tab strip's Options menu: 'new', 'zoom-get', 'zoom-in', 'zoom-out', 'best-fit' or 'reset'. */
  windowOptions: (op) => ipcRenderer.invoke('window:options', String(op)),
  onStream: (cb) => {
    const handler = (_event, kind, data) => cb(String(kind), typeof data === 'string' ? data : undefined);
    ipcRenderer.on('stream', handler);
    return () => ipcRenderer.removeListener('stream', handler);
  },
  // The window's back and forward commands: a mouse's side buttons and a keyboard's browser keys on Windows.
  onHistory: (cb) => {
    const handler = (_event, dir) => cb(dir === 'forward' ? 'forward' : 'back');
    ipcRenderer.on('history', handler);
    return () => ipcRenderer.removeListener('history', handler);
  },
});
