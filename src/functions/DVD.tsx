import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { KV } from '../components/cells';
import { XYChart } from '../components/chart/XYChart';
import { exportActions } from '../components/ExportActions';
import { fmtDay, fmtNum, fmtPct } from '../core/format';
import { DAY_MS } from '../data/calendar';
import { engine } from '../data/market';
import { dividendGrowth, dividends, keyStats, splitRatio, splits, splitType, type Dividend, type StockSplit } from '../data/fundamentals';
import { useNumberedRows, usePanelId } from '../terminal/panel';
import { closeAt } from '../data/analytics';
import type { FnProps } from '../terminal/types';
import { useFundamentals } from '../data/live/yfund';
import { sourceLabel } from '../components/Source';

/** One line of the history: a cash dividend, or a split the record dates the same way (Bloomberg lists both). */
type Row = { kind: 'dividend'; ex: number; d: Dividend } | { kind: 'split'; ex: number; x: StockSplit };

const TYPES = ['All', 'Regular Cash', 'Special Cash', 'Stock Split', 'Expected'] as const;
type TypeFilter = (typeof TYPES)[number];

/** The terminal's wording of a dividend's type: Regular Cash, Special Cash, or the source's own word. */
function typeName(d: Dividend): string {
  if (d.type === 'Projected' || d.type === 'Expected') return d.type;
  if (/special|extra/i.test(d.type)) return 'Special Cash';
  return 'Regular Cash';
}

export function DVD({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const { status } = useFundamentals(s);
  const all = dividends(s);
  const sp = splits(s);
  const today = engine.today * DAY_MS;
  const thisYear = new Date(today).getUTCFullYear();
  const firstYear = Math.min(thisYear, ...all.map((d) => new Date(d.ex).getUTCFullYear()), ...sp.map((x) => new Date(x.date).getUTCFullYear()));
  const [fromYear, setFromYear] = useState<number | null>(null);
  const [toYear, setToYear] = useState(thisYear + 1);
  const [type, setType] = useState<TypeFilter>('All');
  const [adjusted, setAdjusted] = useState(true);
  const from = fromYear ?? Math.max(firstYear, thisYear - 10);
  // Amounts are on today's share basis; unadjusted, each is multiplied back by the splits after its ex-date.
  const factor = (ex: number) => (adjusted ? 1 : sp.filter((x) => x.date > ex).reduce((f, x) => f * (x.numerator / x.denominator), 1));
  const list = all.map((d) => ({ ...d, amount: d.amount * factor(d.ex) }));
  const inRange = (t: number) => {
    const y = new Date(t).getUTCFullYear();
    return y >= from && y <= toYear;
  };
  const rows: Row[] = [
    ...list.filter((d) => inRange(d.ex) && (type === 'All' || typeName(d) === type)).map((d): Row => ({ kind: 'dividend', ex: d.ex, d })),
    ...sp.filter((x) => inRange(x.date) && (type === 'All' || type === 'Stock Split')).map((x): Row => ({ kind: 'split', ex: x.date, x })),
  ].sort((a, b) => b.ex - a.ex);
  const numbered = useNumberedRows('dvd-rows', rows, 11, () => undefined, (r) => fmtDay(r.ex));
  const ks = keyStats(s);
  const daily = engine.daily(s.id);
  const ccy = s.ccy === 'GBp' ? 'GBp' : s.ccy;
  // An ex-date today is the current one; "next" is strictly after today.
  const paid = all.filter((d) => d.ex <= today);
  const next = all.filter((d) => d.ex > today).sort((a, b) => a.ex - b.ex)[0];
  const last = all.find((d) => d.ex <= today);
  // The record comes with the price history, so it reaches back as far as the first daily bar.
  const since = daily.length ? daily.t[0] : NaN;
  const growth = (years: number) => dividendGrowth(paid, today, since, years);
  const q = engine.quote(s.id);
  // The indicated annual dividend: the source's, else the latest regular payment times the payments a year.
  const perYear: Record<string, number> = { Quarter: 4, Monthly: 12, 'Semi-Anl': 2, Annual: 1 };
  const lastRegular = paid.find((d) => typeName(d) === 'Regular Cash' && Number.isFinite(d.amount));
  const indicatedAnnual = Number.isFinite(s.eq!.dps) ? s.eq!.dps : lastRegular && perYear[lastRegular.freq] ? lastRegular.amount * perYear[lastRegular.freq] : NaN;
  const indicated = Number.isFinite(indicatedAnnual) && q && q.last > 0 ? (indicatedAnnual / (s.ccy === 'GBp' ? q.last / 100 : q.last)) * 100 : NaN;
  // The 12-month dividend and its yield at each month end of the range.
  const chart = useMemo(() => {
    const div: { x: number; y: number; label: string }[] = [];
    const yld: { x: number; y: number; label: string }[] = [];
    // A 12-month sum needs a full year of record before it.
    const start = Math.max(Date.UTC(from, 0, 1), Number.isFinite(since) ? since + 365 * DAY_MS : -Infinity);
    for (let t = Date.UTC(from, 1, 0); t <= today; t = Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 2, 0)) {
      if (t < start) continue;
      // A year's worth of payments (four for a quarterly payer) up to this date, so a payment moved by a few days
      // across the month end does not drop out; a window of 365 days is used when the frequency is not known.
      const before = all.filter((d) => d.ex <= t && Number.isFinite(d.amount) && d.type !== 'Projected' && d.type !== 'Expected');
      const n = perYear[before[0]?.freq ?? ''] ?? 0;
      const yearAgo = Date.UTC(new Date(t).getUTCFullYear() - 1, new Date(t).getUTCMonth(), new Date(t).getUTCDate());
      const window = n ? before.filter((d) => typeName(d) === 'Regular Cash').slice(0, n).filter((d) => d.ex > yearAgo - 75 * DAY_MS) : before.filter((d) => d.ex > yearAgo);
      const special = n ? before.filter((d) => typeName(d) === 'Special Cash' && d.ex > yearAgo) : [];
      const sum = [...window, ...special].reduce((a, d) => a + d.amount, 0);
      const label = fmtDay(t);
      div.push({ x: t, y: sum, label });
      const px = daily.length ? closeAt(daily, t) : NaN;
      if (Number.isFinite(px) && px > 0) yld.push({ x: t, y: (sum / (s.ccy === 'GBp' ? px : px)) * 100, label });
    }
    return { div, yld };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.id, from, all.length, daily.length, today]);
  const years = Array.from({ length: thisYear + 2 - firstYear }, (_, i) => firstYear + i);
  const csv = () => [
    ['Declaration', 'Ex Date', 'Record', 'Payable', 'Curr', 'Declared', 'Type'],
    ...rows.map((r) => (r.kind === 'split' ? ['', fmtDay(r.ex, true), '', '', '', splitRatio(r.x), splitType(r.x)] : [fmtDay(r.d.declared, true), fmtDay(r.d.ex, true), fmtDay(r.d.record, true), fmtDay(r.d.pay, true), ccy, Number.isFinite(r.d.amount) ? r.d.amount : '', typeName(r.d)])),
  ];
  return (
    <div>
      <FnHeader
        code="DIVIDENDS"
        title="Dividend/Split Summary"
        sec={s}
        actions={exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_DVD.csv`, csv)}
        controls={
          <div className="chart-tools">
            <label className="fld">
              Range
              <select className="sel-inp" aria-label="From year" value={from} onChange={(e) => setFromYear(Number(e.target.value))}>
                {years.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
              -
              <select className="sel-inp" aria-label="To year" value={toYear} onChange={(e) => setToYear(Number(e.target.value))}>
                {years.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </label>
            <label className="chk">
              <input type="checkbox" checked={adjusted} onChange={(e) => setAdjusted(e.target.checked)} /> Adjust for Capital Change
            </label>
            <label className="fld">
              Currency
              <select className="sel-inp" aria-label="Currency" value="reported" disabled>
                <option value="reported">As Reported ({ccy})</option>
              </select>
            </label>
            <span className="muted">{sourceLabel(engine.isExternal(s.id) ? 'ok' : status, 'schedule generated; real data needs the desktop app')}</span>
          </div>
        }
      />
      <QuoteStrip sec={s} />
      {all.length === 0 ? (
        <div className="empty">
          {engine.realOnly && !engine.isExternal(s.id)
            ? 'Loading the dividend record from Yahoo Finance…'
            : engine.realOnly
              ? `No cash dividends for ${s.name} in the source's ten-year record.`
              : `${s.name} does not pay a regular cash dividend.`}
        </div>
      ) : null}
      {all.length > 0 && (
        <div className="dvd-top">
          <KV
            items={[
              ['12 Month Yield - Gross', fmtPct(ks.divYld, 2, false)],
              ['Indicated Yield', fmtPct(indicated, 2, false)],
              ['1 Yr Dividend Growth', fmtPct(growth(1), 2)],
              ['3 Yr Dividend Growth', fmtPct(growth(3), 2)],
              ['5 Yr Dividend Growth', fmtPct(growth(5), 2)],
              ['Last Price', `${ccy} ${fmtNum(q?.last ?? NaN, s.dec)}`],
              ['Payment Frequency', last?.freq ?? all[0].freq],
              ['Indicated Annual', Number.isFinite(indicatedAnnual) ? `${fmtAmount(indicatedAnnual)} ${ccy}${Number.isFinite(s.eq!.dps) ? '' : ' (latest × frequency)'}` : '--'],
              ['Payout Ratio', fmtPct(ks.payout, 1, false)],
              ['Next Ex Date', next ? `${fmtDay(next.ex)} (${next.type})` : '--'],
              ['Last Split', sp[0] ? `${fmtDay(sp[0].date)} · ${splitRatio(sp[0])}` : engine.realOnly || engine.isExternal(s.id) ? 'None in the record' : '--'],
            ]}
          />
          <XYChart
            height={190}
            series={[
              { label: '12Mth Div', color: '#ff9e1b', points: chart.div },
              { label: 'Yield', color: '#e8e8e8', points: chart.yld, axis: 'left', width: 1.2 },
            ]}
            xTicks={chart.div.length ? Array.from({ length: new Date(chart.div[chart.div.length - 1].x).getUTCFullYear() - new Date(chart.div[0].x).getUTCFullYear() + 1 }, (_, i) => new Date(chart.div[0].x).getUTCFullYear() + i).filter((y) => Date.UTC(y, 0, 1) >= chart.div[0].x).map((y) => ({ v: Date.UTC(y, 0, 1), label: String(y) })) : undefined}
            xFormat={(v) => fmtDay(v)}
            yFormat={(v) => fmtNum(v, 2)}
            y2Format={(v) => `${fmtNum(v, 1)}%`}
          />
        </div>
      )}
      {all.length > 0 && (
        <div className="chart-tools">
          <label className="fld">
            Type
            <select className="sel-inp" aria-label="Type" value={type} onChange={(e) => setType(e.target.value as TypeFilter)}>
              {TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <span className="muted">{rows.length} events</span>
        </div>
      )}
      {rows.length > 0 && (
        <>
          <table className="tbl zebra">
            <thead>
              <tr>
                <th>Declaration</th>
                <th>Ex Date</th>
                <th>Record</th>
                <th>Payable</th>
                <th>Curr</th>
                <th className="num">Declared</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) =>
                r.kind === 'split' ? (
                  <tr key={`split:${r.ex}`}>
                    <td>
                      <span className="row-no">{numbered[i]})</span>
                    </td>
                    <td className="amber">{fmtDay(r.ex)}</td>
                    <td />
                    <td />
                    <td />
                    <td className="num white" title={`${r.x.numerator} new shares for every ${r.x.denominator}`}>
                      {splitRatio(r.x)}
                    </td>
                    <td className="cyan">{splitType(r.x)}</td>
                  </tr>
                ) : (
                  <tr key={r.ex}>
                    <td>
                      <span className="row-no">{numbered[i]})</span> {Number.isFinite(r.d.declared) ? fmtDay(r.d.declared) : ''}
                    </td>
                    <td className="amber">{fmtDay(r.d.ex)}</td>
                    <td>{Number.isFinite(r.d.record) ? fmtDay(r.d.record) : ''}</td>
                    <td>{Number.isFinite(r.d.pay) ? fmtDay(r.d.pay) : ''}</td>
                    <td className="muted">{ccy}</td>
                    <td className="num white">{fmtAmount(r.d.amount)}</td>
                    <td className={r.d.type === 'Projected' || r.d.type === 'Expected' ? 'yellow' : typeName(r.d) === 'Special Cash' ? 'cyan' : ''}>{typeName(r.d)}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
          <div className="note">
            Dividend growth: the compound annual rate from the dividends that went ex in the 12 months to this date one, three or five years ago to those in the past 12 months; -- unless the record covers that earlier year in full. Yield: the 12-month dividend over the price at each month end.
            {list.some((d) => !Number.isFinite(d.record)) ? ' Declaration, record and payable dates come from Nasdaq\'s dividend record, which covers Nasdaq-listed stocks; the price history gives the ex-date and amount only, so a blank cell is a date no source gives.' : ''}
            {sp.length ? ` Splits as Yahoo's price history records them, on their effective date; it records some spin-offs as fractional splits too. ${adjusted ? 'Dividend amounts are on the current share basis (adjusted for later splits).' : 'Dividend amounts as paid at the time (not adjusted for later splits).'}` : ''}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * A dividend amount with the digits the source gives (0.278, 1.831, 0.52), not padded to look more
 * precise. The source stores some amounts as single-precision floats (29.179998 for 29.18), so six
 * significant digits are kept.
 */
export function fmtAmount(v: number): string {
  if (!Number.isFinite(v)) return '--';
  const x = Number(v.toPrecision(6));
  const dec = Math.min(6, Math.max(2, (String(x).split('.')[1] ?? '').length));
  return fmtNum(x, dec);
}
