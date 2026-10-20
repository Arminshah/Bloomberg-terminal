import { describe, expect, it } from 'vitest';
import { ecoNumber, ecoValue, newYorkTime, parseNasdaqEco } from '../src/data/live/nasdaq-eco';
import * as nasdaq from '../electron/nasdaq.cjs';

describe("Nasdaq's economic calendar", () => {
  it('reads each release with its New York time, country, consensus, actual and prior', () => {
    const text = JSON.stringify({
      data: {
        rows: [
          { gmt: '22:00', country: 'China', eventName: 'GDP', actual: '4.5%', consensus: '4.4%', previous: '4.3%', description: 'Gross domestic product' },
          { gmt: '08:30', country: 'Canada', eventName: 'CPI', actual: '0.1%', consensus: '0.2%', previous: '-0.1%', description: '' },
          { gmt: '02:00', country: 'Euro Zone', eventName: "ECB's Elderson Speaks", actual: '&nbsp;', consensus: ' ', previous: '&nbsp;', description: '' },
        ],
      },
    });
    const r = parseNasdaqEco(text, '2026-10-19');
    if ('error' in r) throw new Error(r.error);
    // 22:00 in New York (EDT, UTC-4) is 02:00 UTC the next day: 10:00 in Beijing.
    expect(new Date(r.data[0].time).toISOString()).toBe('2026-10-20T02:00:00.000Z');
    expect(r.data[0]).toMatchObject({ country: 'CN', name: 'GDP', actual: '4.5%', consensus: '4.4%', previous: '4.3%', relevance: 3 });
    expect(r.data[1]).toMatchObject({ country: 'CA', relevance: 3 });
    expect(r.data[2]).toMatchObject({ country: 'EZ', actual: '', consensus: '', relevance: 2 });
    expect(parseNasdaqEco('<html>', '2026-10-19')).toEqual({ error: expect.any(String) });
  });

  it('turns New York wall time into UTC across daylight saving', () => {
    expect(new Date(newYorkTime('2026-01-15', 8, 30)).toISOString()).toBe('2026-01-15T13:30:00.000Z');
    expect(new Date(newYorkTime('2026-07-15', 8, 30)).toISOString()).toBe('2026-07-15T12:30:00.000Z');
  });

  it('cleans published values and reads their numbers', () => {
    expect(ecoValue(' &nbsp;')).toBe('');
    expect(ecoNumber('A$5.5B')).toBe(5.5);
    expect(ecoNumber('-0.1%')).toBe(-0.1);
    expect(ecoNumber('1,234.5K')).toBe(1234.5);
  });

  it('asks for one real day within reach', () => {
    const now = Date.parse('2026-10-20T12:00:00Z');
    expect(nasdaq.nasdaqEconomicRequest('2026-10-20', now)?.url).toBe('https://api.nasdaq.com/api/calendar/economicevents?date=2026-10-20');
    expect(nasdaq.nasdaqEconomicRequest('2026-02-30', now)).toBeNull();
    expect(nasdaq.nasdaqEconomicRequest('2020-01-01', now)).toBeNull();
  });
});
