import { describe, expect, it } from 'vitest';
import { latestByFirm, ratingTone, type AnalystAction } from '../src/data/live/analyst-actions';

const act = (date: string, firm: string, action: string, rating: string, to = NaN, analyst = 'A. Analyst'): AnalystAction => ({ date, firm, analyst, action, rating, from: NaN, to });

describe("ANALYSTS' table of firms, as ANR lists its sources", () => {
  const rows = [
    act('2026-10-20', 'Firm A', 'Lower Target', '', 210),
    act('2026-10-01', 'Firm B', 'Upgrade', 'Outperform', 250, 'B. Analyst'),
    act('2026-09-15', 'Firm A', 'Reiterated Rating', 'Buy', 230),
    act('2026-08-01', 'Firm B', 'Reiterated Rating', 'Market Perform', 200),
    act('2026-07-01', 'Firm C', 'Initiated Coverage', 'Sell', 150),
  ];

  it('lists each firm once, newest first, with its latest rating, target and analyst', () => {
    expect(latestByFirm(rows)).toEqual([
      // A target-only action keeps the rating given before it.
      { firm: 'Firm A', analyst: 'A. Analyst', rating: 'Buy', target: 210, date: '2026-10-20', upgraded: false, downgraded: false },
      { firm: 'Firm B', analyst: 'B. Analyst', rating: 'Outperform', target: 250, date: '2026-10-01', upgraded: true, downgraded: false },
      { firm: 'Firm C', analyst: 'A. Analyst', rating: 'Sell', target: 150, date: '2026-07-01', upgraded: false, downgraded: false },
    ]);
  });

  it('colours a rating by its meaning: buys green, holds yellow, sells red, suspended orange', () => {
    expect(['buy', 'Overweight', 'Outperform', 'Add'].map(ratingTone)).toEqual(['up', 'up', 'up', 'up']);
    expect(['Hold', 'Neutral', 'Equal Weight', 'Sector Perform', 'Market Perform', 'Peer Perform'].map(ratingTone)).toEqual(Array(6).fill('yellow'));
    expect(['Sell', 'Underperform'].map(ratingTone)).toEqual(['dn', 'dn']);
    expect(['Rating Suspended', 'Restricted', 'Under Review'].map(ratingTone)).toEqual(['amber', 'amber', 'amber']);
  });
});
