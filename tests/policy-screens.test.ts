import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { engine } from '../src/data/market';
import { policyRates } from '../src/data/live/policy';
import type { PolicyDecision } from '../src/data/live/policy-decisions';
import { CBRT } from '../src/functions/CBRT';
import { FED } from '../src/functions/FED';
import { FOMC } from '../src/functions/FOMC';

// Server rendering does not have browser market subscriptions; the policy store remains the production store.
vi.mock('../src/data/market', async (original) => ({ ...await original<typeof import('../src/data/market')>(), useTick: () => 0 }));

// Synthetic statement record: tests exercise screens, not the historical truth of these policy figures.
const RELEASE = Date.parse('2026-10-28T18:00:00Z');
const HOLD: PolicyDecision = { id: 'FED:2026-10-28', bank: 'FED', date: '2026-10-28', announcedAt: RELEASE, effectiveDate: '2026-10-29', action: 'hold', changeBp: 0, lower: 3.75, upper: 4, status: 'confirmed', sourceUrl: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm', implementationUrl: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a1.htm', retrievedAt: RELEASE + 60_000 };
const wasReal = engine.realOnly;
afterEach(() => { policyRates.set({}); engine.realOnly = wasReal; vi.restoreAllMocks(); });
const audit = (html: string) => JSON.parse(/data-audit-state="([^"]+)"/.exec(html)![1].replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&#x27;', "'"));

describe('shared policy statement on screens', () => {
  it('renders a confirmed HOLD on FED/FOMC/CBRT when the daily rate provider is unavailable', () => {
    engine.realOnly = true;
    vi.spyOn(engine, 'now').mockReturnValue(RELEASE + 60_000);
    policyRates.set({ decisions: [HOLD], fomc: ['2026-10-28', '2026-12-09'] });
    for (const component of [FED, FOMC, CBRT]) {
      const html = renderToStaticMarkup(createElement(component, { route: { fn: 'FEDPORTAL' } }));
      const fed = audit(html).banks.find((bank: { code: string }) => bank.code === 'FED');
      expect(fed.latestDecision).toMatchObject({ id: HOLD.id, outcome: 'hold', changeBp: 0, upper: 4, lower: 3.75, sourceUrl: HOLD.sourceUrl });
      expect(fed.current.value).toBeNull(); // Future-effective statement does not stand in for missing current history.
      expect(html.toLowerCase()).toContain('unchanged');
    }
  });

  it('keeps a confirmed HOLD separate from September’s last nonzero change on FED and CBRT', () => {
    engine.realOnly = true;
    vi.spyOn(engine, 'now').mockReturnValue(Date.parse('2026-10-29T12:00:00Z'));
    policyRates.set({ decisions: [HOLD], fomc: ['2026-09-16', '2026-10-28', '2026-12-09'], fedUpper: { changes: [['2026-01-01', 4.25], ['2026-09-17', 4]], last: 4, asOf: '2026-10-27' } });
    for (const component of [FED, CBRT]) {
      const html = renderToStaticMarkup(createElement(component, { route: { fn: 'FEDPORTAL' } }));
      expect(html).toContain('Last nonzero change');
      expect(html).toContain('17/09/26');
      expect(html).toContain('Unchanged, 0 bp');
      const fed = audit(html).banks.find((bank: { code: string }) => bank.code === 'FED');
      expect(fed.current).toMatchObject({ value: 4, lower: 3.75 });
      expect(fed.latestDecision).toMatchObject({ date: '2026-10-28', outcome: 'hold' });
    }
  });
});
