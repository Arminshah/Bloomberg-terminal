import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { philFedProblem, philFedRequest } from '../electron/philfed.cjs';
import { latestSurvey, loadUsSpf, parseUsSpf, type UsSpf } from '../src/data/live/us-spf';
import { UsSpfTableView } from '../src/functions/ECFC';
import type { KeyedAnswer } from '../src/data/live/lookup';
// Synthetic pages in the layout of the Philadelphia Fed's survey page and a release page (checked on 31 October 2026);
// the figures are made up. The site states no terms beyond "All rights reserved", so none of its pages is copied here.
import INDEX from './fixtures/philfed/index-synthetic.html?raw';
import PAGE from './fixtures/philfed/spf-q3-2026-synthetic.html?raw';

const spf = (() => {
  const r = parseUsSpf(PAGE, 3, 2026);
  if ('error' in r) throw new Error(r.error);
  return r;
})();

describe("the Philadelphia Fed's Survey of Professional Forecasters", () => {
  it('asks only the survey page and a quarter release page', () => {
    expect(philFedRequest('index')).toEqual({ url: 'https://www.philadelphiafed.org/surveys-and-data/real-time-data-research/survey-of-professional-forecasters', ttl: 6 * 3_600_000 });
    expect(philFedRequest('survey', '3', '2026')?.url).toBe('https://www.philadelphiafed.org/surveys-and-data/real-time-data-research/spf-q3-2026');
    for (const [k, q, y] of [['survey', '5', '2026'], ['survey', '3', '../x'], ['page', '3', '2026'], ['survey', undefined, undefined]]) expect(philFedRequest(k, q, y)).toBeNull();
    expect(philFedProblem(PAGE)).toBeNull();
    expect(philFedProblem('<html><title>Access denied</title></html>')).toBe('The Philadelphia Fed did not send the survey page.');
  });

  it('finds the newest release the survey page links, with its month', () => {
    expect(latestSurvey(INDEX)).toEqual({ quarter: 3, year: 2026, month: 'August 2026' });
    expect(latestSurvey('<html></html>')).toBeNull();
  });

  it("reads the release's tables as printed: previous and new medians, N.A. as none, the decimals kept", () => {
    expect(spf.title).toBe('Third Quarter 2026 Survey of Professional Forecasters');
    expect(spf.tables.map((t) => t.caption)).toEqual([
      'Median forecasts for selected variables',
      'Median short-run and long-run projections for inflation (annualized percentage points)',
      'Risk of a negative quarter (%), survey means',
    ]);
    const [main, inflation, risk] = spf.tables;
    expect(main.columns).toEqual(['Real GDP (%)', 'Unemployment Rate (%)', 'Payrolls (000s/month)']);
    expect(main.sections.map((s) => s.title)).toEqual(['Quarterly data', 'Annual data (projections are based on annual-average levels)']);
    expect(main.sections[0].rows[2]).toEqual({ label: '2027:Q3', previous: [null, null, null], current: ['1.6', '5.2', '30.0'] });
    expect(main.sections[1].rows[1]).toEqual({ label: '2029', previous: ['2.0', '4.8', null], current: ['2.1', '4.7', null] });
    expect(inflation.sections.map((s) => s.title)).toEqual(['Quarterly', 'Q4/Q4 Annual Averages', 'Long-Term Annual Averages']);
    expect(inflation.sections[2].rows[0]).toEqual({ label: '2026-2030', previous: ['2.40', null, '2.30', null], current: ['2.50', null, '2.30', null] });
    expect(risk).toMatchObject({ columns: ['Risk of a negative quarter (%)'], sections: [{ title: 'Quarterly data' }] });
    expect(risk.sections[0].rows[1]).toEqual({ label: '2027:Q3', previous: [null], current: ['19.9'] });
  });

  it('refuses another quarter\'s page and a changed table', () => {
    expect(parseUsSpf(PAGE, 4, 2026)).toEqual({ error: 'The Philadelphia Fed changed the survey page.' });
    expect(parseUsSpf(PAGE.replace('<td style="text-align: center;">1.2</td>', ''), 3, 2026)).toEqual({ error: 'The Philadelphia Fed changed the survey tables.' });
  });

  it('loads the newest release through the survey page, and names what failed', async () => {
    const asked: string[] = [];
    const ok = (text: string) => ({ status: 200, text }) as KeyedAnswer;
    const got = await loadUsSpf(async (kind, q, y) => {
      asked.push(`${kind}:${q ?? ''}:${y ?? ''}`);
      return ok(kind === 'index' ? INDEX : PAGE);
    });
    expect(asked).toEqual(['index::', 'survey:3:2026']);
    expect((got as UsSpf).month).toBe('August 2026');
    expect(await loadUsSpf(async () => ({ status: 503, text: '' }) as KeyedAnswer)).toEqual({ error: 'The Philadelphia Fed answered HTTP 503.' });
  });

  it('shows each variable as Previous and New, N.A. where the page has none', () => {
    const html = renderToStaticMarkup(createElement(UsSpfTableView, { table: spf.tables[0] }));
    expect(html).toContain('<th colSpan="2" class="num">Real GDP (%)</th>');
    expect(html).toContain('>Previous</th>');
    expect(html).toContain('<td class="num">N.A.</td><td class="num cyan">1.6</td>');
    expect(html).toContain('Annual data (projections are based on annual-average levels)');
  });
});
