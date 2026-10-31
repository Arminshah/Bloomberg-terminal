import { describe, expect, it } from 'vitest';
import { COMPOSITE_COUNTRY, secSiblings } from '../src/data/live/related';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';
import * as figiMain from '../electron/openfigi.cjs';
import googl from './fixtures/openfigi-googl.json';

describe('Related Securities (RELS)', () => {
  it("lists every ticker the SEC files under the company's CIK, its own first", () => {
    const list = [
      { cik: 1652044, ticker: 'GOOGL', title: 'Alphabet Inc.' },
      { cik: 70858, ticker: 'BAC', title: 'BANK OF AMERICA CORP /DE/' },
      { cik: 1652044, ticker: 'GOOG', title: 'Alphabet Inc.' },
      { cik: 70858, ticker: 'BAC-PB', title: 'BANK OF AMERICA CORP /DE/' },
    ];
    expect(secSiblings(list, 1652044, 'GOOG').map((c) => c.ticker)).toEqual(['GOOG', 'GOOGL']);
    expect(secSiblings(list, 70858, 'BAC').map((c) => c.ticker)).toEqual(['BAC', 'BAC-PB']);
  });

  it("asks OpenFIGI for a US ticker's share class, then the share class's lines", () => {
    expect(figiMain.usTicker('brk.b')).toBe('BRK/B');
    expect(figiMain.usTicker('BRK-A')).toBe('BRK/A');
    expect(figiMain.usTicker('GOOGL')).toBe('GOOGL');
    expect(figiMain.usTicker('not a ticker')).toBeNull();
    expect(figiMain.tickerJobs('GOOGL')).toEqual([{ idType: 'TICKER', idValue: 'GOOGL', exchCode: 'US' }]);
    expect(figiMain.shareClassJobs('BBG009S39JY5')).toEqual([{ idType: 'ID_BB_GLOBAL_SHARE_CLASS_LEVEL', idValue: 'BBG009S39JY5' }]);
  });

  it("reads OpenFIGI's answers as given: the share class, and each country's composite line, the US first", () => {
    expect(figiMain.shareClassOf(JSON.stringify(googl.ticker))).toEqual({ shareClassFIGI: 'BBG009S39JY5', name: 'ALPHABET INC-CL A' });
    expect(figiMain.shareClassOf(JSON.stringify([{ warning: 'No identifier found.' }]))).toBeNull();
    const lines = figiMain.compositesOf(JSON.stringify(googl.shareClass))!;
    expect(lines).toHaveLength(15);
    expect(lines[0]).toMatchObject({ exchCode: 'US', ticker: 'GOOGL', name: 'ALPHABET INC-CL A' });
    expect(lines.find((l) => l.exchCode === 'GR')?.ticker).toBe('ABEA');
    // Venue lines (a regional exchange inside a country) are left out.
    expect(lines.every((l) => l.figi === googl.shareClass[0].data.find((d) => d.figi === l.figi)?.compositeFIGI)).toBe(true);
    expect(figiMain.compositesOf(JSON.stringify([{ warning: 'No identifier found.' }]))).toEqual([]);
    expect(figiMain.compositesOf('<html>')).toBeNull();
    expect(COMPOSITE_COUNTRY.GR).toBe('Germany');
  });

  it('opens under RELS for a stock', () => {
    expect(parseCommand('GOOGL US RELS', lookupFn)).toMatchObject({ kind: 'route', fn: 'RELATED', sec: { id: 'GOOGL US Equity' } });
  });
});
