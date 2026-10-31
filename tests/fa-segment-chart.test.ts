import { describe, expect, it } from 'vitest';
import { segmentSeries } from '../src/functions/FASegments';
import type { SegmentTable } from '../src/data/live/segments';

const table: SegmentTable = {
  breakdown: 'segment',
  metric: 'revenue',
  concept: 'us-gaap:Revenues',
  periods: [{ start: '2025-01-01', end: '2025-12-31' }, { start: '2024-01-01', end: '2024-12-31' }, { start: '2023-01-01', end: '2023-12-31' }],
  lines: [
    { member: 'x:SmallMember', label: 'Small', values: { '2025-12-31': 2e9, '2024-12-31': 1.5e9, '2023-12-31': 1e9 } },
    { member: 'x:BigMember', label: 'Big', values: { '2025-12-31': 30e9, '2024-12-31': 25e9 } },
    { member: 'x:PartMember', label: 'Part of Big', values: { '2025-12-31': 10e9 }, parent: 'x:BigMember' },
  ],
  total: {},
  unit: 'USD',
};

describe("FINANCIALS Segments by measure, as FA charts them", () => {
  it("charts the top-level segments' revenue in billions, largest first, one bar per fiscal year, oldest year first", () => {
    const series = segmentSeries(table);
    expect(series.map((s) => s.label)).toEqual(['Revenue: Big', 'Revenue: Small']);
    expect(series.map((s) => s.color)).toEqual(['#ff9e1b', '#2fd36b']);
    expect(series[0].points).toEqual([{ x: 2024, y: 25, label: 'FY 2024' }, { x: 2025, y: 30, label: 'FY 2025' }]);
    expect(series[1].points.map((p) => p.label)).toEqual(['FY 2023', 'FY 2024', 'FY 2025']);
  });
});
