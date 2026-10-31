import { deflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { frontMonth, jpxFileUrl, latestFile, nikkeiOpenInterest, nikkeiSettlements, PAGES } from '../electron/jpx.cjs';
import { applyJpx, jpxFront, previousJpxDay } from '../src/data/live/jpx';
import { engine } from '../src/data/market';
import mainSource from '../electron/main.cjs?raw';
import type { JpxDay } from '../src/data/live/lookup';

// Synthetic files in the layouts of JPX's settlement price CSV and open interest workbook (checked on 31 October
// 2026). JPX bars reusing its data for commercial purposes, so its files are not copied here; the figures are made up.
const CSV = [
  '"* Sorted by Index Futures,JGB Futures, Index Options...",,,,,,,,,,,',
  '* the issues which passed the trading date is not listed in this file.,,,,,,,,,,,',
  'Issue Code,Issue Name,Put/Call,Contract Month,Strike Price,Settlement Price,Theoretical Price,Underlying Price,Volatility ,Interest Rate,Days until Maturity,Underlying Name',
  '161120018,FUT_225_261210,,202612,,50010,50010,49990.5,,1.4062,42,Nikkei 225',
  '162030018,FUT_225_270311,,202703,,50100,50120,49990.5,,1.9059,133,Nikkei 225',
  '161120018,FUT_225_261210,,202612,,50010,50010,49990.5,,1.4062,42,Nikkei 225',
  '161110019,FUT_225M_261113,,202611,,50005,50005,49990.5,,1.0,14,Nikkei 225',
  '131110005,PUT_225_261112_30000,PUT,202611,30000,1,1,49990.5,43.2,1.08,14,Nikkei 225',
  '161120005,FUT_TPX_261210,,202612,,3100,3100,3099.5,,1.4,42,TOPIX',
].join('\r\n');

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

// The workbook's layout: products in a left (A to F) and right (H to M) block, each heading its months (Excel day
// numbers) until a Total row; the large Nikkei 225 beside another product, the mini below it.
function workbook(rows: Record<string, string | number>[]): Buffer {
  const strings: string[] = [];
  const cell = (col: string, r: number, v: string | number) => (typeof v === 'number' ? `<c r="${col}${r}"><v>${v}</v></c>` : `<c r="${col}${r}" t="s"><v>${strings.push(v) - 1}</v></c>`);
  const body = rows.map((row, i) => `<row r="${i + 1}">${Object.entries(row).map(([c, v]) => cell(c, i + 1, v)).join('')}</row>`).join('');
  return zip({
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${body}</sheetData></worksheet>`,
    'xl/sharedStrings.xml': `<sst>${strings.map((s) => `<si><t>${s}</t></si>`).join('')}</sst>`,
  });
}
const OI = workbook([
  { A: 'JPX Derivatives Open Interest' },
  { A: 'Nikkei 225', B: 46357, C: 40000, D: 120000, E: -100, F: 120100, H: 'JPX-Nikkei\r\nIndex 400', I: 46357, J: 3000, K: 40000 },
  { B: 46447, C: 500, D: 6000, E: 10, F: 5990, I: 'Total', J: 3000, K: 40000 },
  { B: 'Total', C: 40500, D: 126000, E: -90, F: 126090, H: 'Nikkei 225\r\nmini', I: 46357, J: 800000, K: 230000 },
  { I: 'Total', J: 800000, K: 230000 },
]);

const SETTLE_PAGE = '<a href="/english/markets/derivatives/settlement-price/tvdivq00000014l6-att/rb_e20261030.csv">CSV</a>';
const OI_PAGE = '<a href="/english/markets/derivatives/trading-volume/vk0khi000002j00k-att/20261030open_interest_e.xlsx">Excel</a>';

describe("JPX's files for the Nikkei 225 future", () => {
  it('asks the two pages, then only the files they name', () => {
    expect(PAGES).toEqual({ settlement: 'https://www.jpx.co.jp/english/markets/derivatives/settlement-price/index.html', oi: 'https://www.jpx.co.jp/english/markets/derivatives/trading-volume/index.html' });
    expect(latestFile(SETTLE_PAGE, 'settlement')).toEqual({ file: 'tvdivq00000014l6-att/rb_e20261030.csv', date: '2026-10-30' });
    expect(latestFile(OI_PAGE, 'oi')).toEqual({ file: 'vk0khi000002j00k-att/20261030open_interest_e.xlsx', date: '2026-10-30' });
    expect(jpxFileUrl('settlement', 'tvdivq00000014l6-att/rb_e20261030.csv')).toBe('https://www.jpx.co.jp/english/markets/derivatives/settlement-price/tvdivq00000014l6-att/rb_e20261030.csv');
    for (const [k, f] of [['settlement', '../x.csv'], ['oi', 'a-att/rb_e20261030.csv'], ['other', 'a-att/rb_e20261030.csv']]) expect(jpxFileUrl(k, f)).toBeNull();
    // The day's files are kept on disk, and one already read for its day is not downloaded again.
    expect(mainSource).toContain("const JPX_FILE = () => path.join(app.getPath('userData'), 'jpx-nikkei225.json');");
    expect(mainSource).toContain('if (!kept.days[latest.date]) {');
  });

  it('reads the large future only, each month once, with the index close JPX settles against', () => {
    const s = nikkeiSettlements(CSV);
    if ('error' in s) throw new Error(s.error);
    expect(s.close).toBe(49990.5);
    expect(s.months).toEqual([
      { sq: '2026-12-10', month: '2026-12', settle: 50010, theoretical: 50010 },
      { sq: '2027-03-11', month: '2027-03', settle: 50100, theoretical: 50120 },
    ]);
    expect(nikkeiSettlements('Issue Code,Issue Name\n')).toEqual({ error: 'JPX changed its settlement file.' });
    // The front month trades until the day before its special quotation day.
    expect(frontMonth(s.months, '2026-12-09')?.month).toBe('2026-12');
    expect(frontMonth(s.months, '2026-12-10')?.month).toBe('2027-03');
  });

  it("reads the large future's volume and open interest by month, not the mini's or another product's", () => {
    expect(nikkeiOpenInterest(OI)).toEqual({ '2026-12': { volume: 40000, openInterest: 120000 }, '2027-03': { volume: 500, openInterest: 6000 } });
    expect(nikkeiOpenInterest(workbook([{ A: 'JGB' }]))).toEqual({ error: 'JPX changed its open interest workbook.' });
  });
});

describe('NK1 from JPX', () => {
  afterEach(() => jpxFront.clear());

  it("takes the previous Tokyo trading day from JPX's holidays: Culture Day and weekends skipped", () => {
    expect(previousJpxDay('2026-11-04')).toBe('2026-11-02');
    expect(previousJpxDay('2026-11-02')).toBe('2026-10-30');
    expect(previousJpxDay('2026-12-10')).toBe('2026-12-09');
    expect(previousJpxDay('2028-01-05')).toBeUndefined();
  });

  const day = (close: number, dec: number, mar: number, oi?: JpxDay['oi']): JpxDay => ({
    close,
    months: [{ sq: '2026-12-10', month: '2026-12', settle: dec, theoretical: dec }, { sq: '2027-03-11', month: '2027-03', settle: mar, theoretical: mar }],
    ...(oi ? { oi } : {}),
  });

  it("sets the front month's settlement against the previous trading day's, with JPX's volume and open interest", () => {
    expect(applyJpx({ '2026-10-29': day(49000, 49500, 49600), '2026-10-30': day(49990.5, 50010, 50100, { '2026-12': { volume: 40000, openInterest: 120000 } }) })).toBe(true);
    const q = engine.quote('NK1 Index')!;
    expect(q.last).toBe(50010);
    expect(q.prevClose).toBe(49500);
    expect(jpxFront.get('NK1 Index')).toEqual({ code: 'NKZ6', expiry: '2026-12-09', openInterest: 120000, asOf: '2026-10-30', underlyingClose: 49990.5 });
  });

  it('leaves the change blank when the app did not read the previous trading day, and the range blank always', () => {
    // 28 October was read, 29 October was not: no change against two days back.
    expect(applyJpx({ '2026-10-28': day(48000, 48500, 48600), '2026-10-30': day(49990.5, 50010, 50100) })).toBe(true);
    const q = engine.quote('NK1 Index')!;
    expect(q.last).toBe(50010);
    expect(q.prevClose).toBeNaN();
    expect(q.high).toBeNaN();
    expect(q.low).toBeNaN();
    expect(jpxFront.get('NK1 Index')?.openInterest).toBeNaN();
  });
});
