// Armin Terminal desktop shell (Windows, macOS, Linux).
// Loads the built web app from dist/ and gives it a native window. There is no
// menu bar: F1-F12 belong to the terminal's market sector keys, so window
// commands use Ctrl+Shift shortcuts instead.
const { app, BrowserWindow, Menu, ipcMain, net, session, shell, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const STATE_FILE = () => path.join(app.getPath('userData'), 'window-state.json');
const ICON = path.join(__dirname, '..', 'build', 'icon.png');
const windows = new Map();

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8'));
  } catch {
    return {};
  }
}

function saveState(id, win) {
  if (win.isDestroyed()) return;
  const all = loadState();
  all[id] = { bounds: win.getNormalBounds(), maximized: win.isMaximized() };
  try {
    fs.mkdirSync(path.dirname(STATE_FILE()), { recursive: true });
    fs.writeFileSync(STATE_FILE(), JSON.stringify(all));
  } catch {
    /* not fatal */
  }
}

/** Keeps a saved window on a connected display. */
function visible(bounds) {
  if (!bounds) return undefined;
  const area = screen.getDisplayMatching(bounds).workArea;
  const overlaps = bounds.x < area.x + area.width && bounds.x + bounds.width > area.x && bounds.y < area.y + area.height && bounds.y + bounds.height > area.y;
  return overlaps ? bounds : undefined;
}

function nextId() {
  let id = 1;
  while (windows.has(id)) id++;
  return id;
}

// ------------------------------------------------------------ Yahoo Finance
// Lets the terminal look up any US-listed stock without an API key. Profile
// data needs Yahoo's session cookie and crumb, which the default session keeps.
const YAHOO = 'https://query2.finance.yahoo.com';
/** A source that stops answering must not hold a screen in "loading" forever. */
const TIMEOUT_MS = 20_000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const ALLOWED = /^\/(v8\/finance\/chart\/[A-Za-z0-9.^=%-]+\?|v1\/finance\/search\?|v10\/finance\/quoteSummary\/[A-Za-z0-9.^=%-]+\?|v7\/finance\/quote\?|v7\/finance\/options\/[A-Za-z0-9.^=%-]+\?|ws\/fundamentals-timeseries\/v1\/finance\/timeseries\/[A-Za-z0-9.^=%-]+\?)/;
let crumb = null;

// Every data request revalidates with the server, so a refresh never shows a cached copy.
async function yahooFetch(url, json = true) {
  return net.fetch(url, { headers: { 'User-Agent': UA, ...(json ? { Accept: 'application/json' } : {}) }, credentials: 'include', cache: 'no-cache', signal: AbortSignal.timeout(TIMEOUT_MS) });
}

async function getCrumb(force) {
  if (crumb && !force) return crumb;
  // The cookie comes back on a 404 page; the crumb endpoint answers in plain text.
  await yahooFetch('https://fc.yahoo.com/', false).catch(() => undefined);
  const res = await yahooFetch(`${YAHOO}/v1/test/getcrumb`, false);
  if (!res.ok) throw new Error(`crumb ${res.status}`);
  crumb = (await res.text()).trim();
  return crumb;
}

ipcMain.handle('yahoo', async (event, path) => {
  if (!event.senderFrame || !event.senderFrame.url.startsWith('file://')) throw new Error('not allowed');
  if (typeof path !== 'string' || path.length > 4000 || !ALLOWED.test(path)) throw new Error('not allowed');
  // Quotes, options and company data need the session crumb; charts, search and statements do not.
  const needsCrumb = path.startsWith('/v10/') || path.startsWith('/v7/');
  for (let attempt = 0; attempt < 2; attempt++) {
    let url = YAHOO + path;
    if (needsCrumb) url += `&crumb=${encodeURIComponent(await getCrumb(attempt > 0))}`;
    const res = await yahooFetch(url);
    if (needsCrumb && attempt === 0 && (res.status === 401 || res.status === 403)) continue;
    if (!res.ok) return { status: res.status, data: null };
    return { status: res.status, data: await res.json() };
  }
  return { status: 401, data: null };
});

// ----------------------------------------------------------- US Treasury
// Official daily par yields for every tenor, one CSV per calendar year.
const TREASURY = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv';

ipcMain.handle('treasury', async (event, year) => {
  if (!event.senderFrame || !event.senderFrame.url.startsWith('file://')) throw new Error('not allowed');
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1990 || y > 2100) throw new Error('not allowed');
  const res = await net.fetch(`${TREASURY}/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`, { headers: { 'User-Agent': UA }, cache: 'no-cache', signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { status: res.status, text: res.ok ? await res.text() : '' };
});

// ---------------------------------------------------------- Official data
// Policy rates, funding rates, meeting calendars and government bond yields
// from central banks and finance ministries (public services, no keys). Each
// source is a fixed URL; the page only picks which one and a start date.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const EUROSTAT = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';
// The euro area under its current and possible future aggregate codes, and the largest members.
const EUROSTAT_GEO = ['EA', 'EA21', 'EA22', 'EA23', 'DE', 'FR', 'IT', 'ES', 'NL'].map((g) => `geo=${g}`).join('&');

function boeSeries(codes, since) {
  const [y, m, d] = since.split('-');
  return `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${d}/${MONTHS[Number(m) - 1]}/${y}&Dateto=now&SeriesCodes=${codes}&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`;
}

const OFFICIAL = {
  // New York Fed: effective fed funds with the target range, SOFR, and the latest of every reference rate.
  effr: (since, today) => `https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json?startDate=${since}&endDate=${today}`,
  sofr: () => 'https://markets.newyorkfed.org/api/rates/secured/sofr/last/1.json',
  nyfed: () => 'https://markets.newyorkfed.org/api/rates/all/latest.json',
  fomc: () => 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
  ecb: (since) => `https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.DFR.LEV?format=csvdata&startPeriod=${since}`,
  boe: (since) => boeSeries('IUDBEDR', since),
  boc: (since) => `https://www.bankofcanada.ca/valet/observations/V39079/json?start_date=${since}`,
  rba: () => 'https://www.rba.gov.au/statistics/tables/csv/f1-data.csv',
  snb: (since) => `https://data.snb.ch/api/cube/snbgwdzid/data/csv/en?fromDate=${since}`,
  bcb: (since) => {
    const [y, m, d] = since.split('-');
    return `https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=${d}/${m}/${y}`;
  },
  // Government bond yields, end of day.
  bunds: () => 'https://api.statistiken.bundesbank.de/rest/download/BBSIS/D.I.ZST.ZI.EUR.S1311.B.A604.R02XX+R05XX+R10XX+R30XX.R.A.A._Z._Z.A?format=csv&lang=en',
  gilts: (since) => boeSeries('IUDSNPY,IUDMNPY,IUDLNPY', since),
  jgb: () => 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv',
  jgbHistory: () => 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv',
  canadas: (since) => `https://www.bankofcanada.ca/valet/observations/group/bond_yields_benchmark/json?start_date=${since}`,
  acgb: () => 'https://www.rba.gov.au/statistics/tables/csv/f2-data.csv',
  // Official headline statistics: the ONS for the UK, Eurostat for the euro area and its members.
  ukcpi: () => 'https://www.ons.gov.uk/generator?format=csv&uri=/economy/inflationandpriceindices/timeseries/d7g7/mm23',
  ukgdp: () => 'https://www.ons.gov.uk/generator?format=csv&uri=/economy/grossdomesticproductgdp/timeseries/ihyr/qna',
  // JSON rather than CSV: it names the three months each Labour Force Survey figure covers.
  ukunemp: () => 'https://www.ons.gov.uk/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms/data',
  estatHicp: (since) => `${EUROSTAT}/prc_hicp_minr?format=JSON&lang=EN&${EUROSTAT_GEO}&coicop18=TOTAL&unit=RCH_A&sinceTimePeriod=${since.slice(0, 7)}`,
  estatUnemp: (since) => `${EUROSTAT}/une_rt_m?format=JSON&lang=EN&${EUROSTAT_GEO}&s_adj=SA&age=TOTAL&sex=T&unit=PC_ACT&sinceTimePeriod=${since.slice(0, 7)}`,
  estatGdp: (since) => `${EUROSTAT}/namq_10_gdp?format=JSON&lang=EN&${EUROSTAT_GEO}&na_item=B1GQ&unit=CLV_PCH_SM&s_adj=SCA&sinceTimePeriod=${since.slice(0, 4)}-Q1`,
};

ipcMain.handle('official', async (event, source, since) => {
  if (!event.senderFrame || !event.senderFrame.url.startsWith('file://')) throw new Error('not allowed');
  if (!Object.prototype.hasOwnProperty.call(OFFICIAL, source)) throw new Error('not allowed');
  if (typeof since !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error('not allowed');
  const url = OFFICIAL[source](since, new Date().toISOString().slice(0, 10));
  // Some statistics services answer large requests slowly; a stalled one still ends.
  const res = await net.fetch(url, { headers: { 'User-Agent': UA }, cache: 'no-cache', signal: AbortSignal.timeout(2 * TIMEOUT_MS) });
  return { status: res.status, text: res.ok ? await res.text() : '' };
});

// ------------------------------------------------------------------- FRED
// The St. Louis Fed's FRED: official US release dates and times, and the
// published values of a fixed set of series. FRED's bot filter turns away some
// user agents (an app name inside a browser string, or a bare name), so a
// request goes out as plain Electron first and as a self-identified client
// with the project's page second.
const FRED = 'https://fred.stlouisfed.org';
function fredAgents() {
  const plain = session.defaultSession.getUserAgent().replace(/ armin-terminal\/\S+/i, '');
  return [plain, `ArminTerminal/${app.getVersion()} (+https://github.com/arminshah/bloomberg-terminal)`];
}
const FRED_RELEASES = new Set([9, 10, 13, 27, 46, 50, 51, 53, 54, 95, 97, 180, 192]);
const FRED_SERIES = new Set([
  'PAYEMS', 'UNRATE', 'CPIAUCSL', 'CPIAUCNS', 'CPILFESL', 'CPILFENS', 'PPIFIS', 'RSAFS', 'INDPRO', 'HOUST', 'HSN1F',
  'DGORDER', 'AMTMNO', 'A191RL1Q225SBEA', 'A191RO1Q156NBEA', 'PCEPI', 'PCEPILFE', 'ICSA', 'JTSJOL', 'BOPGSTB',
  'LRHUTTTTJPM156S', 'JPNRGDPEXP', 'LRHUTTTTCAM156S', 'NGDPRSAXDCCAQ', 'LRHUTTTTAUM156S', 'NGDPRSAXDCAUQ',
]);

ipcMain.handle('fred', async (event, kind, arg, from) => {
  if (!fromApp(event)) throw new Error('not allowed');
  let url;
  if (kind === 'calendar') {
    // A window of dates rather than a whole year: a year of weekly releases runs past one page.
    const rid = Number(arg);
    if (!FRED_RELEASES.has(rid) || typeof from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new Error('not allowed');
    const to = new Date(Date.parse(`${from}T00:00:00Z`) + 150 * 86_400_000).toISOString().slice(0, 10);
    url = `${FRED}/releases/calendar?rid=${rid}&vs=${from}&ve=${to}`;
  } else if (kind === 'series') {
    const ids = typeof arg === 'string' ? arg.split(',') : [];
    // The graph service answers at most 12 series per request.
    if (!ids.length || ids.length > 12 || !ids.every((id) => FRED_SERIES.has(id))) throw new Error('not allowed');
    const from = new Date(Date.now() - 4 * 365.25 * 86_400_000).toISOString().slice(0, 10);
    url = `${FRED}/graph/fredgraph.csv?id=${ids.join(',')}&cosd=${ids.map(() => from).join(',')}`;
  } else throw new Error('not allowed');
  let last = { status: 0, text: '' };
  for (const agent of fredAgents()) {
    try {
      const res = await net.fetch(url, { headers: { 'User-Agent': agent }, cache: 'no-cache', signal: AbortSignal.timeout(15_000) });
      if (res.ok) return { status: res.status, text: await res.text() };
      last = { status: res.status, text: '' };
    } catch {
      /* the next agent is tried */
    }
  }
  return last;
});

// ------------------------------------------------------------------ Stream
// Relays Yahoo's streaming quotes for a window whose page cannot open the
// socket itself (some proxies). Only subscribe messages for ticker symbols pass.
const STREAM_URL = 'wss://streamer.finance.yahoo.com/?version=2';
const SYMBOL = /^[A-Za-z0-9.^=\-]{1,24}$/;
const streams = new Map();

function fromApp(event) {
  return !!event.senderFrame && event.senderFrame.url.startsWith('file://');
}

ipcMain.handle('stream:open', (event) => {
  if (!fromApp(event)) throw new Error('not allowed');
  const wc = event.sender;
  streams.get(wc.id)?.close();
  const ws = new WebSocket(STREAM_URL);
  streams.set(wc.id, ws);
  const post = (...args) => {
    if (!wc.isDestroyed()) wc.send('stream', ...args);
  };
  ws.onopen = () => post('open');
  ws.onmessage = (e) => post('message', String(e.data));
  ws.onclose = () => {
    if (streams.get(wc.id) === ws) streams.delete(wc.id);
    post('close');
  };
  ws.onerror = () => undefined; // a close event follows
  wc.once('destroyed', () => ws.close());
});

ipcMain.handle('stream:send', (event, msg) => {
  if (!fromApp(event) || typeof msg !== 'string' || msg.length > 20_000) throw new Error('not allowed');
  const parsed = JSON.parse(msg);
  const list = parsed && Array.isArray(parsed.subscribe) ? parsed.subscribe : null;
  if (!list || !list.every((x) => typeof x === 'string' && SYMBOL.test(x)) || Object.keys(parsed).length !== 1) throw new Error('not allowed');
  const ws = streams.get(event.sender.id);
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ subscribe: list }));
});

ipcMain.handle('stream:close', (event) => {
  if (!fromApp(event)) throw new Error('not allowed');
  streams.get(event.sender.id)?.close();
  streams.delete(event.sender.id);
});

function createWindow(id = nextId()) {
  const saved = loadState()[id] ?? {};
  const bounds = visible(saved.bounds);
  const win = new BrowserWindow({
    width: bounds?.width ?? 1600,
    height: bounds?.height ?? 1000,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 640,
    minHeight: 420,
    backgroundColor: '#000000',
    title: 'Armin Terminal',
    icon: fs.existsSync(ICON) ? ICON : undefined,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  windows.set(id, win);
  win.setMenu(null);
  if (saved.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());

  const index = path.join(__dirname, '..', 'dist', 'index.html');
  win.loadFile(index, id > 1 ? { query: { w: String(id) } } : undefined);

  // Links to news sources and data providers open in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    const key = input.key.toLowerCase();
    if (ctrl && input.shift && key === 'n') {
      e.preventDefault();
      createWindow();
    } else if (ctrl && input.shift && key === 'i') {
      e.preventDefault();
      win.webContents.toggleDevTools();
    } else if (ctrl && input.shift && key === 'f') {
      e.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    } else if (ctrl && input.shift && key === 'r') {
      e.preventDefault();
      win.webContents.reloadIgnoringCache();
    } else if (ctrl && (key === '=' || key === '+')) {
      e.preventDefault();
      win.webContents.setZoomLevel(Math.min(4, win.webContents.getZoomLevel() + 0.5));
    } else if (ctrl && key === '-') {
      e.preventDefault();
      win.webContents.setZoomLevel(Math.max(-3, win.webContents.getZoomLevel() - 0.5));
    } else if (ctrl && key === '0') {
      e.preventDefault();
      win.webContents.setZoomLevel(0);
    } else if (ctrl && key === 'w') {
      e.preventDefault();
      win.close();
    }
  });

  let saveTimer = null;
  const queueSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveState(id, win), 400);
  };
  win.on('resize', queueSave);
  win.on('move', queueSave);
  win.on('close', () => saveState(id, win));
  win.on('closed', () => windows.delete(id));
  return win;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Launching the app again opens another terminal window.
  app.on('second-instance', () => createWindow());
  app.whenReady().then(() => {
    // macOS needs a menu for Cmd+Q and the clipboard; other platforms get none.
    Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null);
    createWindow(1);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(1);
    });
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
