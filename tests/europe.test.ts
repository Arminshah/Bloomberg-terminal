import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarketEngine } from '../src/data/engine';
import { ANCHORS, CURRENCIES, FX, INDICES, buildUniverse } from '../src/data/universe';
import { COUNTRY_NAMES } from '../src/data/eco';
import { COUNTRY_STATS, EUROSTAT_MEMBERS } from '../src/data/live/fred';
import { INDEX_GROUPS } from '../src/functions/WEI';
import { FX_MATRIX } from '../src/functions/FXMON';
import mainSource from '../electron/main.cjs?raw';
// Eurostat's answers on 18 Oct 2026 to the desktop app's requests with Belgium in the geo list (short periods).
import hicpBe from './fixtures/eurostat-be-hicp.json?raw';
import unempBe from './fixtures/eurostat-be-unemp.json?raw';
import gdpBe from './fixtures/eurostat-be-gdp.json?raw';

const NOW = Date.parse('2026-10-12T15:30:00Z'); // a Monday

describe('European indices', () => {
  it('lists the BEL 20 and the other European indices under their Bloomberg tickers and Yahoo symbols', () => {
    const by = new Map(INDICES.map((d) => [d.id, d]));
    expect(by.get('BEL20 Index')).toMatchObject({ ticker: 'BEL20', yk: 'Index', cls: 'index', ccy: 'EUR', country: 'BE', region: 'EMEA', yahoo: '^BFX' });
    expect(by.get('OMX Index')).toMatchObject({ ccy: 'SEK', country: 'SE', region: 'EMEA', yahoo: '^OMX' });
    expect(by.get('PSI20 Index')).toMatchObject({ ccy: 'EUR', country: 'PT', region: 'EMEA', yahoo: 'PSI20.LS' });
    expect(by.get('ATX Index')).toMatchObject({ ccy: 'EUR', country: 'AT', region: 'EMEA', yahoo: '^ATX' });
    expect(by.get('ISEQ Index')).toMatchObject({ ccy: 'EUR', country: 'IE', region: 'EMEA', yahoo: '^ISEQ' });
    // Yahoo gives Oslo's OBX a price but no daily history, so it is not listed.
    expect(INDICES.some((d) => d.ticker === 'OBX' || d.yahoo === 'OBX.OL')).toBe(false);
    for (const t of ['BE', 'SE', 'PT', 'AT', 'IE']) expect(COUNTRY_NAMES[t], t).toBeTruthy();
  });

  it('calibrates each new index and currency to its real closes', () => {
    expect(ANCHORS.get('BEL20 Index')?.[0]).toEqual(['2026-10-16', 5586.04]);
    expect(INDICES.find((d) => d.id === 'BEL20 Index')!.px).toBe(5586.04);
    for (const id of ['OMX Index', 'PSI20 Index', 'ATX Index', 'ISEQ Index', 'CCY:PLN', 'CCY:CZK', 'CCY:DKK']) {
      expect(ANCHORS.get(id)?.length, id).toBeGreaterThan(5);
    }
  });

  it('shows them in the EMEA group of MARKET, every listed index being in the universe', () => {
    const emea = INDEX_GROUPS.find((g) => g.name === 'EMEA')!.ids;
    expect(emea).toEqual(expect.arrayContaining(['AEX Index', 'BEL20 Index', 'OMX Index', 'ATX Index', 'PSI20 Index', 'ISEQ Index']));
    const ids = new Set(buildUniverse(new Date(NOW)).map((d) => d.id));
    for (const id of INDEX_GROUPS.flatMap((g) => g.ids)) expect(ids.has(id), id).toBe(true);
  });

  it('simulates the BEL 20 through its calibration anchors', () => {
    const engine = new MarketEngine(() => NOW);
    const q = engine.quote('BEL20 Index')!;
    expect(Number.isFinite(q.last) && q.last > 0).toBe(true);
    const s = engine.daily('BEL20 Index');
    const i = Array.from(s.t).findIndex((t) => t === Date.parse('2025-12-31T00:00:00Z'));
    expect(i).toBeGreaterThan(0);
    expect(s.c[i]).toBeCloseTo(5078.43, 1);
  });
});

describe('Nordic and central European currencies', () => {
  it('defines the zloty and the koruna and quotes the five against the dollar and the euro', () => {
    expect(CURRENCIES.find((c) => c.code === 'PLN')).toMatchObject({ country: 'PL', region: 'EMEA' });
    expect(CURRENCIES.find((c) => c.code === 'CZK')).toMatchObject({ country: 'CZ', region: 'EMEA' });
    const by = new Map(FX.map((d) => [d.id, d]));
    for (const c of ['SEK', 'NOK', 'DKK', 'PLN', 'CZK']) {
      expect(by.get(`USD${c} Curncy`)?.yahoo, c).toBe(`${c}=X`);
      expect(by.get(`EUR${c} Curncy`)?.yahoo, c).toBe(`EUR${c}=X`);
    }
  });

  it('puts them in FXMATRIX, each matrix currency with a pair against the dollar', () => {
    expect(FX_MATRIX).toEqual(expect.arrayContaining(['SEK', 'NOK', 'DKK', 'PLN', 'CZK']));
    const ids = new Set(FX.map((d) => d.id));
    for (const c of FX_MATRIX.filter((x) => x !== 'USD')) expect(ids.has(`${c}USD Curncy`) || ids.has(`USD${c} Curncy`), c).toBe(true);
  });

  it('keeps the euro crosses consistent with the dollar rates the matrix derives from', () => {
    const engine = new MarketEngine(() => NOW);
    const eurusd = engine.quote('EURUSD Curncy')!.last;
    for (const c of ['SEK', 'NOK', 'DKK', 'PLN', 'CZK']) {
      const usdx = engine.quote(`USD${c} Curncy`)!.last;
      expect(engine.quote(`EUR${c} Curncy`)!.last, c).toBeCloseTo(eurusd * usdx, 6);
      expect(engine.usdValue('EUR') / engine.usdValue(c), c).toBeCloseTo(eurusd * usdx, 6);
    }
    // EURDKK stays near the central rate of ERM II (7.46038), as the calibration has it.
    expect(Math.abs(engine.quote('EURDKK Curncy')!.last / 7.46038 - 1)).toBeLessThan(0.03);
  });
});

describe('Belgium in ECONSTATS', () => {
  afterEach(() => {
    vi.resetModules();
    delete (globalThis as { window?: unknown }).window;
  });

  it('lists Belgium with the euro area members, from Eurostat', () => {
    expect(EUROSTAT_MEMBERS).toContain('BE');
    expect(COUNTRY_STATS.BE).toEqual({ gdp: ['ESTAT:GDP:BE', 'q', 'level'], cpi: ['ESTAT:HICP:BE', 'm', 'level'], un: ['ESTAT:UN:BE', 'm'] });
    expect(COUNTRY_NAMES.BE).toBe('Belgium');
  });

  it('asks Eurostat for every member ECONSTATS lists', () => {
    const list = /const EUROSTAT_GEO = \[([^\]]*)\]/.exec(mainSource)?.[1] ?? '';
    const geos = [...list.matchAll(/'([A-Z0-9]+)'/g)].map((m) => m[1]);
    expect(geos).toEqual(expect.arrayContaining(['EA', ...EUROSTAT_MEMBERS]));
  });

  it("files Belgium's published figures and Eurostat's flags under its own series", async () => {
    const texts: Record<string, string> = { estatHicp: hicpBe, estatUnemp: unempBe, estatGdp: gdpBe };
    (globalThis as { window?: unknown }).window = {
      arminDesktop: {
        fred: async () => ({ status: 0, text: '', missing: 'FRED_API_KEY' }),
        official: async (source: string) => ({ status: 200, text: texts[source] ?? '' }),
      },
    };
    const { startFred, fredData, figureStatus } = await import('../src/data/live/fred');
    const stop = startFred();
    await vi.waitFor(() => expect(fredData.get().series['ESTAT:GDP:BE']).toBeDefined());
    stop();
    const s = fredData.get().series;
    expect(s['ESTAT:HICP:BE']).toEqual([['2026-07-01', 3.6], ['2026-08-01', 4.2], ['2026-09-01', 4.5]]);
    expect(s['ESTAT:UN:BE']).toEqual([['2026-06-01', 6.3], ['2026-07-01', 6.0], ['2026-08-01', 5.9]]);
    expect(s['ESTAT:GDP:BE']?.at(-1)).toEqual(['2026-04-01', 0.5]);
    expect(figureStatus('ESTAT:GDP:BE', '2026-04-01')).toBe('provisional');
    // The other members are still read from the same answers.
    expect(s['ESTAT:HICP:NL']?.at(-1)).toEqual(['2026-09-01', 3.0]);
    expect(s['ESTAT:HICP:EA']?.at(-1)).toEqual(['2026-09-01', 3.8]);
  });
});
