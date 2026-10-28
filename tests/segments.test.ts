import { describe, expect, it } from 'vitest';
import * as secMain from '../electron/sec.cjs';
import { memberLabel, nestLines, parseLabels, parseSegments, type SegmentTable } from '../src/data/live/segments';
import aapl from './fixtures/xbrl-segments/aapl-20250927.xml?raw';
import aaplLab from './fixtures/xbrl-segments/aapl-20250927_lab.xml?raw';
import nvda from './fixtures/xbrl-segments/nvda-20260125.xml?raw';
import nvdaLab from './fixtures/xbrl-segments/nvda-20260125_lab.xml?raw';
import lmt from './fixtures/xbrl-segments/lmt-20251231.xml?raw';
import lmtLab from './fixtures/xbrl-segments/lmt-20251231_lab.xml?raw';
import apld from './fixtures/xbrl-segments/apld-20260531.xml?raw';
import apldLab from './fixtures/xbrl-segments/apld-20260531_lab.xml?raw';
import msft from './fixtures/xbrl-segments/msft-20260630.xml?raw';
import msftLabels from './fixtures/xbrl-segments/msft-20260630_xsd-labels.xml?raw';

// The revenue and operating income facts of five 10-Ks (Apple FY2025, NVIDIA FY2026, Lockheed Martin 2025, Applied
// Digital FY2026, Microsoft FY2026), trimmed from their XBRL instances, with the labels of the members they use.
const m = (v: number | undefined) => (v == null ? undefined : Math.round(v / 1e6));
const table = (ts: SegmentTable[], metric: string, breakdown: string) => ts.find((t) => t.metric === metric && t.breakdown === breakdown)!;
const rows = (t: SegmentTable) => t.lines.map((l) => [`${l.parent ? '- ' : ''}${l.label}`, ...t.periods.map((p) => m(l.values[p.end]))]);

describe('FINANCIALS: segments from a 10-K’s XBRL', () => {
  it("reads Apple's segments, product lines within products, geography and segment operating income", () => {
    const ts = parseSegments(aapl, parseLabels(aaplLab));
    expect(ts.map((t) => `${t.metric}:${t.breakdown}`)).toEqual(['revenue:segment', 'revenue:product', 'revenue:geography', 'operating:segment']);
    const seg = table(ts, 'revenue', 'segment');
    expect(seg.concept).toBe('RevenueFromContractWithCustomerExcludingAssessedTax');
    expect(seg.periods).toEqual([{ start: '2024-09-29', end: '2025-09-27' }, { start: '2023-10-01', end: '2024-09-28' }, { start: '2022-09-25', end: '2023-09-30' }]);
    expect(rows(seg)).toEqual([
      ['Americas', 178353, 167045, 162560],
      ['Europe', 111032, 101328, 94294],
      ['Greater China', 64377, 66952, 72559],
      ['Rest of Asia Pacific', 33696, 30658, 29615],
      ['Japan', 28703, 25052, 24257],
    ]);
    expect(m(seg.total['2025-09-27'])).toBe(416161);
    // The four product lines add up to Products: they are shown within it.
    expect(rows(table(ts, 'revenue', 'product'))).toEqual([
      ['Products', 307003, 294866, 298085],
      ['- iPhone', 209586, 201183, 200583],
      ['- Wearables, Home and Accessories', 35686, 37005, 39845],
      ['- Mac', 33708, 29984, 29357],
      ['- iPad', 28023, 26694, 28300],
      ['Services', 109158, 96169, 85200],
    ]);
    expect(rows(table(ts, 'revenue', 'geography')).map((r) => r[0])).toEqual(['Other countries', 'United States', 'China']);
    expect(m(table(ts, 'operating', 'segment').lines[0].values['2025-09-27'])).toBe(72480);
  });

  it("nests NVIDIA's Compute and Networking within Data Center, and reads the names Lockheed Martin's report shows", () => {
    const nv = parseSegments(nvda, parseLabels(nvdaLab));
    expect(rows(table(nv, 'revenue', 'product')).slice(0, 4)).toEqual([
      ['Data Center', 193737, 115186, 47525],
      ['- Compute', 162361, 102196, 38950],
      ['- Networking', 31376, 12990, 8575],
      ['Gaming', 16042, 11350, 10447],
    ]);
    expect(rows(table(nv, 'revenue', 'segment')).map((r) => r[0])).toEqual(['Compute & Networking', 'Graphics']);
    const lm = parseSegments(lmt, parseLabels(lmtLab));
    // The terse labels, as the report prints them; the major customers axis gives the US Government's share.
    expect(rows(table(lm, 'revenue', 'customer'))).toEqual([
      ['U.S. Government', 53412, 52044, 49423],
      ['International', 21343, 18515, 17644],
      ['U.S. commercial and other', 293, 484, 504],
    ]);
    // Intersegment eliminations and the product-by-segment splits are left out of the segment table.
    expect(rows(table(lm, 'revenue', 'segment'))).toEqual([
      ['Aeronautics', 30257, 28618, 27474],
      ['RMS', 17312, 17264, 16239],
      ['MFC', 14450, 12682, 11253],
      ['Space', 13029, 12479, 12605],
    ]);
  });

  it('takes the revenue concept with the most figures, and keeps a segment total that differs from the company total', () => {
    const ts = parseSegments(apld, parseLabels(apldLab));
    const seg = table(ts, 'revenue', 'segment');
    // Revenues (three years) rather than revenue from contracts with customers (one year): lease income is in Revenues.
    expect(seg.concept).toBe('Revenues');
    expect(rows(seg)).toEqual([
      ['HPC Hosting Business', 385, 0, 0],
      ['Data Center Hosting Business', 154, 144, 137],
    ]);
    const op = table(ts, 'operating', 'segment');
    expect(m(op.total['2026-05-31'])).toBe(-236);
  });

  it("splits Microsoft's products and services from its lines of business: each adds up to the total on its own", () => {
    // Microsoft keeps its labels inside its schema (msft-20260630.xsd), not in a label file.
    const ts = parseSegments(msft, parseLabels(msftLabels));
    expect(ts.map((t) => `${t.metric}:${t.breakdown}`)).toEqual(['revenue:segment', 'revenue:product', 'revenue:productService', 'revenue:geography', 'operating:segment']);
    const lines = table(ts, 'revenue', 'product');
    expect(lines.lines.map((l) => l.label).slice(0, 4)).toEqual(['Server Products and Cloud Services', 'Microsoft 365 Commercial Products and Cloud Services', 'XBOX', 'LinkedIn']);
    expect(m(lines.lines.reduce((a, l) => a + l.values['2026-06-30'], 0))).toBe(331839);
    expect(rows(table(ts, 'revenue', 'productService'))).toEqual([
      ['Service and Other', 267143, 217778, 180349],
      ['Product', 64696, 63946, 64773],
    ]);
  });

  it('names a member without a label from its element, and a country by its name', () => {
    expect(memberLabel('lmt:MissilesAndFireControlMember')).toBe('Missiles and Fire Control');
    expect(memberLabel('country:TW')).toBe('Taiwan');
    expect(memberLabel('us-gaap:ProductMember', new Map([['us-gaap_ProductMember', 'Products']]))).toBe('Products');
  });

  it('nests only where the smaller lines add up, in every year', () => {
    const l = (member: string, a: number, b: number) => ({ member, label: member, values: { y1: a, y0: b } });
    const nested = nestLines([l('A', 100, 90), l('B', 60, 50), l('C', 40, 40), l('D', 30, 20)], ['y1', 'y0']);
    expect(nested.map((x) => `${x.parent ?? ''}>${x.member}`)).toEqual(['>A', 'A>B', 'A>C', '>D']);
    // B and C add up to A in one year only: not nested.
    expect(nestLines([l('A', 100, 95), l('B', 60, 50), l('C', 40, 40)], ['y1', 'y0']).every((x) => !x.parent)).toBe(true);
  });

  it('asks the SEC only for a filing’s label file or schema, beside its instance', () => {
    expect(secMain.secRequest('filing-labels', '320193/000032019325000079/aapl-20250927_lab.xml')?.url).toBe('https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927_lab.xml');
    expect(secMain.secRequest('filing-labels', '789019/000119312526323660/msft-20260630.xsd')?.url).toBe('https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.xsd');
    for (const bad of ['320193/000032019325000079/aapl-20250927.htm', '320193/000032019325000079/../x_lab.xml', '320193/0000320193250000/aapl_lab.xml', 'https://example.com/a_lab.xml']) expect(secMain.secRequest('filing-labels', bad)).toBeNull();
  });
});
