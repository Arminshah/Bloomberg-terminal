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
  { id: 'PX_LAST', label: 'Last', numeric: true, compact: true },
  { id: 'CHG_NET_1D', label: 'Net Chg', numeric: true, compact: true },
  { id: 'CHG_PCT_1D', label: '%Chg', numeric: true, compact: true },
  { id: 'ARMIN_PRE_MARKET', label: 'Pre-mkt', numeric: true },
  { id: 'ARMIN_AFTER_HOURS', label: 'After hrs', numeric: true },
  { id: 'BID', label: 'Bid', numeric: true },
  { id: 'ASK', label: 'Ask', numeric: true },
  { id: 'PX_VOLUME', label: 'Volume', numeric: true },
  { id: 'ARMIN_YTD', label: 'YTD', numeric: true },
  { id: 'ARMIN_SOURCE_TIME', label: 'Time' },
  { id: 'ARMIN_TODAY', label: 'Today' },
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
  { id: 'ARMIN_POST_PX', label: 'After hrs Px', numeric: true },
];

/** The extended-session columns, which lists saved before they existed receive after %Chg. */
export const EXTENDED_COLUMNS = ['ARMIN_PRE_MARKET', 'ARMIN_AFTER_HOURS'];
export const DEFAULT_WATCHLIST_COLUMNS = ['NAME', 'PX_LAST', 'CHG_NET_1D', 'CHG_PCT_1D', ...EXTENDED_COLUMNS, 'BID', 'ASK', 'PX_VOLUME', 'ARMIN_YTD', 'ARMIN_SOURCE_TIME', 'ARMIN_TODAY'];

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

export interface WatchlistRow {
  id: string;
  fields: Map<string, FieldValue>;
  today: number[];
}

/** Captures exactly the local values and provenance used by the monitor and its export. */
export function watchlistRow(
  id: string, sec: SecurityDef | undefined, q: Quote | undefined, now: number,
  history: { ytd: number; today: readonly number[]; intradayTime?: number; extended?: { pre?: SessionPrice; post?: SessionPrice } },
): WatchlistRow {
  const fields = new Map((sec ? securityFields(sec, q, now) : []).map((f) => [f.id, f]));
  const today = history.today.filter(Number.isFinite);
  if (sec) {
    if (sec.quote === 'yield') {
      const pct = fields.get('CHG_PCT_1D')!;
      fields.set(pct.id, { ...pct, value: null, status: 'UNAVAILABLE', asOf: null, note: 'This monitor suppresses relative percent changes for yield references; Net Chg displays the absolute move in basis points.' });
    }
    const extra = (fieldId: string, name: string, value: FieldValue['value'], unit: string, asOf: number | undefined, definition: string) => {
      const valid = value !== null && !(typeof value === 'number' && !Number.isFinite(value)) && (fieldId !== 'ARMIN_YTD' || fields.get('PX_LAST')?.value != null);
      fields.set(fieldId, {
        id: fieldId, name, category: 'Calculated', definition, value: valid ? value : null, unit,
        source: fieldId === 'ARMIN_YTD' ? `Calculated from ${q?.provider ?? 'source'} current price and available year-end daily close` : 'Available intraday history / observed samples',
        status: valid ? q?.src === 'SIM' ? 'DEMO DATA' : fieldId === 'ARMIN_YTD' ? `CALCULATED · ${fields.get('PX_LAST')?.status ?? 'UNKNOWN FRESHNESS'}` : 'CALCULATED' : 'UNAVAILABLE',
        asOf: valid && Number.isFinite(asOf) && asOf! > 0 ? asOf! : null,
        dateOnly: fieldId === 'ARMIN_YTD' && (!!q?.dayOnly || q?.src === 'EOD'),
        timeBasis: fieldId === 'ARMIN_YTD' ? 'Current source-price time; the base is an available year-end daily close.' : 'Last available history observation; not a bid/ask event time.',
        note: 'Local history coverage; a current quote does not verify this history or its adjustment conventions.',
      });
    };
    // Pre-market and after-hours trading (stocks): the change against the regular close, and the price.
    const session = (pctId: string, pxId: string, name: string, s: SessionPrice | undefined) => {
      const base = { category: 'Calculated' as const, source: s?.source ?? 'Extended-hours quote', dateOnly: false, timeBasis: s?.source.includes('(bar close)') ? 'Source timestamp of the last available extended-session bar; not an individual trade timestamp.' : 'Time of the last trade in the session, as the source gives it.', note: sec.cls === 'equity' ? 'Pre-market uses the preceding regular close; after-hours uses that day’s regular close and remains until the next regular session opens. Yahoo sessions are independent of any IEX regular quote. A chart fallback is the last observed bar close, not a transaction tape.' : 'Extended sessions apply to stocks.' };
      const valid = !!s && Number.isFinite(s.price) && s.price > 0;
      fields.set(pctId, { ...base, id: pctId, name: `${name} change`, definition: `${name} price against the last regular-session close.`, value: valid && Number.isFinite(s!.pct) ? s!.pct : null, unit: '%', status: valid ? 'EXTENDED HOURS' : 'UNAVAILABLE', asOf: valid ? s!.time : null });
      fields.set(pxId, { ...base, id: pxId, name: `${name} price`, definition: `Last ${name.toLowerCase()} trade.`, value: valid ? s!.price : null, unit: sec.ccy, status: valid ? 'EXTENDED HOURS' : 'UNAVAILABLE', asOf: valid ? s!.time : null });
    };
    session('ARMIN_PRE_MARKET', 'ARMIN_PRE_PX', 'Pre-market', history.extended?.pre);
    session('ARMIN_AFTER_HOURS', 'ARMIN_POST_PX', 'After-hours', history.extended?.post);
    extra('ARMIN_YTD', 'Year-to-date change', history.ytd, sec.quote === 'yield' ? 'percentage points' : '%', q?.time, 'Current source price against the available year-end daily close; price return for prices, percentage-point change for yield references.');
    extra('ARMIN_TODAY', 'Intraday close samples', today.length ? today.join(';') : null, sec.quote === 'yield' ? 'yield % samples' : `${sec.ccy} samples`, history.intradayTime, 'Available intraday close observations in chart order, separated by semicolons in CSV; not a transaction tape.');
  }
  return { id, fields, today };
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
