import { deflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { parseSpdrHoldings, spdrHoldingsUrl } from '../electron/spdr.cjs';
import { dowFromDia, indexBoard, indexData, type SpdrHoldings } from '../src/data/live/index-members';

/** A ZIP archive of the given files, deflated, as Excel writes a workbook. */
function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content, 'utf8');
    const data = deflateRawSync(raw);
    const nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

// A synthetic workbook in the layout of State Street's holdings files (checked on 31 October 2026): three header
// lines, a blank row, the column names, the holdings, then cash, a futures line and a merger's rights with a numeric
// ticker. The names and figures are made up.
function workbook(rows: (string | number)[][]): Buffer {
  const strings: string[] = [];
  const index = (s: string) => (strings.includes(s) ? strings.indexOf(s) : strings.push(s) - 1);
  const cells = rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => {
    const ref = `${String.fromCharCode(65 + c)}${r + 1}`;
    if (v === '') return '';
    return typeof v === 'number' ? `<c r="${ref}" t="n"><v>${v}</v></c>` : `<c r="${ref}" t="s"><v>${index(v)}</v></c>`;
  }).join('')}</row>`).join('');
  return zip({
    'xl/sharedStrings.xml': `<?xml version="1.0"?><sst>${strings.map((s) => `<si><t>${s.replace(/&/g, '&amp;')}</t></si>`).join('')}</sst>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet><sheetData>${cells}</sheetData></worksheet>`,
  });
}
const HEAD = ['Name', 'Ticker', 'Identifier', 'SEDOL', 'Weight', 'Sector', 'Shares Held', 'Local Currency'];
const file = workbook([
  ['Fund Name:', 'Synthetic SPDR Fund'], ['Ticker Symbol:', 'SPY'], ['Holdings:', 'As of 29-Oct-2026'], [],
  HEAD,
  ['ALPHA CORP', 'ALP', '000000001', '1000001', 60.5, '-', 3.0e8, 'USD'],
  ['BETA & SONS CLASS B', 'BET.B', '000000002', '1000002', 39.4, '-', 1.5e8, 'USD'],
  ['US DOLLAR', '-', '-', '-', 0.05, '-', 1.2e6, 'USD'],
  ['S&P500 EMINI DEC26', 'ESZ6', '-', '-', 0, '-', 120, 'USD'],
  ['CONTRA MERGED CO', '2602335D', '436CVR021', '-', 3e-6, '-', 2.5e6, 'USD'],
  ['Past performance is not a guarantee of future results.'],
]);

describe("State Street's holdings files", () => {
  it('asks only for SPY and DIA', () => {
    expect(spdrHoldingsUrl('SPY')).toBe('https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-spy.xlsx');
    expect(spdrHoldingsUrl('DIA')).toContain('holdings-daily-us-en-dia.xlsx');
    for (const other of ['QQQ', 'spy', '', '../x', undefined, 1]) expect(spdrHoldingsUrl(other)).toBeNull();
  });

  it('reads the date and the stock lines, without cash, futures or rights', () => {
    const out = parseSpdrHoldings(file);
    expect(out).toEqual({
      fund: 'SPY', asOf: '2026-10-29', holdings: [
        { name: 'ALPHA CORP', ticker: 'ALP', cusip: '000000001', sedol: '1000001', weight: 60.5, shares: 3e8, currency: 'USD' },
        { name: 'BETA & SONS CLASS B', ticker: 'BET.B', cusip: '000000002', sedol: '1000002', weight: 39.4, shares: 1.5e8, currency: 'USD' },
      ],
    });
  });

  it('says so when the layout changes or the file is not a workbook', () => {
    expect(parseSpdrHoldings(workbook([['Holdings:', 'As of 29-Oct-2026'], HEAD.slice(0, 5)]))).toEqual({ error: 'State Street changed the holdings file columns.' });
    expect(parseSpdrHoldings(workbook([['Holdings:', 'Daily'], HEAD]))).toEqual({ error: 'State Street changed the holdings file layout.' });
    expect(parseSpdrHoldings(Buffer.from('not a zip'))).toEqual({ error: 'The holdings file is not a workbook the app can read.' });
  });
});

const holdings = (fund: string, rows: [string, number][]): SpdrHoldings => ({
  fund, asOf: '2026-10-29', at: 0, holdings: rows.map(([ticker, shares]) => ({ name: ticker, ticker, cusip: '', sedol: '', weight: 0, shares, currency: 'USD' })),
});
afterEach(() => indexData.set((s) => ({ ...s, lists: {}, quotes: {}, holdings: {}, holdingsProblem: {} })));

describe('index weights from the fund', () => {
  it("weights the S&P 500 by SPY's shares at each member's previous close, and names the members it lacks", () => {
    const members = ['ALP', 'BET.B', ...Array.from({ length: 38 }, (_, i) => `Z${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`)];
    indexData.set((s) => ({
      ...s,
      lists: { SPX: { state: 'ok', members: members.map((symbol) => ({ symbol, name: symbol, sector: '', industry: '' })) } },
      quotes: Object.fromEntries(members.map((m, i) => [m.replace('.', '-'), { last: 11 + i, prevClose: 10 + i, time: 0 }])),
      holdings: { SPY: holdings('SPY', members.slice(0, 39).map((m, i) => [m, 1000 * (i + 1)])) },
    }));
    const board = indexBoard('SPX Index')!;
    const total = members.slice(0, 39).reduce((a, _, i) => a + 1000 * (i + 1) * (10 + i), 0);
    expect(board.members[0].weight).toBeCloseTo((1000 * 10) / total, 12);
    expect(board.members[1].weight).toBeCloseTo((2000 * 11) / total, 12);
    expect(board.members[39].weight).toBeNaN();
    expect(board.weightsFrom).toEqual({ fund: 'SPY', asOf: '2026-10-29', missing: [members[39]] });
  });

  it('keeps market values when the file covers too little of the list', () => {
    indexData.set((s) => ({
      ...s,
      lists: { SPX: { state: 'ok', members: ['ALP', 'BET.B'].map((symbol) => ({ symbol, name: symbol, sector: '', industry: '' })) } },
      holdings: { SPY: holdings('SPY', [['ALP', 1000]]) },
    }));
    expect(indexBoard('SPX Index')!.weightsFrom).toBeUndefined();
  });

  it("takes the Dow's members from DIA only when the file lists about thirty stocks", () => {
    const thirty = Array.from({ length: 30 }, (_, i) => `D${String.fromCharCode(65 + (i % 26))}${i >= 26 ? 'X' : ''}`);
    expect(dowFromDia(holdings('DIA', thirty.map((t) => [t, 1])))).toEqual([...thirty].sort());
    expect(dowFromDia(holdings('DIA', thirty.slice(0, 10).map((t) => [t, 1])))).toEqual([]);
    expect(dowFromDia(undefined)).toEqual([]);
  });
});
