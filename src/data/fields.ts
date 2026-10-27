import { DAY_MS } from './calendar';
import { freshnessOf, sessionLabel } from './freshness';
import type { Quote, SecurityDef } from './types';
import { toCsv } from '../core/csv';

export type FieldCategory = 'Identity' | 'Market' | 'Calculated' | 'Source';
export interface FieldValue {
  id: string;
  name: string;
  category: FieldCategory;
  definition: string;
  value: string | number | null;
  unit: string;
  source: string;
  status: string;
  asOf: number | null;
  dateOnly: boolean;
  timeBasis: string;
  note: string;
}

const timestamp = (n: number | undefined): number | null => n !== undefined && Number.isFinite(n) && n > 0 && n <= 8.64e15 ? n : null;
export const fieldTime = (f: Pick<FieldValue, 'asOf' | 'dateOnly'>): string => f.asOf === null ? '' : new Date(f.asOf).toISOString().slice(0, f.dateOnly ? 10 : undefined);

/** Local field definitions, not Bloomberg field contracts or a BLP/BDP API. No new network requests. */
export function securityFields(sec: SecurityDef, q: Quote | undefined, now: number): FieldValue[] {
  const available = !!q && q.id === sec.id && q.src !== 'NONE';
  const freshness = q ? freshnessOf(q, sec, now) : null;
  const source = q?.provider || (q?.src === 'SIM' ? 'Demo engine' : 'Source unspecified');
  const quoteTime = timestamp(q?.time);
  const unit = sec.quote === 'yield' ? 'yield %' : sec.ccy;
  const status = freshness?.label ?? 'UNAVAILABLE';
  const base: Omit<FieldValue, 'id' | 'name' | 'category' | 'definition' | 'value'> = {
    unit, source, status, asOf: available ? quoteTime : null, dateOnly: !!q?.dayOnly || q?.src === 'EOD',
    timeBasis: 'Source last-price time; session aggregates do not have separate event timestamps.',
    note: freshness?.why ?? 'No source value has arrived.',
  };
  const rows: FieldValue[] = [];
  const add = (id: string, name: string, category: FieldCategory, definition: string, value: FieldValue['value'] | undefined, extra: Partial<FieldValue> = {}) => {
    const valid = value !== undefined && value !== null && !(typeof value === 'number' && !Number.isFinite(value)) && value !== '';
    rows.push({ ...base, id, name, category, definition, value: valid ? value : null, ...extra,
      ...(!valid ? { value: null, status: 'UNAVAILABLE', asOf: null, note: extra.note ?? 'This field was not supplied or cannot be calculated from valid inputs.' } : {}) });
  };
  const identity = (id: string, name: string, definition: string, value: string | undefined) => add(id, name, 'Identity', definition, value, {
    unit: 'text', source: sec.dynamic ? `Instrument definition · ${sec.dynamic.source}` : 'Local instrument definition',
    status: 'REFERENCE', asOf: timestamp(sec.dynamic?.loaded), dateOnly: false,
    timeBasis: sec.dynamic ? 'When the instrument definition was loaded; not a price timestamp.' : 'Local metadata has no independently verified market timestamp.',
    note: 'Instrument metadata; no live market-data or full instrument-master coverage is implied.',
  });
  identity('ID_LOCAL', 'Local security identifier', 'Canonical identifier used inside Armin Terminal; not another vendor’s identifier.', sec.id);
  identity('NAME', 'Security name', 'Instrument name from the local or online-loaded definition.', sec.name);
  identity('SECURITY_TYP', 'Asset class', 'Armin asset class; futures and reference yields remain distinct from equities.', sec.cls);
  identity('CRNCY', 'Quote currency', 'Trading quote currency or minor-unit code. GBp is pence; USd is US cents.', sec.ccy);
  identity('COUNTRY_ISO', 'Country', 'Country code held in the instrument definition.', sec.country);
  identity('EXCH_CODE', 'Exchange', 'Exchange string held in the definition; not the venue of every trade.', sec.exch);
  identity('ARMIN_QUOTE_CONVENTION', 'Quote convention', 'Whether the level represents a price or a yield in percentage points.', sec.quote);

  const market = (id: string, name: string, definition: string, value: number | undefined, extra: Partial<FieldValue> = {}) => add(id, name, 'Market', definition, available ? value : null, extra);
  market('PX_LAST', 'Last price / yield', 'Latest source level: price in quote units, or yield in percent for a yield reference. A daily-bar fallback is not a trade.', q?.last);
  const bbo: Partial<FieldValue> = {
    asOf: null, dateOnly: false, status: q?.src === 'SIM' ? 'DEMO DATA' : `${q?.src === 'STALE' ? 'SOURCE STALE · ' : ''}TIMESTAMP UNAVAILABLE`,
    timeBasis: 'The engine does not expose a separate bid/ask event timestamp.',
    note: 'The last trade timestamp does not verify bid/ask freshness. IEX prices cover one venue; these fields do not establish consolidated NBBO.',
    ...(q?.bboSource ? { source: q.bboSource, status: 'REAL-TIME QUOTE', note: 'Nasdaq Basic: the best bid and offer on Nasdaq’s venues, read once a minute while the monitor shows the line; not consolidated NBBO.' } : {}),
  };
  market('BID', 'Bid', 'Source bid, when supplied. No size, executable guarantee or consolidated NBBO is inferred.', q?.bid, bbo);
  market('ASK', 'Ask', 'Source offer, when supplied. No size, executable guarantee or consolidated NBBO is inferred.', q?.ask, bbo);
  const day = q?.dayProvider ? { source: q.dayProvider } : {};
  market('PX_OPEN', 'Session open', 'Opening level of the session supplied by the provider.', q?.open, day);
  market('PX_HIGH', 'Session high', 'High of the source session; the time shown belongs to the source snapshot, not the high event.', q?.high, day);
  market('PX_LOW', 'Session low', 'Low of the source session; the time shown belongs to the source snapshot, not the low event.', q?.low, day);
  market('PX_PREV_CLOSE', 'Previous close', 'Source previous close, checked against a prior daily bar when available. Unverified bases remain labelled.', q?.prevClose, {
    status: q?.src === 'SIM' ? 'DEMO DATA' : q?.chgCheck === 'verified' ? (q.prevSettle ? 'SETTLEMENT' : 'VERIFIED CLOSE') : 'UNVERIFIED BASE',
    asOf: timestamp(q?.prevCloseDay === undefined ? undefined : q.prevCloseDay * DAY_MS), dateOnly: true,
    timeBasis: 'Date of the previous daily close, if verified by the engine.',
    note: q?.chgCheck === 'verified'
      ? q.prevSettle
        ? "The exchange's settlement for the previous session, as the quote gives it; the daily bar ends on the last trade (or, after a roll, the previous contract) and can differ."
        : 'The source previous close agrees with the prior daily bar.'
      : 'A matching prior daily close has not been established.',
  });
  const change: Partial<FieldValue> = q?.src !== 'SIM' && q?.chgCheck !== 'verified' ? { status: `${status} · UNVERIFIED BASE`, note: `${base.note} The source previous close has not been verified against a daily bar; this change is provisional.` } : {};
  market('CHG_NET_1D', 'Day net change', 'Last minus previous close in price units; yield references use percentage points, not basis points.', q?.chg, { unit: sec.quote === 'yield' ? 'percentage points' : sec.ccy, ...change });
  market('CHG_PCT_1D', 'Day percent change', '100 × (last / previous close − 1). This is a relative percent even for a yield reference.', q?.pct, { unit: '%', ...change });
  const volumeUnit = q?.volumeUnit ?? (sec.cls === 'equity' ? 'shares' : sec.cls === 'future' || sec.cls === 'commodity' ? 'contracts' : sec.cls === 'crypto' ? 'base coins' : 'unspecified');
  market('PX_VOLUME', 'Session volume', 'Volume supplied for the source session and coverage. IEX-only data does not imply market-wide volume.', q?.volume, { unit: volumeUnit, ...day });

  const validBbo = available && Number.isFinite(q?.bid) && Number.isFinite(q?.ask) && q!.bid > 0 && q!.ask >= q!.bid;
  const spread = validBbo ? q!.ask - q!.bid : null;
  const mid = validBbo ? (q!.ask + q!.bid) / 2 : null;
  const derived = (id: string, name: string, definition: string, value: number | null, derivedUnit: string) => add(id, name, 'Calculated', definition, value, {
    ...bbo, unit: derivedUnit, source: `Calculated from ${source} bid/ask`,
    note: validBbo ? bbo.note : 'Needs a finite positive bid and a finite ask at least as large as the bid. Locked quotes are valid; crossed quotes are refused.',
  });
  derived('ARMIN_BID_ASK_SPREAD', 'Bid/ask spread', 'Ask minus bid from the currently supplied pair. Crossed quotes are not treated as a valid spread.', spread, unit);
  derived('ARMIN_BID_ASK_MID', 'Bid/ask midpoint', '(Ask + bid) / 2. This is a calculation, not an observed trade.', mid, unit);
  derived('ARMIN_SPREAD_PCT', 'Spread as percent of midpoint', '100 × (ask − bid) / midpoint; calculated only for a valid supplied pair.', spread !== null && mid !== null ? spread / mid * 100 : null, '%');

  const meta = (id: string, name: string, definition: string, value: string | undefined, extra: Partial<FieldValue> = {}) => add(id, name, 'Source', definition, available ? value : null, { unit: 'text', ...extra });
  meta('ARMIN_PROVIDER', 'Price provider', 'Name of the provider attached to this price line.', q?.provider || (q?.src === 'SIM' ? 'Demo engine' : undefined));
  meta('ARMIN_SOURCE_STATE', 'Source state', 'Engine source state. LIVE is interpreted together with age and source labels in ARMIN_FRESHNESS.', q?.src);
  meta('ARMIN_FRESHNESS', 'Price freshness', 'Freshness evaluated from source state and source time at inspection; polling frequency does not make an old trade recent.', freshness?.label);
  meta('ARMIN_SOURCE_TIME', 'Source last-price time', 'UTC source last-price timestamp, or only a date when the source supplies a daily value. This is not a bid/ask event time.', quoteTime === null ? undefined : new Date(quoteTime).toISOString().slice(0, base.dateOnly ? 10 : undefined));
  const received = timestamp(q?.fetched);
  meta('ARMIN_RECEIVED_AT', 'Received at', 'When the app received the line. This is not when a trade happened.', received === null ? undefined : new Date(received).toISOString(), { asOf: received, dateOnly: false, timeBasis: 'App receipt time; not a market event timestamp.' });
  meta('ARMIN_SESSION', 'Source session', 'Session state reported by the provider; no exchange calendar state is inferred.', sessionLabel(q?.session) ?? undefined);
  const previousTime = timestamp(q?.prevCloseDay === undefined ? undefined : q.prevCloseDay * DAY_MS);
  meta('ARMIN_PREV_CLOSE_DATE', 'Previous close date', 'UTC date of the prior daily close used to check the base.', previousTime === null ? undefined : new Date(previousTime).toISOString().slice(0, 10));
  meta('ARMIN_CHANGE_CHECK', 'Day-change verification', 'Whether the previous-close base agrees with the previous daily bar.', q?.chgCheck);
  meta('ARMIN_VOLUME_UNIT', 'Volume unit', 'Unit supplied by the source, or the instrument-class convention when no override is given.', volumeUnit);
  return rows;
}

export function filterFields(rows: FieldValue[], query: string, category?: FieldCategory, availableOnly = false): FieldValue[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return rows.filter((f) => (!category || f.category === category) && (!availableOnly || f.value !== null) && terms.every((t) => `${f.id} ${f.name} ${f.definition}`.toLowerCase().includes(t)));
}

export function fieldsCsv(id: string, fields: FieldValue[], inspectedAt: number): string {
  return toCsv([
    ['Armin local field catalogue', 'Definitions are local; no other vendor’s field/API compatibility or additional data entitlement is implied.'],
    ['Security', id], ['Inspected at UTC', new Date(inspectedAt).toISOString()],
    ['Field', 'Name', 'Category', 'Value', 'Unit', 'Source', 'Status', 'Source as of UTC', 'Time basis', 'Definition', 'Note'],
    ...fields.map((f) => [f.id, f.name, f.category, f.value, f.unit, f.source, f.status, f.asOf === null ? '' : fieldTime(f), f.timeBasis, f.definition, f.note]),
  ]);
}
