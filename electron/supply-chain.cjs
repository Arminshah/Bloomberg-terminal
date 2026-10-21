// Supply chains from SEC filings, for the main process. Companies name their
// large customers (with the share of revenue each accounts for), their key
// suppliers and their competitors in their annual reports. SPLC finds the
// reports that name a company with the SEC's full-text search and reads the
// sentences that name it; the page classifies them. Only the sentences go back
// to the page, never the documents (a 10-K is a few megabytes).
//
// The SEC's fair-access rules apply as for the rest of EDGAR (electron/sec.cjs):
// the owner's User-Agent, at most 5 requests a second, answers kept.

const DAY = 86_400_000;

/** The words searched beside a company's name: concentration disclosures, supplier and customer statements. */
const TERMS = ['accounted for', 'revenues', 'suppliers', 'supplier', 'customer', 'sole source'];

/** A company name as the page may search it: letters, digits and the punctuation of legal names. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9 .,&'()-]{1,59}$/;

/** A document in a filing's folder: CIK, accession number without dashes, an HTML file name. */
const DOC = /^([1-9]\d{0,9})\/(\d{18})\/([A-Za-z0-9][A-Za-z0-9._-]{0,150}\.html?)$/i;

/**
 * The full-text search for annual reports (10-K, 20-F, 40-F) of the last 18 months that contain the name and
 * the term. `arg` is "term|name"; null when it is not a search the app makes.
 */
function ftsUrl(arg, now = Date.now()) {
  if (typeof arg !== 'string' || arg.length > 200) return null;
  const bar = arg.indexOf('|');
  if (bar < 0) return null;
  const term = arg.slice(0, bar);
  const name = arg.slice(bar + 1).trim();
  if (!TERMS.includes(term) || !NAME.test(name)) return null;
  const q = `"${name}" ${term.includes(' ') ? `"${term}"` : term}`;
  const day = (t) => new Date(t).toISOString().slice(0, 10);
  return `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(q)}&forms=10-K,20-F,40-F&dateRange=custom&startdt=${day(now - 548 * DAY)}&enddt=${day(now)}`;
}

/**
 * DS, document search: the full-text search with the page's words and filters, each checked (words of up to 120
 * characters without markup, form names, CIKs, ISO dates, a page offset). `arg` is a query string; null when a part
 * is not one the app sends.
 */
function searchUrl(arg) {
  if (typeof arg !== 'string' || arg.length > 400) return null;
  let p;
  try {
    p = new URLSearchParams(arg);
  } catch {
    return null;
  }
  const out = new URLSearchParams();
  for (const key of p.keys()) if (!['q', 'forms', 'ciks', 'startdt', 'enddt', 'from'].includes(key)) return null;
  const q = (p.get('q') ?? '').trim();
  if (q.length < 2 || q.length > 120 || /[\u0000-\u001f<>{}\\^`|~]/.test(q)) return null;
  out.set('q', q);
  const forms = p.get('forms');
  if (forms) {
    const list = forms.split(',');
    if (list.length > 16 || !list.every((f) => /^[A-Z0-9][A-Z0-9 /-]{0,11}$/.test(f))) return null;
    out.set('forms', forms);
  }
  const ciks = p.get('ciks');
  if (ciks) {
    const list = ciks.split(',');
    if (list.length > 5 || !list.every((c) => /^\d{10}$/.test(c))) return null;
    out.set('ciks', ciks);
  }
  const iso = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`));
  const start = p.get('startdt');
  const end = p.get('enddt');
  if (start || end) {
    if (!start || !end || !iso(start) || !iso(end)) return null;
    out.set('dateRange', 'custom');
    out.set('startdt', start);
    out.set('enddt', end);
  }
  const from = p.get('from');
  if (from) {
    if (!/^\d{1,4}$/.test(from) || Number(from) % 100 !== 0 || Number(from) > 9900) return null;
    out.set('from', from);
  }
  return `https://efts.sec.gov/LATEST/search-index?${out.toString().replace(/\+/g, '%20')}`;
}

/** The URL of a filed document, or null when the path is not one. */
function docUrl(path) {
  return typeof path === 'string' && DOC.test(path) ? `https://www.sec.gov/Archives/edgar/data/${path}` : null;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', ndash: '-', mdash: '-', hellip: '...', bull: ' ', middot: ' ' };

function entity(_, body) {
  if (body[0] === '#') {
    const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    if (!Number.isFinite(code)) return ' ';
    if (code === 160 || code === 8226 || code === 183) return ' ';
    if (code === 8217 || code === 8216) return "'";
    if (code === 8220 || code === 8221) return '"';
    if (code === 8211 || code === 8212) return '-';
    return code < 0x110000 ? String.fromCodePoint(code) : ' ';
  }
  return ENTITIES[body.toLowerCase()] ?? ' ';
}

/** A filing's HTML as text: one line per paragraph, list item and table cell. */
function htmlToText(html) {
  return String(html)
    .replace(/<(script|style|ix:header)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|td|th|table|center)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, entity)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[ \t  -​]+/g, ' ')
    .replace(/ *\n[\n ]*/g, '\n');
}

// Words whose full stop does not end a sentence (Inc., Co., U.S., e.g.) and single initials.
const ABBREVIATION = /(?:\b(?:Inc|Corp|Co|Cos|Ltd|Bhd|Pty|No|Nos|S\.A|N\.V|L\.P|S\.p\.A|Mr|Ms|Mrs|Dr|St|Jr|Sr|vs|approx|U\.S|U\.K|e\.g|i\.e|etc|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec|Fig|Bros|Intl|Hldgs|Mfg|Ave)\.|(?:^|[\s(])[A-Z]\.)$/;

/** Sentences of a text, kept whole across "Inc." and "U.S.", never across a paragraph. */
function splitSentences(text) {
  const out = [];
  for (const block of String(text).split('\n')) {
    const parts = block.split(/(?<=[.!?]["')]?)\s+(?=["'(]?[A-Z0-9])/);
    let cur = '';
    for (const p of parts) {
      cur = cur ? `${cur} ${p}` : p;
      if (!ABBREVIATION.test(cur)) {
        out.push(cur.trim());
        cur = '';
      }
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out;
}

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One pattern for the names: a name written in capitals (NVIDIA) matches in any case, others as written or in
 * capitals (Apple, APPLE), each as whole words.
 */
function namePattern(names) {
  const exact = [];
  const blind = [];
  for (const n of names) {
    if (/[a-z]/.test(n)) exact.push(escape(n), escape(n.toUpperCase()));
    else blind.push(escape(n));
  }
  const words = (alts, flags) => (alts.length ? new RegExp(`(?<![A-Za-z0-9])(?:${alts.join('|')})(?![A-Za-z0-9])`, flags) : null);
  const e = words(exact, '');
  const b = words(blind, 'i');
  return { test: (s) => !!(e?.test(s) || b?.test(s)) };
}

/** Valid names from the page: up to eight, each a plausible company name. */
function cleanNames(names) {
  if (!Array.isArray(names)) return null;
  const out = [...new Set(names.filter((n) => typeof n === 'string' && NAME.test(n.trim())).map((n) => n.trim()))].slice(0, 8);
  return out.length ? out : null;
}

const MAX_SENTENCE = 1200;

/** The sentences that name the company (the first `max`), each cut to a readable length. */
function mentionSentences(text, names, max = 80) {
  const pattern = namePattern(names);
  const out = [];
  for (const s of splitSentences(text)) {
    if (s.length < 25 || !/[a-z]{3}/.test(s) || !pattern.test(s)) continue;
    out.push(s.slice(0, MAX_SENTENCE));
    if (out.length >= max) break;
  }
  return out;
}

// In a company's own report: who it names as customers, suppliers and competitors.
const OWN = /\b(competitors?|compete[sd]?|competing|competition (?:from|with|comes|includes)|foundr(?:y|ies)|suppliers?|subcontractors?|contract manufacturers?|manufacturing partners?|vendors?|sole[- ]source|single[- ]source|limited[- ]source|customers? (?:include|including|such as|are|is)|largest customers?|end customers?|Customer [A-Z]\b|accounted for|(?:represented|contributed|comprised) (?:approximately |about )?\d|\d%[^.]{0,60}\bof (?:our |its |the Company's )?(?:total |net |consolidated )*(?:revenue|revenues|net sales|sales)\b|(?:revenue|revenues|sales) (?:from|to) [A-Z])/;
// A sentence that introduces a list of competitors on the lines that follow.
const LIST_INTRO = /\b(competitors (?:include|are|consist)|compete (?:with|against)|competition (?:comes from|includes|from))\b[^.]*:?\s*$/i;

/** The sentences of a company's own report that name its customers, suppliers and competitors. */
function ownSentences(text, max = 220) {
  const out = [];
  const seen = new Set();
  const add = (s) => {
    const v = s.slice(0, MAX_SENTENCE);
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  };
  const blocks = String(text).split('\n');
  for (let b = 0; b < blocks.length && out.length < max; b++) {
    const block = blocks[b].trim();
    for (const s of splitSentences(block)) {
      if (s.length >= 25 && /[a-z]{3}/.test(s) && OWN.test(s)) add(s);
    }
    // "Our current competitors include:" then one line per group of competitors.
    if (LIST_INTRO.test(block) && block.endsWith(':')) {
      let k = b + 1;
      for (; k < blocks.length && k <= b + 12; k++) {
        const item = blocks[k].trim();
        if (!item) continue;
        if (!/^[a-z•·\-(]/.test(item) && !/;\s*(and)?$/.test(item)) break;
        add(`[competitors] ${item.replace(/^[•·\-]\s*/, '')}`);
      }
      b = k - 1;
    }
  }
  return out.slice(0, max);
}

/**
 * Extracted sentences kept by document and names: filed documents never change, so they are kept for a month
 * and survive restarts (the store saves the newest 3000).
 */
class SentenceStore {
  constructor(max = 3000) {
    this.max = max;
    this.map = new Map();
  }
  key(kind, path, names) {
    return `${kind}|${path}|${(names ?? []).join(',')}`;
  }
  get(key, now = Date.now()) {
    const v = this.map.get(key);
    return v && now - v.at < 30 * DAY ? v : undefined;
  }
  set(key, value) {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
  toJSON() {
    return [...this.map.entries()];
  }
  load(entries, now = Date.now()) {
    if (!Array.isArray(entries)) return;
    for (const e of entries) {
      if (Array.isArray(e) && typeof e[0] === 'string' && e[1] && typeof e[1].at === 'number' && Array.isArray(e[1].sentences) && now - e[1].at < 30 * DAY) this.map.set(e[0], e[1]);
    }
  }
}

module.exports = { TERMS, ftsUrl, searchUrl, docUrl, htmlToText, splitSentences, namePattern, cleanNames, mentionSentences, ownSentences, SentenceStore };
