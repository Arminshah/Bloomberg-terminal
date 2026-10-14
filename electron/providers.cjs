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
  if (status === 401 || status === 403) return 'not-entitled';
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
    msg = typeof j?.error_message === 'string' ? j.error_message : typeof j?.message === 'string' ? j.message : '';
  } catch {
    msg = /<error\b[^>]*\bmessage="([^"]*)"/.exec(String(text))?.[1] ?? '';
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

module.exports = { CREDENTIALS, SETTINGS, credential, credentialStatus, saveCredential, clearCredential, setting, settingStatus, saveSetting, parseSwitch, recordRequest, recordResult, recordProblem, providerMessage, providerStats, slot, parseDotEnv, errorKind };
