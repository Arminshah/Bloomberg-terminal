// Form 13F for the main process: an institutional investment manager's quarterly report of the US-listed stocks,
// options and convertible bonds it held at the end of a calendar quarter (Section 13(f) securities), from the
// filing's own XML on SEC EDGAR. The cover page (primary_doc.xml) gives the manager, the quarter, whether the filing
// amends an earlier one and the totals; the information table (a second XML file, named by the filer) lists the
// holdings. A table can run to tens of megabytes for a bank, so it is read here and only the holdings, added up per
// security, go to the page.
//
// SEC Form 13F FAQ: managers with discretion over $100 million or more of Section 13(f) securities file within 45
// days of each quarter's end; values are in whole dollars in filings made on or after 3 January 2023, in thousands
// before; short positions and options the manager wrote are left out.

// A filing's folder: the filer's CIK without leading zeros and the accession number with its dashes.
const CIK = /^[1-9]\d{0,9}$/;
const ACCESSION = /^\d{10}-\d{2}-\d{6}$/;
// A file at the top of a filing's folder.
const FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.xml$/i;

/** The folder's path under /Archives/edgar/data/, or null when the CIK or accession number is not one. */
function folderPath(cik, accession) {
  const c = String(cik ?? '');
  const a = String(accession ?? '');
  return CIK.test(c) && ACCESSION.test(a) ? `${c}/${a.replace(/-/g, '')}` : null;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** An element's text with XML entities decoded and spaces tidied. */
function text(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, b) => {
      if (b[0] === '#') {
        const code = b[1] === 'x' || b[1] === 'X' ? parseInt(b.slice(2), 16) : parseInt(b.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ' ';
      }
      return ENT[b.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first <name> element's text inside `xml`, with or without a namespace prefix (ns1:name); '' when absent. */
function field(xml, name) {
  const m = new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z_][\\w.-]*:)?${name}>`).exec(xml);
  return m ? text(m[1]) : '';
}

/** Every <name> element's inner XML. */
function blocks(xml, name) {
  const re = new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z_][\\w.-]*:)?${name}>`, 'g');
  return [...xml.matchAll(re)].map((m) => m[1]);
}

/** "1,234" or "1234" → 1234; NaN when not a number. */
function number(s) {
  const t = String(s).replace(/,/g, '').trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/** The cover's MM-DD-YYYY as YYYY-MM-DD; '' when it is not a date. */
function isoDate(s) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(s).trim());
  return m ? `${m[3]}-${m[1]}-${m[2]}` : '';
}

/**
 * The cover page (primary_doc.xml): the manager, the quarter, the kind of report, the amendment if it is one, the
 * table's entry count and value total as filed, and the other managers it names. Null when it is not a 13F cover.
 */
function parseCover(xml) {
  if (typeof xml !== 'string' || !/<(?:[\w.-]+:)?edgarSubmission\b/.test(xml) || !/<(?:[\w.-]+:)?coverPage\b/.test(xml)) return null;
  const cover = blocks(xml, 'coverPage')[0] ?? '';
  const summary = blocks(xml, 'summaryPage')[0] ?? '';
  const amendment = blocks(cover, 'amendmentInfo')[0] ?? '';
  const others = (list) =>
    blocks(xml, list)
      .flatMap((b) => blocks(b, 'otherManager'))
      .map((m) => ({ name: field(m, 'name'), fileNumber: field(m, 'form13FFileNumber') }))
      .filter((m) => m.name);
  const count = number(field(summary, 'tableEntryTotal'));
  const total = number(field(summary, 'tableValueTotal'));
  return {
    manager: field(blocks(cover, 'filingManager')[0] ?? '', 'name'),
    period: isoDate(field(cover, 'reportCalendarOrQuarter')) || isoDate(field(xml, 'periodOfReport')),
    submissionType: field(xml, 'submissionType'),
    reportType: field(cover, 'reportType'),
    amendment: /^true$/i.test(field(cover, 'isAmendment')),
    amendmentNo: number(field(cover, 'amendmentNo')),
    // RESTATEMENT replaces the earlier report; NEW HOLDINGS adds to it (for one, holdings kept confidential before).
    amendmentType: field(amendment, 'amendmentType').toUpperCase(),
    confidentialEnded: /^true$/i.test(field(amendment, 'confDeniedExpired')),
    entries: Number.isFinite(count) ? count : null,
    total: Number.isFinite(total) ? total : null,
    confidentialOmitted: /^true$/i.test(field(summary, 'isConfidentialOmitted')),
    // A notice names the managers that report its holdings; a holdings report the ones included in it.
    reportedBy: others('otherManagersInfo'),
    included: others('otherManagers2Info'),
    signed: isoDate(field(xml, 'signatureDate')),
  };
}

/**
 * The information table's holdings, one per security: rows of the same CUSIP, kind (shares or principal amount) and
 * option (put, call or none) are added up, as the same stock held under several other managers or kinds of
 * discretion is. Values are as filed (dollars, or thousands before 2023). Null when it is not an information table.
 */
function parseInfoTable(xml) {
  if (typeof xml !== 'string' || !/<(?:[\w.-]+:)?informationTable\b/.test(xml)) return null;
  const byKey = new Map();
  let rows = 0;
  let valueSum = 0;
  let unread = 0;
  const re = /<(?:[A-Za-z_][\w.-]*:)?infoTable\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?infoTable>/g;
  for (const m of xml.matchAll(re)) {
    const row = m[1];
    rows++;
    const cusip = field(row, 'cusip').toUpperCase();
    const value = number(field(row, 'value'));
    const amount = number(field(row, 'sshPrnamt'));
    if (!/^[0-9A-Z]{9}$/.test(cusip) || !Number.isFinite(value) || !Number.isFinite(amount)) {
      unread++;
      continue;
    }
    valueSum += value;
    const type = field(row, 'sshPrnamtType').toUpperCase() === 'PRN' ? 'PRN' : 'SH';
    const pc = field(row, 'putCall').toLowerCase();
    const putCall = pc === 'put' ? 'Put' : pc === 'call' ? 'Call' : '';
    const key = `${cusip}|${type}|${putCall}`;
    const voting = blocks(row, 'votingAuthority')[0] ?? '';
    const sole = number(field(voting, 'Sole'));
    const shared = number(field(voting, 'Shared'));
    const none = number(field(voting, 'None'));
    const discretion = field(row, 'investmentDiscretion').toUpperCase();
    const h = byKey.get(key);
    if (h) {
      h.value += value;
      h.amount += amount;
      h.rows++;
      h.sole += Number.isFinite(sole) ? sole : 0;
      h.shared += Number.isFinite(shared) ? shared : 0;
      h.none += Number.isFinite(none) ? none : 0;
      if (discretion && !h.discretion.includes(discretion)) h.discretion.push(discretion);
    } else {
      const figi = field(row, 'figi').toUpperCase();
      byKey.set(key, {
        cusip,
        issuer: field(row, 'nameOfIssuer'),
        cls: field(row, 'titleOfClass'),
        ...(/^BBG[0-9A-Z]{9}$/.test(figi) ? { figi } : {}),
        type,
        putCall,
        value,
        amount,
        rows: 1,
        sole: Number.isFinite(sole) ? sole : 0,
        shared: Number.isFinite(shared) ? shared : 0,
        none: Number.isFinite(none) ? none : 0,
        discretion: discretion ? [discretion] : [],
      });
    }
  }
  const holdings = [...byKey.values()].sort((a, b) => b.value - a.value);
  return { holdings, rows, valueSum, unread };
}

/**
 * The information table among a filing's files: an XML file other than the cover, the likeliest names first. The
 * filer names it ("information_table.xml", "infotable.xml", "56757.xml"...).
 */
function tableCandidates(names) {
  const xml = (Array.isArray(names) ? names : []).filter((n) => typeof n === 'string' && FILE.test(n) && n.toLowerCase() !== 'primary_doc.xml');
  const likely = (n) => (/info|table|13f/i.test(n) ? 0 : 1);
  return [...xml].sort((a, b) => likely(a) - likely(b));
}

module.exports = { folderPath, parseCover, parseInfoTable, tableCandidates, text, FILE };
