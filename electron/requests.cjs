// Shared, injectable GET transport. Only complete, valid answers enter the cache.
// Kept data is scoped to credentials so replacing a key cannot reuse another account's answer.
const { createHash } = require('node:crypto');

function retryAfter(value, now) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const until = Date.parse(value);
  return Number.isFinite(until) ? Math.max(0, until - now) : 0;
}

function createRequester({ providers, fetch, agent, validate, timeoutMs = 20_000, now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), random = Math.random }) {
  const kept = new Map();
  const inflight = new Map();
  const breakers = new Map();
  const limitedUntil = new Map();
  const safe = (text, secrets) => providers.providerMessage(String(text), secrets);
  const cacheId = (provider, url, headers, secrets, userAgent, transport) => `${provider}:${createHash('sha256').update(JSON.stringify([url, headers, secrets, userAgent, transport])).digest('hex')}`;

  async function request(provider, url, headers, ttl, pace, secrets = [], userAgent, transport) {
    const id = cacheId(provider, url, headers, secrets, userAgent, transport);
    const old = kept.get(id);
    if (old && now() - old.at < ttl) return { status: 200, text: old.text, at: old.at, cached: true };
    if (inflight.has(id)) return inflight.get(id);
    const pending = send(provider, url, headers, pace, secrets, userAgent, id, old, transport);
    inflight.set(id, pending);
    try {
      return await pending;
    } finally {
      inflight.delete(id);
    }
  }

  async function send(provider, url, headers, pace, secrets, userAgent, id, old, transport) {
    const stale = (extra) => ({ status: 0, text: old?.text ?? '', ...(old ? { at: old.at, stale: true } : {}), ...extra });
    const budget = () => {
      providers.recordProblem(provider, 'rate-limited', "The app's daily budget for this provider is spent; it asks again after midnight UTC.");
      return stale({ budget: true });
    };
    const paused = () => {
      const retryAt = limitedUntil.get(provider) ?? 0;
      if (retryAt > now()) return stale({ error: 'Provider rate limit: waiting before the next request.', retryAt });
      const b = breakers.get(provider);
      if (b?.openUntil > now()) return stale({ error: `Paused after ${b.fails} failures in a row.`, retryAt: b.openUntil });
      return null;
    };
    const failed = () => {
      const b = breakers.get(provider) ?? { fails: 0, openUntil: 0 };
      b.fails++;
      if (b.fails >= 5) b.openUntil = now() + 120_000;
      breakers.set(provider, b);
    };
    const p = paused();
    if (p) return p;
    if (!providers.withinDailyCap(provider)) return budget();

    for (let attempt = 0; attempt < 3; attempt++) {
      await providers.slot(provider, pace[0], pace[1]);
      // Hourly limits share the same final daily check, after both queues.
      if (pace[2]) await providers.slot(`${provider}:hour`, pace[2], 3_600_000);
      const waiting = paused();
      if (waiting) return waiting;
      if (!providers.withinDailyCap(provider)) return budget();
      const started = providers.recordRequest(provider);
      let res;
      let text;
      try {
        res = await fetch(url, {
          ...transport,
          headers: { 'User-Agent': userAgent ?? agent(), Accept: 'application/json', ...headers },
          cache: 'no-cache',
          signal: AbortSignal.timeout(timeoutMs),
        });
        // A successful header is not a successful response until its entire body arrives.
        text = await res.text();
      } catch (err) {
        const message = safe(JSON.stringify({ message: err?.message ?? String(err) }), secrets) || 'Network request failed';
        const sanitized = Object.assign(new Error(message), { name: err?.name ?? 'Error' });
        providers.recordResult(provider, 0, sanitized, started);
        if (attempt < 2) {
          await sleep(1000 * 2 ** attempt + random() * 300);
          continue;
        }
        failed();
        return stale({ error: message });
      }

      if (!res.ok) {
        providers.recordResult(provider, res.status, undefined, started);
        const why = safe(text, secrets);
        const message = `HTTP ${res.status}${why ? `: ${why}` : ''}`;
        providers.recordProblem(provider, providers.errorKind(res.status), message);
        if (res.status === 429) {
          // Never hammer a provider or sleep for a long Retry-After inside an IPC request.
          const retryAt = now() + Math.max(60_000, retryAfter(res.headers?.get('retry-after'), now()));
          limitedUntil.set(provider, retryAt);
          return { ...stale({ error: message, retryAt }), status: res.status };
        }
        if (res.status >= 500 && attempt < 2) {
          await sleep(1000 * 2 ** attempt + random() * 300);
          continue;
        }
        if (res.status >= 500) failed();
        return { ...stale({ error: message }), status: res.status };
      }

      let problem = providers.providerPayloadProblem(provider, text, secrets);
      if (!problem) {
        try {
          if (!text.trim()) throw new Error('empty body');
          // News feeds can be XML; every other keyed endpoint speaks JSON.
          if (provider !== 'marketwatch' && provider !== 'sec') JSON.parse(text);
        } catch {
          problem = { kind: 'provider-error', message: 'The provider returned an empty or invalid JSON response.' };
        }
      }
      if (!problem && validate) problem = validate(provider, url, text);
      if (problem) {
        providers.recordProblem(provider, problem.kind, problem.message);
        if (problem.kind === 'rate-limited') limitedUntil.set(provider, now() + 60_000);
        else if (problem.kind === 'provider-error') failed();
        return stale({ error: problem.message });
      }

      providers.recordResult(provider, res.status, undefined, started);
      breakers.delete(provider);
      limitedUntil.delete(provider);
      const at = now();
      kept.set(id, { text, at });
      if (kept.size > 400) kept.delete(kept.keys().next().value);
      return { status: res.status, text, at };
    }
  }

  return request;
}

module.exports = { createRequester, retryAfter };
