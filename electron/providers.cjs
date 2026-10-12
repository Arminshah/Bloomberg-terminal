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
  if (!safeStorage.isEncryptionAvailable()) throw new Error('This system cannot encrypt saved keys; set the environment variable instead');
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
    s = { times: [], total: 0, lastSuccessAt: null, lastErrorAt: null, lastError: null, lastErrorKind: null };
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

function recordRequest(provider) {
  const s = entry(provider);
  const now = Date.now();
  s.times.push(now);
  s.total++;
  while (s.times.length && s.times[0] < now - 60_000) s.times.shift();
}

function recordResult(provider, status, err) {
  const s = entry(provider);
  if (!err && status >= 200 && status < 300) {
    s.lastSuccessAt = Date.now();
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
    out[provider] = { lastMinute: s.times.length, total: s.total, lastSuccessAt: s.lastSuccessAt, lastErrorAt: s.lastErrorAt, lastError: s.lastError, lastErrorKind: s.lastErrorKind };
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

module.exports = { CREDENTIALS, credential, credentialStatus, saveCredential, clearCredential, recordRequest, recordResult, recordProblem, providerMessage, providerStats, slot, parseDotEnv, errorKind };
