// OpenFIGI for the main process: the US ticker of a security named by its CUSIP (a US or Canadian issue) or CINS (a
// foreign issue, the same nine characters starting with a letter), as 13F filings name their holdings. The
// identifiers are free and open (FIGI terms of service); the API needs no key and takes one for higher limits.
//
// api.openfigi.com/v3/mapping (documentation read 25 October 2026): POST a JSON array of jobs {idType, idValue,
// exchCode}; the answer has one entry per job, {data: [...]} or {warning: "No identifier found."} or {error}.
// Without a key 25 requests a minute of 10 jobs each; with one 250 a minute of 100. Over the limit: HTTP 429.

const MAPPING_URL = 'https://api.openfigi.com/v3/mapping';
// Nine characters: eight letters or digits and a check digit.
const CODE = /^[0-9A-Z]{8}[0-9]$/;

/** Jobs per request and requests per minute; the app keeps a little under the published ceilings. */
const LIMITS = { keyed: { jobs: 100, perMinute: 200 }, open: { jobs: 10, perMinute: 20 } };

/** Codes the page may ask about: CUSIPs and CINS, upper case, each once, at most `max`; null when any is not one. */
function cleanCodes(codes, max = 2000) {
  if (!Array.isArray(codes) || codes.length > max) return null;
  const out = [];
  for (const c of codes) {
    const s = String(c ?? '').trim().toUpperCase();
    if (!CODE.test(s)) return null;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

/** A CINS starts with a letter (the issuer's country), a CUSIP with a digit. */
function idType(code) {
  return /^[A-Z]/.test(code) ? 'ID_CINS' : 'ID_CUSIP';
}

/** The request body for some codes: their US composite listing. */
function mappingJobs(codes) {
  return codes.map((c) => ({ idType: idType(c), idValue: c, exchCode: 'US' }));
}

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/**
 * Each code's answer from a mapping response, by code: {ticker, name, securityType, figi} for a match, {none: true}
 * when OpenFIGI knows no US listing for it, {error} when the job failed. Null when the body is not a mapping answer.
 */
function parseMapping(text, codes) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(json) || json.length !== codes.length) return null;
  const out = {};
  codes.forEach((code, i) => {
    const job = json[i];
    const data = Array.isArray(job?.data) ? job.data : null;
    if (data) {
      // The composite US listing first; a code with only another US venue's line is still that security.
      const hit = data.find((d) => d?.exchCode === 'US' && str(d?.ticker)) ?? data.find((d) => str(d?.ticker));
      if (hit) {
        out[code] = {
          ticker: str(hit.ticker).toUpperCase(),
          name: str(hit.name) ?? '',
          securityType: str(hit.securityType2) ?? str(hit.securityType) ?? '',
          figi: str(hit.compositeFIGI) ?? str(hit.figi) ?? '',
        };
        return;
      }
      out[code] = { none: true };
      return;
    }
    if (typeof job?.warning === 'string') out[code] = { none: true };
    else out[code] = { error: str(job?.error) ?? 'no answer for this code' };
  });
  return out;
}

/**
 * Answers kept by code. A match is kept a week (a CUSIP's ticker changes rarely: a rename, a move of exchange), a
 * code without a US listing a day. Saved to disk so a restart does not ask again.
 */
class FigiStore {
  constructor(max = 20000) {
    this.max = max;
    this.map = new Map();
  }
  get(code, now = Date.now()) {
    const e = this.map.get(code);
    if (!e) return undefined;
    const ttl = e.value.ticker ? 7 * 86_400_000 : 86_400_000;
    return now - e.at < ttl ? e : undefined;
  }
  set(code, value, at = Date.now()) {
    if (value.error) return;
    this.map.delete(code);
    this.map.set(code, { at, value });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
  load(saved) {
    if (!saved || typeof saved !== 'object') return;
    for (const [code, e] of Object.entries(saved)) {
      if (CODE.test(code) && typeof e?.at === 'number' && e.value && typeof e.value === 'object') this.map.set(code, { at: e.at, value: e.value });
    }
  }
  toJSON() {
    return Object.fromEntries(this.map);
  }
}

// A US stock's listings in other countries (RELS): its ticker on the US composite gives its share class, and the share
// class every line it trades on; each country's composite line is kept.

/** A US ticker as OpenFIGI writes it (BRK/A for a class); null when it is not one. */
function usTicker(ticker) {
  const t = String(ticker ?? '').trim().toUpperCase().replace(/[.-]/, '/');
  return /^[A-Z][A-Z0-9]{0,6}(\/[A-Z]{1,2})?$/.test(t) ? t : null;
}

const tickerJobs = (ticker) => [{ idType: 'TICKER', idValue: ticker, exchCode: 'US' }];
const shareClassJobs = (figi) => [{ idType: 'ID_BB_GLOBAL_SHARE_CLASS_LEVEL', idValue: figi }];
const SHARE_CLASS = /^BBG[0-9A-Z]{9}$/;

/** The share class of a ticker's US line, from a one-job mapping answer; null when there is none. */
function shareClassOf(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const hit = Array.isArray(json?.[0]?.data) ? json[0].data.find((d) => SHARE_CLASS.test(String(d?.shareClassFIGI ?? ''))) : null;
  return hit ? { shareClassFIGI: hit.shareClassFIGI, name: str(hit.name) ?? '' } : null;
}

/** Each country's composite line of a share class, the US first: exchange code, ticker, name and type. */
function compositesOf(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const data = json?.[0]?.data;
  if (!Array.isArray(data)) return typeof json?.[0]?.warning === 'string' ? [] : null;
  return data
    .filter((d) => str(d?.figi) && d.figi === d.compositeFIGI && str(d?.exchCode) && str(d?.ticker))
    .map((d) => ({ exchCode: str(d.exchCode), ticker: str(d.ticker), name: str(d.name) ?? '', securityType: str(d.securityType2) ?? str(d.securityType) ?? '', figi: d.figi }))
    .sort((a, b) => Number(b.exchCode === 'US') - Number(a.exchCode === 'US') || a.exchCode.localeCompare(b.exchCode) || a.ticker.localeCompare(b.ticker));
}

module.exports = { MAPPING_URL, LIMITS, CODE, cleanCodes, idType, mappingJobs, parseMapping, FigiStore, usTicker, tickerJobs, shareClassJobs, shareClassOf, compositesOf };
