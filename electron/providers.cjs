// Provider credentials, request accounting and rate limits for the main process.
// Keys stay in this process: the page can save or clear a credential and see
// whether one is configured and where it came from, but it can never read a
// value back. Values come from the environment first, then a .env file next
// to the app when running from source, then the encrypted store in the user's
// app data folder.
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const CREDENTIALS = {
  // FRED documents its keys as 32-character lowercase alphanumeric strings.
  FRED_API_KEY: { label: 'FRED API key', valid: (v) => /^[a-z0-9]{32}$/.test(v) },
  MASSIVE_API_KEY: { label: 'Massive API key', valid: (v) => /^[A-Za-z0-9_-]{8,128}$/.test(v) },
  ALPHA_VANTAGE_API_KEY: { label: 'Alpha Vantage API key', valid: (v) => /^[A-Za-z0-9]{8,64}$/.test(v) },
  TWELVE_DATA_API_KEY: { label: 'Twelve Data API key', valid: (v) => /^[A-Za-z0-9]{16,64}$/.test(v) },
  // CoinGecko's free Demo plan: market caps and circulating supply, aggregated across exchanges.
  COINGECKO_API_KEY: { label: 'CoinGecko Demo API key', valid: (v) => /^[A-Za-z0-9_-]{10,64}$/.test(v) },
  // News (Finnhub: market and company news; Marketaux: ticker-tagged news with sentiment).
  FINNHUB_API_KEY: { label: 'Finnhub API key', valid: (v) => /^[A-Za-z0-9]{20,64}$/.test(v) },
  MARKETAUX_API_TOKEN: { label: 'Marketaux API token', valid: (v) => /^[A-Za-z0-9]{20,64}$/.test(v) },
  // Tiingo: end-of-day prices for CROSSCHECK.
  TIINGO_API_KEY: { label: 'Tiingo API token', valid: (v) => /^[A-Za-z0-9]{20,64}$/.test(v) },
  // Alpaca market data (IEX on the free plan). Paper and live accounts both have a key ID and a secret;
  // the app uses them only for market data, never for trading.
  ALPACA_API_KEY_ID: { label: 'Alpaca API key ID', valid: (v) => /^(PK|AK)[A-Z0-9]{14,38}$/.test(v) },
  ALPACA_API_SECRET_KEY: { label: 'Alpaca API secret key', valid: (v) => /^[A-Za-z0-9/+=_-]{30,80}$/.test(v) },
  // Financial Modeling Prep: analyst price targets, ratings and estimates.
  FMP_API_KEY: { label: 'Financial Modeling Prep API key', valid: (v) => /^[A-Za-z0-9]{20,64}$/.test(v) },
  // TipRanks: kept for a later adapter; nothing is sent to TipRanks yet.
  TIPRANKS_API_KEY: { label: 'TipRanks API key', valid: (v) => /^tr_(live|test)_[A-Za-z0-9]{16,80}$/.test(v) && !/^tr_(live|test)_x+$/i.test(v) },
  // The SEC asks for an application name and a contact email it can reach.
  SEC_USER_AGENT: {
    label: 'SEC User-Agent (application name and your contact email)',
    valid: (v) => v.length <= 200 && /^[\x20-\x7e]+$/.test(v) && /\S+\s+\S+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(v) && !/@example\.(com|org|net)\b/i.test(v),
  },
};

const STORE = () => path.join(app.getPath('userData'), 'provider-credentials.json');

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE(), 'utf8'));
  } catch {
    return {};
  }
}

function writeStore(data) {
  fs.mkdirSync(path.dirname(STORE()), { recursive: true });
  fs.writeFileSync(STORE(), JSON.stringify(data), { mode: 0o600 });
}

/** KEY=VALUE lines of a .env file; quotes around a value are dropped. */
function parseDotEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

let dotEnv = null;
function fromDotEnv(name) {
  if (app.isPackaged) return '';
  if (!dotEnv) {
    try {
      dotEnv = parseDotEnv(fs.readFileSync(path.join(app.getAppPath(), '.env'), 'utf8'));
    } catch {
      dotEnv = {};
    }
  }
  return (dotEnv[name] ?? '').trim();
}

/**
 * Whether saved keys can be encrypted. On Linux that takes a desktop keyring (GNOME Keyring, KWallet);
 * without one Electron may fall back to "basic_text", a fixed key that protects nothing, so the app
 * declines to save keys there.
 */
function canEncrypt() {
  if (!safeStorage.isEncryptionAvailable()) return false;
  return !(process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text');
}

function fromStore(name) {
  const enc = readStore()[name];
  if (typeof enc !== 'string' || !safeStorage.isEncryptionAvailable()) return '';
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64')).trim();
  } catch {
    return '';
  }
}

/** A credential's value and where it came from, for use inside this process only. */
function credential(name) {
  if (!CREDENTIALS[name]) return { value: '', source: null };
  const env = (process.env[name] ?? '').trim();
  if (env) return { value: env, source: 'environment' };
  const file = fromDotEnv(name);
  if (file) return { value: file, source: '.env file' };
  const saved = fromStore(name);
  if (saved) return { value: saved, source: 'saved in this app' };
  return { value: '', source: null };
}

// ---------------------------------------------------------------- settings
// Switches that are not secrets: environment first, then .env (from source),
// then the value saved from the app's provider screen, then the default.

const SETTINGS = {
  // Yahoo Finance prices are an unofficial, personal-use source the owner chose to keep. Off stops every
  // Yahoo request and the streaming socket.
  YAHOO_PRICES_ENABLED: { label: 'Yahoo Finance prices (unofficial, personal use)', default: true },
  // Kraken's public market data for the crypto lines. Off hands them back to Yahoo, when Yahoo is on.
  KRAKEN_ENABLED: { label: 'Kraken exchange prices for crypto (public market data)', default: true },
  // Twelve Data's free plan is for internal, non-display use. Only the owner can say a plan allows showing its
  // prices on screen; until then nothing is sent to Twelve Data.
  TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED: { label: 'Twelve Data: my plan allows displaying its data', default: false },
  // Dow Jones's terms of use (30 June 2026, sections 9.4.1 and 9.4.3) bar automated access to MarketWatch
  // content, its RSS feeds included, without written consent. Off until the owner decides to accept that.
  MARKETWATCH_RSS_ENABLED: { label: 'MarketWatch top stories RSS (Dow Jones terms restrict automated access)', default: false },
  // The keyed sources added in 2.1.0, each on while its key is set; off stops every request to it.
  FMP_ENABLED: { label: 'Financial Modeling Prep analyst research', default: true },
  FINNHUB_ENABLED: { label: 'Finnhub market and company news', default: true },
  MARKETAUX_ENABLED: { label: 'Marketaux news and sentiment', default: true },
  ALPACA_ENABLED: { label: 'Alpaca IEX quotes (market data only)', default: true },
  TIINGO_ENABLED: { label: 'Tiingo end-of-day closes', default: true },
};

const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'provider-settings.json');

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8'));
  } catch {
    return {};
  }
}

/** "false", "0", "no" and "off" are off; anything else set is on. */
function parseSwitch(v) {
  return !/^(false|0|no|off)$/i.test(String(v).trim());
}

/** A setting's value and where it came from. */
function setting(name) {
  const def = SETTINGS[name];
  if (!def) return { value: false, source: null };
  const env = (process.env[name] ?? '').trim();
  if (env) return { value: parseSwitch(env), source: 'environment' };
  const file = fromDotEnv(name);
  if (file) return { value: parseSwitch(file), source: '.env file' };
  const saved = readSettings()[name];
  if (typeof saved === 'boolean') return { value: saved, source: 'saved in this app' };
  return { value: def.default, source: 'default' };
}

function settingStatus() {
  const out = {};
  for (const [name, def] of Object.entries(SETTINGS)) out[name] = { label: def.label, ...setting(name) };
  return out;
}

function saveSetting(name, value) {
  if (!SETTINGS[name] || typeof value !== 'boolean') throw new Error('unknown setting');
  fs.mkdirSync(path.dirname(SETTINGS_FILE()), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE(), JSON.stringify({ ...readSettings(), [name]: value }));
}

function credentialStatus() {
  const out = {};
  for (const [name, def] of Object.entries(CREDENTIALS)) {
    const { value, source } = credential(name);
    out[name] = { label: def.label, configured: !!value, valid: !value || def.valid(value), source };
  }
  return out;
}

function saveCredential(name, value) {
  const def = CREDENTIALS[name];
  if (!def) throw new Error('unknown credential');
  const v = typeof value === 'string' ? value.trim() : '';
  if (!def.valid(v)) throw new Error(`${def.label} does not look right`);
  if (!canEncrypt()) throw new Error('This system cannot encrypt saved keys; set the environment variable instead');
  writeStore({ ...readStore(), [name]: safeStorage.encryptString(v).toString('base64') });
}

/**
 * Which credential a pasted line is about: its variable name, or the provider's name or site as the owner
 * might write it ("Finnhub.io:", "marketaux.com:", "6: SEC_USER_AGENT:"). Alpaca lines name the secret
 * key with "secret"; otherwise an Alpaca line is about the key ID.
 */
const ALIASES = [
  [/alpaca/i, (line) => (/secret/i.test(line) ? 'ALPACA_API_SECRET_KEY' : 'ALPACA_API_KEY_ID')],
  [/alpha[\s_-]*vantage/i, 'ALPHA_VANTAGE_API_KEY'],
  [/twelve[\s_-]*data/i, 'TWELVE_DATA_API_KEY'],
  [/coin[\s_-]*gecko/i, 'COINGECKO_API_KEY'],
  [/\bfred\b|fred_api_key/i, 'FRED_API_KEY'],
  [/massive|polygon/i, 'MASSIVE_API_KEY'],
  [/sec[\s_-]*user[\s_-]*agent/i, 'SEC_USER_AGENT'],
  [/finnhub/i, 'FINNHUB_API_KEY'],
  [/tiingo/i, 'TIINGO_API_KEY'],
  [/marketaux/i, 'MARKETAUX_API_TOKEN'],
  [/financial[\s_-]*modeling[\s_-]*prep|\bfmp\b|fmp_api_key/i, 'FMP_API_KEY'],
  [/tipranks/i, 'TIPRANKS_API_KEY'],
];

/** The SEC contact from a line such as "SEC_USER_AGENT: Name: Ann Example e-mail: ann@mail.org". */
function secAgentFrom(line) {
  const rest = line.replace(/^.*?sec[\s_-]*user[\s_-]*agent\s*[:=]?\s*/i, '');
  return rest.replace(/\b(name|e-?mail|contact)\s*:\s*/gi, '').replace(/\s+/g, ' ').trim();
}

/**
 * Reads keys from pasted text, one per line, in whatever form the owner wrote them, and returns each one it
 * recognised with the value that passes that credential's check. Values never leave the main process.
 */
function parseCredentialList(text) {
  const names = new Set(Object.keys(CREDENTIALS).map((n) => n.toLowerCase()));
  const found = [];
  const skipped = [];
  String(text)
    .split(/\r?\n/)
    .forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return;
      const explicit = Object.keys(CREDENTIALS).find((n) => new RegExp(`\\b${n}\\b`, 'i').test(line));
      const alias = ALIASES.find(([re]) => re.test(line));
      const name = explicit ?? (alias ? (typeof alias[1] === 'function' ? alias[1](line) : alias[1]) : undefined);
      if (!name) {
        skipped.push({ line: i + 1, reason: 'no provider named' });
        return;
      }
      const def = CREDENTIALS[name];
      let value;
      if (name === 'SEC_USER_AGENT') {
        const agent = secAgentFrom(line);
        value = def.valid(agent) ? agent : undefined;
      } else {
        // Candidate tokens: anything between spaces, brackets, quotes, colons or equals signs, except the names.
        // Words from a label ("Massive (formerly Polygon.io)", "personal key") can pass a loose key check, so a
        // token with both letters and digits wins, the longest if several; a line with several plain words and
        // no such token is skipped rather than guessed.
        const tokens = line.split(/[\s[\]()<>"'`,;|:=]+/).filter((t) => t && !names.has(t.toLowerCase()));
        const passing = [...new Set(tokens.filter((t) => def.valid(t)))];
        const keyish = passing.filter((t) => /\d/.test(t) && /[a-z]/i.test(t));
        value = keyish.length ? keyish.reduce((a, b) => (b.length > a.length ? b : a)) : passing.length === 1 ? passing[0] : undefined;
        if (!value && passing.length > 1) {
          skipped.push({ line: i + 1, name, reason: 'more than one word could be the key; paste it into its own field' });
          return;
        }
      }
      if (!value) {
        skipped.push({ line: i + 1, name, reason: `no value that looks like a ${def.label}` });
        return;
      }
      if (found.some((f) => f.name === name)) {
        skipped.push({ line: i + 1, name, reason: 'already given on an earlier line' });
        return;
      }
      found.push({ name, value });
    });
  return { found, skipped };
}

/** Saves every key recognised in pasted text; reports names and reasons only, never values. */
function importCredentials(text) {
  const { found, skipped } = parseCredentialList(text);
  const saved = [];
  for (const { name, value } of found) {
    try {
      saveCredential(name, value);
      saved.push(name);
    } catch (err) {
      skipped.push({ name, reason: String(err.message ?? err) });
    }
  }
  return { saved, skipped };
}

function clearCredential(name) {
  if (!CREDENTIALS[name]) throw new Error('unknown credential');
  const data = readStore();
  delete data[name];
  writeStore(data);
}

// ------------------------------------------------------------- accounting
// Per provider: when it last answered, when and how it last failed, and how
// many requests went out in the last minute. Error text never includes URLs,
// which can carry keys.

const stats = new Map();

/**
 * Daily allowances: the provider's published free-plan limit and the app's own ceiling below it. Counted
 * per UTC day and kept across restarts, so closing the app does not reset them.
 */
const DAILY = {
  alphavantage: { limit: 25, cap: 20 },
  twelvedata: { limit: 800, cap: 600 },
  fmp: { limit: 250, cap: 220 },
  marketaux: { limit: 100, cap: 90 },
  tiingo: { limit: 1000, cap: 500 },
};

const TODAY_FILE = () => (app?.getPath ? path.join(app.getPath('userData'), 'provider-requests-today.json') : null);
const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
let today = null;

function todayCounts() {
  const day = utcDay();
  if (!today) {
    try {
      const f = TODAY_FILE();
      const saved = f ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
      today = saved && saved.day === day && saved.counts && typeof saved.counts === 'object' ? saved : { day, counts: {} };
    } catch {
      today = { day, counts: {} };
    }
  }
  if (today.day !== day) today = { day, counts: {} };
  return today;
}

let saveTimer = null;
function keepToday() {
  const f = TODAY_FILE();
  if (!f || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, JSON.stringify(todayCounts()));
    } catch {
      /* the count stays in memory */
    }
  }, 1000);
}

/** Requests sent to `provider` today (UTC). */
function usedToday(provider) {
  return todayCounts().counts[provider] ?? 0;
}

/** Whether `provider` may still be asked today under the app's own ceiling. */
function withinDailyCap(provider) {
  const d = DAILY[provider];
  return !d || usedToday(provider) < d.cap;
}

function entry(provider) {
  let s = stats.get(provider);
  if (!s) {
    s = { times: [], total: 0, lastAttemptAt: null, lastSuccessAt: null, lastLatencyMs: null, lastErrorAt: null, lastError: null, lastErrorKind: null };
    stats.set(provider, s);
  }
  return s;
}

/** The kind of a failure, in the brief's categories. */
function errorKind(status, err) {
  if (err) {
    const name = String(err.name ?? '');
    if (name === 'TimeoutError' || name === 'AbortError') return 'timeout';
    return 'network';
  }
  // 402: the plan does not include the request (FMP), or its allowance is used up.
  if (status === 401 || status === 402 || status === 403) return 'not-entitled';
  if (status === 404) return 'no-data';
  if (status === 429) return 'rate-limited';
  if (status >= 500) return 'provider-error';
  return 'provider-error';
}

/** Counts a request going out; returns its start time, for the latency. */
function recordRequest(provider) {
  const s = entry(provider);
  const now = Date.now();
  s.times.push(now);
  s.total++;
  s.lastAttemptAt = now;
  while (s.times.length && s.times[0] < now - 60_000) s.times.shift();
  const t = todayCounts();
  t.counts[provider] = (t.counts[provider] ?? 0) + 1;
  keepToday();
  return now;
}

function recordResult(provider, status, err, startedAt) {
  const s = entry(provider);
  if (!err && status >= 200 && status < 300) {
    s.lastSuccessAt = Date.now();
    if (typeof startedAt === 'number') s.lastLatencyMs = s.lastSuccessAt - startedAt;
    return;
  }
  s.lastErrorAt = Date.now();
  s.lastErrorKind = errorKind(status, err);
  s.lastError = err ? String(err.message ?? err).replace(/https?:\/\/\S+/g, '<url>').slice(0, 160) : `HTTP ${status}`;
}

/** Records a problem found after the response arrived (no data, changed format). */
function recordProblem(provider, kind, message) {
  const s = entry(provider);
  s.lastErrorAt = Date.now();
  s.lastErrorKind = kind;
  s.lastError = String(message).replace(/https?:\/\/\S+/g, '<url>').slice(0, 160);
}

/**
 * The provider's own explanation of a failed request, from an error body such
 * as FRED's {"error_code":400,"error_message":"..."} or <error message="..."/>.
 * Secret values and URLs are removed; '' when the body explains nothing.
 */
function providerMessage(text, secrets = []) {
  let msg = '';
  try {
    const j = JSON.parse(text);
    // Each provider words it its own way: {"error_message"}, {"message"}, {"Error Message"} (FMP),
    // {"error": "..."} (Finnhub), {"error": {"message"}} (Marketaux), {"detail"} (Tiingo) or a bare string.
    const first = [j?.error_message, j?.message, j?.['Error Message'], j?.error, j?.error?.message, j?.detail, j].find((x) => typeof x === 'string');
    msg = first ?? '';
  } catch {
    const t = String(text).trim();
    msg = /<error\b[^>]*\bmessage="([^"]*)"/.exec(t)?.[1] ?? (t.startsWith('<') ? '' : t);
  }
  for (const s of secrets) if (s) msg = msg.split(s).join('<key>');
  msg = msg.replace(/https?:\/\/\S+/g, '<url>').replace(/\s+/g, ' ').trim();
  // "Read <url> for more information." says nothing once the link is gone.
  const sentences = msg.split(/(?<=\.) /).filter((x) => !x.includes('<url>'));
  return (sentences.length ? sentences.join(' ') : msg).slice(0, 160);
}

function providerStats() {
  const now = Date.now();
  const out = {};
  for (const [provider, s] of stats) {
    while (s.times.length && s.times[0] < now - 60_000) s.times.shift();
    out[provider] = { lastMinute: s.times.length, total: s.total, lastAttemptAt: s.lastAttemptAt, lastSuccessAt: s.lastSuccessAt, lastLatencyMs: s.lastLatencyMs, lastErrorAt: s.lastErrorAt, lastError: s.lastError, lastErrorKind: s.lastErrorKind };
  }
  // Requests today for every provider counted today, including ones not asked since this start.
  for (const [provider, n] of Object.entries(todayCounts().counts)) {
    out[provider] ??= { lastMinute: 0, total: 0, lastAttemptAt: null, lastSuccessAt: null, lastLatencyMs: null, lastErrorAt: null, lastError: null, lastErrorKind: null };
    out[provider].today = n;
  }
  for (const [provider, d] of Object.entries(DAILY)) {
    if (out[provider]) Object.assign(out[provider], { today: out[provider].today ?? 0, dayLimit: d.limit, dayCap: d.cap });
  }
  return out;
}

// ------------------------------------------------------------ rate limits
// A request waits for a free slot rather than failing. Limits sit below what
// each provider documents.

const limits = new Map();

/** Resolves when a request to `provider` may go out: at most `max` per `windowMs`. */
function slot(provider, max, windowMs) {
  let l = limits.get(provider);
  if (!l) {
    l = { times: [], queue: Promise.resolve() };
    limits.set(provider, l);
  }
  const next = l.queue.then(async () => {
    for (;;) {
      const now = Date.now();
      while (l.times.length && l.times[0] <= now - windowMs) l.times.shift();
      if (l.times.length < max) {
        l.times.push(now);
        return;
      }
      await new Promise((r) => setTimeout(r, l.times[0] + windowMs - now + 5));
    }
  });
  l.queue = next.catch(() => undefined);
  return next;
}

module.exports = { CREDENTIALS, SETTINGS, DAILY, credential, credentialStatus, saveCredential, clearCredential, parseCredentialList, importCredentials, setting, settingStatus, saveSetting, parseSwitch, recordRequest, recordResult, recordProblem, providerMessage, providerStats, slot, usedToday, withinDailyCap, parseDotEnv, errorKind };
