// Armin Terminal desktop shell (Windows, macOS, Linux).
// Loads the built web app from dist/ and gives it a native window. There is no
// menu bar: F1-F12 belong to the terminal's market sector keys, so window
// commands use Ctrl+Shift shortcuts instead.
const { app, BrowserWindow, Menu, ipcMain, net, shell, screen } = require('electron');
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

async function yahooFetch(url, json = true) {
  return net.fetch(url, { headers: { 'User-Agent': UA, ...(json ? { Accept: 'application/json' } : {}) }, credentials: 'include', signal: AbortSignal.timeout(TIMEOUT_MS) });
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
  const res = await net.fetch(`${TREASURY}/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { status: res.status, text: res.ok ? await res.text() : '' };
});

// ---------------------------------------------------------- Central banks
// Policy rates from the central banks' own public data services (no keys).
// Each source is a fixed URL; the page only picks which one and a start date.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const POLICY = {
  effr: (since, today) => `https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json?startDate=${since}&endDate=${today}`,
  sofr: () => 'https://markets.newyorkfed.org/api/rates/secured/sofr/last/1.json',
  ecb: (since) => `https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.DFR.LEV?format=csvdata&startPeriod=${since}`,
  boe: (since) => {
    const [y, m, d] = since.split('-');
    return `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${d}/${MONTHS[Number(m) - 1]}/${y}&Dateto=now&SeriesCodes=IUDBEDR&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`;
  },
  boc: (since) => `https://www.bankofcanada.ca/valet/observations/V39079/json?start_date=${since}`,
};

ipcMain.handle('policy', async (event, source, since) => {
  if (!event.senderFrame || !event.senderFrame.url.startsWith('file://')) throw new Error('not allowed');
  if (!Object.prototype.hasOwnProperty.call(POLICY, source)) throw new Error('not allowed');
  if (typeof since !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error('not allowed');
  const url = POLICY[source](since, new Date().toISOString().slice(0, 10));
  const res = await net.fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { status: res.status, text: res.ok ? await res.text() : '' };
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
