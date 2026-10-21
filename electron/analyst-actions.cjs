// Analysts' rating actions on a US-listed stock from MarketBeat's public forecast page: date, brokerage, analyst,
// action, rating and the price target before and after ("$83.00 ➝ $70.00"). The page's ratings history table is read;
// quantitative rating services (Weiss Ratings and the like) are left out, as they are not analysts' research.

const SYMBOL = /^[A-Z][A-Z0-9]{0,6}(?:[.-][A-Z]{1,2})?$/;

/** MarketBeat's forecast page for a ticker; MarketBeat redirects to the right exchange. */
function forecastUrl(symbol) {
  if (typeof symbol !== 'string' || !SYMBOL.test(symbol)) return null;
  return `https://www.marketbeat.com/stocks/NASDAQ/${symbol.replace('-', '.')}/forecast/`;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rarr: '→' };
function text(html) {
  return String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, b) => {
      if (b[0] === '#') {
        const code = b[1] === 'x' || b[1] === 'X' ? parseInt(b.slice(2), 16) : parseInt(b.slice(1), 10);
        return Number.isFinite(code) && code !== 160 ? String.fromCodePoint(code) : ' ';
      }
      return ENT[b.toLowerCase()] ?? ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** A firm's or analyst's name without MarketBeat's star ranking or subscription prompt. */
function name(s) {
  return s
    .replace(/\s*Subscribe to MarketBeat.*$/i, '')
    .replace(/\s*\d(\.\d)? of 5 stars.*$/i, '')
    .replace(/\s*Not Rated\s*$/i, '')
    .trim();
}

const SERVICES = /^(weiss ratings|wall street zen|zacks research|stocknews\.com|valuengine|seeking alpha|quantitative|marketbeat)\b/i;

/** "10/9/2026" → "2026-10-09". */
function isoDate(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
}

const price = (s) => {
  const v = Number(String(s).replace(/[$,\s]/g, ''));
  return Number.isFinite(v) && v > 0 ? v : NaN;
};

/**
 * The ratings history: [{ date, firm, analyst, action, rating, from, to }] newest first, `from` and `to` the price
 * target before and after (NaN where the action set none). Null without the table.
 */
function parseRatings(html) {
  if (typeof html !== 'string') return null;
  for (const table of html.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
    const head = (/<thead[\s\S]*?<\/thead>/i.exec(table) ?? [''])[0];
    const cols = [...head.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => text(m[1]).toLowerCase());
    const at = (n) => cols.findIndex((c) => c === n);
    const [iDate, iFirm, iAnalyst, iAction, iRating, iTarget] = ['date', 'brokerage', 'analyst', 'action', 'rating', 'price target'].map(at);
    if (iDate < 0 || iFirm < 0 || iAction < 0 || iRating < 0 || iTarget < 0) continue;
    const out = [];
    for (const row of table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => text(m[1]));
      if (cells.length <= Math.max(iTarget, iRating, iAction)) continue;
      const date = isoDate(cells[iDate]);
      const firm = name(cells[iFirm]);
      if (!date || !firm || SERVICES.test(firm)) continue;
      const targets = cells[iTarget].split(/\s*(?:➝|→|->|to)\s*/).map(price).filter((v) => Number.isFinite(v));
      out.push({
        date,
        firm,
        analyst: iAnalyst >= 0 ? name(cells[iAnalyst]) : '',
        action: cells[iAction],
        rating: cells[iRating].replace(/\s*\([A-F][+-]?\)$/, ''),
        from: targets.length > 1 ? targets[0] : NaN,
        to: targets.length ? targets[targets.length - 1] : NaN,
      });
      if (out.length >= 60) break;
    }
    if (out.length) return out;
  }
  return null;
}

module.exports = { forecastUrl, parseRatings };
