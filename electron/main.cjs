// Armin Terminal desktop shell (Windows, macOS, Linux).
// Loads the built web app from dist/ and gives it a native window. There is no
// menu bar: F1-F12 belong to the terminal's market sector keys, so window
// commands use Ctrl+Shift shortcuts instead.
const { app, BrowserWindow, Menu, ipcMain, net, session, shell, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const providers = require('./providers.cjs');

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

/** True for requests from the app's own pages (file://), the only ones allowed to ask for data. */
function fromApp(event) {
  return !!event.senderFrame && event.senderFrame.url.startsWith('file://');
}

/** Sends a request on behalf of `provider`, counting it and recording how it ended. */
async function tracked(provider, url, init) {
  providers.recordRequest(provider);
  try {
    const res = await net.fetch(url, init);
    providers.recordResult(provider, res.status);
    return res;
  } catch (err) {
    providers.recordResult(provider, 0, err);
    throw err;
  }
}

// ------------------------------------------------------- Provider status
// What each provider has done lately and which credentials are configured.
// Credential values never come back to the page.
ipcMain.handle('providers:status', (event) => {
  if (!fromApp(event)) throw new Error('not allowed');
  return { credentials: providers.credentialStatus(), settings: providers.settingStatus(), providers: providers.providerStats() };
});

// The settings as they were when the page loaded: screens decide at start which source owns each line.
ipcMain.on('providers:settings-sync', (event) => {
  event.returnValue = fromApp(event) ? Object.fromEntries(Object.entries(providers.settingStatus()).map(([k, v]) => [k, v.value])) : {};
});

ipcMain.handle('providers:setting', (event, name, value) => {
  if (!fromApp(event) || typeof name !== 'string' || typeof value !== 'boolean') throw new Error('not allowed');
  try {
    providers.saveSetting(name, value);
    return { ok: true, settings: providers.settingStatus() };
  } catch (err) {
    return { ok: false, error: String(err.message ?? err), settings: providers.settingStatus() };
  }
});

ipcMain.handle('providers:set', (event, name, value) => {
  if (!fromApp(event) || typeof name !== 'string' || typeof value !== 'string' || value.length > 400) throw new Error('not allowed');
  try {
    providers.saveCredential(name, value);
    return { ok: true, credentials: providers.credentialStatus() };
  } catch (err) {
    return { ok: false, error: String(err.message ?? err), credentials: providers.credentialStatus() };
  }
});

ipcMain.handle('providers:clear', (event, name) => {
  if (!fromApp(event) || typeof name !== 'string') throw new Error('not allowed');
  providers.clearCredential(name);
  return { ok: true, credentials: providers.credentialStatus() };
});

// ------------------------------------------------------------ Yahoo Finance
// Lets the terminal look up any US-listed stock without an API key. Profile
// data needs Yahoo's session cookie and crumb, which the default session keeps.
const YAHOO = 'https://query2.finance.yahoo.com';
/** A source that stops answering must not hold a screen in "loading" forever. */
const TIMEOUT_MS = 20_000;

/**
 * Who the app says it is. Yahoo gets Electron's own user agent, which names
 * this app, its Electron version and the Chromium engine that sends the
 * request (Yahoo turns away clients that do not look like a browser engine);
 * every other provider gets the app's name and its repository.
 */
function browserAgent() {
  return session.defaultSession.getUserAgent();
}
function clientAgent() {
  return `ArminTerminal/${app.getVersion()} (+https://github.com/arminshah/bloomberg-terminal)`;
}
// What the page may ask Yahoo for, and what is removed from the answers (electron/yahoo-scope.cjs).
const { ALLOWED, yahooRequest, withoutRestricted } = require('./yahoo-scope.cjs');

function yahooEnabled() {
  return providers.setting('YAHOO_PRICES_ENABLED').value;
}
let crumb = null;

// Every data request revalidates with the server, so a refresh never shows a cached copy.
async function yahooFetch(url, json = true) {
  return tracked('yahoo', url, { headers: { 'User-Agent': browserAgent(), ...(json ? { Accept: 'application/json' } : {}) }, credentials: 'include', cache: 'no-cache', signal: AbortSignal.timeout(TIMEOUT_MS) });
}

async function getCrumb(force) {
  if (crumb && !force) return crumb;
  // The cookie comes back on a 404 page (expected, so not recorded as a failure); the crumb endpoint answers in plain text.
  providers.recordRequest('yahoo');
  await net.fetch('https://fc.yahoo.com/', { headers: { 'User-Agent': browserAgent() }, credentials: 'include', cache: 'no-cache', signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => undefined);
  const res = await yahooFetch(`${YAHOO}/v1/test/getcrumb`, false);
  if (!res.ok) throw new Error(`crumb ${res.status}`);
  crumb = (await res.text()).trim();
  return crumb;
}

ipcMain.handle('yahoo', async (event, asked) => {
  if (!fromApp(event)) throw new Error('not allowed');
  if (typeof asked !== 'string' || asked.length > 4000 || !ALLOWED.test(asked)) throw new Error('not allowed');
  if (!yahooEnabled()) return { status: 0, data: null, disabled: true };
  const path = yahooRequest(asked);
  // Quotes, options and company data need the session crumb; charts, search and statements do not.
  const needsCrumb = path.startsWith('/v10/') || path.startsWith('/v7/');
  for (let attempt = 0; attempt < 2; attempt++) {
    let url = YAHOO + path;
    if (needsCrumb) url += `&crumb=${encodeURIComponent(await getCrumb(attempt > 0))}`;
    const res = await yahooFetch(url);
    if (needsCrumb && attempt === 0 && (res.status === 401 || res.status === 403)) continue;
    if (!res.ok) return { status: res.status, data: null };
    return { status: res.status, data: withoutRestricted(path, await res.json()) };
  }
  return { status: 401, data: null };
});

// ----------------------------------------------------------- US Treasury
// Official daily par yields for every tenor, one CSV per calendar year.
const TREASURY = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv';

ipcMain.handle('treasury', async (event, year) => {
  if (!fromApp(event)) throw new Error('not allowed');
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1990 || y > 2100) throw new Error('not allowed');
  const res = await tracked('treasury', `${TREASURY}/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`, { headers: { 'User-Agent': clientAgent() }, cache: 'no-cache', signal: AbortSignal.timeout(TIMEOUT_MS) });
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
  // Statistics Canada (Web Data Service): unemployment rate, seasonally adjusted (vector 2062815), and the
  // all-items CPI (vector 41690973), in one request.
  statcan: (since, today) => `https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorByReferencePeriodRange?vectorIds=%222062815%22,%2241690973%22&startRefPeriod=${since}&endReferencePeriod=${today}`,
  // Australian Bureau of Statistics (Data API): unemployment rate, seasonally adjusted, and the monthly CPI's
  // annual change, all groups, Australia.
  absUnemp: (since) => `https://data.api.abs.gov.au/rest/data/ABS,LF,1.0.0/M13.3.1599.20.AUS.M?startPeriod=${since.slice(0, 7)}&format=csv`,
  absCpi: (since) => `https://data.api.abs.gov.au/rest/data/ABS,CPI,2.0.0/3.10001.10.50.M?startPeriod=${since.slice(0, 7)}&format=csv`,
  // Official announcements for the news screens: each publisher's own RSS feed (headline, link, date).
  newsFed: () => 'https://www.federalreserve.gov/feeds/press_all.xml',
  newsEcb: () => 'https://www.ecb.europa.eu/rss/press.html',
  newsBoe: () => 'https://www.bankofengland.co.uk/rss/news',
  newsBoc: () => 'https://www.bankofcanada.ca/content_type/press-releases/feed/',
  newsRba: () => 'https://www.rba.gov.au/rss/rss-cb-media-releases.xml',
  newsBea: () => 'https://apps.bea.gov/rss/rss.xml',
  newsEsma: () => 'https://www.esma.europa.eu/rss.xml',
};

/** Which provider publishes each official source, for the status screen. */
const OFFICIAL_PROVIDER = {
  effr: 'nyfed', sofr: 'nyfed', nyfed: 'nyfed', fomc: 'fedboard', ecb: 'ecb', boe: 'boe', gilts: 'boe', boc: 'boc', canadas: 'boc',
  rba: 'rba', acgb: 'rba', snb: 'snb', bcb: 'bcb', bunds: 'bundesbank', jgb: 'mof', jgbHistory: 'mof',
  ukcpi: 'ons', ukgdp: 'ons', ukunemp: 'ons', estatHicp: 'eurostat', estatUnemp: 'eurostat', estatGdp: 'eurostat',
  statcan: 'statcan', absUnemp: 'abs', absCpi: 'abs',
  newsFed: 'fedboard', newsEcb: 'ecb', newsBoe: 'boe', newsBoc: 'boc', newsRba: 'rba', newsBea: 'bea', newsEsma: 'esma',
};

ipcMain.handle('official', async (event, source, since) => {
  if (!fromApp(event)) throw new Error('not allowed');
  if (!Object.prototype.hasOwnProperty.call(OFFICIAL, source)) throw new Error('not allowed');
  if (typeof since !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error('not allowed');
  const url = OFFICIAL[source](since, new Date().toISOString().slice(0, 10));
  // Some statistics services answer large requests slowly; a stalled one still ends.
  const res = await tracked(OFFICIAL_PROVIDER[source], url, { headers: { 'User-Agent': clientAgent() }, cache: 'no-cache', signal: AbortSignal.timeout(2 * TIMEOUT_MS) });
  return { status: res.status, text: res.ok ? await res.text() : '' };
});

// ------------------------------------------------------------------- FRED
// The St. Louis Fed's FRED API: scheduled release dates and the published
// values of a fixed set of series. FRED's terms ask applications to use the
// API with each user's own key, and its site terms rule out scraping, so
// nothing here reads the FRED website. Without a key the request is not sent.
const FRED_API = 'https://api.stlouisfed.org/fred';
const FRED_RELEASES = new Set([9, 10, 13, 27, 46, 50, 51, 53, 54, 95, 97, 180, 192]);
const FRED_SERIES = new Set([
  'PAYEMS', 'UNRATE', 'CPIAUCSL', 'CPIAUCNS', 'CPILFESL', 'CPILFENS', 'PPIFIS', 'RSAFS', 'INDPRO', 'HOUST', 'HSN1F',
  'DGORDER', 'AMTMNO', 'A191RL1Q225SBEA', 'A191RO1Q156NBEA', 'PCEPI', 'PCEPILFE', 'ICSA', 'JTSJOL', 'BOPGSTB',
  'LRHUTTTTJPM156S', 'JPNRGDPEXP', 'LRHUTTTTCAM156S', 'NGDPRSAXDCCAQ', 'LRHUTTTTAUM156S', 'NGDPRSAXDCAUQ',
]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

ipcMain.handle('fred', async (event, kind, arg, from) => {
  if (!fromApp(event)) throw new Error('not allowed');
  let url;
  if (kind === 'release-dates') {
    // Dates from `from` on, future scheduled ones included.
    const rid = Number(arg);
    if (!FRED_RELEASES.has(rid) || typeof from !== 'string' || !ISO_DATE.test(from)) throw new Error('not allowed');
    url = `${FRED_API}/release/dates?release_id=${rid}&realtime_start=${from}&include_release_dates_with_no_data=true&sort_order=asc&limit=1000&file_type=json`;
  } else if (kind === 'observations') {
    if (typeof arg !== 'string' || !FRED_SERIES.has(arg)) throw new Error('not allowed');
    const start = new Date(Date.now() - 4 * 365.25 * 86_400_000).toISOString().slice(0, 10);
    url = `${FRED_API}/series/observations?series_id=${arg}&observation_start=${start}&file_type=json`;
  } else throw new Error('not allowed');
  const key = providers.credential('FRED_API_KEY').value;
  if (!key) return { status: 0, text: '', missing: 'FRED_API_KEY' };
  if (!providers.CREDENTIALS.FRED_API_KEY.valid(key)) {
    const why = 'The configured key is not 32 lowercase letters and digits, so it was not sent.';
    providers.recordProblem('fred', 'not-entitled', why);
    return { status: 0, text: '', refused: why };
  }
  // API version 1, which takes the key as the api_key parameter. FRED allows up
  // to 120 requests a minute (its errors page); the app keeps to half that.
  await providers.slot('fred', 60, 60_000);
  const res = await tracked('fred', `${url}&api_key=${encodeURIComponent(key)}`, { headers: { 'User-Agent': clientAgent() }, cache: 'no-cache', signal: AbortSignal.timeout(20_000) });
  if (res.ok) return { status: res.status, text: await res.text() };
  // FRED explains a failure in the body, for example "The value for variable
  // api_key is not registered." Keep that explanation, without the key.
  const why = providers.providerMessage(await res.text().catch(() => ''), [key]);
  const refused = res.status === 400 && /api_key/i.test(why);
  if (why) providers.recordProblem('fred', refused ? 'not-entitled' : providers.errorKind(res.status), `HTTP ${res.status}: ${why}`);
  // 429 and 423: FRED is throttling; the caller stops and tries again later.
  return { status: res.status, text: '', ...(refused ? { refused: why } : {}), ...(res.status === 429 || res.status === 423 ? { throttled: true } : {}) };
});

// -------------------------------------------------------------- SEC EDGAR
// The SEC's company list, filing histories and XBRL company facts
// (electron/sec.cjs). Nothing is sent until the owner has configured a
// User-Agent with their own contact email; the app never makes one up.
const sec = require('./sec.cjs');
const secCache = new sec.SecCache(64_000_000);
const SEC_TICKERS_FILE = () => path.join(app.getPath('userData'), 'sec-company-tickers.json');

/** The company list survives restarts: it is about a megabyte and changes slowly. */
function secTickersFromDisk() {
  try {
    const saved = JSON.parse(fs.readFileSync(SEC_TICKERS_FILE(), 'utf8'));
    if (typeof saved?.at === 'number' && typeof saved?.text === 'string') secCache.set(sec.TICKERS_URL, saved.text, saved.at);
  } catch {
    /* not saved yet */
  }
}

ipcMain.handle('sec', async (event, kind, arg) => {
  if (!fromApp(event)) throw new Error('not allowed');
  const target = sec.secRequest(kind, arg || undefined);
  if (!target) throw new Error('not allowed');
  const ua = providers.credential('SEC_USER_AGENT').value;
  if (!ua) return { status: 0, text: '', missing: 'SEC_USER_AGENT' };
  if (!providers.CREDENTIALS.SEC_USER_AGENT.valid(ua)) {
    const why = 'The configured SEC User-Agent does not give an application name and a contact email, so nothing was sent.';
    providers.recordProblem('sec', 'not-entitled', why);
    return { status: 0, text: '', refused: why };
  }
  if (kind === 'tickers' && !secCache.get(target.url)) secTickersFromDisk();
  const kept = secCache.get(target.url);
  if (kept && Date.now() - kept.at < target.ttl) return { status: 200, text: kept.text, at: kept.at, cached: true };
  await providers.slot('sec', sec.PER_SECOND, 1000);
  let res;
  try {
    res = await tracked('sec', target.url, { headers: { 'User-Agent': ua, Accept: 'application/json' }, cache: 'no-cache', signal: AbortSignal.timeout(2 * TIMEOUT_MS) });
  } catch (err) {
    // A copy fetched earlier goes back marked stale, with its time; never as current.
    const error = String(err?.message ?? err).replace(/https?:\/\/\S+/g, '<url>').slice(0, 160);
    return kept ? { status: 0, text: kept.text, at: kept.at, stale: true, error } : { status: 0, text: '', error };
  }
  if (res.ok) {
    const text = await res.text();
    const at = Date.now();
    secCache.set(target.url, text, at);
    if (kind === 'tickers') {
      try {
        fs.writeFileSync(SEC_TICKERS_FILE(), JSON.stringify({ at, text }));
      } catch {
        /* kept in memory only */
      }
    }
    return { status: res.status, text, at };
  }
  if (res.status === 403 || res.status === 429) providers.recordProblem('sec', providers.errorKind(res.status), sec.refusalReason(res.status));
  // 404: the SEC has no such file, for example company facts for a filer without XBRL financial data.
  return kept ? { status: res.status, text: kept.text, at: kept.at, stale: true } : { status: res.status, text: '' };
});

// ----------------------------------------------------------------- Kraken
// Exchange-native crypto prices, candles and order books (electron/kraken.cjs).
// The page names a kind and a pair from a fixed list; the URL is built here.
// Kraken's Date header is kept: its tickers carry no time of their own, so the
// time the exchange answered is the time of the snapshot.
const kraken = require('./kraken.cjs');

ipcMain.handle('kraken', async (event, kind, arg, n) => {
  if (!fromApp(event)) throw new Error('not allowed');
  const url = kraken.krakenUrl(kind, arg, n);
  if (!url) throw new Error('not allowed');
  if (!providers.setting('KRAKEN_ENABLED').value) return { status: 0, text: '', disabled: true };
  await providers.slot('kraken', kraken.PER_SECOND, 1000);
  const res = await tracked('kraken', url, { headers: { 'User-Agent': clientAgent(), Accept: 'application/json' }, cache: 'no-cache', signal: AbortSignal.timeout(TIMEOUT_MS) });
  const serverTime = Date.parse(res.headers.get('date') ?? '');
  if (!res.ok) return { status: res.status, text: '' };
  const text = await res.text();
  const errors = kraken.krakenErrors(text);
  if (errors.length) providers.recordProblem('kraken', kraken.krakenErrorKind(errors), errors.join('; '));
  return { status: res.status, text, ...(Number.isFinite(serverTime) ? { serverTime } : {}) };
});

// -------------------------------------------------------------- CoinGecko
// Market capitalisation and circulating supply for the listed coins, from
// CoinGecko's free Demo plan with the owner's own key (10,000 calls a month,
// attribution required). Aggregated across exchanges: never used as a price.
const COINGECKO_IDS = 'bitcoin,ethereum,solana,ripple,cardano,dogecoin,avalanche-2,chainlink,litecoin,polkadot';

ipcMain.handle('coingecko', async (event) => {
  if (!fromApp(event)) throw new Error('not allowed');
  const key = providers.credential('COINGECKO_API_KEY').value;
  if (!key) return { status: 0, text: '', missing: 'COINGECKO_API_KEY' };
  // The app asks every 10 minutes at most (about 4,400 calls a month); the plan allows 100 a minute.
  await providers.slot('coingecko', 10, 60_000);
  const res = await tracked('coingecko', `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${COINGECKO_IDS}`, { headers: { 'User-Agent': clientAgent(), Accept: 'application/json', 'x-cg-demo-api-key': key }, cache: 'no-cache', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.ok) return { status: res.status, text: await res.text() };
  const why = providers.providerMessage(await res.text().catch(() => ''), [key]);
  if (why) providers.recordProblem('coingecko', providers.errorKind(res.status), `HTTP ${res.status}: ${why}`);
  return { status: res.status, text: '' };
});

// ------------------------------------------------------------------ Stream
// Relays Yahoo's streaming quotes for a window whose page cannot open the
// socket itself (some proxies). Only subscribe messages for ticker symbols pass.
const STREAM_URL = 'wss://streamer.finance.yahoo.com/?version=2';
const SYMBOL = /^[A-Za-z0-9.^=\-]{1,24}$/;
const streams = new Map();

ipcMain.handle('stream:open', (event) => {
  if (!fromApp(event)) throw new Error('not allowed');
  const wc = event.sender;
  if (!yahooEnabled()) {
    wc.send('stream', 'close');
    return;
  }
  streams.get(wc.id)?.close();
  providers.recordRequest('yahoo-stream');
  const ws = new WebSocket(STREAM_URL);
  streams.set(wc.id, ws);
  const post = (...args) => {
    if (!wc.isDestroyed()) wc.send('stream', ...args);
  };
  ws.onopen = () => {
    providers.recordResult('yahoo-stream', 200);
    post('open');
  };
  ws.onmessage = (e) => post('message', String(e.data));
  ws.onclose = (e) => {
    if (streams.get(wc.id) === ws) streams.delete(wc.id);
    if (e && e.code !== 1000) providers.recordProblem('yahoo-stream', 'network', `stream closed (code ${e.code})`);
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
    // With Yahoo prices switched off, nothing reaches Yahoo: not even the page's own streaming socket.
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['wss://streamer.finance.yahoo.com/*', 'https://*.yahoo.com/*'] }, (_details, done) => done({ cancel: !yahooEnabled() }));
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
