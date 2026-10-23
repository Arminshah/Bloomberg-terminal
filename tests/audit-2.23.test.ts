import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoMembersNote, groupName, regionTab } from '../src/functions/IMAP';
import { engine } from '../src/data/market';
import { buildRealFund, realFund, splitsKey } from '../src/data/live/yfund';
import { parseCompanyFacts } from '../src/data/live/sec';
import { splitFactorSince } from '../src/data/live/statement-supplements';
import { realSplits } from '../src/data/live/yahoo';

/** Regression tests for the findings of the 2.23.0 audit (docs/audit-v2.23.0.md), one block per finding. */

const day = (s: string) => Date.parse(`${s}T00:00:00Z`) / 86_400_000;
const NOW = Date.parse('2026-10-20T00:00:00Z');

describe('A23-006: SEC per-share figures filed before a later split are put on today\'s share basis', () => {
  const def = engine.get('NVDA US Equity')!;
  // NVIDIA's splits as its price history records them: 4-for-1 on 20 Jul 2021, 10-for-1 on 10 Jun 2024.
  const NVDA_SPLITS = [{ day: day('2021-07-20'), numerator: 4, denominator: 1 }, { day: day('2024-06-10'), numerator: 10, denominator: 1 }];
  afterEach(() => {
    realFund.delete(def.id);
    realSplits.delete(def.id);
  });

  it('counts only the splits after the filing day', () => {
    expect(splitFactorSince(NVDA_SPLITS, '2024-02-21')).toBe(10); // 10-K for FY2024, before the 2024 split
    expect(splitFactorSince(NVDA_SPLITS, '2021-02-26')).toBe(40); // 10-K for FY2021, before both
    expect(splitFactorSince(NVDA_SPLITS, '2025-02-26')).toBe(1); // 10-K for FY2025, already restated
    expect(splitFactorSince(NVDA_SPLITS, '2024-06-10')).toBe(1); // filed on the split day: not counted again
    expect(splitFactorSince([], '2024-02-21')).toBe(1);
    expect(splitFactorSince(NVDA_SPLITS, 'not a date')).toBeNaN();
  });

  // FY2022 (ended 30 Jan 2022) last appeared in the 10-K filed 21 Feb 2024, with EPS 3.85 on 2.535 billion shares.
  const fy2022 = (unit: string, val: number) => ({ units: { [unit]: [{ start: '2021-02-01', end: '2022-01-30', val, accn: '0001045810-24-000029', form: '10-K', filed: '2024-02-21', fy: 2024, fp: 'FY' }] } });
  const facts = () => parseCompanyFacts(JSON.stringify({ cik: 1045810, entityName: 'NVIDIA CORP', facts: { 'us-gaap': {
    Revenues: fy2022('USD', 26_914e6), NetIncomeLoss: fy2022('USD', 9_752e6),
    EarningsPerShareDiluted: fy2022('USD/shares', 3.85), WeightedAverageNumberOfDilutedSharesOutstanding: fy2022('shares', 2_535e6),
  } } }))!;
  const company = { quoteSummary: { result: [{ financialData: { financialCurrency: 'USD' } }] } };

  it('divides the filed EPS by the split factor and multiplies the diluted shares by it (NVIDIA FY2022: 3.85 → 0.385)', () => {
    const f = buildRealFund(def, company, null, null, null, NOW, facts(), NVDA_SPLITS);
    const y = f.annual.find((p) => p.label === 'FY 2022')!;
    expect(y.eps).toBeCloseTo(0.385, 6);
    expect(y.shares).toBeCloseTo(25_350, 6); // millions, on today's basis
    expect(y.ni).toBeCloseTo(9_752, 6); // money is unchanged by a split
    // Both on today's basis, so EPS times diluted shares still gives net income back.
    expect(Math.abs(y.eps * y.shares - y.ni) / y.ni).toBeLessThan(0.005); // EPS is filed to the cent
    expect(y.supplements?.join(' ')).toContain('adjusted for the share splits since that filing');
    expect(y.supplements?.join(' ')).toContain('filed figure 3.85');
    expect(f.splitsKey).toBe(splitsKey(NVDA_SPLITS));
  });

  it('leaves the per-share figures out while the split history is unknown, and keeps them as filed when no split followed', () => {
    const unknown = buildRealFund(def, company, null, null, null, NOW, facts(), null);
    expect(unknown.annual.find((p) => p.label === 'FY 2022')!.eps).toBeNaN();
    expect(unknown.annual.find((p) => p.label === 'FY 2022')!.rev).toBeCloseTo(26_914, 6);
    expect(unknown.splitsKey).toBe('unknown');
    const none = buildRealFund(def, company, null, null, null, NOW, facts(), []);
    expect(none.annual.find((p) => p.label === 'FY 2022')!.eps).toBe(3.85);
    expect(none.splitsKey).toBe('none');
  });

  it('reads the split history the price history loaded when none is passed', () => {
    realSplits.set(def.id, NVDA_SPLITS);
    expect(buildRealFund(def, company, null, null, null, NOW, facts()).annual.find((p) => p.label === 'FY 2022')!.eps).toBeCloseTo(0.385, 6);
  });
});

describe('A23-001: INDEXMAP for an index without a loadable membership says so and opens its region', () => {
  it('maps an index to its region tab', () => {
    expect(regionTab(engine.get('SPX Index'))).toBe(1);
    expect(regionTab(engine.get('SX5E Index'))).toBe(2);
    expect(regionTab(engine.get('UKX Index'))).toBe(2);
    expect(regionTab(engine.get('BEL20 Index'))).toBe(2);
    expect(regionTab(engine.get('NKY Index'))).toBe(3);
    expect(regionTab(engine.get('HSI Index'))).toBe(3);
    expect(regionTab(undefined)).toBe(1);
  });

  it('labels the fallback as not being the index (SX5E: the European map, not "US by sector")', () => {
    const sx5e = engine.get('SX5E Index')!;
    const html = renderToStaticMarkup(createElement(NoMembersNote, { index: sx5e, region: regionTab(sx5e) }));
    expect(html).toContain('SX5E: the index&#x27;s membership is not available here (index memberships load in the desktop app)');
    expect(html).toContain('This is not the index: it is the heat map of the European stocks');
    const world = renderToStaticMarkup(createElement(NoMembersNote, { index: sx5e, region: 4 }));
    expect(world).toContain('heat map of the stocks the app follows');
  });
});

describe('A23-002: a stock without a known sector is grouped as Unclassified, not "--"', () => {
  it('turns the lookup placeholder into a group name', () => {
    expect(groupName('--', 'Unclassified')).toBe('Unclassified');
    expect(groupName(' -- ', 'Unclassified')).toBe('Unclassified');
    expect(groupName('', 'Unclassified')).toBe('Unclassified');
    expect(groupName(undefined, 'Other')).toBe('Other');
    expect(groupName('Information Technology', 'Unclassified')).toBe('Information Technology');
  });
});

describe('A23-004: the key bar\'s market sector keys do what their function keys do', () => {
  it('types each F-key\'s sector word, F12 included (PORT types CLIENT, as F12 does)', async () => {
    const { KEYS } = await import('../src/components/KeyBar');
    const { FKEY_TEXT } = await import('../src/components/CommandLine');
    const yellow = KEYS.filter((k) => k.color === 'yellow');
    expect(yellow.map((k) => k.sub)).toEqual(Object.keys(FKEY_TEXT));
    for (const k of yellow) expect(k.types).toBe(FKEY_TEXT[k.sub]);
    expect(KEYS.find((k) => k.sub === 'F12')).toMatchObject({ label: 'PORT', types: 'CLIENT' });
  });
});

describe('A23-005: the package description counts the registered functions', () => {
  it('states the number of functions in the registry', async () => {
    const { FUNCTIONS } = await import('../src/terminal/registry');
    const pkg = (await import('../package.json')).default as { description: string };
    expect(pkg.description).toContain(`${FUNCTIONS.length} functions`);
  });
});

describe('A23-003: a bond the app cannot price is not called a stock', () => {
  it('points a generic Treasury to its yield line', async () => {
    const { genericTreasuryYield } = await import('../src/terminal/commands');
    expect(genericTreasuryYield('CT10')).toEqual({ id: 'USGG10YR Index', years: 10 });
    expect(genericTreasuryYield('ct2')).toEqual({ id: 'USGG2YR Index', years: 2 });
    expect(genericTreasuryYield('CT99')).toBeUndefined();
    expect(genericTreasuryYield('T 4 08/15/34')).toBeUndefined();
  });

  it('reports an unknown bond as a security of its kind, without searching it as a company name', async () => {
    const { parseCommand } = await import('../src/terminal/commands');
    const { lookupFn } = await import('../src/terminal/registry');
    const p = parseCommand('CT99 Govt PROFILE', lookupFn);
    expect(p).toMatchObject({ kind: 'error', message: 'Unknown security: CT99 Govt', final: true });
    expect(p.kind === 'error' && p.lookup).toBeFalsy();
    // A stock still gets its online lookup.
    expect(parseCommand('ZZZQ US Equity PROFILE', lookupFn)).toMatchObject({ kind: 'error', lookup: 'ZZZQ' });
  });
});

describe('A23-007: Finnhub\'s calendar-quarter periods are put on the company\'s fiscal quarters (NVIDIA)', () => {
  // Finnhub /stock/earnings for NVDA on 23 Oct 2026, as received (its year and quarter fields included).
  const finnhubEps = [
    { period: '2026-09-30', year: 2027, quarter: 2, actual: 2.22, estimate: 2.1384, surprise: 0.0816, surprisePct: 3.8159 },
    { period: '2026-06-30', year: 2027, quarter: 1, actual: 1.87, estimate: 1.7922, surprise: 0.0778, surprisePct: 4.341 },
    { period: '2026-06-30', year: 2026, quarter: 1, actual: 1.87, estimate: 1.7922, surprise: 0.0778, surprisePct: 4.341 },
    { period: '2026-03-31', year: 2026, quarter: 4, actual: 1.62, estimate: 1.5634, surprise: 0.0566, surprisePct: 3.6203 },
  ];

  it('maps a calendar-quarter label to the fiscal quarter end inside it', async () => {
    const { finnhubQuarterEnd } = await import('../src/data/live/consensus');
    expect(finnhubQuarterEnd('2026-09-30', 1)).toBe('2026-07-31'); // NVIDIA: January year end
    expect(finnhubQuarterEnd('2026-06-30', 1)).toBe('2026-04-30');
    expect(finnhubQuarterEnd('2026-03-31', 1)).toBe('2026-01-31');
    expect(finnhubQuarterEnd('2026-09-30', 9)).toBe('2026-09-30'); // Apple: September year end, quarters on calendar quarters
    expect(finnhubQuarterEnd('2026-09-30', 12)).toBe('2026-09-30');
    expect(finnhubQuarterEnd('2026-09-30', 5)).toBe('2026-08-31'); // a May year end: quarters end Aug, Nov, Feb, May
    expect(finnhubQuarterEnd('2026-08-31', 1)).toBe('2026-08-31'); // not a calendar quarter's end: kept
    expect(finnhubQuarterEnd('2026-09-30', undefined)).toBe('2026-09-30');
  });

  it('shows no quarter "ended 30/09/26" or "30/06/26" and lists each fiscal quarter once', async () => {
    const { mergeConsensus } = await import('../src/data/live/consensus');
    const yahoo = {
      past: [
        { end: '2026-07-31', label: 'Q2 2027', date: Date.parse('2026-08-26T20:20:00Z'), epsEst: 2.091, epsActual: 2.22, revActual: NaN },
        { end: '2026-04-30', label: 'Q1 2027', date: Date.parse('2026-05-20T20:20:00Z'), epsEst: 1.772, epsActual: 1.87, revActual: NaN },
        { end: '2026-01-31', label: 'Q4 2026', date: Date.parse('2026-02-25T21:20:00Z'), epsEst: 1.538, epsActual: 1.62, revActual: NaN },
      ],
      next: null,
      following: null,
    };
    for (const input of [{ yahoo, finnhubEps, fye: 1 }, { yahoo, finnhubEps }, { finnhubEps, fye: 1 }]) {
      const past = mergeConsensus({ ...input, now: Date.parse('2026-10-23T12:00:00Z') }).past;
      expect(past.map((q) => q.end)).not.toContain('2026-09-30');
      expect(past.map((q) => q.end)).not.toContain('2026-06-30');
      const labels = past.map((q) => q.label);
      expect(new Set(labels).size).toBe(labels.length);
      expect(past.find((q) => q.label === 'Q2 2027')).toMatchObject({ end: '2026-07-31' });
      expect(past.find((q) => q.label === 'Q2 2027')!.eps.actual).toBe(2.22);
      expect(labels).not.toContain('Q1 2026');
    }
  });
});

describe('A23-008: the missing-revenue hint does not ask for a key that cannot help (SAP GY)', () => {
  it('says the earlier-estimate sources are asked for US listings only', async () => {
    const { missingRevenueHint } = await import('../src/data/live/consensus');
    const q = { end: '2026-09-30', label: 'Q3 2026', eps: { est: NaN, actual: NaN, low: NaN, high: NaN, analysts: NaN }, rev: { est: NaN, actual: 10.27e9, low: NaN, high: NaN, analysts: NaN } };
    const outside = missingRevenueHint([q as never], undefined, false)!;
    expect(outside).toContain('1 of 1 reported quarters have no expected revenue');
    expect(outside).toContain('for US listings only');
    expect(outside).not.toContain('ALPHA_VANTAGE_API_KEY');
    expect(missingRevenueHint([q as never], undefined, true)).toContain('ALPHA_VANTAGE_API_KEY');
  });
});

describe('A23-009: a P/E on a loss reads NM, not a blank (APLD)', () => {
  it('FUNDCHART and QUOTE mark loss years NM and keep a blank where the price or currency is missing', async () => {
    const { yearPeBlank } = await import('../src/functions/ANALYSIS');
    const { peText } = await import('../src/functions/DESEquity');
    const html = (n: unknown) => renderToStaticMarkup(createElement('div', null, n as never));
    expect(html(yearPeBlank(true, -0.91))).toContain('>NM</span>');
    expect(html(yearPeBlank(true, 0))).toContain('>NM</span>');
    expect(yearPeBlank(false, -0.91)).toBe('--'); // reported in another currency: no P/E either way
    expect(yearPeBlank(true, NaN)).toBe('--');
    expect(html(peText(NaN, -0.91))).toContain('>NM</span>'); // QUOTE's P/E LTM uses the same rule
  });
});

describe('A23-010: the news quick start\'s workflows (reference document 14)', () => {
  it('TOP with a topic filters by that word; a stock still filters by its ticker', async () => {
    const { parseCommand } = await import('../src/terminal/commands');
    const { lookupFn } = await import('../src/terminal/registry');
    for (const topic of ['Oil', 'Europe', 'China', 'Stocks', 'Bonds', 'gold']) {
      expect(parseCommand(`TOP ${topic}`, lookupFn)).toEqual({ kind: 'route', fn: 'MARKETNEWS', args: topic.toUpperCase() });
    }
    expect(parseCommand('TOP NVDA', lookupFn)).toMatchObject({ kind: 'route', fn: 'MARKETNEWS', sec: { id: 'NVDA US Equity' } });
  });

  it('opens the screens the document names that the app has under another name', async () => {
    const { parseCommand } = await import('../src/terminal/commands');
    const { lookupFn } = await import('../src/terminal/registry');
    expect(parseCommand('FIRS', lookupFn)).toEqual({ kind: 'route', fn: 'BREAKING' });
    expect(parseCommand('HCP', lookupFn)).toEqual({ kind: 'route', fn: 'HISTORY' });
    expect(parseCommand('HCPI', lookupFn)).toEqual({ kind: 'route', fn: 'HISTORY' });
    expect(parseCommand('FXFR', lookupFn)).toEqual({ kind: 'route', fn: 'FXFORWARD' });
  });

  it('names the front contract for an active-contract ticker (CLA Comdty)', async () => {
    const { parseCommand } = await import('../src/terminal/commands');
    const { lookupFn } = await import('../src/terminal/registry');
    expect(parseCommand('CLA Comdty', lookupFn)).toEqual({ kind: 'error', message: 'CLA Comdty: the app has no active-contract line. The front contract is: CL1 Comdty', final: true });
    expect(parseCommand('ZZA Comdty', lookupFn)).toMatchObject({ kind: 'error', message: 'Unknown security: ZZA Comdty' });
  });
});

describe('A23-011: SCREEN leaves out industries, as the ESG screening exercise does (reference document 17)', () => {
  it('excludes a stock whose sector or industry contains one of the words', async () => {
    const { excludedBy } = await import('../src/functions/EQS');
    const pm = { eq: { sector: 'Consumer Staples', industry: 'Tobacco' } } as never;
    const lvs = { eq: { sector: 'Consumer Discretionary', industry: 'Resorts & Casinos' } } as never;
    const aapl = { eq: { sector: 'Information Technology', industry: 'Consumer Electronics' } } as never;
    const words = 'tobacco, Casinos , defense';
    expect(excludedBy(pm, words)).toBe('tobacco');
    expect(excludedBy(lvs, words)).toBe('casinos');
    expect(excludedBy(aapl, words)).toBeUndefined();
    expect(excludedBy(pm, '  ,  ')).toBeUndefined();
  });
});

describe('A23-012: the course notes\' commands (reference document 16)', () => {
  it('points GT10 Govt to the 10-year yield and opens PORTFOLIO for PRTU', async () => {
    const { parseCommand, genericTreasuryYield } = await import('../src/terminal/commands');
    const { lookupFn } = await import('../src/terminal/registry');
    expect(genericTreasuryYield('GT10')).toEqual({ id: 'USGG10YR Index', years: 10 });
    expect(parseCommand('PRTU', lookupFn)).toEqual({ kind: 'route', fn: 'PORTFOLIO' });
  });
});

describe('A23-013: a typed company name lists the company before a guessed ticker', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('"apple" suggests Apple Inc first; an unknown ticker alone still offers the online load first', async () => {
    vi.stubGlobal('window', { arminDesktop: { yahoo: vi.fn() } });
    const { suggest } = await import('../src/terminal/suggest');
    const apple = suggest('apple');
    expect(apple[0]).toMatchObject({ kind: 'sec', primary: 'AAPL US Equity' });
    expect(apple.findIndex((s) => s.key === 'online:APPLE')).toBeGreaterThan(0);
    expect(suggest('ZZZX')[0]).toMatchObject({ key: 'online:ZZZX' });
  });
});
