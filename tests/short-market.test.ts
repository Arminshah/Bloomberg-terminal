import { describe, expect, it } from 'vitest';
import { finraName, parseFinraSettlement } from '../src/data/live/short-market';
import { rankShorts, type RankedShort } from '../src/functions/SIA';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';
import * as nasdaqMain from '../electron/nasdaq.cjs';
import settlement from './fixtures/finra-settlement-2026-09-30.json';

const parsed = parseFinraSettlement(JSON.stringify(settlement));
const lines: RankedShort[] = 'data' in parsed ? parsed.data.map((l) => ({ ...l, pctOut: NaN })) : [];

describe('Short Interest Analysis (SIA)', () => {
  it("reads a FINRA settlement as answered: each listing's short interest, change, days to cover and volume", () => {
    expect(lines).toHaveLength(43);
    expect(lines[0]).toEqual({ symbol: 'NVDA', name: 'NVIDIA Corporation', market: 'NNM', shares: 311389688, prior: 294225803, changePct: 5.83, daysToCover: 2.82, avgVolume: 110290688, split: false, pctOut: NaN });
    expect(lines.find((l) => l.symbol === 'ZCSH')?.split).toBe(true);
    expect(parseFinraSettlement('[]')).toEqual({ data: [] });
    expect(parseFinraSettlement(JSON.stringify({ message: 'Bad Request' }))).toEqual({ error: 'Bad Request' });
    expect(parseFinraSettlement('<html>')).toEqual({ error: 'FINRA returned a page that is not JSON.' });
  });

  it('keeps the company in a name FINRA cut at 30 characters', () => {
    expect(finraName('NVIDIA Corporation Common Stoc')).toBe('NVIDIA Corporation');
    expect(finraName('Plug Power, Inc. Common Stock')).toBe('Plug Power, Inc.');
    expect(finraName('Transocean LTD.')).toBe('Transocean LTD.');
    expect(finraName('Opendoor Technologies Inc Comm')).toBe('Opendoor Technologies Inc');
    expect(finraName('Eos Energy Enterprises, Inc. C')).toBe('Eos Energy Enterprises, Inc.');
    expect(finraName('Grab Holdings Limited Class A')).toBe('Grab Holdings Limited Class A');
    expect(finraName('SoundHound AI, Inc Class A Com')).toBe('SoundHound AI, Inc');
    expect(finraName('NIO Inc. American depositary s')).toBe('NIO Inc.');
    // A cut name without a company suffix stays as FINRA gives it.
    expect(finraName('iShares iBoxx $ High Yield Cor')).toBe('iShares iBoxx $ High Yield Cor');
  });

  it('ranks the listings for each view, the OTC market left out unless asked for', () => {
    expect(rankShorts(lines, 'shares', false)[0].symbol).toBe('NVDA');
    expect(rankShorts(lines, 'shares', false).some((l) => l.market === 'OTC')).toBe(false);
    expect(rankShorts(lines, 'shares', true).some((l) => l.symbol === 'IVPAF')).toBe(true);
    expect(rankShorts(lines, 'daysToCover', false)[0]).toMatchObject({ symbol: 'IPSC', daysToCover: 50.91 });
    expect(rankShorts(lines, 'daysToCover', true)[0]).toMatchObject({ symbol: 'IVPAF', daysToCover: 159.3 });
    // Rises and falls leave out a settlement across a split (ZCSH, AXTX).
    expect(rankShorts(lines, 'rising', false).slice(0, 3).map((l) => l.symbol)).toEqual(['ACWX', 'JPST', 'IAGG']);
    expect(rankShorts(lines, 'falling', false).slice(0, 3).map((l) => l.symbol)).toEqual(['SOXL', 'VRRM', 'KORU']);
    // Without shares outstanding, the share view is empty rather than guessed.
    expect(rankShorts(lines, 'pctOut', false)).toEqual([]);
    expect(rankShorts([{ ...lines[0], pctOut: 1.2 }, { ...lines[1], pctOut: 3.4 }], 'pctOut', false).map((l) => l.symbol)).toEqual([lines[1].symbol, 'NVDA']);
  });

  it("asks FINRA for one published settlement's listings above 500,000 shares a day", () => {
    const now = Date.UTC(2026, 9, 26);
    const req = nasdaqMain.finraSettlementRequest('2026-09-30', now)!;
    expect(req.url).toBe('https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest');
    expect(JSON.parse(req.body)).toEqual({
      limit: 5000,
      compareFilters: [
        { compareType: 'EQUAL', fieldName: 'settlementDate', fieldValue: '2026-09-30' },
        { compareType: 'GREATER', fieldName: 'averageDailyVolumeQuantity', fieldValue: 500000 },
      ],
      sortFields: ['-currentShortPositionQuantity'],
    });
    expect(nasdaqMain.finraSettlementRequest('2026-11-13', now)).toBeNull();
    expect(nasdaqMain.finraSettlementRequest('2026-09-31', now)).toBeNull();
    expect(nasdaqMain.finraSettlementRequest('AAPL', now)).toBeNull();
  });

  it('opens under SIA', () => {
    expect(parseCommand('SIA', lookupFn)).toEqual({ kind: 'route', fn: 'SHORTRANKING' });
  });
});
