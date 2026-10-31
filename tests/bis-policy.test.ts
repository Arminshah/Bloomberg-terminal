import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { engine } from '../src/data/market';
import { parseBisCbpol, type OfficialAnswer } from '../src/data/live/official';
import { loadPolicyRates, policyRates } from '../src/data/live/policy';
import { centralBanks } from '../src/data/eco';
import { CENB } from '../src/functions/FXRATES';
import { CBRT } from '../src/functions/CBRT';

vi.mock('../src/data/market', async (original) => {
  const actual = await original<typeof import('../src/data/market')>();
  return { ...actual, useTick: () => 0, useQuote: (id: string | undefined) => id ? actual.engine.quote(id) : undefined };
});

// A synthetic answer in the layout the BIS's WS_CBPOL dataflow gives with format=csv&detail=dataonly (checked on
// 31 October 2026): weekends and holidays come as NaN, and the levels are not a claim about any bank's actual rate.
const BIS = [
  'FREQ,REF_AREA,TIME_PERIOD,OBS_VALUE',
  'D,CN,2026-09-30,3.1', 'D,CN,2026-10-03,NaN', 'D,CN,2026-10-20,3', 'D,CN,2026-10-21,3',
  'D,IN,2026-09-30,5.25', 'D,IN,2026-10-07,5.5', 'D,IN,2026-10-19,5.5',
  'D,JP,2026-09-30,1', 'D,JP,2026-10-01,1.25', 'D,JP,2026-10-27,1.25',
  'D,MX,2026-09-30,7', 'D,MX,2026-10-09,6.75', 'D,MX,2026-10-27,6.75',
].join('\n');

const NOW = Date.parse('2026-10-31T12:00:00Z');
const answer = (text: string, status = 200): OfficialAnswer => ({ status, text, attemptedAt: NOW, receivedAt: NOW, ...(status === 200 ? { checkedAt: NOW } : { error: 'Synthetic failure' }) });
const wasReal = engine.realOnly;
afterEach(() => { policyRates.set({}); engine.realOnly = wasReal; vi.restoreAllMocks(); });

describe("the BIS's policy rates", () => {
  it('reads one country, skipping holidays and other countries, and needs its own columns', () => {
    expect(parseBisCbpol(BIS, 'IN')).toEqual([['2026-09-30', 5.25], ['2026-10-07', 5.5], ['2026-10-19', 5.5]]);
    expect(parseBisCbpol(BIS, 'CN')).toEqual([['2026-09-30', 3.1], ['2026-10-20', 3], ['2026-10-21', 3]]);
    expect(parseBisCbpol(BIS, 'BR')).toEqual([]);
    expect(parseBisCbpol('FREQ,REF_AREA,OBS_VALUE\nD,IN,5.5', 'IN')).toEqual([]);
    expect(parseBisCbpol(`\uFEFF${BIS}`, 'MX')).toHaveLength(3);
  });

  it("gives the PBoC, RBI, Banxico and the BOJ's guideline their moves, dated by the BIS's observations", async () => {
    await loadPolicyRates(async (source) => answer(source === 'bis' ? BIS : '', source === 'bis' ? 200 : 503), NOW);
    const r = policyRates.get();
    expect(r.rbi).toMatchObject({ last: 5.5, asOf: '2026-10-19', changes: [['2026-09-30', 5.25], ['2026-10-07', 5.5]] });
    expect(r.pboc).toMatchObject({ last: 3, asOf: '2026-10-21' });
    expect(r.banxico).toMatchObject({ last: 6.75, asOf: '2026-10-27' });
    expect(r.bojTarget).toMatchObject({ last: 1.25, changes: [['2026-09-30', 1], ['2026-10-01', 1.25]] });
    // The check holds for the four together and carries the oldest of their dates.
    expect(r.health?.bis).toMatchObject({ state: 'current', sourceDate: '2026-10-19' });
    engine.realOnly = true;
    vi.spyOn(engine, 'now').mockReturnValue(NOW);
    const banks = Object.fromEntries(centralBanks(NOW).map((b) => [b.code, b]));
    expect(banks.RBI).toMatchObject({ rate: 5.5, real: true, last: '2026-10-07', lastMove: 0.25 });
    expect(banks.BANXICO).toMatchObject({ rate: 6.75, real: true });
    expect(banks.BOJ).toMatchObject({ rate: 1.25, real: true });
  });

  it('marks the check failed when a bank is missing from the answer, and keeps the earlier levels', async () => {
    await loadPolicyRates(async (source) => answer(source === 'bis' ? BIS : '', source === 'bis' ? 200 : 503), NOW);
    const withoutMexico = BIS.split('\n').filter((l) => !l.startsWith('D,MX')).join('\n');
    await loadPolicyRates(async (source) => answer(source === 'bis' ? withoutMexico : '', source === 'bis' ? 200 : 503), NOW + 60_000);
    expect(policyRates.get().health?.bis?.state).toBe('error');
    expect(policyRates.get().banxico?.last).toBe(6.75);
  });

  it('names the BIS beside each rate it supplies and credits it', async () => {
    await loadPolicyRates(async (source) => answer(source === 'bis' ? BIS : '', source === 'bis' ? 200 : 503), NOW);
    engine.realOnly = true;
    vi.spyOn(engine, 'now').mockReturnValue(NOW);
    const monitor = renderToStaticMarkup(createElement(CENB, { route: { fn: 'CENTRALBANKS' } }));
    const rbi = /<tr[^>]*data-bank-code="RBI"[\s\S]*?<\/tr>/.exec(monitor)![0];
    expect(rbi).toContain('via BIS');
    expect(rbi).toContain('5.50%');
    expect(rbi).toContain('time not verified');
    expect(monitor).toContain('Source: BIS central bank policy rates (WS_CBPOL)');
    const analysis = renderToStaticMarkup(createElement(CBRT, { route: { fn: 'RATEANALYSIS' } }));
    expect(analysis).toContain('Policy repo rate · via BIS');
    expect(analysis).toContain('Monthly fixing; dates unavailable');
  });
});
