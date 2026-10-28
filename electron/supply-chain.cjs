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

/**
 * The words searched beside a company's name: concentration disclosures, supplier and customer statements, purchases
 * from it, its distributors, the companies naming it a competitor, and leases, contracts and agreements with it.
 * An empty term searches the name alone.
 */
const TERMS = ['', 'accounted for', 'largest customer', 'revenues', 'suppliers', 'supplier', 'customer', 'sole source', 'purchase', 'distributor', 'competitors', 'lease', 'contract', 'agreement'];

/**
 * The filings searched: annual and quarterly reports of the last two years, the IPO prospectuses of the last three
 * years, or the current reports (8-K, with their press releases and other exhibits) of the last two years.
 */
const SETS = {
  reports: { forms: '10-K,20-F,40-F,10-Q', days: 730 },
  prospectus: { forms: 'S-1,F-1,424B4', days: 1096 },
  current: { forms: '8-K', days: 730 },
};

/** A company name as the page may search it: letters, digits and the punctuation of legal names. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9 .,&'()-]{1,59}$/;

/** A document in a filing's folder: CIK, accession number without dashes, an HTML file name. */
const DOC = /^([1-9]\d{0,9})\/(\d{18})\/([A-Za-z0-9][A-Za-z0-9._-]{0,150}\.html?)$/i;

/**
 * The full-text search for the reports (annual and quarterly, 18 months), IPO prospectuses (three years) or current
 * reports (a year) that contain the name and the term, a page of 100 hits (`from` 0 to 400). `arg` is "term|name",
 * optionally followed by "|set", "|from" and "|cik" (one filer's documents only); null when it is not a search the
 * app makes.
 */
function ftsUrl(arg, now = Date.now()) {
  if (typeof arg !== 'string' || arg.length > 240) return null;
  const [term, rawName, set = 'reports', from = '0', cik = '', ...rest] = arg.split('|');
  const name = (rawName ?? '').trim();
  if (rest.length || !TERMS.includes(term) || !NAME.test(name) || !Object.hasOwn(SETS, set) || !['0', '100', '200', '300', '400'].includes(from) || (cik && !/^[1-9]\d{0,9}$/.test(cik))) return null;
  const q = term ? `"${name}" ${term.includes(' ') ? `"${term}"` : term}` : `"${name}"`;
  const day = (t) => new Date(t).toISOString().slice(0, 10);
  const { forms, days } = SETS[set];
  return `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(q)}&forms=${forms}&dateRange=custom&startdt=${day(now - days * DAY)}&enddt=${day(now)}${cik ? `&ciks=${cik.padStart(10, '0')}` : ''}${from !== '0' ? `&from=${from}` : ''}`;
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
    // Line breaks in the source are spaces: many filings wrap each paragraph's text over several source lines. In
    // preformatted text a blank line ends a paragraph.
    .replace(/(<pre\b[\s\S]*?<\/pre>)|[\r\n]+/gi, (m, pre) => (pre ? pre.replace(/\r?\n[ \t]*\r?\n\s*/g, '<br>').replace(/[\r\n]+/g, ' ') : ' '))
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

// Words whose full stop does not end a sentence (Inc., Co., U.S., e.g.) and initials, run together too ("J.C. Bamford").
const ABBREVIATION = /(?:\b(?:Inc|Corp|Co|Cos|Ltd|Bhd|Pty|No|Nos|S\.A|N\.V|L\.P|S\.p\.A|Mr|Ms|Mrs|Dr|St|Jr|Sr|vs|approx|U\.S|U\.K|e\.g|i\.e|etc|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec|Fig|Bros|Intl|Hldgs|Mfg|Ave)\.|(?:^|[\s(.])[A-Z]\.)$/;

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

/** A name's words joined by a space or a hyphen: "Coca Cola" is also "Coca-Cola". */
function spaced(pattern) {
  return pattern.replace(/(?:\\-| )/g, '[ -]');
}

/**
 * One pattern for the names: a name written in capitals (NVIDIA) matches in any case, others as written or in
 * capitals (Apple, APPLE), each as whole words.
 */
function namePattern(names) {
  const exact = [];
  const blind = [];
  for (const n of names) {
    if (/[a-z]/.test(n)) exact.push(spaced(escape(n)), spaced(escape(n.toUpperCase())));
    else blind.push(spaced(escape(n)));
  }
  const words = (alts, flags) => (alts.length ? new RegExp(`(?<![A-Za-z0-9])(?:${alts.join('|')})(?![A-Za-z0-9])`, flags) : null);
  const e = words(exact, '');
  const b = words(blind, 'i');
  const index = (s) => Math.min(...[e, b].filter(Boolean).map((r) => {
    const m = r.exec(s);
    return m ? m.index : Infinity;
  }));
  return { test: (s) => !!(e?.test(s) || b?.test(s)), index: (s) => { const i = index(s); return Number.isFinite(i) ? i : 0; } };
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
    // A long sentence keeps the part around the first mention of the company, so the name is never cut off.
    const at = s.length > MAX_SENTENCE ? pattern.index(s) : 0;
    out.push(at > MAX_SENTENCE / 2 ? s.slice(at - MAX_SENTENCE / 2, at + MAX_SENTENCE / 2) : s.slice(0, MAX_SENTENCE));
    if (out.length >= max) break;
  }
  return out;
}

/** The version of the sentence extraction, part of the stored sentences' keys. */
const EXTRACTION = 7;

/** Counterparties a company announces without naming them: "a U.S. based investment-grade hyperscaler". */
const UNNAMED_PARTY = String.raw`(?:a|an|the same|another|one|two|three|its)\s+(?:[\w.,-]+\s+){0,6}?(?:hyperscalers?|customers?|tenants?|OEMs?|automakers?|carriers?|utilit(?:y|ies)|retailers?|operators?|cloud (?:service )?providers?|(?:technology|semiconductor|software|automotive|energy|telecommunications|pharmaceutical) compan(?:y|ies))\b`;

// In a company's own report: who it names as customers, suppliers and competitors, and the agreements it enters
// into with other companies (leases, supply and purchase agreements, orders, partnerships, investments, loans).
const OWN = new RegExp(
  String.raw`\b(competitors?|compete[sd]?|competing|competition\b[^.]{0,80}?\b(?:from|with|comes|includes)|equity[- ]method|(?:own|owns|owned|hold|holds|held|retained)\s+(?:approximately\s+|about\s+|an?\s+)?\d{1,3}(?:\.\d+)?%|(?:majority|wholly)[- ]owned subsidiar|foundr(?:y|ies)|suppliers?|subcontractors?|contract manufacturers?|manufacturing partners?|vendors?|sole[- ]source|single[- ]source|limited[- ]source|customers? (?:include|including|such as|are|is)|largest customers?|end customers?|Customer [A-Z]\b|accounted for|accounting for|(?:represented|representing|contributed|comprised) (?:approximately |about )?\d|\d{1,3}(?:\.\d+)?\s?%[^.]{0,60}\bof (?:our |its |the Company's )?(?:total |net |consolidated )*(?:revenue|revenues|net sales|sales)\b|(?:revenue|revenues|sales) (?:from|to) [A-Z]|(?:lease|leases|hosting agreement|colocation agreement|capacity agreement|services agreement)\b[^;]{0,120}\bwith [A-Z][^;]{0,200}\bto (?:host|serve|support)\b` +
    // Agreement names are often capitalised ("a Credit and Guaranty Agreement with Goldman Sachs Bank USA").
    String.raw`|(?:[Aa]greements?|[Ll]eases?|[Cc]ontracts?|[Oo]rders?|[Pp]artnership|[Cc]ollaboration|[Aa]lliance|[Jj]oint [Vv]enture|[Ff]acility|[Nn]otice to [Pp]roceed|LNTP|[Mm]emorandum of [Uu]nderstanding|[Ll]etter of [Ii]ntent|[Oo]fftake|[Pp]romissory [Nn]ote)\b[^.;]{0,160}?\bwith\s+(?:(?:a|an|the|its)\s+)?(?:new\s+|leading\s+|major\s+|global\s+)?[A-Z]` +
    // A lender named as a facility's agent; units or shares issued to an investor; suppliers listed after the
    // purchasing they serve ("purchasing around ... qualified partners-including ABB for electrical equipment"); an
    // exhibit list's agreements "by and among" their parties.
    String.raw`|as\s+(?:the\s+)?(?:administrative|collateral)\s+agent\b|formerly,?\s+(?:known as\s+)?[A-Z]` +
    String.raw`|\b(?:issued|issuing|issue|sold|selling|sell)\b(?:[^.;]|\.(?=\d)){0,160}\b(?:preferred units|common units|units|preferred stock|preferred shares|shares of (?:our |its )?(?:common|preferred|Series))\b(?:[^.;]|\.(?=\d)){0,160}\bto\s+[A-Z]` +
    String.raw`|\b(?:purchas\w+|procur\w+|sourc\w+|buy\w*)\b[^.]{0,120}?\b(?:partners?|providers?|vendors?|suppliers?|manufacturers?)\b[^.]{0,20}?\b(?:including|such as|like|include|includes|namely)\b` +
    String.raw`|^[A-Z][^.;]{0,140}\b(?:Agreement|Lease|Note|Contract|Guaranty)\b[^;]{0,120}\b(?:by and between|by and among|between|among)\s+[A-Z]` +
    String.raw`|(?:agreements?|leases?|contracts?|orders?|partnership|collaboration)\b[^.;]{0,160}?\bwith\s+${UNNAMED_PARTY}` +
    // A campus or building "currently leased to Oracle": the tenant is a customer.
    String.raw`|\b(?:leased|subleased|rented)\s+(?:[\w-]+\s+){0,2}?to\s+(?:(?:[A-Z])|${UNNAMED_PARTY})` +
    String.raw`|\b(?:selected|chosen|awarded|engaged)\b[^.;]{0,60}\bby\s+[A-Z]|\b(?:orders?|contracts?|awards?|investments?)\s+from\s+[A-Z]|\bpartner(?:ship|ships|ed|s)?\b[^.;]{0,60}\bwith\s+[A-Z]` +
    String.raw`|\b(?:purchase[sd]?|purchasing|buy|buys|bought|source[sd]?|sourcing|procure[sd]?|procuring|obtain(?:s|ed)?|license[sd]?)\b[^.;]{0,100}\bfrom\s+[A-Z]|\b(?:rely|relies|relied|depend|depends|depended|dependent|reliant)\b[^.;]{0,40}\bon\s+[A-Z]|\b(?:manufactured|produced|supplied|fabricated|assembled) by\s+[A-Z])`,
);
// A sentence that introduces a list of competitors on the lines that follow.
const LIST_INTRO = /\b(competitors (?:include|are|consist)|compete (?:with|against)|competition (?:comes from|includes|from))\b[^.]*:?\s*$/i;

/** The sentences of a company's own report that name its customers, suppliers and competitors. */
function ownSentences(text, max = 400) {
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
  let heading = '';
  for (let b = 0; b < blocks.length && out.length < max; b++) {
    const block = blocks[b].trim();
    for (const s of splitSentences(block)) {
      if (s.length < 25 || !/[a-z]{3}/.test(s) || !OWN.test(s)) continue;
      // "HPC Hosting Business" above "During fiscal year 2026, this business segment was comprised of one customer
      // accounting for 59%": the heading names the segment the sentence speaks of.
      add(heading && /\bthis (?:business )?segment\b/i.test(s) && !s.startsWith(heading) ? `${heading} ${s}` : s);
    }
    if (block) heading = /^[A-Z][\w&-]*(?:\s+[A-Z][\w&-]*){0,5}$/.test(block) && /\b(?:Business|Segment)$/.test(block) ? block : '';
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
    // The extraction's version: sentences taken by an older reading are read again.
    return `${EXTRACTION}|${kind}|${path}|${(names ?? []).join(',')}`;
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

module.exports = { TERMS, SETS, EXTRACTION, ftsUrl, searchUrl, docUrl, htmlToText, splitSentences, namePattern, cleanNames, mentionSentences, ownSentences, SentenceStore };
