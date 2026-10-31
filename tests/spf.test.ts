import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseEcbSpf, roundLabel, type EcbSpf } from '../src/data/live/spf';
import { SpfTable } from '../src/functions/ECFC';
import mainSource from '../electron/main.cjs?raw';
// The ECB Data Portal's answer of 31 October 2026 to the app's request (the last two rounds of every horizon),
// trimmed to the calendar years, the longer term and two rolling horizons. Source: ECB statistics.
import CSV from './fixtures/ecb-spf-2026-10-31.csv?raw';

const spf = (() => {
  const r = parseEcbSpf(CSV);
  if ('error' in r) throw new Error(r.error);
  return r;
})();

describe("the ECB's Survey of Professional Forecasters", () => {
  it('asks the panel averages of the four variables, every horizon, last two rounds', () => {
    expect(mainSource).toContain("ecbSpf: () => 'https://data-api.ecb.europa.eu/service/data/SPF/Q.U2.HICP+CORE+RGDP+UNEM.POINT..Q.AVG?lastNObservations=2&format=csvdata'");
    expect(mainSource).toContain("ecbSpf: 'ecb'");
  });

  it("reads the Q4 2026 round against Q3's: this year, the next two and the longer term (2031)", () => {
    expect(spf.round).toBe('2026-Q4');
    expect(spf.previous).toBe('2026-Q3');
    expect(roundLabel(spf.round)).toBe('Q4 2026');
    expect(spf.years).toEqual(['2026', '2027', '2028']);
    expect(spf.longTermYear).toBe('2031');
    expect(spf.values.HICP['2026'].now).toBeCloseTo(2.9907, 4);
    expect(spf.values.HICP['2026'].before).toBeCloseTo(2.7317, 4);
    expect(spf.values.HICP['2027'].now).toBeCloseTo(2.634, 3);
    expect(spf.values.HICP.LT.now).toBeCloseTo(2.019, 3);
    expect(spf.values.RGDP['2026'].now).toBeCloseTo(0.9727, 4);
    expect(spf.values.RGDP['2026'].before).toBeCloseTo(0.5727, 4);
    expect(spf.values.CORE['2027'].now).toBeCloseTo(2.4763, 4);
    expect(spf.values.UNEM['2026'].now).toBeCloseTo(6.3687, 4);
    // The longer term is the 2031 horizon in these rounds: the same averages.
    expect(spf.values.UNEM.LT.now).toBe(spf.values.UNEM['2031'].now);
  });

  it('leaves out the rolling horizons, which are dated by their target quarter, not by the round', () => {
    expect(Object.keys(spf.values.RGDP)).not.toContain('P9M');
    // Their dates (2027 and 2028 quarters) do not pass for the latest round either.
    expect(spf.round).not.toMatch(/^202[78]/);
    // 2030 was the longer term of the first two rounds of 2026, not of these.
    expect(spf.values.HICP['2030']).toBeUndefined();
  });

  it('names an answer that is not the survey', () => {
    expect(parseEcbSpf('<html>')).toEqual({ error: 'The ECB changed the survey format.' });
    expect(parseEcbSpf('KEY,FCT_TOPIC,FCT_HORIZON,FCT_SOURCE,TIME_PERIOD,OBS_VALUE\n')).toEqual({ error: 'The ECB gave no survey averages.' });
  });

  it('shows each average to two decimals with its change since the round before, and a blank where the round before had none', () => {
    const html = renderToStaticMarkup(createElement(SpfTable, { spf }));
    expect(html).toContain('Longer term (2031)');
    expect(html).toContain('HICP inflation, % y/y');
    expect(html).toContain('2.99');
    expect(html).toContain('+0.26');
    expect(html).toContain('+0.40');
    // A change that rounds to 0.00 is shown uncoloured.
    const flat: EcbSpf = { round: '2026-Q4', previous: '2026-Q3', years: ['2026'], values: { RGDP: { '2026': { now: 1.002, before: 1 } } } };
    expect(renderToStaticMarkup(createElement(SpfTable, { spf: flat }))).toContain('<td class="num">0.00</td>');
    const one: EcbSpf = { round: '2026-Q4', years: ['2026'], values: { RGDP: { '2026': { now: 1 } } } };
    const lone = renderToStaticMarkup(createElement(SpfTable, { spf: one }));
    expect(lone).toContain('Longer term</th>');
    expect(lone).not.toContain('+');
  });
});
