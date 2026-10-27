import { hashString, normal } from '../core/rng';
import { zonedToUtc } from '../core/format';
import { DAY_MS, isBusinessDay, dayNum } from './calendar';
import { engine } from './market';
import { levelOn, policyRates, type PolicyRates, type PolicySeries } from './live/policy';
import { eventDates, expectedPeriod, fredData, periodLabel as fredPeriodLabel, previousPeriod, US_EVENTS, valueAt, type FredEvent } from './live/fred';

export { zonedToUtc } from '../core/format';

export interface CentralBank {
  code: string;
  country: string;
  bank: string;
  rate: number;
  name: string;
  tz: string;
  time: [number, number];
  meetings: string[];
  last: string;
  lastMove: number;
  /** Rate, last move and history from the central bank's own data (desktop app) rather than reference settings. */
  real?: boolean;
}

/**
 * Policy rates and meeting calendars. Meeting dates are each bank's published
 * schedule. In the desktop app the rates of the Fed, ECB, Bank of England,
 * Bank of Canada, RBA, SNB and Banco Central do Brasil come from their own data
 * services and the others are left out; in the browser the Fed range is
 * derived from the 3M bill and the rest are reference settings.
 */
export function centralBanks(): CentralBank[] {
  return withRealRates(referenceBanks());
}

/** A bank's decision days from its published calendar, whether or not its rate comes from its own data. */
export const meetingsOf = (code: string): string[] => referenceBanks().find((b) => b.code === code)?.meetings ?? [];

function referenceBanks(): CentralBank[] {
  const bill = engine.quote('USGG3M Index')?.prevClose ?? 4;
  const fedUpper = Math.round((bill + 0.12) * 4) / 4;
  return [
    { code: 'FED', country: 'US', bank: 'Federal Reserve', rate: fedUpper, name: 'FOMC Rate Decision (Upper Bound)', tz: 'America/New_York', time: [14, 0], meetings: ['2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09', '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-09', '2027-07-28', '2027-09-15', '2027-10-27', '2027-12-08'], last: '2026-09-16', lastMove: 0.25 },
    { code: 'ECB', country: 'EZ', bank: 'European Central Bank', rate: 2.5, name: 'ECB Deposit Facility Rate', tz: 'Europe/Berlin', time: [14, 15], meetings: ['2026-02-05', '2026-03-19', '2026-04-30', '2026-06-11', '2026-07-23', '2026-09-10', '2026-10-29', '2026-12-17', '2027-02-04', '2027-03-18', '2027-04-29', '2027-06-10', '2027-07-22', '2027-09-09', '2027-10-28', '2027-12-16', '2028-02-03', '2028-03-23', '2028-05-04', '2028-06-08', '2028-07-20', '2028-09-07', '2028-10-12', '2028-12-07'], last: '2026-09-10', lastMove: 0.25 },
    { code: 'BOE', country: 'GB', bank: 'Bank of England', rate: 3.75, name: 'BoE Bank Rate', tz: 'Europe/London', time: [12, 0], meetings: ['2026-02-05', '2026-03-19', '2026-04-30', '2026-06-18', '2026-07-30', '2026-09-17', '2026-11-05', '2026-12-17', '2027-02-04', '2027-03-18', '2027-04-29', '2027-06-17', '2027-07-29', '2027-09-16', '2027-11-04', '2027-12-16'], last: '2025-12-18', lastMove: -0.25 },
    { code: 'BOJ', country: 'JP', bank: 'Bank of Japan', rate: 1.25, name: 'BOJ Overnight Call Rate Guideline', tz: 'Asia/Tokyo', time: [12, 0], meetings: ['2026-01-23', '2026-03-19', '2026-04-28', '2026-06-16', '2026-07-31', '2026-09-18', '2026-10-30', '2026-12-18', '2027-01-22', '2027-03-18', '2027-04-28', '2027-06-11', '2027-07-22', '2027-09-22', '2027-10-29', '2027-12-17'], last: '2026-09-18', lastMove: 0.25 },
    { code: 'BOC', country: 'CA', bank: 'Bank of Canada', rate: 2.25, name: 'Bank of Canada Rate Decision', tz: 'America/Toronto', time: [9, 45], meetings: ['2026-01-28', '2026-03-18', '2026-04-29', '2026-06-10', '2026-07-15', '2026-09-02', '2026-10-28', '2026-12-09', '2027-01-27', '2027-03-03', '2027-04-28', '2027-06-02', '2027-07-21', '2027-09-08', '2027-10-27', '2027-12-08'], last: '2025-10-29', lastMove: -0.25 },
    { code: 'RBA', country: 'AU', bank: 'Reserve Bank of Australia', rate: 3.6, name: 'RBA Cash Rate Target', tz: 'Australia/Sydney', time: [14, 30], meetings: ['2026-02-03', '2026-03-17', '2026-05-05', '2026-06-16', '2026-08-11', '2026-09-29', '2026-11-03', '2026-12-08', '2027-02-09', '2027-03-23', '2027-05-04', '2027-06-22', '2027-08-10', '2027-09-28', '2027-11-02', '2027-12-14'], last: '2025-08-12', lastMove: -0.25 },
    { code: 'SNB', country: 'CH', bank: 'Swiss National Bank', rate: 0.0, name: 'SNB Policy Rate', tz: 'Europe/Zurich', time: [9, 30], meetings: ['2026-03-19', '2026-06-18', '2026-09-24', '2026-12-10', '2027-03-18', '2027-06-24', '2027-09-23', '2027-12-16'], last: '2025-06-19', lastMove: -0.25 },
    { code: 'PBOC', country: 'CN', bank: "People's Bank of China", rate: 3.0, name: '1-Year Loan Prime Rate', tz: 'Asia/Shanghai', time: [9, 15], meetings: [], last: '2025-05-20', lastMove: -0.1 },
    { code: 'RBI', country: 'IN', bank: 'Reserve Bank of India', rate: 5.25, name: 'RBI Repurchase Rate', tz: 'Asia/Kolkata', time: [10, 0], meetings: ['2026-02-06', '2026-04-08', '2026-06-05', '2026-08-07', '2026-10-07', '2026-12-04'], last: '2025-12-05', lastMove: -0.25 },
    { code: 'BCB', country: 'BR', bank: 'Banco Central do Brasil', rate: 14.25, name: 'Selic Rate', tz: 'America/Sao_Paulo', time: [18, 30], meetings: ['2026-01-28', '2026-03-18', '2026-05-06', '2026-06-17', '2026-08-05', '2026-09-16', '2026-11-04', '2026-12-09', '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-16', '2027-08-04', '2027-09-22', '2027-10-27', '2027-12-08'], last: '2026-09-16', lastMove: -0.25 },
    { code: 'BANXICO', country: 'MX', bank: 'Banco de Mexico', rate: 7.0, name: 'Overnight Rate', tz: 'America/Mexico_City', time: [13, 0], meetings: ['2026-02-12', '2026-03-26', '2026-05-14', '2026-06-25', '2026-08-13', '2026-09-24', '2026-11-12', '2026-12-17'], last: '2025-12-18', lastMove: -0.25 },
  ];
}

const REAL_SERIES: Record<string, keyof PolicyRates> = { FED: 'fedUpper', ECB: 'ecb', BOE: 'boe', BOC: 'boc', RBA: 'rba', SNB: 'snb', BCB: 'bcb' };

/** A bank's real rate series, when loaded. */
export function policySeries(code: string): PolicySeries | undefined {
  const key = REAL_SERIES[code];
  return key ? (policyRates.get()[key] as PolicySeries | undefined) : undefined;
}

function withRealRates(banks: CentralBank[]): CentralBank[] {
  // The Fed's meeting list comes from the Board's own calendar once it has loaded.
  const fomc = policyRates.get().fomc;
  if (fomc?.length) banks = banks.map((cb) => (cb.code === 'FED' ? { ...cb, meetings: fomc } : cb));
  const out = banks.map((cb) => {
    const s = policySeries(cb.code);
    if (!s || !s.changes.length) return cb;
    const [since, level] = s.changes[s.changes.length - 1];
    const before = s.changes.length > 1 ? s.changes[s.changes.length - 2][1] : level;
    // A move takes effect a day (Fed) to a week (ECB) after the meeting that decided it.
    const meeting = [...cb.meetings].reverse().find((m) => m <= since && Date.parse(since) - Date.parse(m) <= 8 * DAY_MS);
    return { ...cb, rate: level, last: meeting ?? since, lastMove: level - before, real: true };
  });
  // The desktop app lists only the banks whose rates come from their own data.
  return engine.realOnly ? out.filter((b) => b.real) : out;
}

export interface EcoEvent {
  id: string;
  time: number;
  country: string;
  name: string;
  period: string;
  survey: number | null;
  actual: number | null;
  prior: number;
  revised: number | null;
  unit: string;
  dec: number;
  relevance: number;
  /** Positive surprise is good for the economy (e.g. payrolls), negative for inflation-type stats. */
  kind: 'activity' | 'inflation' | 'rate' | 'other';
  /** A real record (a central bank decision from the bank's own data); everything else is generated. */
  real?: boolean;
  /** For an event whose source gives the day but not the time (FRED release dates): that day, ISO. */
  date?: string;
}

type Rule =
  | { t: 'nthWeekday'; n: number; wd: number }
  | { t: 'lastWeekday'; wd: number }
  | { t: 'weekly'; wd: number }
  | { t: 'dom'; d: number }
  | { t: 'firstBiz'; plus?: number }
  | { t: 'lastBiz' };

interface Tpl {
  c: string;
  name: string;
  tz: string;
  time: [number, number];
  rule: Rule;
  base: number;
  sd: number;
  unit: string;
  dec: number;
  rel: number;
  kind: EcoEvent['kind'];
  lag: number; // months between period and release
  quarterly?: boolean;
  months?: number[];
}

const NY = 'America/New_York';
const FR = 'Europe/Berlin';
const LN = 'Europe/London';
const TK = 'Asia/Tokyo';
const SH = 'Asia/Shanghai';
const SY = 'Australia/Sydney';
const TO = 'America/Toronto';

const TEMPLATES: Tpl[] = [
  { c: 'US', name: 'Change in Nonfarm Payrolls', tz: NY, time: [8, 30], rule: { t: 'nthWeekday', n: 1, wd: 5 }, base: 95, sd: 55, unit: 'k', dec: 0, rel: 3, kind: 'activity', lag: 1 },
  { c: 'US', name: 'Unemployment Rate', tz: NY, time: [8, 30], rule: { t: 'nthWeekday', n: 1, wd: 5 }, base: 4.4, sd: 0.1, unit: '%', dec: 1, rel: 3, kind: 'other', lag: 1 },
  { c: 'US', name: 'Average Hourly Earnings MoM', tz: NY, time: [8, 30], rule: { t: 'nthWeekday', n: 1, wd: 5 }, base: 0.3, sd: 0.1, unit: '%', dec: 1, rel: 2, kind: 'inflation', lag: 1 },
  { c: 'US', name: 'CPI MoM', tz: NY, time: [8, 30], rule: { t: 'dom', d: 14 }, base: 0.3, sd: 0.1, unit: '%', dec: 1, rel: 3, kind: 'inflation', lag: 1 },
  { c: 'US', name: 'CPI YoY', tz: NY, time: [8, 30], rule: { t: 'dom', d: 14 }, base: 3.3, sd: 0.1, unit: '%', dec: 1, rel: 3, kind: 'inflation', lag: 1 },
  { c: 'US', name: 'CPI Ex Food and Energy YoY', tz: NY, time: [8, 30], rule: { t: 'dom', d: 14 }, base: 3.0, sd: 0.1, unit: '%', dec: 1, rel: 3, kind: 'inflation', lag: 1 },
  { c: 'US', name: 'PPI Final Demand MoM', tz: NY, time: [8, 30], rule: { t: 'dom', d: 15 }, base: 0.2, sd: 0.2, unit: '%', dec: 1, rel: 2, kind: 'inflation', lag: 1 },
  { c: 'US', name: 'Retail Sales Advance MoM', tz: NY, time: [8, 30], rule: { t: 'dom', d: 16 }, base: 0.3, sd: 0.4, unit: '%', dec: 1, rel: 3, kind: 'activity', lag: 1 },
  { c: 'US', name: 'Initial Jobless Claims', tz: NY, time: [8, 30], rule: { t: 'weekly', wd: 4 }, base: 236, sd: 9, unit: 'k', dec: 0, rel: 2, kind: 'other', lag: 0 },
  { c: 'US', name: 'ISM Manufacturing', tz: NY, time: [10, 0], rule: { t: 'firstBiz' }, base: 49.2, sd: 1.1, unit: '', dec: 1, rel: 3, kind: 'activity', lag: 1 },
  { c: 'US', name: 'ISM Services Index', tz: NY, time: [10, 0], rule: { t: 'firstBiz', plus: 2 }, base: 51.6, sd: 1.2, unit: '', dec: 1, rel: 2, kind: 'activity', lag: 1 },
  { c: 'US', name: 'Industrial Production MoM', tz: NY, time: [9, 15], rule: { t: 'dom', d: 17 }, base: 0.1, sd: 0.3, unit: '%', dec: 1, rel: 2, kind: 'activity', lag: 1 },
  { c: 'US', name: 'Housing Starts', tz: NY, time: [8, 30], rule: { t: 'dom', d: 18 }, base: 1310, sd: 60, unit: 'k', dec: 0, rel: 2, kind: 'activity', lag: 1 },
  { c: 'US', name: 'Existing Home Sales', tz: NY, time: [10, 0], rule: { t: 'dom', d: 22 }, base: 4.02, sd: 0.1, unit: 'm', dec: 2, rel: 2, kind: 'activity', lag: 1 },
  { c: 'US', name: 'New Home Sales', tz: NY, time: [10, 0], rule: { t: 'dom', d: 25 }, base: 665, sd: 40, unit: 'k', dec: 0, rel: 2, kind: 'activity', lag: 1 },
  { c: 'US', name: 'Durable Goods Orders', tz: NY, time: [8, 30], rule: { t: 'dom', d: 26 }, base: 0.4, sd: 1.5, unit: '%', dec: 1, rel: 2, kind: 'activity', lag: 1 },
  { c: 'US', name: 'GDP Annualized QoQ', tz: NY, time: [8, 30], rule: { t: 'dom', d: 29 }, base: 1.6, sd: 0.4, unit: '%', dec: 1, rel: 3, kind: 'activity', lag: 1, months: [0, 3, 6, 9] },
  { c: 'US', name: 'PCE Core Deflator MoM', tz: NY, time: [8, 30], rule: { t: 'dom', d: 28 }, base: 0.3, sd: 0.1, unit: '%', dec: 1, rel: 3, kind: 'inflation', lag: 1 },
  { c: 'US', name: 'U. of Mich. Sentiment', tz: NY, time: [10, 0], rule: { t: 'nthWeekday', n: 2, wd: 5 }, base: 55.5, sd: 1.8, unit: '', dec: 1, rel: 2, kind: 'activity', lag: 0 },
  { c: 'US', name: 'Conf. Board Consumer Confidence', tz: NY, time: [10, 0], rule: { t: 'lastWeekday', wd: 2 }, base: 92.4, sd: 2.5, unit: '', dec: 1, rel: 2, kind: 'activity', lag: 0 },
  { c: 'US', name: 'JOLTS Job Openings', tz: NY, time: [10, 0], rule: { t: 'nthWeekday', n: 1, wd: 2 }, base: 7120, sd: 180, unit: 'k', dec: 0, rel: 2, kind: 'activity', lag: 2 },
  { c: 'US', name: 'DOE Crude Oil Inventories', tz: NY, time: [10, 30], rule: { t: 'weekly', wd: 3 }, base: -400, sd: 2800, unit: 'k', dec: 0, rel: 1, kind: 'other', lag: 0 },
  { c: 'EZ', name: 'HCOB Eurozone Manufacturing PMI', tz: FR, time: [10, 0], rule: { t: 'firstBiz' }, base: 49.6, sd: 0.6, unit: '', dec: 1, rel: 2, kind: 'activity', lag: 1 },
  { c: 'EZ', name: 'CPI Estimate YoY', tz: FR, time: [11, 0], rule: { t: 'firstBiz', plus: 1 }, base: 2.4, sd: 0.1, unit: '%', dec: 1, rel: 3, kind: 'inflation', lag: 1 },
  { c: 'EZ', name: 'GDP SA QoQ', tz: FR, time: [11, 0], rule: { t: 'dom', d: 30 }, base: 0.2, sd: 0.1, unit: '%', dec: 1, rel: 3, kind: 'activity', lag: 1, months: [0, 3, 6, 9] },
  { c: 'EZ', name: 'HCOB Eurozone Composite PMI', tz: FR, time: [10, 0], rule: { t: 'dom', d: 23 }, base: 50.4, sd: 0.7, unit: '', dec: 1, rel: 2, kind: 'activity', lag: 0 },
  { c: 'DE', name: 'ZEW Survey Expectations', tz: FR, time: [11, 0], rule: { t: 'nthWeekday', n: 3, wd: 2 }, base: 21.5, sd: 6, unit: '', dec: 1, rel: 2, kind: 'activity', lag: 0 },
  { c: 'DE', name: 'IFO Business Climate', tz: FR, time: [10, 0], rule: { t: 'dom', d: 24 }, base: 88.3, sd: 0.8, unit: '', dec: 1, rel: 2, kind: 'activity', lag: 0 },
  { c: 'DE', name: 'CPI EU Harmonized YoY', tz: FR, time: [14, 0], rule: { t: 'dom', d: 29 }, base: 2.5, sd: 0.15, unit: '%', dec: 1, rel: 2, kind: 'inflation', lag: 0 },
  { c: 'GB', name: 'CPI YoY', tz: LN, time: [7, 0], rule: { t: 'nthWeekday', n: 3, wd: 3 }, base: 3.6, sd: 0.15, unit: '%', dec: 1, rel: 3, kind: 'inflation', lag: 1 },
  { c: 'GB', name: 'Monthly GDP (MoM)', tz: LN, time: [7, 0], rule: { t: 'nthWeekday', n: 2, wd: 4 }, base: 0.1, sd: 0.2, unit: '%', dec: 1, rel: 2, kind: 'activity', lag: 2 },
  { c: 'GB', name: 'ILO Unemployment Rate 3Mths', tz: LN, time: [7, 0], rule: { t: 'nthWeekday', n: 3, wd: 2 }, base: 5.1, sd: 0.1, unit: '%', dec: 1, rel: 2, kind: 'other', lag: 2 },
  { c: 'GB', name: 'Retail Sales Inc Auto Fuel MoM', tz: LN, time: [7, 0], rule: { t: 'nthWeekday', n: 3, wd: 5 }, base: 0.2, sd: 0.6, unit: '%', dec: 1, rel: 2, kind: 'activity', lag: 1 },
  { c: 'JP', name: 'Natl CPI Ex Fresh Food YoY', tz: TK, time: [8, 30], rule: { t: 'nthWeekday', n: 3, wd: 5 }, base: 2.7, sd: 0.1, unit: '%', dec: 1, rel: 3, kind: 'inflation', lag: 1 },
  { c: 'JP', name: 'Tokyo CPI Ex-Fresh Food YoY', tz: TK, time: [8, 30], rule: { t: 'lastWeekday', wd: 5 }, base: 2.5, sd: 0.1, unit: '%', dec: 1, rel: 2, kind: 'inflation', lag: 0 },
  { c: 'JP', name: 'Jobless Rate', tz: TK, time: [8, 30], rule: { t: 'lastWeekday', wd: 5 }, base: 2.5, sd: 0.1, unit: '%', dec: 1, rel: 1, kind: 'other', lag: 1 },
  { c: 'JP', name: 'Tankan Large Mfg Index', tz: TK, time: [8, 50], rule: { t: 'firstBiz' }, base: 13, sd: 2, unit: '', dec: 0, rel: 3, kind: 'activity', lag: 1, months: [0, 3, 6, 9] },
  { c: 'CN', name: 'CPI YoY', tz: SH, time: [9, 30], rule: { t: 'dom', d: 10 }, base: 0.6, sd: 0.2, unit: '%', dec: 1, rel: 3, kind: 'inflation', lag: 1 },
  { c: 'CN', name: 'Exports YoY', tz: SH, time: [11, 0], rule: { t: 'dom', d: 9 }, base: 4.5, sd: 2.5, unit: '%', dec: 1, rel: 2, kind: 'activity', lag: 1 },
  { c: 'CN', name: 'Industrial Production YoY', tz: SH, time: [10, 0], rule: { t: 'dom', d: 16 }, base: 5.3, sd: 0.4, unit: '%', dec: 1, rel: 2, kind: 'activity', lag: 1 },
  { c: 'CN', name: 'Retail Sales YoY', tz: SH, time: [10, 0], rule: { t: 'dom', d: 16 }, base: 3.4, sd: 0.6, unit: '%', dec: 1, rel: 2, kind: 'activity', lag: 1 },
  { c: 'CN', name: 'GDP YoY', tz: SH, time: [10, 0], rule: { t: 'dom', d: 19 }, base: 4.7, sd: 0.15, unit: '%', dec: 1, rel: 3, kind: 'activity', lag: 1, months: [0, 3, 6, 9] },
  { c: 'CN', name: 'Manufacturing PMI', tz: SH, time: [9, 30], rule: { t: 'lastBiz' }, base: 49.6, sd: 0.4, unit: '', dec: 1, rel: 3, kind: 'activity', lag: 0 },
  { c: 'CA', name: 'Net Change in Employment', tz: TO, time: [8, 30], rule: { t: 'nthWeekday', n: 1, wd: 5 }, base: 18, sd: 25, unit: 'k', dec: 1, rel: 2, kind: 'activity', lag: 1 },
  { c: 'CA', name: 'CPI YoY', tz: TO, time: [8, 30], rule: { t: 'nthWeekday', n: 3, wd: 2 }, base: 2.6, sd: 0.15, unit: '%', dec: 1, rel: 2, kind: 'inflation', lag: 1 },
  { c: 'AU', name: 'Employment Change', tz: SY, time: [11, 30], rule: { t: 'nthWeekday', n: 3, wd: 4 }, base: 22, sd: 18, unit: 'k', dec: 1, rel: 2, kind: 'activity', lag: 1 },
  { c: 'AU', name: 'CPI YoY', tz: SY, time: [11, 30], rule: { t: 'lastWeekday', wd: 3 }, base: 3.1, sd: 0.15, unit: '%', dec: 1, rel: 2, kind: 'inflation', lag: 1 },
];

function ruleDates(rule: Rule, y: number, m0: number): number[] {
  const days: number[] = [];
  const first = Date.UTC(y, m0, 1);
  const dim = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  const wdOf = (d: number) => new Date(Date.UTC(y, m0, d)).getUTCDay();
  switch (rule.t) {
    case 'nthWeekday': {
      let count = 0;
      for (let d = 1; d <= dim; d++) if (wdOf(d) === rule.wd && ++count === rule.n) days.push(d);
      break;
    }
    case 'lastWeekday':
      for (let d = dim; d >= 1; d--)
        if (wdOf(d) === rule.wd) {
          days.push(d);
          break;
        }
      break;
    case 'weekly':
      for (let d = 1; d <= dim; d++) if (wdOf(d) === rule.wd) days.push(d);
      break;
    case 'dom': {
      let d = Math.min(rule.d, dim);
      while (wdOf(d) === 0 || wdOf(d) === 6) d = d < dim ? d + 1 : d - 2;
      days.push(d);
      break;
    }
    case 'firstBiz': {
      let d = 1;
      let need = (rule.plus ?? 0) + 1;
      for (; d <= dim; d++) if (wdOf(d) !== 0 && wdOf(d) !== 6 && --need === 0) break;
      days.push(d);
      break;
    }
    case 'lastBiz': {
      let d = dim;
      while (wdOf(d) === 0 || wdOf(d) === 6) d--;
      days.push(d);
      break;
    }
  }
  void first;
  return days;
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function periodLabel(tpl: Tpl, y: number, m0: number, day: number): string {
  if (tpl.rule.t === 'weekly') {
    const d = new Date(Date.UTC(y, m0, day - 5));
    return `${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`;
  }
  if (tpl.months) {
    const q = Math.floor(((m0 - tpl.lag + 12) % 12) / 3);
    return `${q + 1}Q`;
  }
  const pm = (m0 - tpl.lag + 12) % 12;
  return MONTH[pm];
}

/** Today's date in New York, where the US agencies publish. */
export function newYorkDate(now: number): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  return p.slice(0, 10);
}

/**
 * US releases from the FRED API: the agencies' scheduled dates (FRED gives no
 * time of day) and the values published for each release's period. An event
 * sits at noon UTC of its date so it sorts into the right day; screens show
 * its date, never a time. Actual and prior are the figures as currently
 * published, so they include any revisions since.
 */
/**
 * The days a US event is published. FRED files some dates of other reports under a release:
 * every New Residential Sales date (release 97) under Housing Starts (27), and the annual retail
 * revision under Retail Sales (9). Those are left out, and so is any later date for a month or week
 * already published. Quarterly GDP is published three times for each quarter on purpose.
 */
export function releaseDays(ev: FredEvent, releases: Record<number, string[]>): string[] {
  const other = ev.rid === 27 ? new Set(releases[97] ?? []) : new Set<string>();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of eventDates(ev, releases[ev.rid] ?? [])) {
    if (other.has(d)) continue;
    if (ev.freq !== 'q') {
      const [y, m, day] = d.split('-').map(Number);
      const p = expectedPeriod(ev, Date.UTC(y, m - 1, day));
      if (seen.has(p)) continue;
      seen.add(p);
    }
    out.push(d);
  }
  return out;
}

function usReleases(from: number, to: number, now: number): EcoEvent[] {
  const st = fredData.get();
  const today = newYorkDate(now);
  const out: EcoEvent[] = [];
  for (const ev of US_EVENTS) {
    for (const d of releaseDays(ev, st.releases)) {
      const [y, m, day] = d.split('-').map(Number);
      const t = Date.UTC(y, m - 1, day, 12);
      if (t < from || t > to) continue;
      const p = expectedPeriod(ev, Date.UTC(y, m - 1, day));
      const obs = st.series[ev.series];
      const prior = valueAt(obs, previousPeriod(p, ev.freq), ev.calc, ev.freq, ev.scale);
      out.push({
        id: `US:${ev.name}:${d}`,
        time: t,
        date: d,
        country: 'US',
        name: ev.name,
        period: fredPeriodLabel(p, ev.freq),
        survey: null,
        actual: d <= today ? valueAt(obs, p, ev.calc, ev.freq, ev.scale) : null,
        prior: prior ?? NaN,
        revised: null,
        unit: ev.unit,
        dec: ev.dec,
        relevance: ev.rel,
        kind: ev.kind,
        real: true,
      });
    }
  }
  return out;
}

/** Events between two times, with actuals filled in once released. */
export function ecoEvents(from: number, to: number, now = engine.now()): EcoEvent[] {
  const out: EcoEvent[] = [];
  const start = new Date(from - 2 * DAY_MS);
  const end = new Date(to + 2 * DAY_MS);
  // The desktop app lists only real releases; the browser's calendar is generated.
  if (engine.realOnly) out.push(...usReleases(from, to, now));
  else for (let y = start.getUTCFullYear(), m = start.getUTCMonth(); y < end.getUTCFullYear() || (y === end.getUTCFullYear() && m <= end.getUTCMonth()); m === 11 ? (y++, (m = 0)) : m++) {
    for (const tpl of TEMPLATES) {
      if (tpl.months && !tpl.months.includes(m)) continue;
      for (const day of ruleDates(tpl.rule, y, m)) {
        const time = zonedToUtc(y, m, day, tpl.time[0], tpl.time[1], tpl.tz);
        if (time < from || time > to) continue;
        const seed = hashString(`${tpl.c}:${tpl.name}`);
        const k = y * 400 + m * 31 + day;
        const drift = normal(seed, Math.floor(k / 31), 1) * tpl.sd * 0.8;
        const prior = round(tpl.base + drift + normal(seed, k, 2) * tpl.sd * 0.6, tpl.dec);
        const survey = round(prior + normal(seed, k, 3) * tpl.sd * 0.35, tpl.dec);
        const actual = round(survey + normal(seed, k, 4) * tpl.sd * 0.8, tpl.dec);
        const revised = normal(seed, k, 5) > 1 ? round(prior + tpl.sd * 0.3 * Math.sign(normal(seed, k, 6)), tpl.dec) : null;
        out.push({
          id: `${tpl.c}:${tpl.name}:${y}-${m}-${day}`,
          time,
          country: tpl.c,
          name: tpl.name,
          period: periodLabel(tpl, y, m, day),
          survey: tpl.rel >= 1 ? survey : null,
          actual: time <= now ? actual : null,
          prior,
          revised: time <= now ? revised : null,
          unit: tpl.unit,
          dec: tpl.dec,
          relevance: tpl.rel,
          kind: tpl.kind,
        });
      }
    }
  }
  for (const cb of centralBanks()) {
    for (const iso of cb.meetings) {
      const [yy, mm, dd] = iso.split('-').map(Number);
      const time = zonedToUtc(yy, mm - 1, dd, cb.time[0], cb.time[1], cb.tz);
      if (time < from || time > to) continue;
      const decision = rateDecision(cb, iso);
      out.push({
        id: `${cb.code}:${iso}`,
        time,
        country: cb.country,
        name: cb.name,
        period: MONTH[mm - 1] + ' ' + dd,
        survey: decision.survey,
        actual: time <= now ? decision.actual : null,
        prior: decision.prior,
        revised: null,
        unit: '%',
        dec: 2,
        relevance: 3,
        kind: 'rate',
        real: !!cb.real,
      });
    }
  }
  return out.sort((a, b) => a.time - b.time || b.relevance - a.relevance);
}

/**
 * Days from a decision to the day its rate applies: the ECB's changes take
 * effect the following Wednesday, the others' the next day at the latest.
 */
const EFFECTIVE_AFTER: Record<string, number> = { ECB: 6 };

/**
 * A meeting's prior rate and decision. With real history these are the levels
 * before and after the meeting (no survey: consensus is not available). The
 * decision is read from the bank's series once the series reaches the day the
 * rate applies, or earlier if a change dated after the meeting is already
 * there; until then it is null (pending), so an unchanged level never stands in
 * for a decision that has not taken effect yet. Without real history every
 * meeting keeps the reference rate.
 */
export function rateDecision(cb: Pick<CentralBank, 'code' | 'rate'>, iso: string, series = policySeries(cb.code)): { survey: number | null; actual: number | null; prior: number } {
  const s = series;
  if (!s) return { survey: cb.rate, actual: cb.rate, prior: cb.rate };
  const shift = (days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
  const prior = levelOn(s, shift(-1));
  const effective = shift(EFFECTIVE_AFTER[cb.code] ?? 1);
  const moved = s.changes.find(([d]) => d > iso && d <= shift(8));
  const actual = effective <= s.asOf ? levelOn(s, effective) : moved ? moved[1] : null;
  return { survey: null, actual, prior: Number.isFinite(prior) ? prior : s.last };
}

function round(x: number, dec: number): number {
  const f = 10 ** dec;
  return Math.round(x * f) / f;
}

export const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', EZ: 'Eurozone', DE: 'Germany', GB: 'United Kingdom', JP: 'Japan', CN: 'China', CA: 'Canada', AU: 'Australia',
  FR: 'France', IT: 'Italy', ES: 'Spain', CH: 'Switzerland', IN: 'India', BR: 'Brazil', MX: 'Mexico', KR: 'South Korea', HK: 'Hong Kong',
  TW: 'Taiwan', NL: 'Netherlands', DK: 'Denmark', SG: 'Singapore', EU: 'Euro Area', ZA: 'South Africa', TR: 'Turkey', SE: 'Sweden',
  NO: 'Norway', NZ: 'New Zealand', BE: 'Belgium', PT: 'Portugal', AT: 'Austria', IE: 'Ireland', PL: 'Poland', CZ: 'Czechia',
  XX: 'Global',
};

/** Releases due in the next `ms` window (for flash headlines). */
export function releasedBetween(a: number, b: number): EcoEvent[] {
  return ecoEvents(a - 60_000, b, b).filter((e) => e.time > a && e.time <= b);
}

export const isBizDay = (ms: number) => isBusinessDay(dayNum(ms));
