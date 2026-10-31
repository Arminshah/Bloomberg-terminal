// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { fieldTime, securityFields, type FieldValue } from './fields';
import type { Quote, SecurityDef } from './types';

/** A stock's price in one extended session and its change against the regular session's close. */
export interface SessionPrice {
  price: number;
  /** Percent change against the last regular-session close. */
  pct: number;
  /** When the price was traded (ms). */
  time: number;
  source: string;
}

export interface WatchlistColumn {
  id: string;
  label: string;
  numeric?: boolean;
  compact?: boolean;
}

/** Column IDs refer to the local field catalogue, with two explicitly local chart/history columns. */
export const WATCHLIST_COLUMNS: readonly WatchlistColumn[] = [
  { id: 'NAME', label: 'Name' },
  { id: 'PX_LAST', label: 'Last Price', numeric: true, compact: true },
  { id: 'CHG_PCT_1D', label: 'Change (%)', numeric: true, compact: true },
  { id: 'CHG_NET_1D', label: 'Change', numeric: true, compact: true },
  { id: 'ARMIN_PRE_MARKET', label: 'Pre-mkt', numeric: true },
  { id: 'ARMIN_AFTER_HOURS', label: 'After-hrs', numeric: true },
  { id: 'BID', label: 'Bid', numeric: true },
  { id: 'ASK', label: 'Ask', numeric: true },
  { id: 'PX_VOLUME', label: 'Volume', numeric: true },
  { id: 'ARMIN_AVG_VOL_3M', label: 'Avg Vol (3M)', numeric: true },
  { id: 'ARMIN_YTD', label: 'YTD', numeric: true },
  { id: 'ARMIN_1Y', label: '52-Wk %', numeric: true },
  { id: 'ARMIN_DAY_RANGE', label: 'Day Range' },
  { id: 'ARMIN_52W_RANGE', label: '52-Wk Range' },
  { id: 'ARMIN_TODAY', label: 'Day Chart' },
  { id: 'CUR_MKT_CAP', label: 'Market Cap', numeric: true },
  { id: 'ARMIN_SOURCE_TIME', label: 'Time' },
  { id: 'PX_OPEN', label: 'Open', numeric: true },
  { id: 'PX_HIGH', label: 'High', numeric: true },
  { id: 'PX_LOW', label: 'Low', numeric: true },
  { id: 'PX_PREV_CLOSE', label: 'Prev Close', numeric: true },
  { id: 'ARMIN_BID_ASK_SPREAD', label: 'Bid/Ask Spread', numeric: true },
  { id: 'ARMIN_BID_ASK_MID', label: 'Midpoint', numeric: true },
  { id: 'ARMIN_SPREAD_PCT', label: 'Spread %', numeric: true },
  { id: 'CRNCY', label: 'Currency' },
  { id: 'EXCH_CODE', label: 'Exchange' },
  { id: 'COUNTRY_ISO', label: 'Country' },
  { id: 'SECURITY_TYP', label: 'Asset Class' },
  { id: 'ARMIN_PROVIDER', label: 'Provider' },
  { id: 'ARMIN_FRESHNESS', label: 'Freshness' },
  { id: 'ARMIN_CHANGE_CHECK', label: 'Change Check' },
  { id: 'ARMIN_RECEIVED_AT', label: 'Received UTC' },
  { id: 'ARMIN_SESSION', label: 'Session' },
  { id: 'ARMIN_VOLUME_UNIT', label: 'Volume Unit' },
  { id: 'ARMIN_PRE_PX', label: 'Pre-mkt Px', numeric: true },
  { id: 'ARMIN_POST_PX', label: 'After-hrs Px', numeric: true },
];

/** The extended-session columns, which lists saved before they existed receive after %Chg. */
export const EXTENDED_COLUMNS = ['ARMIN_PRE_MARKET', 'ARMIN_AFTER_HOURS'];
/** The owner's layout (27 October 2026), after Yahoo Finance's watchlist summary. */
export const DEFAULT_WATCHLIST_COLUMNS = ['NAME', 'PX_LAST', 'CHG_PCT_1D', 'CHG_NET_1D', ...EXTENDED_COLUMNS, 'PX_VOLUME', 'ARMIN_AVG_VOL_3M', 'ARMIN_YTD', 'ARMIN_1Y', 'ARMIN_DAY_RANGE', 'ARMIN_52W_RANGE', 'ARMIN_TODAY', 'CUR_MKT_CAP'];
/** The default before it, which saved lists carrying exactly these columns move on from (userdata.ts). */
export const PREVIOUS_DEFAULT_COLUMNS = ['NAME', 'PX_LAST', 'CHG_NET_1D', 'CHG_PCT_1D', ...EXTENDED_COLUMNS, 'BID', 'ASK', 'PX_VOLUME', 'ARMIN_YTD', 'ARMIN_1Y', 'ARMIN_SOURCE_TIME', 'ARMIN_TODAY'];
/** Whether a saved list carries exactly the previous default columns (in any order), and so takes the new layout. */
export function onPreviousDefault(columns: readonly string[] | undefined): boolean {
  const previous = new Set(PREVIOUS_DEFAULT_COLUMNS);
  return !!columns && columns.length === previous.size && columns.every((c) => previous.has(c));
}
/** Columns drawn rather than sorted. */
export const UNSORTED_COLUMNS = new Set(['ARMIN_TODAY', 'ARMIN_DAY_RANGE', 'ARMIN_52W_RANGE']);

/** A saved column list with the extended-session columns added after %Chg (or at the end), once. */
export function withExtendedColumns(ids: string[]): string[] {
  if (EXTENDED_COLUMNS.some((c) => ids.includes(c))) return ids;
  const at = ids.indexOf('CHG_PCT_1D');
  return at < 0 ? [...ids, ...EXTENDED_COLUMNS] : [...ids.slice(0, at + 1), ...EXTENDED_COLUMNS, ...ids.slice(at + 1)];
}
export const WATCHLIST_PRESETS = [
  { name: 'Default', columns: DEFAULT_WATCHLIST_COLUMNS },
  { name: 'Quote detail', columns: ['NAME', 'PX_LAST', 'CHG_NET_1D', 'CHG_PCT_1D', 'PX_OPEN', 'PX_HIGH', 'PX_LOW', 'PX_PREV_CLOSE', 'BID', 'ASK', 'ARMIN_BID_ASK_SPREAD', 'PX_VOLUME'] },
  { name: 'Source check', columns: ['NAME', 'PX_LAST', 'CRNCY', 'ARMIN_PROVIDER', 'ARMIN_FRESHNESS', 'ARMIN_SOURCE_TIME', 'ARMIN_RECEIVED_AT', 'ARMIN_CHANGE_CHECK'] },
] as const;

const columnsById = new Map(WATCHLIST_COLUMNS.map((c) => [c.id, c]));

/** Older saved lists have no columns. Unknown/duplicate stored fields cannot hide the monitor. */
export function watchlistColumns(saved: unknown): WatchlistColumn[] {
  const ids = Array.isArray(saved) ? [...new Set(saved.filter((id): id is string => typeof id === 'string' && columnsById.has(id)))] : [];
  return (ids.length ? ids : DEFAULT_WATCHLIST_COLUMNS).map((id) => columnsById.get(id)!);
}

export interface WatchlistSort {
  column: string;
  direction: 'asc' | 'desc';
}

/** A range drawn as a bar: the marker at `at`, the filled part from `from` to `to` (each within low to high). */
export interface RangeView {
  low: number;
  high: number;
  at: number;
  from: number;
  to: number;
}

export interface WatchlistRow {
  id: string;
  fields: Map<string, FieldValue>;
  today: number[];
  /** The previous close, for the day chart's base line. */
  base?: number;
  day?: RangeView;
  year?: RangeView;
}

/** Captures exactly the local values and provenance used by the monitor and its export. */
export function watchlistRow(
  id: string, sec: SecurityDef | undefined, q: Quote | undefined, now: number,
  history: { ytd: number; y1?: number; today: readonly number[]; intradayTime?: number; extended?: { pre?: SessionPrice; post?: SessionPrice; preOver?: boolean }; avgVolume?: number; range52?: { low: number; high: number } | null; marketCap?: number },
): WatchlistRow {
  const fields = new Map((sec ? securityFields(sec, q, now) : []).map((f) => [f.id, f]));
  const today = history.today.filter(Number.isFinite);
  const views: Pick<WatchlistRow, 'base' | 'day' | 'year'> = {};
  if (sec) {
    if (sec.quote === 'yield') {
      const pct = fields.get('CHG_PCT_1D')!;
      fields.set(pct.id, { ...pct, value: null, status: 'UNAVAILABLE', asOf: null, note: 'This monitor suppresses relative percent changes for yield references; Net Chg displays the absolute move in basis points.' });
    }
    const extra = (fieldId: string, name: string, value: FieldValue['value'], unit: string, asOf: number | undefined, definition: string) => {
      const change = fieldId === 'ARMIN_YTD' || fieldId === 'ARMIN_1Y';
      const valid = value !== null && !(typeof value === 'number' && !Number.isFinite(value)) && (!change || fields.get('PX_LAST')?.value != null);
      fields.set(fieldId, {
        id: fieldId, name, category: 'Calculated', definition, value: valid ? value : null, unit,
        source: fieldId === 'ARMIN_YTD' ? `Calculated from ${q?.provider ?? 'source'} current price and available year-end daily close` : fieldId === 'ARMIN_1Y' ? `Calculated from ${q?.provider ?? 'source'} current price and the daily close a year earlier` : 'Available intraday history / observed samples',
        status: valid ? q?.src === 'SIM' ? 'DEMO DATA' : change ? `CALCULATED · ${fields.get('PX_LAST')?.status ?? 'UNKNOWN FRESHNESS'}` : 'CALCULATED' : 'UNAVAILABLE',
        asOf: valid && Number.isFinite(asOf) && asOf! > 0 ? asOf! : null,
        dateOnly: change && (!!q?.dayOnly || q?.src === 'EOD'),
        timeBasis: fieldId === 'ARMIN_YTD' ? 'Current source-price time; the base is an available year-end daily close.' : fieldId === 'ARMIN_1Y' ? 'Current source-price time; the base is the daily close a year earlier.' : 'Last available history observation; not a bid/ask event time.',
        note: 'Local history coverage; a current quote does not verify this history or its adjustment conventions.',
      });
    };
    // Pre-market and after-hours trading (stocks): the change against the regular close, and the price.
    const session = (pctId: string, pxId: string, name: string, s: SessionPrice | undefined) => {
      const base = { category: 'Calculated' as const, source: s?.source ?? 'Extended-hours quote', dateOnly: false, timeBasis: s?.source.includes('(bar close)') ? 'Source timestamp of the last available extended-session bar; not an individual trade timestamp.' : 'Time of the last trade in the session, as the source gives it.', note: sec.cls === 'equity' ? 'Pre-market uses the preceding regular close and is N/A from the regular close until the next pre-market. After-hours uses that day’s regular close and stays, frozen at its last trade, through the next morning and day until the next after-hours session trades. Yahoo sessions are independent of any IEX regular quote. A chart fallback is the last observed bar close, not a transaction tape.' : 'Extended sessions apply to stocks.' };
      const valid = !!s && Number.isFinite(s.price) && s.price > 0;
      fields.set(pctId, { ...base, id: pctId, name: `${name} change`, definition: `${name} price against the last regular-session close.`, value: valid && Number.isFinite(s!.pct) ? s!.pct : null, unit: '%', status: valid ? 'EXTENDED HOURS' : 'UNAVAILABLE', asOf: valid ? s!.time : null });
      fields.set(pxId, { ...base, id: pxId, name: `${name} price`, definition: `Last ${name.toLowerCase()} trade.`, value: valid ? s!.price : null, unit: sec.ccy, status: valid ? 'EXTENDED HOURS' : 'UNAVAILABLE', asOf: valid ? s!.time : null });
    };
    // Average volume, market value and the two ranges: from the daily history and the quote, as each says.
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
    const last = num(fields.get('PX_LAST')?.value);
    const lowDay = num(fields.get('PX_LOW')?.value);
    const highDay = num(fields.get('PX_HIGH')?.value);
    const open = num(fields.get('PX_OPEN')?.value);
    const prev = num(fields.get('PX_PREV_CLOSE')?.value);
    if (prev > 0) views.base = prev;
    const status = q?.src === 'SIM' ? 'DEMO DATA' : 'CALCULATED';
    const put = (fieldId: string, name: string, value: string | number | null, unit: string, source: string, definition: string, note: string) => fields.set(fieldId, {
      id: fieldId, name, category: 'Calculated', definition, value, unit, source, status: value === null ? 'UNAVAILABLE' : status,
      asOf: value === null || !q?.time ? null : q.time, dateOnly: false, timeBasis: 'The source quote time; ranges and averages run to it.', note,
    });
    const avg = num(history.avgVolume);
    put('ARMIN_AVG_VOL_3M', 'Average volume, 3 months', avg > 0 ? avg : null, 'shares', 'Calculated from the daily history', 'The average daily volume of the last 63 completed sessions (about three months).', avg > 0 ? 'Today\u2019s session is left out.' : 'No volume history: indices, currencies and yields trade none of their own, or the history is shorter than 63 sessions.');
    const cap = num(history.marketCap);
    put('CUR_MKT_CAP', 'Market value', cap > 0 ? cap : null, sec.ccy === 'GBp' ? 'GBP' : sec.ccy, 'Shares outstanding times the last price', 'Market value: the shares outstanding times the last price, in the stock\u2019s own currency.', cap > 0 ? 'The share count is the source\u2019s (Yahoo Finance in the desktop app).' : 'Stocks only.');
    const fmt = (v: number) => v.toFixed(sec.dec);
    const dayOk = lowDay > 0 && highDay >= lowDay && last > 0;
    if (dayOk) views.day = { low: lowDay, high: highDay, at: last, from: open > 0 ? Math.min(open, last) : last, to: open > 0 ? Math.max(open, last) : last };
    put('ARMIN_DAY_RANGE', 'Day range', dayOk ? `${fmt(lowDay)} - ${fmt(highDay)}` : null, sec.ccy, 'The source session\u2019s low and high', 'Today\u2019s low and high, with the last price marked and the move from the open filled.', dayOk ? '' : 'The source gives no low and high for this session.');
    const r52 = history.range52;
    const yearOk = !!r52 && last > 0;
    if (yearOk) views.year = { low: r52!.low, high: r52!.high, at: last, from: lowDay > 0 ? lowDay : last, to: highDay > 0 ? highDay : last };
    put('ARMIN_52W_RANGE', '52-week range', yearOk ? `${fmt(r52!.low)} - ${fmt(r52!.high)}` : null, sec.ccy, 'Calculated from the daily history', 'The lowest low and highest high of the last 52 weeks, today included, with the last price marked and today\u2019s range filled.', yearOk ? 'Prices as the daily history gives them (split-adjusted for stocks).' : 'Less than a year of daily history.');
    session('ARMIN_PRE_MARKET', 'ARMIN_PRE_PX', 'Pre-market', history.extended?.pre);
    if (history.extended?.preOver) {
      const over = { status: 'OUT OF SESSION', note: 'Pre-market is over: the regular session has closed. The next pre-market opens at 04:00 New York time on the next trading day.' };
      for (const fid of ['ARMIN_PRE_MARKET', 'ARMIN_PRE_PX']) fields.set(fid, { ...fields.get(fid)!, ...over });
    }
    session('ARMIN_AFTER_HOURS', 'ARMIN_POST_PX', 'After-hours', history.extended?.post);
    extra('ARMIN_YTD', 'Year-to-date change', history.ytd, sec.quote === 'yield' ? 'percentage points' : '%', q?.time, 'Current source price against the available year-end daily close; price return for prices, percentage-point change for yield references.');
    extra('ARMIN_1Y', 'One-year change', history.y1 ?? NaN, sec.quote === 'yield' ? 'percentage points' : '%', q?.time, 'Current source price against the daily close a year earlier; price return for prices, percentage-point change for yield references.');
    extra('ARMIN_TODAY', 'Intraday close samples', today.length ? today.join(';') : null, sec.quote === 'yield' ? 'yield % samples' : `${sec.ccy} samples`, history.intradayTime, 'Available intraday close observations in chart order, separated by semicolons in CSV; not a transaction tape.');
  }
  return { id, fields, today, ...views };
}

/** Missing/unverified-base values stay last in both directions; ties retain manual list order. */
export function sortWatchlistRows(rows: readonly WatchlistRow[], sort: WatchlistSort | undefined, columns: readonly WatchlistColumn[]): WatchlistRow[] {
  if (!sort || !columns.some((c) => c.id === sort.column && c.id !== 'ARMIN_TODAY')) return [...rows];
  return [...rows].sort((a, b) => {
    const af = a.fields.get(sort.column);
    const bf = b.fields.get(sort.column);
    const x = af?.status.includes('UNVERIFIED BASE') ? null : af?.value ?? null;
    const y = bf?.status.includes('UNVERIFIED BASE') ? null : bf?.value ?? null;
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return sort.direction === 'desc' ? -cmp : cmp;
  });
}

/** The order with `id` moved directly before or after `target`; an unknown line or target leaves it unchanged. */
export function placeInOrder(order: readonly string[], id: string, target: string, after: boolean): string[] {
  if (id === target || !order.includes(id) || !order.includes(target)) return [...order];
  const ids = order.filter((x) => x !== id);
  ids.splice(ids.indexOf(target) + (after ? 1 : 0), 0, id);
  return ids;
}

/** Selected columns and displayed row order, followed by explicit per-cell units/source/timing. */
export function watchlistExport(rows: readonly WatchlistRow[], columns: readonly WatchlistColumn[], now: number): (string | number | null)[][] {
  return [
    ['Security', ...columns.map((c) => c.label)],
    ...rows.map((r) => [r.id, ...columns.map((c) => r.fields.get(c.id)?.value ?? null)]),
    [],
    ['Local watchlist fields', 'Raw values in the units below. Yield changes are percentage points (the screen displays basis points). Intraday charts export close samples.'],
    ['Inspected at UTC', new Date(now).toISOString()],
    ['Security', 'Field', 'Unit', 'Source', 'Status', 'Source as of UTC', 'Time basis', 'Definition', 'Note'],
    ...rows.flatMap((r) => columns.map((c) => {
      const f = r.fields.get(c.id);
      return f ? [r.id, c.id, f.unit, f.source, f.status, f.asOf === null ? null : fieldTime(f), f.timeBasis, f.definition, f.note] : [r.id, c.id, null, null, 'UNAVAILABLE', null, null, null, 'Security definition is not available in this session.'];
    })),
  ];
}
