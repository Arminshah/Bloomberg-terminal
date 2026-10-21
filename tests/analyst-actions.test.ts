import { describe, expect, it } from 'vitest';
import { forecastUrl, parseRatings } from '../electron/analyst-actions.cjs';
import { actionLabel, parseActions, position } from '../src/data/live/analyst-actions';

// MarketBeat's ratings history table (APLD, October 2026), with its star rankings and subscription prompts.
const row = (...c: string[]) => `<tr>${c.map((x) => `<td>${x}</td>`).join('')}</tr>`;
const PAGE = `<table><thead><tr><th>Date</th><th>Brokerage</th><th>Analyst</th><th>Action</th><th>Rating</th><th>Price Target</th><th>Upside/Downside</th><th>Details</th></tr></thead><tbody>
${row('10/19/2026', 'Weiss Ratings <span>3 of 5 stars</span>', '', 'Reiterated Rating', 'Sell (D-)', '', '', '')}
${row('10/9/2026', 'Morgan Stanley <span>3 of 5 stars</span>', 'Stephen Byrd <span>5 of 5 stars</span>', 'Set Target', 'Equal Weight', '$37.50 &#x279D; $41.00', '+77.68%', '')}
${row('10/8/2026', 'Needham &amp; Company LLC Subscribe to MarketBeat All Access to unlock brokerage rankings', 'John Todaro Subscribe to MarketBeat All Access to unlock analyst rankings', 'Lower Target', 'Buy', '$83.00 ➝ $70.00', '+193.99%', '')}
${row('9/21/2026', 'Rothschild &amp; Co Redburn', 'Alex Haissl', 'Set Target', 'Neutral', '$22.00', '-21.76%', '')}
${row('5/27/2026', 'Lucid Cap Mkts', '', 'Upgrade', 'Strong-Buy', '', '', '')}
</tbody></table>`;

describe("Analysts' rating actions", () => {
  it('reads firm, analyst, action, rating and the price target before and after; rating services left out', () => {
    const rows = parseRatings(PAGE)!;
    expect(rows.map((r) => r.firm)).toEqual(['Morgan Stanley', 'Needham & Company LLC', 'Rothschild & Co Redburn', 'Lucid Cap Mkts']);
    expect(rows[0]).toEqual({ date: '2026-10-09', firm: 'Morgan Stanley', analyst: 'Stephen Byrd', action: 'Set Target', rating: 'Equal Weight', from: 37.5, to: 41 });
    expect(rows[1]).toMatchObject({ analyst: 'John Todaro', from: 83, to: 70 });
    expect(rows[2].from).toBeNaN();
    expect(rows[2].to).toBe(22);
    expect(parseRatings('<table><thead><tr><th>Date</th></tr></thead></table>')).toBeNull();
    expect(forecastUrl('BRK-B')).toBe('https://www.marketbeat.com/stocks/NASDAQ/BRK.B/forecast/');
    expect(forecastUrl('x y')).toBeNull();
  });

  it('reads ratings as buy, hold or sell and names the action by what changed', () => {
    expect(['Buy', 'Overweight', 'Market Outperform', 'Strong-Buy', 'Outperform'].map(position)).toEqual(['BUY', 'BUY', 'BUY', 'BUY', 'BUY']);
    expect(['Equal Weight', 'Neutral', 'Hold', 'Sector Perform', 'Market Perform'].map(position)).toEqual(['HOLD', 'HOLD', 'HOLD', 'HOLD', 'HOLD']);
    expect(['Sell', 'Underweight', 'Underperform'].map(position)).toEqual(['SELL', 'SELL', 'SELL']);
    const rows = parseActions(JSON.stringify(parseRatings(PAGE)))!;
    expect(rows.map(actionLabel)).toEqual(['Raised target', 'Lowered target', 'Set target', 'Upgraded']);
  });
});
