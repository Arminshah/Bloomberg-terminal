// Japan Exchange Group's end-of-day files for the Nikkei 225 future on the Osaka Exchange (no key): the daily
// settlement prices (every futures and options contract, about 4 MB of CSV) and the open interest workbook (each
// contract month's volume and open interest). Only the latest day of each stays online, and the pages that link them
// name the file, so the app reads the page, then the file it names. JPX's terms bar collecting or reusing the data for
// commercial purposes; this is the owner's private display. robots.txt allows everything (31 October 2026).

const { sheetRows } = require('./spdr.cjs');

const SITE = 'https://www.jpx.co.jp/english/markets/derivatives';
const PAGES = { settlement: `${SITE}/settlement-price/index.html`, oi: `${SITE}/trading-volume/index.html` };

/** A page's link to its latest file: "tvdivq00000014l6-att/rb_e20261030.csv", or null. */
function latestFile(html, kind) {
  const re = kind === 'settlement'
    ? /href="\/english\/markets\/derivatives\/settlement-price\/([a-z0-9]+-att\/rb_e(20\d{6})\.csv)"/
    : /href="\/english\/markets\/derivatives\/trading-volume\/([a-z0-9]+-att\/(20\d{6})open_interest_e\.xlsx)"/;
  const m = re.exec(html);
  return m ? { file: m[1], date: `${m[2].slice(0, 4)}-${m[2].slice(4, 6)}-${m[2].slice(6, 8)}` } : null;
}

/** The URL of a file a page named; anything else is refused. */
function jpxFileUrl(kind, file) {
  if (kind === 'settlement' && /^[a-z0-9]+-att\/rb_e20\d{6}\.csv$/.test(file)) return `${SITE}/settlement-price/${file}`;
  if (kind === 'oi' && /^[a-z0-9]+-att\/20\d{6}open_interest_e\.xlsx$/.test(file)) return `${SITE}/trading-volume/${file}`;
  return null;
}

/**
 * The Nikkei 225 future's months from the settlement file: issue names "FUT_225_261210" (the special quotation day,
 * 10 December 2026, the day after the last trading day), each with its settlement and theoretical price, and the
 * index close the file gives. The file lists some rows twice; each month is kept once.
 */
function nikkeiSettlements(csv) {
  const months = new Map();
  let close = NaN;
  for (const line of csv.split(/\r?\n/)) {
    const c = line.split(',');
    const m = /^FUT_225_(\d{2})(\d{2})(\d{2})$/.exec(c[1] ?? '');
    if (!m || c[11]?.trim() !== 'Nikkei 225') continue;
    const settle = Number(c[5]);
    if (!(settle > 0)) continue;
    const sq = `20${m[1]}-${m[2]}-${m[3]}`;
    months.set(sq, { sq, month: `${c[3].slice(0, 4)}-${c[3].slice(4, 6)}`, settle, theoretical: Number(c[6]) });
    if (Number(c[7]) > 0) close = Number(c[7]);
  }
  if (!months.size) return { error: 'JPX changed its settlement file.' };
  return { close, months: [...months.values()].sort((a, b) => a.sq.localeCompare(b.sq)) };
}

/** The Nikkei 225 (large) rows of the open interest workbook: contract month "YYYY-MM" → volume and open interest. */
function nikkeiOpenInterest(buf) {
  const rows = sheetRows(buf);
  if (!rows) return { error: 'JPX changed its open interest workbook.' };
  const out = {};
  // Excel's day numbers count from 30 December 1899.
  const month = (v) => (/^\d+(\.\d+)?$/.test(v ?? '') ? new Date(Date.UTC(1899, 11, 30) + Number(v) * 86_400_000).toISOString().slice(0, 7) : null);
  // Each product heads its months in a left (A to F) or right (H to M) block; its rows run until its "Total".
  for (const [label, contract, volume, oi] of [['A', 'B', 'C', 'D'], ['H', 'I', 'J', 'K']]) {
    let inside = false;
    for (const r of rows) {
      const name = (r[label] ?? '').replace(/\s+/g, ' ').trim();
      if (name) inside = name === 'Nikkei 225';
      if (!inside) continue;
      if ((r[contract] ?? '').trim() === 'Total') { inside = false; continue; }
      const mo = month(r[contract]);
      if (mo && /^\d+$/.test(r[volume] ?? '') && /^\d+$/.test(r[oi] ?? '')) out[mo] = { volume: Number(r[volume]), openInterest: Number(r[oi]) };
    }
  }
  return Object.keys(out).length ? out : { error: 'JPX changed its open interest workbook.' };
}

/** The front month on a trading day: the first whose special quotation day is after it (it trades until the day before). */
function frontMonth(months, date) {
  return months.find((m) => m.sq > date);
}

module.exports = { PAGES, latestFile, jpxFileUrl, nikkeiSettlements, nikkeiOpenInterest, frontMonth };
