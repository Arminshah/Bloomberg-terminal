import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { engine } from '../src/data/market';
import { policyRates, type PolicyRates } from '../src/data/live/policy';
import type { PolicyDecision } from '../src/data/live/policy-decisions';
import { BTMM, WIRP } from '../src/functions/RATES';

vi.mock('../src/data/market', async (original) => {
  const market = await original<typeof import('../src/data/market')>();
  return { ...market, useTick: () => 0, useQuote: (id: string) => market.engine.quote(id) };
});
vi.mock('../src/data/live/yquotes', async (original) => ({ ...await original<typeof import('../src/data/live/yquotes')>(), useYahooQuotes: () => new Map() }));

// Synthetic policy documents/levels exercise chronology only; they are not actual Fed observations.
const RELEASE = Date.parse('2026-10-28T18:00:00Z');
const EFFECTIVE = Date.parse('2026-11-02T05:00:00Z');
const CUT: PolicyDecision = { id: 'FED:2026-10-28', bank: 'FED', date: '2026-10-28', announcedAt: RELEASE, effectiveDate: '2026-11-02', lower: 3.5, upper: 3.75, action: 'cut', changeBp: -25, status: 'confirmed', retrievedAt: RELEASE + 60_000, sourceUrl: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm', implementationUrl: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a1.htm' };
const rates = (): PolicyRates => ({
  decisions: [CUT], fomc: ['2026-10-28', '2026-12-09'],
  fedUpper: { changes: [['2026-09-17', 4]], last: 4, asOf: '2026-10-27' },
  fedLower: { changes: [['2026-09-17', 3.75]], last: 3.75, asOf: '2026-10-27' },
  effr: { changes: [['2026-09-17', 3.9]], last: 3.9, asOf: '2026-10-27' },
});
const wasReal = engine.realOnly;
afterEach(() => { policyRates.set({}); engine.realOnly = wasReal; vi.restoreAllMocks(); });
const render = (component: typeof BTMM) => renderToStaticMarkup(createElement(component, { route: { fn: 'MONEYMARKET' } }));
const targetText = (html: string, testid: string) => new RegExp(`data-testid="${testid}"[^>]*>([\\s\\S]*?)<\\/${testid === 'money-target' ? 'tr' : 'div'}>`).exec(html)?.[1].replace(/<[^>]+>/g, ' ');

describe('effective Fed target on downstream rate screens', () => {
  it('keeps the entire old range until the explicit effective instant and then updates both bounds before daily observations', () => {
    engine.realOnly = true;
    const clock = vi.spyOn(engine, 'now').mockReturnValue(EFFECTIVE - 1);
    policyRates.set(rates());
    for (const [component, id] of [[BTMM, 'money-target'], [WIRP, 'probability-target']] as const) {
      expect(targetText(render(component), id)).toContain('3.75-4.00%');
    }
    clock.mockReturnValue(EFFECTIVE);
    for (const [component, id] of [[BTMM, 'money-target'], [WIRP, 'probability-target']] as const) {
      const html = render(component);
      expect(targetText(html, id)).toContain('3.50-3.75%');
      expect(targetText(html, id)).not.toContain('3.75-3.75');
      expect(html).toContain(CUT.sourceUrl);
      expect(html).toContain('In force from 2026-11-02');
    }
    const probabilities = render(WIRP);
    expect(probabilities).toContain('Latest observed effective fed funds');
    expect(probabilities).toContain('27/10/26');
    expect(probabilities).toContain('Awaiting an effective fed funds observation on or after 2026-11-02');
  });

  it('shows a statement-backed target while the observation and futures providers are unavailable', () => {
    engine.realOnly = true;
    vi.spyOn(engine, 'now').mockReturnValue(EFFECTIVE);
    policyRates.set({ decisions: [CUT] });
    expect(targetText(render(BTMM), 'money-target')).toContain('3.50-3.75%');
    const probabilities = render(WIRP);
    expect(targetText(probabilities, 'probability-target')).toContain('3.50-3.75%');
    expect(probabilities).toContain('Loading the effective fed funds rate');
  });

  it('never fabricates a lower bound from the upper target in real mode', () => {
    engine.realOnly = true;
    vi.spyOn(engine, 'now').mockReturnValue(EFFECTIVE);
    policyRates.set({ fedUpper: rates().fedUpper });
    for (const [component, id] of [[BTMM, 'money-target'], [WIRP, 'probability-target']] as const) {
      const text = targetText(render(component), id);
      expect(text).toContain('4.00% (upper bound; lower unavailable)');
      expect(text).not.toContain('3.75');
    }
  });

  it('shows the failed check of the exact implementation document instead of another healthy source', () => {
    engine.realOnly = true;
    vi.spyOn(engine, 'now').mockReturnValue(EFFECTIVE);
    policyRates.set({ ...rates(), health: { effr: { state: 'current', attemptedAt: EFFECTIVE, checkedAt: EFFECTIVE } }, documentHealth: {
      'fedStatement:2026-10-28': { state: 'current', attemptedAt: EFFECTIVE, checkedAt: EFFECTIVE },
      'fedImplementation:2026-10-28': { state: 'error', attemptedAt: EFFECTIVE, checkedAt: RELEASE + 60_000, error: 'Synthetic implementation recheck failure' },
    } });
    for (const component of [BTMM, WIRP]) {
      const html = render(component);
      expect(html).toContain('Latest target check failed: Synthetic implementation recheck failure');
      expect(html).toContain('Retained target keeps its source dates');
    }
  });
});
