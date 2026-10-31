import { describe, expect, it } from 'vitest';
import * as main from '../electron/bea.cjs';
import * as providers from '../electron/providers.cjs';
import { beaProblem, parseBeaTable, periodLabel, type BeaTable } from '../src/data/live/bea';
// BEA's answers of 28 October 2026, without its echo of the request (no UserID in them); Table 2.6 trimmed to the
// lines NIPA shows.
import GDP from './fixtures/bea/gdp-contributions-2026-10-28.json?raw';
import INCOME from './fixtures/bea/personal-income-2026-10-28.json?raw';

const NOW = Date.parse('2026-10-28T15:00:00Z');
const table = (text: string): BeaTable => {
  const t = parseBeaTable(text);
  if ('error' in t) throw new Error(t.error);
  return t;
};
const value = (t: BeaTable, line: number, period: string) => t.lines.find((l) => l.line === line)!.values.get(period);

describe('BEA requests', () => {
  it('asks two NIPA tables for the last years only, with the UserID added in the main process', () => {
    expect(main.beaRequest('gdp-contributions', NOW)).toEqual({ url: 'https://apps.bea.gov/api/data/?method=GetData&DataSetName=NIPA&TableName=T10102&Frequency=Q&Year=2024,2025,2026&ResultFormat=JSON', ttl: 21_600_000 });
    expect(main.beaRequest('personal-income', NOW)!.url).toContain('TableName=T20600&Frequency=M&Year=2025,2026');
    expect(main.beaRequest('T10101', NOW)).toBeNull();
    expect(main.withKey('https://apps.bea.gov/api/data/?method=GetData', 'ABC')).toBe('https://apps.bea.gov/api/data/?method=GetData&UserID=ABC');
  });

  it("removes BEA's echo of the request, which holds the UserID, and passes nothing else on", () => {
    const answer = JSON.stringify({ BEAAPI: { Request: { RequestParam: [{ ParameterName: 'USERID', ParameterValue: '01234567-89AB-CDEF-0123-456789ABCDEF' }] }, Results: { Data: [] } } });
    const clean = main.withoutRequest(answer);
    expect(clean).not.toContain('01234567-89AB');
    expect(JSON.parse(clean)).toEqual({ BEAAPI: { Results: { Data: [] } } });
    expect(main.withoutRequest('<html>01234567-89AB-CDEF-0123-456789ABCDEF</html>')).toBe('');
    expect(main.withoutRequest('{"other":1}')).toBe('');
  });
});

describe("BEA's national accounts tables", () => {
  it('reads Table 1.1.2: real GDP growth in Q2 2026 and what drove it, as FRED republishes it', () => {
    const t = table(GDP);
    expect(t.title).toBe('Table 1.1.2. Contributions to Percent Change in Real Gross Domestic Product');
    expect(t.revised).toBe('2026-09-30');
    expect(t.periods.at(-1)).toBe('2026Q2');
    // FRED on 28 October 2026: A191RL1Q225SBEA 2.2, DPCERY2Q224SBEA 2.51, A019RY2Q224SBEA -1.1.
    expect(value(t, 1, '2026Q2')).toBe(2.2);
    expect(value(t, 2, '2026Q2')).toBe(2.51);
    expect(value(t, 15, '2026Q2')).toBe(-1.1);
    expect(value(t, 1, '2026Q1')).toBe(2.5);
    expect(t.lines.find((l) => l.line === 22)!.label).toBe('Government consumption expenditures and gross investment');
  });

  it('reads Table 2.6: personal income and saving in August 2026, in millions as BEA gives them', () => {
    const t = table(INCOME);
    expect(t.periods.at(-1)).toBe('2026M08');
    const pi = t.lines.find((l) => l.line === 1)!;
    expect(pi).toMatchObject({ label: 'Personal income', mult: 6 });
    // FRED on 28 October 2026: PI 27,626.9 and DSPI 24,223.2 billion, PSAVERT 4.1.
    expect(pi.values.get('2026M08')).toBe(27_626_933);
    expect(value(t, 27, '2026M08')).toBe(24_223_171);
    expect(value(t, 35, '2026M08')).toBe(4.1);
  });

  it('labels quarters and months', () => {
    expect(periodLabel('2026Q2')).toBe('Q2 2026');
    expect(periodLabel('2026M08')).toBe('Aug 2026');
  });
});

describe('BEA answers that bring no data', () => {
  it("reads BEA's error inside an HTTP 200 answer, and says what each failure is", () => {
    const refused = JSON.stringify({ BEAAPI: { Results: { Error: { APIErrorCode: '1', APIErrorDescription: 'Invalid Request - Invalid API UserId.' } } } });
    expect(parseBeaTable(refused)).toEqual({ error: 'BEA: Invalid Request - Invalid API UserId. (code 1)' });
    expect(providers.providerPayloadProblem('bea', refused)).toMatchObject({ kind: 'not-entitled' });
    const throttled = JSON.stringify({ BEAAPI: { Results: { Error: { APIErrorCode: '7', APIErrorDescription: 'Request Denied - exceeded Requests per minute quota.' } } } });
    expect(providers.providerPayloadProblem('bea', throttled)).toMatchObject({ kind: 'rate-limited' });
    expect(beaProblem({ status: 0, text: '', missing: 'BEA_API_KEY' }).state).toBe('needs-key');
    expect(beaProblem({ status: 200, text: '', error: 'Invalid Request - Invalid API UserId.' }).message).toBe('BEA refused the UserID (invalid API UserId). Check BEA_API_KEY on PROVIDERS.');
    expect(beaProblem({ status: 200, text: '', error: 'Request Denied - exceeded Requests per minute quota.' }).message).toContain('limit');
    expect(beaProblem({ status: 502, text: '' }).message).toBe("BEA's service failed (HTTP 502).");
  });
});
