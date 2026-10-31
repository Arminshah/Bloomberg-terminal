// State Street's daily holdings files for two SPDR funds (no key): every holding with its ticker, CUSIP, SEDOL,
// weight and shares held, as of the previous business day. SPY holds the S&P 500 and DIA the Dow in full, so SPY's
// shares of each member are in proportion to the index's float-adjusted shares, and DIA's tickers are the Dow's
// members. State Street's terms allow use for your own personal purposes only; nothing is redistributed.

const { unzipFile } = require('./congress.cjs');

const FUNDS = {
  SPY: 'https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-spy.xlsx',
  DIA: 'https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-dia.xlsx',
};

/** The file for a fund the app reads, or null. */
function spdrHoldingsUrl(fund) {
  return typeof fund === 'string' && Object.prototype.hasOwnProperty.call(FUNDS, fund) ? FUNDS[fund] : null;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const text = (s) => s.replace(/&(amp|lt|gt|quot|apos|#(\d+)|#x([0-9a-f]+));/gi, (_, name, dec, hex) => (dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ENTITIES[name.toLowerCase()]));
const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

/** The first sheet's rows as {column letter: text}, from a workbook's shared strings and cells. */
function sheetRows(buf) {
  const strings = unzipFile(buf, 'xl/sharedStrings.xml');
  const sheet = unzipFile(buf, 'xl/worksheets/sheet1.xml');
  if (!sheet) return null;
  const shared = strings ? [...strings.toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => text([...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join(''))) : [];
  const rows = [];
  for (const row of sheet.toString('utf8').matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    for (const c of row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const body = c[3] ?? '';
      const type = /\bt="([^"]+)"/.exec(c[2])?.[1];
      const value = /<v>([^<]*)<\/v>/.exec(body)?.[1];
      if (type === 's') cells[c[1]] = value === undefined ? '' : shared[Number(value)] ?? '';
      else if (type === 'inlineStr') cells[c[1]] = text([...body.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join(''));
      else if (value !== undefined) cells[c[1]] = text(value);
    }
    rows.push(cells);
  }
  return rows;
}

/**
 * A holdings file as {fund, asOf, holdings: [{name, ticker, cusip, sedol, weight, shares, currency}]}, or {error}.
 * Only stock lines are kept: cash ("US DOLLAR", ticker "-"), money-market funds, futures and the contingent value
 * rights a merger leaves (numeric tickers) are dropped.
 */
function parseSpdrHoldings(buf) {
  const rows = sheetRows(buf);
  if (!rows) return { error: 'The holdings file is not a workbook the app can read.' };
  const fund = rows.find((r) => /^Ticker Symbol:?$/.test(r.A ?? ''))?.B ?? '';
  const asOfText = rows.find((r) => /^Holdings:?$/.test(r.A ?? ''))?.B ?? '';
  const d = /As of (\d{1,2})-([A-Z][a-z]{2})-(\d{4})/.exec(asOfText);
  const asOf = d && MONTHS[d[2]] ? `${d[3]}-${MONTHS[d[2]]}-${d[1].padStart(2, '0')}` : '';
  const head = rows.findIndex((r) => r.A === 'Name' && r.B === 'Ticker');
  if (head < 0 || !asOf) return { error: 'State Street changed the holdings file layout.' };
  const columns = Object.fromEntries(Object.entries(rows[head]).map(([col, name]) => [name, col]));
  const need = ['Ticker', 'Identifier', 'SEDOL', 'Weight', 'Shares Held', 'Local Currency'];
  if (!need.every((n) => columns[n])) return { error: 'State Street changed the holdings file columns.' };
  const holdings = [];
  for (const r of rows.slice(head + 1)) {
    const ticker = (r[columns.Ticker] ?? '').trim();
    const weight = Number(r[columns.Weight]);
    const shares = Number(r[columns['Shares Held']]);
    if (!/^[A-Z][A-Z.]{0,6}$/.test(ticker) || !Number.isFinite(weight) || !(shares > 0)) continue;
    holdings.push({ name: (r.A ?? '').trim(), ticker, cusip: (r[columns.Identifier] ?? '').trim(), sedol: (r[columns.SEDOL] ?? '').trim(), weight, shares, currency: (r[columns['Local Currency']] ?? '').trim() });
  }
  return holdings.length ? { fund, asOf, holdings } : { error: 'The holdings file listed no stocks.' };
}

module.exports = { spdrHoldingsUrl, parseSpdrHoldings, SPDR_FUNDS: Object.keys(FUNDS) };
