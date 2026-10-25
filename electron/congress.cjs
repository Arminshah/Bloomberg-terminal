// Members of Congress and their financial disclosures, for the main process. The House Clerk publishes every
// disclosure filed by members of the House: a yearly index (a ZIP holding a tab-separated list) and each report as
// a PDF. Periodic transaction reports (PTRs) list the stocks and other assets a member, a spouse or a dependent child
// bought or sold; annual reports list what they own (Schedule A), each value as a range. Reports filed electronically
// are PDFs with text, read here line by line (electron/pdf-text.cjs); reports filed on paper are scans, with no text.
// The member lists come from the House Clerk and the Senate, with each member's party.
//
// The Senate's disclosure site (efdsearch.senate.gov) refuses automated requests, so senators' trades come only
// from Financial Modeling Prep's list of the latest ones, with the owner's key.
//
// 5 U.S.C. § 13107(c): it is unlawful to obtain or use these reports for any unlawful or commercial purpose (other
// than by news media), to determine a credit rating, or to solicit money. The app is for its owner's private use.

const zlib = require('node:zlib');

const HOUSE = 'https://disclosures-clerk.house.gov';
const MEMBERS_URL = 'https://clerk.house.gov/xml/lists/MemberData.xml';
const SENATORS_URL = 'https://www.senate.gov/general/contact_information/senators_cfm.xml';
const DOC_ID = /^\d{4,10}$/;
/** Reports kept on disk are read again when the reading changes: this goes up with each change. */
const READER_VERSION = 2;

/** A filing year the Clerk publishes (from 2008), up to next year; null otherwise. */
function filingYear(y, now = new Date()) {
  const n = Number(y);
  return Number.isInteger(n) && n >= 2008 && n <= now.getUTCFullYear() + 1 ? n : null;
}

const indexUrl = (year) => `${HOUSE}/public_disc/financial-pdfs/${year}FD.zip`;
const ptrUrl = (year, docId) => `${HOUSE}/public_disc/ptr-pdfs/${year}/${docId}.pdf`;
const annualUrl = (year, docId) => `${HOUSE}/public_disc/financial-pdfs/${year}/${docId}.pdf`;

/** "2026/20035691" → { year, docId }; null when it is not one. */
function docRef(arg, now = new Date()) {
  const m = /^(\d{4})\/(\d{4,10})$/.exec(String(arg ?? ''));
  const year = m ? filingYear(m[1], now) : null;
  return year && DOC_ID.test(m[2]) ? { year, docId: m[2] } : null;
}

// --------------------------------------------------------------- the ZIP

/** One file from a ZIP archive (stored or deflated), or null. Enough for the Clerk's index archives. */
function unzipFile(buf, name, maxBytes = 50_000_000) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) return null;
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  for (let k = 0; k < count && p + 46 <= buf.length; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const full = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const entry = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extra + comment;
    if (entry !== name) continue;
    if (full > maxBytes || local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) return null;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    if (method === 0) return Buffer.from(data);
    if (method === 8) return zlib.inflateRawSync(data, { maxOutputLength: maxBytes });
    return null;
  }
  return null;
}

/** "5/15/2026" or "05/15/2026" → "2026-05-15"; '' otherwise. */
function usDate(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s ?? '').trim());
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
}

/**
 * The yearly index ({year}FD.txt): one filing a line, tab separated, under the heading Prefix, Last, First, Suffix,
 * FilingType, StateDst, Year, FilingDate, DocID. Filing types: P periodic transaction report, O annual report, A
 * amendment, C candidate, X extension, T termination, W withdrawn, and a few others.
 */
function parseHouseIndex(text) {
  const lines = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/);
  if (!/^Prefix\tLast\tFirst\tSuffix\tFilingType\tStateDst\tYear\tFilingDate\tDocID/.test(lines[0] ?? '')) return null;
  const out = [];
  for (const line of lines.slice(1)) {
    const c = line.split('\t').map((x) => x.trim());
    if (c.length < 9 || !DOC_ID.test(c[8]) || !c[1]) continue;
    const filed = usDate(c[7]);
    if (!filed) continue;
    out.push({ prefix: c[0], last: c[1], first: c[2], suffix: c[3], type: c[4], stateDst: c[5], year: Number(c[6]), filed, docId: c[8] });
  }
  return out;
}

// ------------------------------------------------------ the PDF forms

/** Asset type codes as the House lists them (fd.house.gov/reference/asset-type-codes.aspx, read 25 October 2026). */
const ASSET_TYPES = {
  '4K': '401K and other retirement accounts', '5C': '529 college savings plan', '5F': '529 portfolio', '5P': '529 prepaid tuition plan',
  AB: 'Asset-backed securities', BA: 'Bank, money market accounts and CDs', BK: 'Brokerage account', CO: 'Collectibles',
  CS: 'Corporate bonds and notes', CT: 'Cryptocurrency', DB: 'Defined benefit pension', DO: 'Debts owed to the filer',
  DS: 'Delaware statutory trust', EF: 'ETF', EQ: 'Excepted or qualified blind trust', ET: 'Exchange traded note', FA: 'Farm',
  FE: 'Foreign exchange position', FN: 'Fixed annuity', FU: 'Futures', GS: 'Government securities and agency debt',
  HE: 'Hedge or private equity fund (EIF)', HN: 'Hedge or private equity fund', IC: 'Investment club', IH: 'IRA (cash)',
  IP: 'Intellectual property and royalties', IR: 'IRA', MA: 'Managed account', MF: 'Mutual fund', MO: 'Mineral, oil or solar rights',
  OI: 'Ownership interest (holding investments)', OL: 'Ownership interest (trade or business)', OP: 'Options', OT: 'Other',
  PE: 'Pension', PM: 'Precious metals', PS: 'Stock (not publicly traded)', RE: 'REIT', RF: 'REIT (EIF)', RN: 'REIT (non-EIF)',
  RP: 'Real property', RS: 'Restricted stock units', SA: 'Stock appreciation right', ST: 'Stock (including ADRs)', TR: 'Trust',
  VA: 'Variable annuity', VI: 'Variable insurance', WU: 'Whole or universal insurance',
};

/**
 * The forms' labels under an asset ("Filing Status: New", "Description: ..."). Their bold font has no text map for
 * lower case, so PDF.js reads only the capitals ("F      S     : New"); both spellings are known.
 */
const LABELS = { 'F S': 'status', 'S O': 'subholding', D: 'description', C: 'comments', L: 'location' };
const LABEL_WORDS = { 'filing status': 'status', 'subholding of': 'subholding', description: 'description', comments: 'comments', location: 'location' };

function labelOf(text) {
  const words = /^(Filing Status|Subholding Of|Description|Comments|Location)\s*:\s*(.*)$/i.exec(text);
  if (words) return { key: LABEL_WORDS[words[1].toLowerCase()], value: words[2].trim() };
  const caps = /^([A-Z](?:\s+[A-Z])?)\s*:\s*(.*)$/.exec(text);
  const key = caps ? LABELS[caps[1].replace(/\s+/g, ' ')] : undefined;
  return key ? { key, value: caps[2].trim() } : null;
}

/** "$1,001 - $15,000" → { min, max }; "Over $50,000,000" → { min, max: null }; "None" → zero; null when unknown. */
function amountRange(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (/^none$/i.test(t)) return { min: 0, max: 0 };
  const nums = [...t.matchAll(/\$\s?([\d,]+(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, '')));
  if (/\bover\b/i.test(t) && nums.length === 1) return { min: nums[0], max: null };
  if (nums.length === 2 && nums[0] <= nums[1]) return { min: nums[0], max: nums[1] };
  return null;
}

/** "Intel Corporation - Common Stock (INTC) [ST]" → its name, ticker and asset type code. */
function assetParts(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  const code = /\[([0-9A-Z]{2})\]\s*$/.exec(t)?.[1] ?? '';
  const body = code ? t.replace(/\s*\[[0-9A-Z]{2}\]\s*$/, '') : t;
  // Sub-holdings read "Account ⇒ Holding", or deeper: "Trust ⇒ Brokerage account ⇒ Holding".
  const arrow = body.lastIndexOf('⇒');
  const account = arrow >= 0 ? body.slice(0, arrow).split('⇒').map((x) => x.trim()).filter(Boolean).join(' › ') : '';
  const holding = arrow >= 0 ? body.slice(arrow + 1).trim() : body;
  const tick = [...holding.matchAll(/\(([A-Z][A-Z0-9]{0,5}(?:[./][A-Z]{1,2})?)\)/g)].at(-1);
  const ticker = tick ? tick[1].replace('.', '/') : '';
  const name = tick ? holding.replace(tick[0], '').replace(/\s+,/g, ',').replace(/[\s,-]+$/, '').trim() : holding;
  return { name, ticker, code, ...(account ? { account } : {}) };
}

/** Column starts from a table's heading line: each heading's x. */
function headingColumns(line, names) {
  const cols = {};
  for (const [key, label] of Object.entries(names)) {
    const cell = line.cells.find((c) => c.text === label && !Object.values(cols).includes(c.x));
    if (cell) cols[key] = cell.x;
  }
  return cols;
}

/** The column a cell falls in: the last one starting at or before it (a few units of slack). */
function columnAt(cols, x) {
  let best = null;
  for (const [key, cx] of Object.entries(cols)) if (cx <= x + 4 && (best === null || cx > cols[best])) best = key;
  return best;
}

function byColumn(cols, line) {
  const out = {};
  for (const c of line.cells) {
    const k = columnAt(cols, c.x);
    if (k) out[k] = out[k] ? `${out[k]} ${c.text}` : c.text;
  }
  return out;
}

/** The form's own header lines: Name, Status, State/District, Filing Type, Filing Year, Filing Date, Filing ID. */
function formHeader(pages) {
  const h = { filingId: '', name: '', status: '', stateDst: '', filingType: '', filingYear: '', filed: '' };
  for (const { lines } of pages.slice(0, 1)) {
    for (const l of lines) {
      const [first, ...rest] = l.cells.map((c) => c.text);
      const value = rest.join(' ').trim();
      const id = /^Filing ID #(\d+)$/.exec(first);
      if (id) h.filingId = id[1];
      else if (first === 'Name:') h.name = value;
      else if (first === 'Status:') h.status = value;
      else if (first === 'State/District:') h.stateDst = value;
      else if (first === 'Filing Type:') h.filingType = value;
      else if (first === 'Filing Year:') h.filingYear = value;
      else if (first === 'Filing Date:') h.filed = usDate(value);
    }
  }
  return h;
}

const DATE = /^\d{2}\/\d{2}\/\d{4}$/;
const TX_TYPE = /^(P|S|E|S \(partial\))$/;
const SUBHEADS = new Set(['Type', 'Date', 'Gains >', '$200?', 'Tx. >', '$1,000?']);
const subheading = (l) => l.cells.every((c) => SUBHEADS.has(c.text));
const footnote = (l) => /^\* (For the complete list|Investment Vehicle details)/.test(l.cells[0]?.text ?? '');

/**
 * A periodic transaction report's transactions: owner (SP spouse, JT joint, DC dependent child, blank the member),
 * the asset with its ticker and type, the transaction (P purchase, S sale, S (partial), E exchange), its date and
 * the date the member was notified, the amount as a range, and the labels under it (status, sub-account,
 * description, comments). `scanned` when the report has no text (filed on paper).
 */
function parsePtr(doc) {
  const pages = doc?.pages ?? [];
  const header = formHeader(pages);
  const transactions = [];
  const scanned = pages.length > 0 && pages.every((p) => p.lines.length === 0);
  let cols = null;
  let cur = null;
  let label = null;
  const flush = () => {
    if (!cur) return;
    const amountText = cur.amount.join(' ').replace(/\s+/g, ' ').trim();
    const range = amountRange(amountText);
    const asset = cur.asset.join(' ').replace(/\s+/g, ' ').trim();
    transactions.push({
      owner: cur.owner,
      asset,
      ...assetParts(asset),
      type: cur.type.join(' ').replace(/\s+/g, ' ').trim(),
      date: usDate(cur.date),
      notified: usDate(cur.notified),
      amount: amountText,
      min: range ? range.min : null,
      max: range ? range.max : null,
      ...cur.labels,
    });
    cur = null;
    label = null;
  };
  for (const { lines } of pages) {
    for (const l of lines) {
      if (l.cells.some((c) => c.text === 'Owner') && l.cells.some((c) => c.text === 'Asset') && l.cells.some((c) => c.text === 'Amount')) {
        cols = headingColumns(l, { id: 'ID', owner: 'Owner', asset: 'Asset', type: 'Transaction', date: 'Date', notified: 'Notification', amount: 'Amount', cap: 'Cap.' });
        continue;
      }
      if (!cols) continue;
      if (footnote(l)) {
        flush();
        cols = null;
        continue;
      }
      if (subheading(l)) continue;
      const row = byColumn(cols, l);
      if (row.date && DATE.test(row.date) && row.type && TX_TYPE.test(row.type.split(' (')[0])) {
        flush();
        cur = { owner: row.owner ?? '', asset: [row.asset ?? ''], type: [row.type], date: row.date, notified: row.notified ?? '', amount: [row.amount ?? ''], labels: {} };
        continue;
      }
      if (!cur) continue;
      const lab = row.asset ? labelOf(row.asset) : null;
      if (lab) {
        label = lab.key;
        cur.labels[label] = lab.value;
      } else if (label) {
        cur.labels[label] = `${cur.labels[label]} ${l.cells.map((c) => c.text).join(' ')}`.trim();
      } else {
        if (row.asset) cur.asset.push(row.asset);
        if (row.amount) cur.amount.push(row.amount);
        if (row.type) cur.type.push(row.type);
        if (row.owner) cur.owner = `${cur.owner} ${row.owner}`.trim();
      }
    }
  }
  flush();
  return { ...header, scanned, transactions };
}

/**
 * An annual report's assets (Schedule A, "Assets and Unearned Income"): each asset with its owner, its value as a
 * range at the end of the year, and the labels under it. Sub-holdings ("Brokerage account ⇒ Fund") are listed
 * once each, with their own value: the account is not listed again as a total, so the values add up without
 * counting anything twice.
 */
function parseAnnual(doc) {
  const pages = doc?.pages ?? [];
  const header = formHeader(pages);
  const assets = [];
  const scanned = pages.length > 0 && pages.every((p) => p.lines.length === 0);
  let schedule = '';
  let cols = null;
  let cur = null;
  let label = null;
  // A value cut across lines: "$5,000,001 -" or "Spouse/DC Over" before its amount.
  const open = () => !!cur && /(-|\bOver)\s*$/i.test(cur.value.join(' '));
  const flush = () => {
    if (!cur) return;
    const value = cur.value.join(' ').replace(/\s+/g, ' ').trim();
    const range = amountRange(value);
    const asset = cur.asset.join(' ').replace(/\s+/g, ' ').trim();
    assets.push({ owner: cur.owner, asset, ...assetParts(asset), value, min: range ? range.min : null, max: range ? range.max : null, ...cur.labels });
    cur = null;
    label = null;
  };
  for (const { lines } of pages) {
    for (const l of lines) {
      const first = l.cells[0]?.text ?? '';
      // Schedule headings sit at the left margin: "S        A: A ..." as PDF.js reads them, or "Schedule A: ...".
      const head = /^(?:S|Schedule)\s+([A-J])\s*:/.exec(first);
      if (head && l.cells[0].x < 24) {
        flush();
        schedule = head[1];
        cols = null;
        continue;
      }
      if (schedule !== 'A') continue;
      if (l.cells.some((c) => c.text === 'Asset') && l.cells.some((c) => c.text === 'Value of Asset')) {
        cols = headingColumns(l, { asset: 'Asset', owner: 'Owner', value: 'Value of Asset', incomeType: 'Income Type(s)', income: 'Income', tx: 'Tx. >' });
        continue;
      }
      if (!cols) continue;
      if (footnote(l)) {
        flush();
        cols = null;
        continue;
      }
      if (subheading(l)) continue;
      const row = byColumn(cols, l);
      const lab = row.asset ? labelOf(row.asset) : null;
      // A row starts on a line with both an asset and its value: the form's cells are top aligned.
      if (!lab && row.asset && row.value && !open()) {
        flush();
        cur = { owner: row.owner ?? '', asset: [row.asset], value: [row.value], labels: {} };
        continue;
      }
      if (!cur) continue;
      if (lab) {
        label = lab.key;
        cur.labels[label] = lab.value;
      } else if (label && !row.value) {
        cur.labels[label] = `${cur.labels[label]} ${l.cells.map((c) => c.text).join(' ')}`.trim();
      } else {
        if (row.asset) cur.asset.push(row.asset);
        if (row.value) cur.value.push(row.value);
        if (row.owner) cur.owner = `${cur.owner} ${row.owner}`.trim();
      }
    }
  }
  flush();
  return { ...header, scanned, assets };
}

// ------------------------------------------------------------ members

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const text = (s) => String(s ?? '').replace(/&(#\d+|[a-z]+);/gi, (m, b) => (b[0] === '#' ? String.fromCodePoint(Number(b.slice(1))) : (ENT[b.toLowerCase()] ?? m))).replace(/\s+/g, ' ').trim();
const tag = (xml, name) => text(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`).exec(xml)?.[1] ?? '');

/** The House's members (clerk.house.gov MemberData.xml): each seat's member, party and bioguide ID; vacant seats left out. */
function parseHouseMembers(xml) {
  if (typeof xml !== 'string' || !/<MemberData\b/.test(xml)) return null;
  const out = [];
  for (const m of xml.matchAll(/<member>([\s\S]*?)<\/member>/g)) {
    const b = m[1];
    const last = tag(b, 'lastname');
    if (!last) continue;
    out.push({
      chamber: 'House',
      bioguide: tag(b, 'bioguideID'),
      last,
      first: tag(b, 'firstname'),
      name: tag(b, 'official-name') || `${tag(b, 'firstname')} ${last}`,
      party: tag(b, 'party'),
      state: /<state postal-code="([A-Z]{2})"/.exec(b)?.[1] ?? '',
      stateDst: tag(b, 'statedistrict'),
    });
  }
  return out;
}

/** The Senate's members (senate.gov senators_cfm.xml). */
function parseSenators(xml) {
  if (typeof xml !== 'string' || !/<contact_information\b/.test(xml)) return null;
  const out = [];
  for (const m of xml.matchAll(/<member>([\s\S]*?)<\/member>/g)) {
    const b = m[1];
    const last = tag(b, 'last_name');
    if (!last) continue;
    out.push({ chamber: 'Senate', bioguide: tag(b, 'bioguide_id'), last, first: tag(b, 'first_name'), name: `${tag(b, 'first_name')} ${last}`, party: tag(b, 'party'), state: tag(b, 'state'), stateDst: tag(b, 'state') });
  }
  return out;
}

/**
 * Senators' and representatives' latest trades from FMP, kept as they arrive: FMP's free plan lists only the latest 25
 * of each chamber, so the app keeps every one it has seen, and says when a new list does not reach back to the
 * ones it had (trades in between may be missing).
 */
class FmpTradeLog {
  constructor(max = 20000) {
    this.max = max;
    this.rows = [];
    this.keys = new Set();
    this.gaps = [];
    this.since = {};
  }
  static key(r) {
    return [r.chamber, r.link, r.transactionDate, r.symbol, r.assetDescription, r.type, r.amount, r.owner].join('|');
  }
  /** Adds a list fetched at `at`; returns how many rows were new. */
  add(chamber, list, at = Date.now()) {
    const rows = list.filter((r) => r && typeof r === 'object' && typeof r.disclosureDate === 'string').map((r) => ({ ...r, chamber }));
    if (!rows.length) return 0;
    const had = this.rows.filter((r) => r.chamber === chamber);
    const newest = had.reduce((a, r) => (r.disclosureDate > a ? r.disclosureDate : a), '');
    const oldestNew = rows.reduce((a, r) => (!a || r.disclosureDate < a ? r.disclosureDate : a), '');
    const overlap = rows.some((r) => this.keys.has(FmpTradeLog.key(r)));
    if (had.length && !overlap && oldestNew > newest) this.gaps.push({ chamber, from: newest, to: oldestNew, at });
    if (!this.since[chamber]) this.since[chamber] = oldestNew;
    let added = 0;
    for (const r of rows) {
      const k = FmpTradeLog.key(r);
      if (this.keys.has(k)) continue;
      this.keys.add(k);
      this.rows.push({ ...r, seen: at });
      added++;
    }
    if (this.rows.length > this.max) {
      this.rows.sort((a, b) => b.disclosureDate.localeCompare(a.disclosureDate));
      for (const r of this.rows.splice(this.max)) this.keys.delete(FmpTradeLog.key(r));
    }
    return added;
  }
  load(saved) {
    if (!saved || !Array.isArray(saved.rows)) return;
    this.rows = saved.rows.filter((r) => r && typeof r.disclosureDate === 'string' && (r.chamber === 'senate' || r.chamber === 'house'));
    this.keys = new Set(this.rows.map(FmpTradeLog.key));
    this.gaps = Array.isArray(saved.gaps) ? saved.gaps : [];
    this.since = saved.since && typeof saved.since === 'object' ? saved.since : {};
  }
  toJSON() {
    return { rows: this.rows, gaps: this.gaps, since: this.since };
  }
}

module.exports = { READER_VERSION, HOUSE, MEMBERS_URL, SENATORS_URL, ASSET_TYPES, filingYear, docRef, indexUrl, ptrUrl, annualUrl, unzipFile, usDate, parseHouseIndex, labelOf, amountRange, assetParts, parsePtr, parseAnnual, parseHouseMembers, parseSenators, FmpTradeLog };
