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
  const started = providers.recordRequest(provider);
  try {
    const res = await net.fetch(url, init);
    providers.recordResult(provider, res.status, undefined, started);
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

// Keys pasted as a list (PROVIDERS): each recognised one is saved encrypted; only names and reasons return.
ipcMain.handle('providers:import', (event, text) => {
  if (!fromApp(event) || typeof text !== 'string' || text.length > 10_000) throw new Error('not allowed');
  try {
    return { ok: true, ...providers.importCredentials(text), credentials: providers.credentialStatus() };
  } catch (err) {
    return { ok: false, error: String(err.message ?? err), saved: [], skipped: [], credentials: providers.credentialStatus() };
  }
});

ipcMain.handle('providers:clear', (event, name) => {
  if (!fromApp(event) || typeof name !== 'string') throw new Error('not allowed');
  providers.clearCredential(name);
  return { ok: true, credentials: providers.credentialStatus() };
});

// ---------------------------------------------------------------- Refresh
// The top bar's REFRESH (electron/refresh.cjs): for two minutes, answers kept here from before the click count as
// expired, so the page's requests reach the sources again. Sources with a daily allowance (the DAILY table in
// electron/providers.cjs) and TipRanks' monthly one keep answers younger than an hour; pacing and caps still apply.
const { createRefresh, WINDOW_MS: REFRESH_WINDOW_MS, KEEP_MS: REFRESH_KEEP_MS } = require('./refresh.cjs');
const ALLOWANCE_KEPT = [...Object.keys(providers.DAILY).filter((p) => p !== 'anthropic'), 'tipranks'];
const refresh = createRefresh({ capped: (provider) => ALLOWANCE_KEPT.includes(provider) });

ipcMain.handle('refresh', (event) => {
  if (!fromApp(event)) throw new Error('not allowed');
  return { at: refresh.mark(), windowMs: REFRESH_WINDOW_MS, keepMs: REFRESH_KEEP_MS, kept: ALLOWANCE_KEPT };
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
// Nasdaq's servers drop a request whose User-Agent names a web address (as clientAgent does) or Electron (as the
// browser's does): checked 20 October 2026, they reset the connection or never answer. A plain name and version passes.
function nasdaqAgent() {
  return `ArminTerminal/${app.getVersion()}`;
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
/** When Yahoo last refused to give a crumb. */
let crumbFailedAt = 0;

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
  const text = (await res.text()).trim();
  // A consent or error page instead of the short crumb string is a refusal too.
  if (!text || text.length > 64 || /[<{\s]/.test(text)) throw new Error('no crumb in the answer');
  crumb = text;
  crumbFailedAt = 0;
  return crumb;
}

ipcMain.handle('yahoo', async (event, asked) => {
  if (!fromApp(event)) throw new Error('not allowed');
  if (typeof asked !== 'string' || asked.length > 4000 || !ALLOWED.test(asked)) throw new Error('not allowed');
  if (!yahooEnabled()) return { status: 0, data: null, disabled: true };
  const research = providers.setting('YAHOO_RESEARCH_ENABLED').value;
  const path = yahooRequest(asked, research);
  // Quotes, options and company data need the session crumb; charts, search and statements do not.
  const needsCrumb = path.startsWith('/v10/') || path.startsWith('/v7/');
  // While Yahoo refuses the session (no cookie it accepts, as in the EU before its cookies are accepted), the
  // crumb is asked for again at most every two minutes, and the page is told why (`session: false`).
  if (needsCrumb && !crumb && Date.now() - crumbFailedAt < 120_000) return { status: 401, data: null, session: false };
  for (let attempt = 0; attempt < 2; attempt++) {
    let url = YAHOO + path;
    if (needsCrumb) {
      try {
        url += `&crumb=${encodeURIComponent(await getCrumb(attempt > 0))}`;
      } catch (err) {
        crumb = null;
        crumbFailedAt = Date.now();
        providers.recordProblem('yahoo', 'not-entitled', `Yahoo refused the session cookie (${String(err?.message ?? err).slice(0, 60)}): quotes and company data cannot load. In the EU, accept Yahoo's cookies once on PROVIDERS.`);
        return { status: 401, data: null, session: false };
      }
    }
    const res = await yahooFetch(url);
    if (needsCrumb && attempt === 0 && (res.status === 401 || res.status === 403)) continue;
    if (!res.ok) {
      if (needsCrumb && (res.status === 401 || res.status === 403)) {
        crumb = null;
        crumbFailedAt = Date.now();
        return { status: res.status, data: null, session: false };
      }
      return { status: res.status, data: null };
    }
    return { status: res.status, data: withoutRestricted(path, await res.json(), research) };
  }
  return { status: 401, data: null, session: false };
});

// ----------------------------------------------------------- US Treasury
// Official daily par yields for every tenor, one CSV per calendar year.
const TREASURY = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv';

ipcMain.handle('treasury', async (event, year) => {
  if (!fromApp(event)) throw new Error('not allowed');
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1990 || y > 2100) throw new Error('not allowed');
  // This official annual export can take longer than the quote services.
  const res = await tracked('treasury', `${TREASURY}/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`, { headers: { 'User-Agent': clientAgent(), Accept: 'text/csv' }, cache: 'no-cache', signal: AbortSignal.timeout(35_000) });
  return { status: res.status, text: res.ok ? await res.text() : '' };
});

// ---------------------------------------------------------- Official data
// Policy rates, funding rates, meeting calendars and government bond yields
// from central banks and finance ministries (public services, no keys). Each
// source is a fixed URL; the page only picks which one and a start date.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const { fetchFedPress } = require('./official-feeds.cjs');

const EUROSTAT = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';
// The euro area under its current and possible future aggregate codes, the largest members, and Belgium. With geo=BE
// all three requests below answered on 18 Oct 2026 with Belgium's figures: HICP 4.5% for Sep 2026, unemployment
// 5.9% for Aug 2026, GDP growth 0.5% for 2026 Q2 (flagged provisional).
const EUROSTAT_GEO = ['EA', 'EA21', 'EA22', 'EA23', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE'].map((g) => `geo=${g}`).join('&');

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
  // Only dated Board monetary-policy documents; no renderer-supplied URL is accepted.
  fedStatement: (date) => `https://www.federalreserve.gov/newsevents/pressreleases/monetary${date.replace(/-/g, '')}a.htm`,
  fedImplementation: (date) => `https://www.federalreserve.gov/newsevents/pressreleases/monetary${date.replace(/-/g, '')}a1.htm`,
  ecb: (since) => `https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.DFR.LEV?format=csvdata&startPeriod=${since}`,
  // The ECB's reference rates of every currency it publishes against the euro, for the ten days to a date: the rate of
  // that date, or of the last day before it with rates (none on weekends and TARGET holidays). PORTFOLIO's dated entries.
  ecbFx: (date) => {
    const start = new Date(Date.parse(`${date}T00:00:00Z`) - 10 * 86_400_000).toISOString().slice(0, 10);
    return `https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A?format=csvdata&startPeriod=${start}&endPeriod=${date}`;
  },
  boe: (since) => boeSeries('IUDBEDR', since),
  // The overnight benchmarks the ECB and the Bank of England publish: the euro short-term rate (ECB Data Portal,
  // dataset EST) and SONIA (Bank of England database, IUDSOIA).
  estr: (since) => `https://data-api.ecb.europa.eu/service/data/EST/B.EU000A2X2A25.WT?format=csvdata&startPeriod=${since}`,
  sonia: (since) => boeSeries('IUDSOIA', since),
  // The Bank of Japan's Time-Series Data Search API (no key; its notice asks for a credit line, shown where the
  // figures are): the basic loan rate, daily with every change (IR01, MADR1Z@D), and the uncollateralized overnight
  // call rate, the daily average (FM01, STRDCLUCON), which the Bank's policy guideline targets.
  bojLoan: (since) => `https://www.stat-search.boj.or.jp/api/v1/getDataCode?format=json&lang=en&db=IR01&startDate=${since.slice(0, 4)}${since.slice(5, 7)}&code=MADR1Z@D`,
  bojCall: (since) => `https://www.stat-search.boj.or.jp/api/v1/getDataCode?format=json&lang=en&db=FM01&startDate=${since.slice(0, 4)}${since.slice(5, 7)}&code=STRDCLUCON`,
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
  // The Bureau of Labor Statistics' public API, version 1 (no key; a small daily allowance per address): CPI for all
  // urban consumers, not seasonally adjusted (CUUR0000SA0), and the unemployment rate, seasonally adjusted
  // (LNS14000000) — the series FRED republishes as CPIAUCNS and UNRATE. Asked only when no FRED key is set.
  blsCpi: () => 'https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0',
  blsUnemp: () => 'https://api.bls.gov/publicAPI/v1/timeseries/data/LNS14000000',
  // Official announcements for the news screens: each publisher's own RSS feed (headline, link, date).
  newsFed: () => 'https://www.federalreserve.gov/feeds/press_all.xml',
  newsEcb: () => 'https://www.ecb.europa.eu/rss/press.html',
  newsBoe: () => 'https://www.bankofengland.co.uk/rss/news',
  newsBoc: () => 'https://www.bankofcanada.ca/content_type/press-releases/feed/',
  newsRba: () => 'https://www.rba.gov.au/rss/rss-cb-media-releases.xml',
  newsBea: () => 'https://apps.bea.gov/rss/rss.xml',
  newsEsma: () => 'https://www.esma.europa.eu/rss.xml',
  // Speeches and blog posts, the Bank of Japan's announcements, central bankers' speeches the BIS gathers, and the
  // SEC's press releases (asked with SEC_USER_AGENT, as the SEC requires).
  newsFedSpeeches: () => 'https://www.federalreserve.gov/feeds/speeches.xml',
  newsEcbBlog: () => 'https://www.ecb.europa.eu/rss/blog.html',
  newsBoj: () => 'https://www.boj.or.jp/en/rss/whatsnew.xml',
  newsBis: () => 'https://www.bis.org/doclist/cbspeeches.rss',
  newsSec: () => 'https://www.sec.gov/news/pressreleases.rss',
};

/** Which provider publishes each official source, for the status screen. */
const OFFICIAL_PROVIDER = {
  effr: 'nyfed', sofr: 'nyfed', nyfed: 'nyfed', fomc: 'fedboard', fedStatement: 'fedboard', fedImplementation: 'fedboard', ecb: 'ecb', ecbFx: 'ecb', estr: 'ecb', boe: 'boe', sonia: 'boe', bojLoan: 'boj', bojCall: 'boj', gilts: 'boe', boc: 'boc', canadas: 'boc',
  rba: 'rba', acgb: 'rba', snb: 'snb', bcb: 'bcb', bunds: 'bundesbank', jgb: 'mof', jgbHistory: 'mof',
  ukcpi: 'ons', ukgdp: 'ons', ukunemp: 'ons', estatHicp: 'eurostat', estatUnemp: 'eurostat', estatGdp: 'eurostat',
  statcan: 'statcan', absUnemp: 'abs', absCpi: 'abs', blsCpi: 'bls', blsUnemp: 'bls',
  newsFed: 'fedboard', newsEcb: 'ecb', newsBoe: 'boe', newsBoc: 'boc', newsRba: 'rba', newsBea: 'bea', newsEsma: 'esma',
  newsFedSpeeches: 'fedboard', newsEcbBlog: 'ecb', newsBoj: 'boj', newsBis: 'bis', newsSec: 'sec',
};

ipcMain.handle('official', async (event, source, since) => {
  if (!fromApp(event)) throw new Error('not allowed');
  if (!Object.prototype.hasOwnProperty.call(OFFICIAL, source)) throw new Error('not allowed');
  if (typeof since !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error('not allowed');
  const url = OFFICIAL[source](since, new Date().toISOString().slice(0, 10));
  if (source === 'newsFed') {
    const answer = await fetchFedPress((url, init) => tracked('fedboard', url, init), { headers: { 'User-Agent': clientAgent() }, cache: 'no-cache', signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (answer.error) providers.recordProblem('fedboard', 'schema-changed', answer.error);
    return answer;
  }
  if (source === 'newsSec') {
    // The SEC wants every automated client to name itself and a contact: without SEC_USER_AGENT nothing is sent.
    const agent = providers.credential('SEC_USER_AGENT').value;
    if (!agent || !providers.CREDENTIALS.SEC_USER_AGENT.valid(agent)) return { status: 0, text: '', missing: 'SEC_USER_AGENT' };
    await providers.slot('sec', sec.PER_SECOND, 1000);
    const res = await tracked('sec', url, { headers: { 'User-Agent': agent, Accept: 'application/rss+xml, application/xml' }, cache: 'no-cache', signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { status: res.status, text: res.ok ? await res.text() : '' };
  }
  // Some statistics services answer large requests slowly; a stalled one still ends.
  const res = await tracked(OFFICIAL_PROVIDER[source], url, { headers: { 'User-Agent': clientAgent(), ...(source === 'ecb' || source === 'ecbFx' || source === 'estr' ? { Accept: 'text/csv' } : {}) }, cache: 'no-cache', signal: AbortSignal.timeout(2 * TIMEOUT_MS) });
  return { status: res.status, text: res.ok ? await res.text() : '', at: Date.now(), url };
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
  // The macro dashboard (MACRO): policy rate, Treasury yields and spreads, money, credit spreads, financial
  // conditions and recession indicators.
  'EFFR', 'DFEDTARU', 'DFEDTARL', 'DGS2', 'DGS10', 'DGS30', 'T10Y2Y', 'T10Y3M', 'M2SL', 'BAMLC0A0CM', 'BAMLH0A0HYM2',
  'NFCI', 'STLFSI4', 'SAHMREALTIME', 'USREC',
]);
// Series whose first releases the app compares with today's values (ALFRED vintages): payrolls and GDP growth.
const FRED_FIRST_RELEASE = new Set(['PAYEMS', 'A191RL1Q225SBEA']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// The economic data chart (ECOW): FRED's search, series descriptions and transformed observations (electron/fred.cjs).
const { fredChartUrl } = require('./fred.cjs');

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
  } else if (kind === 'first-release') {
    // output_type 4: "Observations, Initial Release Only", over every vintage; each value's realtime_start is
    // the day it was first published.
    if (typeof arg !== 'string' || !FRED_FIRST_RELEASE.has(arg)) throw new Error('not allowed');
    const start = new Date(Date.now() - 2 * 365.25 * 86_400_000).toISOString().slice(0, 10);
    url = `${FRED_API}/series/observations?series_id=${arg}&observation_start=${start}&output_type=4&realtime_start=1776-07-04&realtime_end=9999-12-31&file_type=json`;
  } else {
    url = fredChartUrl(kind, arg, from);
    if (!url) throw new Error('not allowed');
  }
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
  // A refresh asks again for filing lists and company facts; the company list and filed documents do not change.
  const refreshed = (kind === 'submissions' || kind === 'facts') && kept && refresh.expired('sec', kept.at);
  if (kept && Date.now() - kept.at < target.ttl && !refreshed) return { status: 200, text: kept.text, at: kept.at, cached: true };
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

// SPLC: the sentences of an annual report that name a company ('mentions'), or that name the filer's own
// customers, suppliers and competitors ('own'). The document is read here and only the sentences go to the
// page; they are kept a month on disk (a filed document never changes).
const supply = require('./supply-chain.cjs');
const supplyStore = new supply.SentenceStore();
const SUPPLY_FILE = () => path.join(app.getPath('userData'), 'supply-chain-sentences.json');
let supplyLoaded = false;
let supplySave = null;

function supplyFromDisk() {
  if (supplyLoaded) return;
  supplyLoaded = true;
  try {
    supplyStore.load(JSON.parse(fs.readFileSync(SUPPLY_FILE(), 'utf8')));
  } catch {
    /* nothing saved yet */
  }
}

function supplyToDisk() {
  if (supplySave) return;
  supplySave = setTimeout(() => {
    supplySave = null;
    try {
      fs.writeFileSync(SUPPLY_FILE(), JSON.stringify(supplyStore));
    } catch {
      /* kept in memory only */
    }
  }, 5000);
}

// The Summary Compensation Table of a proxy statement (electron/proxy-pay.cjs): each named executive's salary and
// total pay by year. Proxy statements do not change; one is read once a session.
const proxyPay = require('./proxy-pay.cjs');
const payKept = new Map();
ipcMain.handle('sec-pay', async (event, docPath) => {
  const url = supply.docUrl(docPath);
  if (!fromApp(event) || !url) throw new Error('not allowed');
  const ua = providers.credential('SEC_USER_AGENT').value;
  if (!ua) return { status: 0, executives: [], missing: 'SEC_USER_AGENT' };
  if (!providers.CREDENTIALS.SEC_USER_AGENT.valid(ua)) return { status: 0, executives: [], refused: 'The configured SEC User-Agent does not give an application name and a contact email, so nothing was sent.' };
  const kept = payKept.get(docPath);
  if (kept) return { status: 200, executives: kept.executives, at: kept.at, cached: true };
  await providers.slot('sec', sec.PER_SECOND, 1000);
  let res;
  try {
    res = await tracked('sec', url, { headers: { 'User-Agent': ua, Accept: 'text/html' }, cache: 'no-cache', signal: AbortSignal.timeout(3 * TIMEOUT_MS) });
  } catch (err) {
    return { status: 0, executives: [], error: String(err?.message ?? err).replace(/https?:\/\/\S+/g, '<url>').slice(0, 160) };
  }
  if (!res.ok) {
    if (res.status === 403 || res.status === 429) providers.recordProblem('sec', providers.errorKind(res.status), sec.refusalReason(res.status));
    return { status: res.status, executives: [] };
  }
  const executives = proxyPay.parseSummaryCompensation(await res.text()) ?? [];
  const at = Date.now();
  payKept.set(docPath, { at, executives });
  if (payKept.size > 50) payKept.delete(payKept.keys().next().value);
  return { status: 200, executives, at };
});

ipcMain.handle('sec-text', async (event, kind, docPath, names) => {
  if (!fromApp(event)) throw new Error('not allowed');
  const url = supply.docUrl(docPath);
  const clean = kind === 'mentions' ? supply.cleanNames(names) : [];
  if ((kind !== 'mentions' && kind !== 'own') || !url || !clean) throw new Error('not allowed');
  const ua = providers.credential('SEC_USER_AGENT').value;
  if (!ua) return { status: 0, sentences: [], missing: 'SEC_USER_AGENT' };
  if (!providers.CREDENTIALS.SEC_USER_AGENT.valid(ua)) return { status: 0, sentences: [], refused: 'The configured SEC User-Agent does not give an application name and a contact email, so nothing was sent.' };
  supplyFromDisk();
  const key = supplyStore.key(kind, docPath, clean);
  const kept = supplyStore.get(key);
  if (kept) return { status: 200, sentences: kept.sentences, at: kept.at, cached: true };
  await providers.slot('sec', sec.PER_SECOND, 1000);
  let res;
  try {
    res = await tracked('sec', url, { headers: { 'User-Agent': ua, Accept: 'text/html' }, cache: 'no-cache', signal: AbortSignal.timeout(3 * TIMEOUT_MS) });
  } catch (err) {
    return { status: 0, sentences: [], error: String(err?.message ?? err).replace(/https?:\/\/\S+/g, '<url>').slice(0, 160) };
  }
  if (!res.ok) {
    if (res.status === 403 || res.status === 429) providers.recordProblem('sec', providers.errorKind(res.status), sec.refusalReason(res.status));
    return { status: res.status, sentences: [] };
  }
  const text = supply.htmlToText(await res.text());
  const sentences = kind === 'own' ? supply.ownSentences(text) : supply.mentionSentences(text, clean);
  const at = Date.now();
  supplyStore.set(key, { at, sentences });
  supplyToDisk();
  return { status: res.status, sentences, at };
});

// Form 13F (electron/thirteenf.cjs): a filing's cover page alone ('cover', for the value of each quarter), or with
// its information table ('holdings'), added up per security. A table can be tens of megabytes (a bank's), so it is
// read here and only the holdings go to the page. A filing never changes; one is read once a session.
const thirteenF = require('./thirteenf.cjs');
const thirteenKept = new Map();

/** One file from sec.gov's archive, for a handler that reads it here: its text, or why there is none. */
async function secArchiveFile(url, ua, accept) {
  await providers.slot('sec', sec.PER_SECOND, 1000);
  let res;
  try {
    res = await tracked('sec', url, { headers: { 'User-Agent': ua, Accept: accept }, cache: 'no-cache', signal: AbortSignal.timeout(3 * TIMEOUT_MS) });
  } catch (err) {
    return { status: 0, error: String(err?.message ?? err).replace(/https?:\/\/\S+/g, '<url>').slice(0, 160) };
  }
  if (!res.ok) {
    if (res.status === 403 || res.status === 429) providers.recordProblem('sec', providers.errorKind(res.status), sec.refusalReason(res.status));
    return { status: res.status };
  }
  return { status: res.status, text: await res.text() };
}

ipcMain.handle('sec-13f', async (event, cik, accession, part) => {
  const folder = thirteenF.folderPath(cik, accession);
  if (!fromApp(event) || !folder || (part !== 'cover' && part !== 'holdings')) throw new Error('not allowed');
  const ua = providers.credential('SEC_USER_AGENT').value;
  if (!ua) return { status: 0, missing: 'SEC_USER_AGENT' };
  if (!providers.CREDENTIALS.SEC_USER_AGENT.valid(ua)) return { status: 0, refused: 'The configured SEC User-Agent does not give an application name and a contact email, so nothing was sent.' };
  const kept = thirteenKept.get(`${folder}:${part}`) ?? (part === 'cover' ? thirteenKept.get(`${folder}:holdings`) : undefined);
  if (kept) return { status: 200, ...kept, cached: true };
  const base = `https://www.sec.gov/Archives/edgar/data/${folder}`;
  // Every 13F filed in XML (from the second quarter of 2013) has its cover as primary_doc.xml.
  const coverFile = await secArchiveFile(`${base}/primary_doc.xml`, ua, 'application/xml');
  if (coverFile.text == null) return { status: coverFile.status, ...(coverFile.error ? { error: coverFile.error } : {}) };
  const cover = thirteenF.parseCover(coverFile.text);
  if (!cover) return { status: 200, unreadable: 'cover' };
  let out = { cover, at: Date.now() };
  if (part === 'holdings' && !/NOTICE/i.test(cover.reportType)) {
    const index = await secArchiveFile(`${base}/index.json`, ua, 'application/json');
    if (index.text == null) return { status: index.status, ...(index.error ? { error: index.error } : {}) };
    let names = [];
    try {
      const items = JSON.parse(index.text)?.directory?.item;
      names = Array.isArray(items) ? items.map((x) => String(x?.name ?? '')) : [];
    } catch {
      /* no list: no table */
    }
    let table = null;
    let file = '';
    for (const name of thirteenF.tableCandidates(names).slice(0, 3)) {
      const got = await secArchiveFile(`${base}/${name}`, ua, 'application/xml');
      if (got.text == null) return { status: got.status, ...(got.error ? { error: got.error } : {}) };
      table = thirteenF.parseInfoTable(got.text);
      if (table) {
        file = name;
        break;
      }
    }
    if (!table) return { status: 200, cover, unreadable: 'table' };
    out = { cover, ...table, file, at: out.at };
  }
  thirteenKept.set(`${folder}:${part}`, out);
  // About forty filings; a bank's holdings can be tens of thousands of lines, so fewer of those.
  const size = () => [...thirteenKept.values()].reduce((a, v) => a + 1 + (v.holdings?.length ?? 0), 0);
  while (thirteenKept.size > 1 && (thirteenKept.size > 40 || size() > 150_000)) thirteenKept.delete(thirteenKept.keys().next().value);
  return { status: 200, ...out };
});

// OpenFIGI (electron/openfigi.cjs): the US ticker for each CUSIP the page asks about, kept a week on disk. It answers
// without a key at lower limits; the owner's key, when set, raises them.
const openfigi = require('./openfigi.cjs');
const figiStore = new openfigi.FigiStore();
const FIGI_FILE = () => path.join(app.getPath('userData'), 'openfigi-cusips.json');
let figiLoaded = false;
let figiSave = null;

function figiFromDisk() {
  if (figiLoaded) return;
  figiLoaded = true;
  try {
    figiStore.load(JSON.parse(fs.readFileSync(FIGI_FILE(), 'utf8')));
  } catch {
    /* nothing saved yet */
  }
}

function figiToDisk() {
  if (figiSave) return;
  figiSave = setTimeout(() => {
    figiSave = null;
    try {
      fs.writeFileSync(FIGI_FILE(), JSON.stringify(figiStore));
    } catch {
      /* kept in memory only */
    }
  }, 5000);
}

ipcMain.handle('openfigi', async (event, codes) => {
  const asked = openfigi.cleanCodes(codes);
  if (!fromApp(event) || !asked) throw new Error('not allowed');
  if (!providers.setting('OPENFIGI_ENABLED').value) return { status: 0, results: {}, gated: 'OPENFIGI_ENABLED' };
  figiFromDisk();
  const results = {};
  const due = [];
  for (const c of asked) {
    const e = figiStore.get(c);
    if (e) results[c] = e.value;
    else due.push(c);
  }
  if (!due.length) return { status: 200, results, cached: true };
  const key = providers.credential('OPENFIGI_API_KEY').value;
  const keyed = !!key && providers.CREDENTIALS.OPENFIGI_API_KEY.valid(key);
  if (key && !keyed) providers.recordProblem('openfigi', 'not-entitled', 'The configured OPENFIGI_API_KEY has the wrong format, so it was not sent; the app asks without a key, at the lower limits.');
  const limit = keyed ? openfigi.LIMITS.keyed : openfigi.LIMITS.open;
  let status = 200;
  let error;
  for (let i = 0; i < due.length; i += limit.jobs) {
    const batch = due.slice(i, i + limit.jobs);
    await providers.slot('openfigi', limit.perMinute, 60_000);
    let res;
    try {
      res = await tracked('openfigi', openfigi.MAPPING_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(keyed ? { 'X-OPENFIGI-APIKEY': key } : {}) },
        body: JSON.stringify(openfigi.mappingJobs(batch)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      status = 0;
      error = String(err?.message ?? err).replace(/https?:\/\/\S+/g, '<url>').slice(0, 160);
      break;
    }
    if (!res.ok) {
      status = res.status;
      if (res.status === 429) providers.recordProblem('openfigi', 'rate-limited', 'HTTP 429: OpenFIGI asked the app to slow down.');
      else if (res.status === 401 || res.status === 403) providers.recordProblem('openfigi', 'not-entitled', `HTTP ${res.status}: OpenFIGI refused the API key.`);
      break;
    }
    const parsed = openfigi.parseMapping(await res.text(), batch);
    if (!parsed) {
      error = 'OpenFIGI answered in a format the app does not recognise.';
      break;
    }
    const at = Date.now();
    for (const c of batch) {
      results[c] = parsed[c];
      figiStore.set(c, parsed[c], at);
    }
  }
  figiToDisk();
  return { status, results, keyed, ...(error ? { error } : {}) };
});

// The IMF's World Economic Outlook through its DataMapper API, and goods trade by partner through its SDMX API
// (electron/imf.cjs), no key: ECFC and ECTR.
const imf = require('./imf.cjs');
ipcMain.handle('imf', async (event, kind, arg) => {
  const req = imf.imfRequest(kind, arg);
  if (!fromApp(event) || !req) throw new Error('not allowed');
  return keyedGet('imf', req.url, { Accept: 'application/json' }, req.ttl, [30, 60_000], []);
});

// Bills, laws and one bill's details from Congress.gov's API (electron/congressgov.cjs), with the owner's key in the
// X-Api-Key header: BILL.
const congressGov = require('./congressgov.cjs');
ipcMain.handle('congress-gov', async (event, kind, arg) => {
  const req = congressGov.congressGovRequest(kind, arg);
  if (!fromApp(event) || !req) throw new Error('not allowed');
  const key = usableKey('CONGRESS_GOV_API_KEY', 'congressgov');
  if (!key.value) return { status: 0, text: '', ...key };
  return keyedGet('congressgov', req.url, { 'X-Api-Key': key.value, Accept: 'application/json' }, req.ttl, [60, 60_000], [key.value]);
});

// USAspending.gov (SPLC): a company's federal contracts and subcontracts, kept 12 hours. The API needs no key; it
// answers 503 or drops the connection at times, so a request is tried four times, waiting 2, 4 and 8 seconds.
const usaspending = require('./usaspending.cjs');
const usaspendingKept = new Map();
ipcMain.handle('usaspending', async (event, kind, arg) => {
  const req = usaspending.usaspendingRequest(kind, arg);
  if (!fromApp(event) || !req) throw new Error('not allowed');
  const key = `${kind}|${arg}`;
  const kept = usaspendingKept.get(key);
  if (kept && Date.now() - kept.at < 12 * 3_600_000) return { ...kept.value, cached: true };
  let last = { status: 0, rows: [], error: 'no answer' };
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const init = req.method === 'POST' ? { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': clientAgent() }, body: JSON.stringify(req.body) } : { headers: { Accept: 'application/json', 'User-Agent': clientAgent() } };
      const res = await tracked('usaspending', req.url, { ...init, signal: AbortSignal.timeout(2 * TIMEOUT_MS) });
      if (!res.ok) {
        last = { status: res.status, rows: [] };
        if (res.status < 500) break;
      } else {
        const rows = usaspending.parseUsaspending(kind, await res.text());
        if (!rows) {
          providers.recordProblem('usaspending', 'schema-changed', 'USAspending answered in a format the app does not recognise.');
          return { status: res.status, rows: [], error: 'format' };
        }
        const value = { status: 200, rows };
        if (usaspendingKept.size > 400) usaspendingKept.delete(usaspendingKept.keys().next().value);
        usaspendingKept.set(key, { at: Date.now(), value });
        return value;
      }
    } catch (err) {
      last = { status: 0, rows: [], error: String(err?.message ?? err).replace(/https?:\/\/\S+/g, '<url>').slice(0, 160) };
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
  return last;
});

// A US stock's listings in other countries from OpenFIGI (RELS): two mapping requests, kept a day.
const figiListings = new Map();
ipcMain.handle('openfigi-listings', async (event, ticker) => {
  const t = openfigi.usTicker(ticker);
  if (!fromApp(event) || !t) throw new Error('not allowed');
  if (!providers.setting('OPENFIGI_ENABLED').value) return { status: 0, listings: [], gated: 'OPENFIGI_ENABLED' };
  const kept = figiListings.get(t);
  if (kept && Date.now() - kept.at < 86_400_000) return { ...kept.value, cached: true };
  const key = providers.credential('OPENFIGI_API_KEY').value;
  const keyed = !!key && providers.CREDENTIALS.OPENFIGI_API_KEY.valid(key);
  const limit = keyed ? openfigi.LIMITS.keyed : openfigi.LIMITS.open;
  const ask = async (jobs) => {
    await providers.slot('openfigi', limit.perMinute, 60_000);
    const res = await tracked('openfigi', openfigi.MAPPING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(keyed ? { 'X-OPENFIGI-APIKEY': key } : {}) },
      body: JSON.stringify(jobs),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 429) providers.recordProblem('openfigi', 'rate-limited', 'HTTP 429: OpenFIGI asked the app to slow down.');
    return { status: res.status, text: res.ok ? await res.text() : '' };
  };
  try {
    const first = await ask(openfigi.tickerJobs(t));
    if (!first.text) return { status: first.status, listings: [] };
    const share = openfigi.shareClassOf(first.text);
    if (!share) return { status: 200, listings: [], none: true };
    const second = await ask(openfigi.shareClassJobs(share.shareClassFIGI));
    const listings = second.text ? openfigi.compositesOf(second.text) : null;
    if (!listings) return { status: second.status || 0, listings: [], error: second.text ? 'OpenFIGI answered in a format the app does not recognise.' : undefined };
    const value = { status: 200, listings, shareClassFIGI: share.shareClassFIGI, name: share.name };
    figiListings.set(t, { at: Date.now(), value });
    return value;
  } catch (err) {
    return { status: 0, listings: [], error: String(err?.message ?? err).replace(/https?:\/\/\S+/g, '<url>').slice(0, 160) };
  }
});

// Congress (electron/congress.cjs): the member lists of the House Clerk and the Senate, the House Clerk's yearly index
// of financial disclosures, each trade report (PTR) and annual report read from its PDF (kept on disk: a filed
// report never changes; a correction is a new filing), and FMP's latest trades of each chamber with the owner's key,
// kept as they arrive. The Clerk is asked at most four times a second.
const congress = require('./congress.cjs');
const pdfText = require('./pdf-text.cjs');
const CONGRESS_FILE = () => path.join(app.getPath('userData'), 'congress-reports.json');
const CONGRESS_FMP_FILE = () => path.join(app.getPath('userData'), 'congress-fmp-trades.json');
const congressKept = new Map();
let congressReports = null;
let congressSave = null;
const fmpTradeLog = new congress.FmpTradeLog();
let fmpTradeLogLoaded = false;

function congressFromDisk() {
  if (congressReports) return congressReports;
  congressReports = { ptr: {}, annual: {} };
  try {
    const saved = JSON.parse(fs.readFileSync(CONGRESS_FILE(), 'utf8'));
    if (saved?.v === congress.READER_VERSION && saved.ptr && saved.annual) congressReports = { ptr: saved.ptr, annual: saved.annual };
  } catch {
    /* nothing saved yet */
  }
  return congressReports;
}

function congressToDisk() {
  if (congressSave) return;
  congressSave = setTimeout(() => {
    congressSave = null;
    try {
      fs.writeFileSync(CONGRESS_FILE(), JSON.stringify({ v: congress.READER_VERSION, ...congressReports }));
    } catch {
      /* kept in memory only */
    }
  }, 5000);
}

/** One file from the House Clerk or the Senate, as bytes; or why there is none. */
async function congressFile(provider, url, accept, maxBytes) {
  await providers.slot(provider, 4, 1000);
  let res;
  try {
    res = await tracked(provider, url, { headers: { 'User-Agent': clientAgent(), Accept: accept }, cache: 'no-cache', signal: AbortSignal.timeout(3 * TIMEOUT_MS) });
  } catch (err) {
    return { status: 0, error: String(err?.message ?? err).replace(/https?:\/\/\S+/g, '<url>').slice(0, 160) };
  }
  if (!res.ok) return { status: res.status };
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > maxBytes) return { status: res.status, error: 'the file is larger than the app reads' };
  return { status: res.status, bytes };
}

function fmpTradeLogFromDisk() {
  if (fmpTradeLogLoaded) return;
  fmpTradeLogLoaded = true;
  try {
    fmpTradeLog.load(JSON.parse(fs.readFileSync(CONGRESS_FMP_FILE(), 'utf8')));
  } catch {
    /* nothing kept yet */
  }
}

/** FMP's latest trades of a chamber, added to the log; the answer carries the whole log of that chamber. */
async function fmpCongress(chamber) {
  fmpTradeLogFromDisk();
  const kept = () => ({ rows: fmpTradeLog.rows.filter((r) => r.chamber === chamber), gaps: fmpTradeLog.gaps.filter((g) => g.chamber === chamber), since: fmpTradeLog.since[chamber] ?? null });
  if (!providers.setting('FMP_ENABLED').value) return { status: 0, gated: 'FMP_ENABLED', ...kept() };
  const key = usableKey('FMP_API_KEY', 'fmp');
  if (!key.value) return { status: 0, ...(key.missing ? { missing: key.missing } : { refused: key.refused }), ...kept() };
  const req = fmp.fmpCongressRequest(chamber, key.value);
  const res = await keyedGet('fmp', req.url, {}, req.ttl, [30, 60_000], [key.value]);
  if (res.text && !res.stale) {
    try {
      const list = JSON.parse(res.text);
      if (Array.isArray(list) && fmpTradeLog.add(chamber, list)) fs.writeFileSync(CONGRESS_FMP_FILE(), JSON.stringify(fmpTradeLog));
    } catch {
      /* not a list: the status says why */
    }
  }
  const rest = { ...res };
  delete rest.text;
  return { ...rest, ...kept() };
}

let fmpCongressTimer = null;
function watchFmpCongress() {
  if (fmpCongressTimer) return;
  fmpCongressTimer = setInterval(() => {
    void fmpCongress('senate').then(() => fmpCongress('house')).catch(() => {});
  }, 6 * 3_600_000);
}
// A log kept on disk means the screen was opened before: keep watching from the start.
app.whenReady().then(() => {
  if (fs.existsSync(CONGRESS_FMP_FILE())) watchFmpCongress();
});

ipcMain.handle('congress', async (event, kind, arg) => {
  if (!fromApp(event)) throw new Error('not allowed');
  if (kind === 'members') {
    const kept = congressKept.get('members');
    if (kept && Date.now() - kept.at < 24 * 3_600_000) return { status: 200, ...kept, cached: true };
    // The Clerk answers HTTP 406 to "Accept: application/xml" (checked 25 October 2026); it serves text/xml.
    const xml = 'text/xml, application/xml;q=0.9, */*;q=0.8';
    const [h, s] = await Promise.all([congressFile('house-clerk', congress.MEMBERS_URL, xml, 5_000_000), congressFile('senate', congress.SENATORS_URL, xml, 2_000_000)]);
    const house = h.bytes ? congress.parseHouseMembers(h.bytes.toString('utf8')) : null;
    const senate = s.bytes ? congress.parseSenators(s.bytes.toString('utf8')) : null;
    if (!house && !senate) return { status: h.status || s.status, error: h.error ?? s.error ?? 'The member lists could not be read.' };
    const out = { house: house ?? [], senate: senate ?? [], at: Date.now(), ...(!house || !senate ? { partial: true } : {}) };
    if (house && senate) congressKept.set('members', out);
    return { status: 200, ...out };
  }
  if (kind === 'index') {
    const year = congress.filingYear(arg);
    if (!year) throw new Error('not allowed');
    const key = `index:${year}`;
    const kept = congressKept.get(key);
    // This year's and last year's lists grow as members file (annual reports for a year come the May after it).
    if (kept && Date.now() - kept.at < (year >= new Date().getUTCFullYear() - 1 ? 6 : 7 * 24) * 3_600_000) return { status: 200, ...kept, cached: true };
    const got = await congressFile('house-clerk', congress.indexUrl(year), 'application/zip', 20_000_000);
    if (!got.bytes) return { status: got.status, ...(got.error ? { error: got.error } : {}) };
    const txt = congress.unzipFile(got.bytes, `${year}FD.txt`);
    const filings = txt ? congress.parseHouseIndex(txt.toString('utf8')) : null;
    if (!filings) return { status: 200, error: "The House Clerk's index is not in the format the app reads." };
    const out = { year, filings, at: Date.now() };
    congressKept.set(key, out);
    return { status: 200, ...out };
  }
  if (kind === 'ptr' || kind === 'annual') {
    const ref = congress.docRef(arg);
    if (!ref) throw new Error('not allowed');
    const store = congressFromDisk()[kind];
    if (store[ref.docId]) return { status: 200, report: store[ref.docId], cached: true };
    const url = kind === 'ptr' ? congress.ptrUrl(ref.year, ref.docId) : congress.annualUrl(ref.year, ref.docId);
    const got = await congressFile('house-clerk', url, 'application/pdf', 40_000_000);
    if (!got.bytes) return { status: got.status, ...(got.error ? { error: got.error } : {}) };
    let report;
    try {
      const doc = await pdfText.pdfLines(got.bytes);
      report = kind === 'ptr' ? congress.parsePtr(doc) : congress.parseAnnual(doc);
      report.pages = doc.numPages;
    } catch (err) {
      return { status: 200, error: `The report could not be read: ${String(err?.message ?? err).slice(0, 120)}` };
    }
    report.read = Date.now();
    store[ref.docId] = report;
    // A few thousand reports at most; the oldest read go first.
    const ids = Object.keys(store);
    if (ids.length > (kind === 'ptr' ? 6000 : 2500)) for (const id of ids.sort((a, b) => store[a].read - store[b].read).slice(0, ids.length - (kind === 'ptr' ? 6000 : 2500))) delete store[id];
    congressToDisk();
    return { status: 200, report };
  }
  if (kind === 'fmp') {
    if (arg !== 'senate' && arg !== 'house') throw new Error('not allowed');
    const res = await fmpCongress(arg);
    // Once the screen has been opened, the latest lists are asked for every six hours while the app runs, so trades
    // do not fall off FMP's 25 before the app has kept them.
    watchFmpCongress();
    return res;
  }
  throw new Error('not allowed');
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
  // Every window asks every 10 minutes; one answer serves all of them for 9 minutes, so the app makes about 4,800
  // calls a month however many windows are open (the plan allows 10,000 a month and 100 a minute).
  return providers.shared('coingecko', key, 9 * 60_000, async () => {
    await providers.slot('coingecko', 10, 60_000);
    const res = await tracked('coingecko', `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${COINGECKO_IDS}`, { headers: { 'User-Agent': clientAgent(), Accept: 'application/json', 'x-cg-demo-api-key': key }, cache: 'no-cache', signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) return { status: res.status, text: await res.text() };
    const why = providers.providerMessage(await res.text().catch(() => ''), [key]);
    if (why) providers.recordProblem('coingecko', providers.errorKind(res.status), `HTTP ${res.status}: ${why}`);
    return { status: res.status, text: '' };
  }, (r) => r.status === 200 && !!r.text);
});

// ------------------------------------------------- End-of-day cross-checks
// Daily bars from Massive, Alpha Vantage or Twelve Data (electron/eod.cjs) with
// the owner's own key, for comparing the closes the app shows. Each provider's
// budget is kept; Twelve Data is not asked until display rights are confirmed.
const eod = require('./eod.cjs');

ipcMain.handle('eod', async (event, provider, ticker, from, to) => {
  if (!fromApp(event)) throw new Error('not allowed');
  const def = Object.prototype.hasOwnProperty.call(eod.PROVIDERS, provider) ? eod.PROVIDERS[provider] : null;
  if (!def || !eod.eodRequest(provider, ticker, from, to, 'x')) throw new Error('not allowed');
  if (def.gate && !providers.setting(def.gate).value) return { status: 0, text: '', gated: def.gate };
  const key = providers.credential(def.credential).value;
  if (!key) return { status: 0, text: '', missing: def.credential };
  if (!providers.CREDENTIALS[def.credential].valid(key)) {
    providers.recordProblem(provider, 'not-entitled', `The configured ${def.credential} has the wrong format, so it was not sent.`);
    return { status: 0, text: '', refused: 'wrong format' };
  }
  const req = eod.eodRequest(provider, ticker, from, to, key);
  // The shared broker handles persistent daily caps, pacing, body errors and stale fallback.
  return keyedGet(provider, req.url, req.headers, 3600_000, [def.perMinute, 60_000, def.perHour], [key]);
});

// Massive's dividend record (electron/eod.cjs) for a stock Nasdaq's record does not cover, with the owner's key.
ipcMain.handle('massive-dividends', async (event, ticker) => {
  if (!fromApp(event) || !eod.massiveDividendsRequest(String(ticker), 'x')) throw new Error('not allowed');
  const key = providers.credential('MASSIVE_API_KEY').value;
  if (!key) return { status: 0, text: '', missing: 'MASSIVE_API_KEY' };
  if (!providers.CREDENTIALS.MASSIVE_API_KEY.valid(key)) {
    providers.recordProblem('massive', 'not-entitled', 'The configured MASSIVE_API_KEY has the wrong format, so it was not sent.');
    return { status: 0, text: '', refused: 'wrong format' };
  }
  const req = eod.massiveDividendsRequest(String(ticker), key);
  return keyedGet('massive', req.url, req.headers, 12 * 3600_000, [eod.PROVIDERS.massive.perMinute, 60_000], [key]);
});

// ----------------------------------------- Analyst research, news, IEX quotes
// Financial Modeling Prep (electron/fmp.cjs), the news sources (electron/news.cjs) and Alpaca's IEX data
// (electron/alpaca.cjs), each with the owner's key where it needs one. Answers are kept for a while per
// request; a provider's daily ceiling, pace and failures are handled here, the same way for all of them.
const fmp = require('./fmp.cjs');
const news = require('./news.cjs');
const alpaca = require('./alpaca.cjs');
const { optionChainRequest, optionChainProblem } = require('./option-chain.cjs');
const { finnhubResearchRequest } = require('./finnhub-research.cjs');

// Credential-scoped cache, deduplication, retries, quotas and provider-body errors are tested
// independently of Electron in requests.test.ts. Never count HTTP-200 error bodies as success.
const { createRequester } = require('./requests.cjs');
const keyedGet = createRequester({ providers, fetch: (url, init) => net.fetch(url, init), agent: clientAgent, timeoutMs: TIMEOUT_MS, refresh,
  validate: (provider, url, text) => {
    // A consent or error page instead of the feed is a failure, not an answer to keep for 15 minutes.
    if (provider === 'google-news') return /<rss\b/i.test(text) ? null : { kind: 'schema-changed', message: 'Google answered with a web page, not the feed.' };
    if (provider === 'datasets') {
      return /^\uFEFF?Symbol,Security,GICS Sector,GICS Sub-Industry/.test(text) ? null : { kind: 'schema-changed', message: 'The S&P 500 member list changed its format.' };
    }
    if (provider === 'nasdaq') {
      const message = require('./nasdaq.cjs').nasdaqProblem(text);
      return message ? { kind: 'schema-changed', message } : null;
    }
    if (provider !== 'alpaca' || !new URL(url).pathname.startsWith('/v1beta1/options/snapshots/')) return null;
    const message = optionChainProblem(text);
    return message ? { kind: 'schema-changed', message } : null;
  },
});

/** A configured key that passes its check, or why there is none. */
function usableKey(name, provider) {
  const value = providers.credential(name).value;
  if (!value) return { missing: name };
  if (!providers.CREDENTIALS[name].valid(value)) {
    providers.recordProblem(provider, 'not-entitled', `The configured ${name} has the wrong format, so it was not sent.`);
    return { refused: 'wrong format' };
  }
  return { value };
}

// fresh: the owner's research access check asks the provider again rather than reading the kept answer.
ipcMain.handle('analysts', async (event, kind, symbol, fresh) => {
  if (!fromApp(event) || !fmp.fmpRequest(kind, symbol, 'x')) throw new Error('not allowed');
  if (!providers.setting('FMP_ENABLED').value) return { status: 0, text: '', gated: 'FMP_ENABLED' };
  const key = usableKey('FMP_API_KEY', 'fmp');
  if (!key.value) return { status: 0, text: '', ...key };
  const req = fmp.fmpRequest(kind, symbol, key.value);
  return keyedGet('fmp', req.url, {}, fresh === true ? 0 : req.ttl, [30, 60_000], [key.value]);
});

// EIA (electron/eia.cjs): the weekly storage report needs no key; the Open Data API takes the owner's.
const eia = require('./eia.cjs');
ipcMain.handle('eia', async (event, kind) => {
  const req = eia.eiaRequest(String(kind));
  if (!fromApp(event) || !req) throw new Error('not allowed');
  if (!req.keyed) return keyedGet('eia-report', req.url, { Accept: 'application/json' }, req.ttl, [10, 60_000], []);
  const key = usableKey('EIA_API_KEY', 'eia');
  if (!key.value) return { status: 0, text: '', ...key };
  return keyedGet('eia', eia.withKey(req.url, key.value), { Accept: 'application/json' }, req.ttl, [20, 60_000], [key.value]);
});

// The CFTC's Commitments of Traders (electron/cftc.cjs), from its public reporting platform: no key.
const cftc = require('./cftc.cjs');
ipcMain.handle('cftc', async (event, kind, report, mode, code) => {
  const req = cftc.cftcRequest(String(kind), String(report), String(mode), code == null ? undefined : String(code));
  if (!fromApp(event) || !req) throw new Error('not allowed');
  return keyedGet('cftc', req.url, { Accept: 'application/json' }, req.ttl, [30, 60_000], []);
});

// The Treasury's Fiscal Data (electron/fiscal.cjs) for DEBTPROFILE T: no key.
const fiscal = require('./fiscal.cjs');
ipcMain.handle('fiscal', async (event, kind) => {
  const req = fiscal.fiscalRequest(String(kind));
  if (!fromApp(event) || !req) throw new Error('not allowed');
  return keyedGet('fiscal', req.url, { Accept: 'application/json' }, req.ttl, [20, 60_000], []);
});

// BEA (electron/bea.cjs): two national accounts tables with the owner's UserID, which BEA's answer repeats and the
// main process removes before the answer goes anywhere.
const bea = require('./bea.cjs');
ipcMain.handle('bea', async (event, kind) => {
  const req = bea.beaRequest(String(kind));
  if (!fromApp(event) || !req) throw new Error('not allowed');
  const key = usableKey('BEA_API_KEY', 'bea');
  if (!key.value) return { status: 0, text: '', ...key };
  const res = await keyedGet('bea', bea.withKey(req.url, key.value), { Accept: 'application/json' }, req.ttl, [30, 60_000], [key.value]);
  if (!res.text) return res;
  const text = bea.withoutRequest(res.text);
  return text ? { ...res, text } : { ...res, text: '', error: 'BEA answered with something other than its data.' };
});

ipcMain.handle('finnhub-research', async (event, kind, symbol, fresh) => {
  const url = finnhubResearchRequest(kind, symbol);
  if (!fromApp(event) || !url) throw new Error('not allowed');
  if (!providers.setting('FINNHUB_ENABLED').value) return { status: 0, text: '', gated: 'FINNHUB_ENABLED' };
  const key = usableKey('FINNHUB_API_KEY', 'finnhub');
  if (!key.value) return { status: 0, text: '', ...key };
  return keyedGet('finnhub', url, { 'X-Finnhub-Token': key.value }, fresh === true ? 0 : 6 * 3_600_000, [30, 60_000], [key.value]);
});

const tipranks = require('./tipranks.cjs');
const tipranksClient = tipranks.createTipRanksClient({ providers, fetch: (url, init) => net.fetch(url, init), monthFile: () => path.join(app.getPath('userData'), 'tipranks-month.json') });
ipcMain.handle('tipranks', async (event, kind, ticker) => {
  if (!fromApp(event) || !tipranks.validRequest(kind, ticker)) throw new Error('not allowed');
  if (!providers.setting('TIPRANKS_ENABLED').value) return { status: 0, text: '', gated: 'TIPRANKS_ENABLED' };
  const key = usableKey('TIPRANKS_API_KEY', 'tipranks');
  if (!key.value) return { status: 0, text: '', ...key };
  return tipranksClient.research(kind, ticker, key.value);
});

const finnhub = require('./finnhub.cjs');

// Finnhub company data for US-listed stocks (electron/finnhub.cjs), sharing Finnhub's pace with its news.
ipcMain.handle('finnhub', async (event, kind, symbol) => {
  if (!fromApp(event) || !finnhub.finnhubRequest(kind, symbol)) throw new Error('not allowed');
  if (!providers.setting('FINNHUB_ENABLED').value) return { status: 0, text: '', gated: 'FINNHUB_ENABLED' };
  const key = usableKey('FINNHUB_API_KEY', 'finnhub');
  if (!key.value) return { status: 0, text: '', ...key };
  const req = finnhub.finnhubRequest(kind, symbol);
  return keyedGet('finnhub', req.url, finnhub.finnhubHeaders(key.value), req.ttl, [30, 60_000], [key.value]);
});

// Every company's reports by date, for EVENTS: Nasdaq's calendar one day at a time without a key (electron/nasdaq.cjs:
// EPS expected and reported, market value), and Finnhub's and FMP's for a window with the owner's keys (EPS and revenue).
const nasdaq = require('./nasdaq.cjs');

ipcMain.handle('earnings-calendar', async (event, source, from, to) => {
  if (!fromApp(event)) throw new Error('not allowed');
  if (source === 'nasdaq') {
    const req = from === to ? nasdaq.nasdaqCalendarRequest(from) : null;
    if (!req) throw new Error('not allowed');
    return keyedGet('nasdaq', req.url, req.headers, req.ttl, [60, 60_000], [], nasdaqAgent());
  }
  if (source === 'nasdaq-eco') {
    const req = from === to ? nasdaq.nasdaqEconomicRequest(from) : null;
    if (!req) throw new Error('not allowed');
    return keyedGet('nasdaq', req.url, req.headers, req.ttl, [60, 60_000], [], nasdaqAgent());
  }
  if (source === 'nasdaq-ipo') {
    const req = from === to ? nasdaq.nasdaqIpoRequest(from) : null;
    if (!req) throw new Error('not allowed');
    return keyedGet('nasdaq', req.url, req.headers, req.ttl, [60, 60_000], [], nasdaqAgent());
  }
  if (source === 'nasdaq-dividends') {
    const req = from === to ? nasdaq.nasdaqDividendRequest(from) : null;
    if (!req) throw new Error('not allowed');
    return keyedGet('nasdaq', req.url, req.headers, req.ttl, [60, 60_000], [], nasdaqAgent());
  }
  if (source === 'nasdaq-splits') {
    const req = nasdaq.nasdaqSplitsRequest();
    return keyedGet('nasdaq', req.url, req.headers, req.ttl, [60, 60_000], [], nasdaqAgent());
  }
  if (source === 'nasdaq-caps') {
    const req = nasdaq.nasdaqScreenerRequest();
    return keyedGet('nasdaq', req.url, req.headers, req.ttl, [60, 60_000], [], nasdaqAgent());
  }
  if (source === 'finnhub') {
    const req = finnhub.finnhubCalendarRequest(from, to);
    if (!req) throw new Error('not allowed');
    if (!providers.setting('FINNHUB_ENABLED').value) return { status: 0, text: '', gated: 'FINNHUB_ENABLED' };
    const key = usableKey('FINNHUB_API_KEY', 'finnhub');
    if (!key.value) return { status: 0, text: '', ...key };
    return keyedGet('finnhub', req.url, finnhub.finnhubHeaders(key.value), req.ttl, [30, 60_000], [key.value]);
  }
  if (source === 'fmp') {
    if (!fmp.fmpCalendarRequest(from, to, 'x')) throw new Error('not allowed');
    if (!providers.setting('FMP_ENABLED').value) return { status: 0, text: '', gated: 'FMP_ENABLED' };
    const key = usableKey('FMP_API_KEY', 'fmp');
    if (!key.value) return { status: 0, text: '', ...key };
    const req = fmp.fmpCalendarRequest(from, to, key.value);
    return keyedGet('fmp', req.url, {}, req.ttl, [30, 60_000], [key.value]);
  }
  throw new Error('not allowed');
});

// Index memberships and member volumes without a key (electron/index-members.cjs), for the index monitors and SCREEN.
const indexMembers = require('./index-members.cjs');
ipcMain.handle('index-members', async (event, kind, arg) => {
  if (!fromApp(event)) throw new Error('not allowed');
  const req = kind === 'nasdaq-quotes' ? indexMembers.nasdaqQuotesRequest(arg) : kind === 'ftse100' ? indexMembers.ftse100Request(arg) : indexMembers.membersRequest(kind);
  if (!req) throw new Error('not allowed');
  // Wikimedia asks programs to name themselves and say how to reach their author: the app's own agent does both.
  return keyedGet(req.provider, req.url, req.headers, req.ttl, req.provider === 'nasdaq' ? [60, 60_000] : [10, 60_000], [], req.provider === 'wikipedia' ? clientAgent() : nasdaqAgent());
});

// One company's figures from Nasdaq's quote and company pages, without a key (electron/nasdaq.cjs): they fill what
// Yahoo leaves empty. Shares the calendar's pace of 60 requests a minute.
ipcMain.handle('nasdaq', async (event, kind, symbol) => {
  const req = nasdaq.nasdaqCompanyRequest(kind, symbol);
  if (!fromApp(event) || !req) throw new Error('not allowed');
  // The watchlist's real-time quotes go in a lane of their own (20 a minute), so they never hold up EVENTS' calendar
  // days or a company's pages.
  if (kind === 'info') return keyedGet('nasdaq-quote', req.url, req.headers, req.ttl, [20, 60_000], [], nasdaqAgent());
  return keyedGet('nasdaq', req.url, req.headers, req.ttl, [60, 60_000], [], nasdaqAgent());
});

// ------------------------------------------------------- Estimate history
// One stock's reported quarters with the consensus EPS and revenue estimate before each report
// (electron/estimate-history.cjs): the expected revenue of past quarters that the keyless sources do not keep.
// Finviz's quote page first (two years, exact quarter ends, the coming quarter's revenue estimate); for EARNINGS also
// the older quarters from Zacks (Electron's own User-Agent, as for Yahoo), or from MarketBeat when Zacks does not
// answer with its tables (its bot protection, an error, an unknown ticker), and Zacks then rests for half an hour.
// The app never tries to get past a site's bot protection. A history is kept on disk until the company's next report
// (electron/estimate-history.cjs historyFresh); only the figures reach the page.
const estimateHistory = require('./estimate-history.cjs');
// Two lanes, so the stock on screen (EARNINGS, an earnings card) never waits behind EVENTS' lines: EVENTS' requests
// go one at a time, evenly spaced (Finviz every 2.5 s); the stock on screen up to four in 10 s.
const HISTORY = {
  finviz: { url: estimateHistory.finvizUrl, parse: estimateHistory.parseFinviz, pace: { calendar: [1, 2_500], earnings: [4, 10_000] } },
  zacks: { url: estimateHistory.zacksUrl, parse: estimateHistory.parseZacks, pace: { calendar: [6, 60_000], earnings: [6, 60_000] } },
  marketbeat: { url: estimateHistory.marketbeatUrl, parse: estimateHistory.parseMarketBeat, pace: { calendar: [1, 6_000], earnings: [4, 10_000] } },
};
// Kept on disk: past reports do not change, so a history holds until the company's next report.
const historyKept = estimateHistory.createHistoryStore(() => path.join(app.getPath('userData'), 'estimate-history.json'));
app.on('before-quit', () => historyKept.flush());
let zacksRestUntil = 0;

async function historyPage(provider, url, agent) {
  try {
    const res = await tracked(provider, url, { headers: { 'User-Agent': agent, Accept: 'text/html' }, cache: 'no-cache', signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { status: res.status, html: res.ok ? await res.text() : '' };
  } catch (err) {
    return { status: 0, html: '', error: String(err?.message ?? err).replace(/https?:\/\/\S+/g, '<url>').slice(0, 160) };
  }
}

/** One source's history of a stock: { at, history (null without one), status, error }. */
async function historyOf(provider, symbol, lane) {
  const key = `${provider}|${symbol}`;
  const kept = historyKept.get(key);
  // A Finviz page kept before the app read its peers is read again.
  const outdated = provider === 'finviz' && !!kept?.history && !Array.isArray(kept.history.peers);
  // REFRESH asks again only for a history older than an hour: the past reports in it do not change.
  if (!outdated && estimateHistory.historyFresh(kept) && (Date.now() - kept.at < 3_600_000 || !refresh.expired(provider, kept.at))) return kept;
  if (provider === 'zacks' && Date.now() < zacksRestUntil) return kept?.history ? kept : { at: Date.now(), history: null, status: 0, error: '' };
  const src = HISTORY[provider];
  await providers.slot(provider === 'zacks' ? 'zacks' : `${provider}:${lane}`, ...src.pace[lane]);
  const page = await historyPage(provider, src.url(symbol), provider === 'zacks' ? browserAgent() : nasdaqAgent());
  const history = src.parse(page.html);
  if (!history && provider === 'zacks') zacksRestUntil = Date.now() + 30 * 60_000;
  if (!history && kept?.history) return { ...kept, stale: true };
  const entry = { at: Date.now(), history, status: page.status, error: page.error };
  // A page that could not be had (network, refusal) is asked again next time; one without figures after 30 minutes.
  if (history || page.status === 200 || page.status === 404) historyKept.set(key, { at: entry.at, history });
  return entry;
}

const hasReports = (h) => !!h && (h.sales?.length > 0 || h.eps?.length > 0);

ipcMain.handle('estimate-history', async (event, kind, symbol) => {
  if (!fromApp(event) || (kind !== 'earnings' && kind !== 'calendar') || !estimateHistory.finvizUrl(symbol)) throw new Error('not allowed');
  const got = [];
  const first = await historyOf('finviz', symbol, kind);
  if (hasReports(first.history)) got.push(first);
  // EVENTS' lines need the reports around their dates: Finviz's two years do, unless Finviz has none.
  if (kind === 'earnings' || !hasReports(first.history)) {
    const zacks = await historyOf('zacks', symbol, kind);
    const older = zacks.history ? zacks : await historyOf('marketbeat', symbol, kind);
    if (older.history) got.push(older);
  }
  if (!got.length) return { status: first.status ? (first.status === 200 ? 404 : first.status) : 404, text: '', error: first.error || 'No earnings history was found for this ticker.' };
  // A history kept from an earlier answer (the refresh failed) goes back marked stale, with the time it was read.
  return { status: 200, text: JSON.stringify(got.map((g) => g.history)), at: Math.min(...got.map((g) => g.at)), ...(got.some((g) => g.stale) ? { stale: true } : {}) };
});

// Analysts' rating actions with their price targets, from MarketBeat's forecast page (electron/analyst-actions.cjs),
// for ANALYSTS; kept six hours per stock.
const analystActions = require('./analyst-actions.cjs');
const actionsKept = new Map();
ipcMain.handle('analyst-actions', async (event, symbol) => {
  const url = analystActions.forecastUrl(symbol);
  if (!fromApp(event) || !url) throw new Error('not allowed');
  const kept = actionsKept.get(symbol);
  if (kept && Date.now() - kept.at < 6 * 3_600_000 && !refresh.expired('marketbeat', kept.at)) return { status: 200, text: kept.text, at: kept.at, cached: true };
  await providers.slot('marketbeat:earnings', 4, 10_000);
  const page = await historyPage('marketbeat', url, nasdaqAgent());
  const rows = analystActions.parseRatings(page.html);
  if (!rows) return kept ? { status: page.status, text: kept.text, at: kept.at, stale: true } : { status: page.status === 200 ? 404 : page.status, text: '', error: page.error || (page.status === 200 ? 'MarketBeat lists no rating actions for this stock.' : undefined) };
  const text = JSON.stringify(rows);
  const at = Date.now();
  actionsKept.set(symbol, { at, text });
  if (actionsKept.size > 200) actionsKept.delete(actionsKept.keys().next().value);
  return { status: 200, text, at };
});

// The companies Finviz lists as a stock's peers, from the same quote page (kept with its history).
ipcMain.handle('finviz-peers', async (event, symbol) => {
  if (!fromApp(event) || !estimateHistory.finvizUrl(symbol)) throw new Error('not allowed');
  const got = await historyOf('finviz', symbol, 'earnings');
  const peers = got.history?.peers ?? [];
  return peers.length ? { status: 200, text: JSON.stringify(peers), at: got.at } : { status: got.status === 200 || !got.status ? 404 : got.status, text: '', error: got.error || 'Finviz lists no peers for this stock.' };
});

// FINRA's consolidated short interest (no key): one US-listed stock's, where Nasdaq's page has none, or a settlement's.
ipcMain.handle('finra', async (event, kind, symbol) => {
  // The latest settlements (75 days), or two years of them for the short interest screen (SI); or, for the market's
  // ranking (SIA), one settlement of every listing (`symbol` is then its date).
  const req = kind === 'short-interest' ? nasdaq.finraShortRequest(symbol) : kind === 'short-history' ? nasdaq.finraShortRequest(symbol, Date.now(), 760, 60) : kind === 'settlement' ? nasdaq.finraSettlementRequest(symbol) : null;
  if (!fromApp(event) || !req) throw new Error('not allowed');
  return keyedGet('finra', req.url, req.headers, req.ttl, [20, 60_000], [], undefined, { method: 'POST', body: req.body });
});

// Alpha Vantage's earnings and estimates with the owner's key (electron/alphavantage.cjs), kept on disk for three days
// because the free key allows 25 requests a day. A refresh asks again only for an answer older than an hour.
const alphavantage = require('./alphavantage.cjs');
const avCache = alphavantage.createDiskCache(() => path.join(app.getPath('userData'), 'alphavantage-earnings.json'));
ipcMain.handle('alphavantage', async (event, kind, symbol) => {
  if (!fromApp(event) || !alphavantage.avEarningsRequest(kind, symbol, 'x')) throw new Error('not allowed');
  const key = usableKey('ALPHA_VANTAGE_API_KEY', 'alphavantage');
  if (!key.value) return { status: 0, text: '', ...key };
  const id = alphavantage.cacheId(kind, symbol, key.value);
  const kept = avCache.get(id);
  if (kept && Date.now() - kept.at < alphavantage.TTL && !refresh.expired('alphavantage', kept.at)) return { status: 200, text: kept.text, at: kept.at, cached: true };
  const req = alphavantage.avEarningsRequest(kind, symbol, key.value);
  const answer = await keyedGet('alphavantage', req.url, {}, req.ttl, [2, 60_000], [key.value]);
  if (answer.status === 200 && answer.text && !answer.stale && !answer.cached) avCache.set(id, answer.text, answer.at ?? Date.now());
  // A refusal or a spent allowance keeps showing the last answer, marked stale.
  if (!answer.text && kept) return { ...answer, text: kept.text, at: kept.at, stale: true };
  return answer;
});

// Massive's pace is the same slot CROSSCHECK's bars wait in, so news never pushes it over 5 calls a minute. Alpaca's
// news has its own 30 a minute, which with the 120 kept for quotes and options stays under the plan's 200.
const NEWS_PACE = { finnhub: [30, 60_000], marketaux: [10, 60_000], marketwatch: [6, 60_000], sec: [sec.PER_SECOND, 1000], 'yahoo-rss': [20, 60_000], euronext: [6, 60_000], 'alpaca-news': [30, 60_000], massive: [5, 60_000], 'google-news': [10, 60_000] };

ipcMain.handle('news', async (event, source, arg) => {
  if (!fromApp(event) || !news.newsRequest(source, arg, 'x')) throw new Error('not allowed');
  const def = news.SOURCES[source];
  if (def.gate && !providers.setting(def.gate).value) return { status: 0, text: '', gated: def.gate };
  const keys = [];
  for (const name of [def.credential, def.credential2].filter(Boolean)) {
    const k = usableKey(name, def.provider);
    if (!k.value) return { status: 0, text: '', ...k };
    keys.push(k.value);
  }
  const [key = '', key2 = ''] = keys;
  const req = news.newsRequest(source, arg, key, key2);
  return keyedGet(def.provider, req.url, req.headers, req.ttl, NEWS_PACE[def.provider], def.agent ? [] : keys, def.agent ? key : undefined);
});

ipcMain.handle('alpaca', async (event, kind, symbols) => {
  if (!fromApp(event)) throw new Error('not allowed');
  const url = alpaca.alpacaRequest(kind, symbols);
  if (!url) throw new Error('not allowed');
  if (!providers.setting('ALPACA_ENABLED').value) return { status: 0, text: '', gated: 'ALPACA_ENABLED' };
  const id = usableKey('ALPACA_API_KEY_ID', 'alpaca');
  if (!id.value) return { status: 0, text: '', ...id };
  const secret = usableKey('ALPACA_API_SECRET_KEY', 'alpaca');
  if (!secret.value) return { status: 0, text: '', ...secret };
  // Alpaca's free plan allows 200 requests a minute; quotes are kept for 4 seconds.
  return keyedGet('alpaca', url, alpaca.alpacaHeaders(id.value, secret.value), 4_000, [120, 60_000], [id.value, secret.value]);
});

ipcMain.handle('option-chain', async (event, arg) => {
  const url = optionChainRequest(arg);
  if (!fromApp(event) || !url) throw new Error('not allowed');
  if (!providers.setting('ALPACA_ENABLED').value) return { status: 0, text: '', gated: 'ALPACA_ENABLED' };
  const id = usableKey('ALPACA_API_KEY_ID', 'alpaca');
  if (!id.value) return { status: 0, text: '', ...id };
  const secret = usableKey('ALPACA_API_SECRET_KEY', 'alpaca');
  if (!secret.value) return { status: 0, text: '', ...secret };
  return keyedGet('alpaca', url, alpaca.alpacaHeaders(id.value, secret.value), 15_000, [120, 60_000], [id.value, secret.value]);
});

// The help desk's Claude mode (electron/assistant.cjs): one request per call; the page runs the tools between calls.
const assistant = require('./assistant.cjs');
let claude = null;
ipcMain.handle('assistant', async (event, messages) => {
  if (!fromApp(event)) throw new Error('not allowed');
  if (!providers.setting('CLAUDE_HELPDESK_ENABLED').value) return { gated: 'CLAUDE_HELPDESK_ENABLED' };
  const key = usableKey('ANTHROPIC_API_KEY', 'anthropic');
  if (!key.value) return key;
  const problem = assistant.checkMessages(messages);
  if (problem) return { error: problem };
  if (!providers.withinDailyCap('anthropic')) return { budget: true };
  if (claude?.key !== key.value) {
    const { Anthropic } = require('@anthropic-ai/sdk');
    claude = { key: key.value, client: new Anthropic({ apiKey: key.value, fetch: (url, init) => tracked('anthropic', url, init), maxRetries: 2, timeout: 120_000 }) };
  }
  try {
    return await assistant.ask(claude.client, messages);
  } catch (err) {
    return { error: assistant.errorText(err, key.value) };
  }
});

// ------------------------------------------------- Yahoo cookie consent
// Yahoo's quote and company endpoints need a session cookie and "crumb". In the EU, Yahoo first asks the
// visitor to accept its cookies, so a program gets no usable cookie and those endpoints refuse it. This opens
// Yahoo in a plain window of the app's own session: the owner accepts (or not) on Yahoo's own page, the cookie
// is kept in the app's session, and the crumb is fetched again. Only yahoo.com pages may load in the window.
let consentWin = null;
const yahooHost = (u) => {
  try {
    const h = new URL(u).hostname;
    return h === 'yahoo.com' || h.endsWith('.yahoo.com');
  } catch {
    return false;
  }
};

ipcMain.handle('yahoo:consent', async (event) => {
  if (!fromApp(event)) throw new Error('not allowed');
  if (!yahooEnabled()) return { ok: false, detail: 'Yahoo Finance is switched off (YAHOO_PRICES_ENABLED).' };
  if (consentWin && !consentWin.isDestroyed()) {
    consentWin.focus();
    return { ok: false, detail: 'The Yahoo window is already open.' };
  }
  await new Promise((resolve) => {
    consentWin = new BrowserWindow({
      width: 1100,
      height: 800,
      parent: BrowserWindow.fromWebContents(event.sender) ?? undefined,
      title: 'Yahoo Finance: accept its cookies, then close this window',
      autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
    });
    consentWin.setMenu(null);
    consentWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    consentWin.webContents.on('will-navigate', (e, u) => {
      if (!yahooHost(u)) e.preventDefault();
    });
    consentWin.webContents.on('will-redirect', (e, u) => {
      if (!yahooHost(u)) e.preventDefault();
    });
    consentWin.on('closed', () => {
      consentWin = null;
      resolve();
    });
    void consentWin.loadURL('https://finance.yahoo.com/');
  });
  crumb = null;
  crumbFailedAt = 0;
  try {
    await getCrumb(true);
    return { ok: true, detail: 'Yahoo accepted the session: quotes and company data can load again.' };
  } catch (err) {
    return { ok: false, detail: `Yahoo still refuses the session (${String(err?.message ?? err).replace(/https?:\/\/\S+/g, '<url>').slice(0, 80)}).` };
  }
});

// ------------------------------------------------------------- Self-test
// One small request to each source, on the owner's own network and with the owner's keys (electron/selftest.cjs).
// The page gets names, states, statuses, timings and short samples; never a key or a URL.
const selftest = require('./selftest.cjs');
const SELFTEST_PACE = { fmp: [30, 60_000], finnhub: [30, 60_000], marketaux: [10, 60_000], alpaca: [120, 60_000], 'alpaca-news': [30, 60_000], tiingo: [1, 60_000, 40], massive: [5, 60_000], alphavantage: [1, 60_000], twelvedata: [6, 60_000], fred: [60, 60_000], sec: [sec.PER_SECOND, 1000], coingecko: [10, 60_000], kraken: [60, 60_000] };

/** Yahoo's own checks: the cookie and crumb the quote and company endpoints need, and the ones that need neither. */
async function yahooSelfTest() {
  const out = [];
  const step = async (id, label, run) => {
    const t0 = Date.now();
    try {
      const { status, detail, valid = true } = await run();
      out.push({ id, label, state: status >= 200 && status < 300 && valid ? 'pass' : 'fail', status, ms: Date.now() - t0, detail });
    } catch (err) {
      out.push({ id, label, state: 'fail', status: 0, ms: Date.now() - t0, detail: String(err?.message ?? err).replace(/https?:\/\/\S+/g, '<url>').slice(0, 160) });
    }
  };
  if (!yahooEnabled()) return [{ id: 'yahoo', label: 'Yahoo Finance', state: 'off', detail: 'switched off (YAHOO_PRICES_ENABLED)' }];
  const read = async (res) => {
    const text = await res.text().catch(() => '');
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      j = undefined;
    }
    return { text, j };
  };
  await step('yahoo-chart', 'Yahoo chart, no crumb needed (AB InBev, Brussels)', async () => {
    const res = await yahooFetch(`${YAHOO}/v8/finance/chart/ABI.BR?range=5d&interval=1d`);
    const { j, text } = await read(res);
    const m = j?.chart?.result?.[0]?.meta;
    return { status: res.status, valid: Number.isFinite(m?.regularMarketPrice) && m.regularMarketPrice > 0, detail: m ? `ABI.BR ${m.regularMarketPrice} ${m.currency}` : providers.providerMessage(text) || 'no chart in the answer' };
  });
  let crumbOk = false;
  await step('yahoo-crumb', 'Yahoo cookie and crumb (needed for quotes and company data)', async () => {
    const c = await getCrumb(true);
    crumbOk = !!c && c.length <= 64 && !/[<{\s]/.test(c);
    return { status: crumbOk ? 200 : 0, detail: crumbOk ? 'crumb received' : 'no valid session crumb received' };
  });
  await step('yahoo-quote', 'Yahoo quotes (Apple, S&P 500, EUR/USD)', async () => {
    const res = await yahooFetch(`${YAHOO}/v7/finance/quote?symbols=AAPL,%5EGSPC,EURUSD%3DX&crumb=${encodeURIComponent(crumb ?? '')}`);
    const { j, text } = await read(res);
    const list = j?.quoteResponse?.result ?? [];
    const valid = ['AAPL', '^GSPC', 'EURUSD=X'].every((symbol) => list.some((q) => q.symbol === symbol && Number.isFinite(q.regularMarketPrice) && q.regularMarketPrice > 0));
    return { status: res.status, valid, detail: valid ? list.map((q) => `${q.symbol} ${q.regularMarketPrice}`).join(', ') : providers.providerMessage(text) || 'missing or invalid quote data' };
  });
  await step('yahoo-summary', 'Yahoo company data (Apple profile and statistics)', async () => {
    const res = await yahooFetch(`${YAHOO}/v10/finance/quoteSummary/AAPL?modules=assetProfile,summaryDetail&crumb=${encodeURIComponent(crumb ?? '')}`);
    const { j, text } = await read(res);
    const r = j?.quoteSummary?.result?.[0];
    return { status: res.status, valid: !!r && (!!r.assetProfile?.industry || Number.isFinite(r.summaryDetail?.trailingPE?.raw ?? r.summaryDetail?.trailingPE)), detail: r ? `${r.assetProfile?.industry ?? '?'}, P/E ${r.summaryDetail?.trailingPE?.raw ?? r.summaryDetail?.trailingPE ?? '?'}` : providers.providerMessage(text) || 'no company data in the answer' };
  });
  await step('yahoo-search', 'Yahoo stock search (APLD)', async () => {
    const res = await yahooFetch(`${YAHOO}/v1/finance/search?q=APLD&quotesCount=8&newsCount=0`);
    const { j } = await read(res);
    const hit = j?.quotes?.find((q) => q.symbol === 'APLD' && q.quoteType === 'EQUITY');
    return { status: res.status, valid: !!hit, detail: hit ? `${hit.symbol}: ${hit.longname ?? hit.shortname ?? 'equity'} (${hit.exchange ?? 'exchange not supplied'})` : 'APLD equity was not returned by stock search' };
  });
  if (!providers.setting('YAHOO_RESEARCH_ENABLED').value) out.push({ id: 'yahoo-research', label: 'Yahoo analyst research (APLD)', state: 'off', detail: 'switched off (YAHOO_RESEARCH_ENABLED)' });
  else await step('yahoo-research', 'Yahoo analyst research (APLD; coverage varies by dataset)', async () => {
    const res = await yahooFetch(`${YAHOO}/v10/finance/quoteSummary/APLD?modules=price,financialData,recommendationTrend,upgradeDowngradeHistory,earningsTrend&crumb=${encodeURIComponent(crumb ?? '')}`);
    const { j } = await read(res);
    const r = j?.quoteSummary?.result?.[0];
    const target = r?.financialData?.targetMeanPrice?.raw ?? r?.financialData?.targetMeanPrice;
    const trends = r?.recommendationTrend?.trend;
    const periods = Array.isArray(trends) ? trends.filter((t) => /^(0|-\d+)m$/.test(t?.period ?? '') && ['strongBuy', 'buy', 'hold', 'sell', 'strongSell'].every((k) => Number.isInteger(t[k]) && t[k] >= 0) && ['strongBuy', 'buy', 'hold', 'sell', 'strongSell'].reduce((sum, k) => sum + t[k], 0) > 0).length : 0;
    const estimates = r?.earningsTrend?.trend;
    const annual = Array.isArray(estimates) ? estimates.filter((t) => ['0y', '+1y'].includes(t?.period) && /^\d{4}-\d{2}-\d{2}$/.test(t.endDate ?? '') && (Number.isFinite(t.earningsEstimate?.avg?.raw ?? t.earningsEstimate?.avg) || Number.isFinite(t.revenueEstimate?.avg?.raw ?? t.revenueEstimate?.avg))).length : 0;
    const valid = !!r && !j?.quoteSummary?.error && (r.price?.symbol === undefined || r.price.symbol === 'APLD') && ((Number.isFinite(target) && target > 0) || periods > 0 || annual > 0);
    return { status: res.status, valid, detail: valid ? `APLD: target ${Number.isFinite(target) ? target : 'not supplied'}, ${periods} recommendation periods, ${annual} annual estimate periods` : 'no usable APLD research in the answer' };
  });
  return out;
}

ipcMain.handle('providers:selftest', async (event) => {
  if (!fromApp(event)) throw new Error('not allowed');
  const results = await yahooSelfTest();
  const now = Date.now();
  for (const t of selftest.TESTS) {
    const base = { id: t.id, label: t.cost ? `${t.label} (${t.cost})` : t.label };
    if (t.setting && !providers.setting(t.setting).value) {
      results.push({ ...base, state: 'off', detail: `switched off (${t.setting})` });
      continue;
    }
    const keys = (t.credentials ?? []).map((name) => [name, providers.credential(name).value]);
    const missing = keys.find(([, v]) => !v);
    if (missing && !t.keyless) {
      results.push({ ...base, state: 'skip', detail: `no ${missing[0]} set` });
      continue;
    }
    const wrong = keys.find(([name, v]) => v && !providers.CREDENTIALS[name].valid(v));
    if (wrong) {
      results.push({ ...base, state: 'fail', detail: `${wrong[0]} has the wrong format, so it was not sent` });
      continue;
    }
    const secrets = keys.map(([, v]) => v).filter(Boolean);
    const keyNote = missing ? `without a key (no ${missing[0]} set): ` : '';
    const req = t.request(secrets, now);
    const t0 = Date.now();
    try {
      // A diagnostic spends the same account allowance as an ordinary request.
      // Never bypass pacing, daily caps or HTTP-200 refusal detection.
      let res;
      let sourceLabel = '';
      if (t.id === 'fed-rss') {
        const answer = await fetchFedPress((url, init) => tracked('fedboard', url, init), { headers: { 'User-Agent': clientAgent() }, cache: 'no-cache', signal: AbortSignal.timeout(15_000) });
        if (answer.error) providers.recordProblem('fedboard', 'schema-changed', answer.error);
        sourceLabel = answer.fallback ? `${answer.sourceLabel}: ` : '';
        res = { status: answer.status, ok: !!answer.text, statusText: answer.error, text: async () => answer.text };
      } else if (SELFTEST_PACE[t.provider]) {
        const answer = await keyedGet(t.provider, req.url, req.headers ?? {}, 0, SELFTEST_PACE[t.provider], t.agent ? [] : secrets, t.agent ? secrets[0] : undefined);
        res = { status: answer.status, ok: answer.status >= 200 && answer.status < 300 && !answer.stale && !!answer.text,
          statusText: answer.budget ? 'Daily request cap reached; resets at midnight UTC.' : answer.error ?? 'No fresh answer.', text: async () => answer.text };
      } else {
        if (t.slot) await providers.slot(t.provider, ...t.slot);
        res = await tracked(t.provider, req.url, {
          ...(req.method ? { method: req.method, body: req.body } : {}),
          headers: { 'User-Agent': t.agent ? secrets[0] : clientAgent(), Accept: req.accept ?? 'application/json', ...(req.headers ?? {}) },
          cache: 'no-cache',
          signal: AbortSignal.timeout(15_000),
        });
      }
      const text = t.binary && res.ok ? Buffer.from(await res.arrayBuffer().catch(() => new ArrayBuffer(0))) : await res.text().catch(() => '');
      const ms = Date.now() - t0;
      if (!res.ok) {
        // A direct answer's body says why (statusText is only "Forbidden"); a paced answer's reason is in its error,
        // and its text may be an older kept answer.
        const said = [JSON.stringify({ message: res.statusText }), text];
        if (!SELFTEST_PACE[t.provider]) said.reverse();
        results.push({ ...base, state: 'fail', status: res.status, ms, detail: keyNote + (said.map((m) => providers.providerMessage(m, secrets)).find(Boolean) || 'refused') });
        continue;
      }
      try {
        results.push({ ...base, state: 'pass', status: res.status, ms, detail: keyNote + sourceLabel + t.read(text, now) });
      } catch (err) {
        providers.recordProblem(t.provider, 'schema-changed', providers.providerMessage(JSON.stringify({ message: String(err?.message ?? err) }), secrets));
        results.push({ ...base, state: 'fail', status: res.status, ms, detail: keyNote + providers.providerMessage(JSON.stringify({ message: String(err?.message ?? err) }), secrets) });
      }
    } catch (err) {
      const why = err?.name === 'TimeoutError' ? 'no answer within 15 seconds' : String(err?.message ?? err).replace(/https?:\/\/\S+/g, '<url>');
      results.push({ ...base, state: 'fail', status: 0, ms: Date.now() - t0, detail: keyNote + why.slice(0, 160) });
    }
  }
  const run = { at: now, version: app.getVersion(), platform: `${process.platform} ${process.arch}, Electron ${process.versions.electron}`, results };
  return { ...run, report: selftest.reportText(run) };
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

/** The tab bar's height in pixels (.wtabs-bar in global.css): the window's buttons are drawn this tall over it. */
const TAB_BAR_HEIGHT = 32;

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
    // No title bar: the window's own minimise, maximise and close buttons sit at the right end of the app's light tab bar,
    // which drags the window (WorkspaceTabs.tsx keeps the tabs clear of them). TAB_BAR_HEIGHT matches the bar's CSS.
    ...(process.platform === 'darwin' ? {} : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#cfcdd0', symbolColor: '#2b2b2b', height: TAB_BAR_HEIGHT } }),
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
  // A mouse's side buttons and a keyboard's browser keys on Windows: one screen back or forward in the panel, as in a
  // browser. The page never navigates itself.
  win.on('app-command', (e, cmd) => {
    if (cmd !== 'browser-backward' && cmd !== 'browser-forward') return;
    e.preventDefault();
    win.webContents.send('history', cmd === 'browser-forward' ? 'forward' : 'back');
  });
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
    // A retired source's saved key and switch (Equibles) are deleted.
    providers.forgetRetired();
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
