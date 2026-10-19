import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { Section, KV } from '../components/cells';
import { XYChart } from '../components/chart/XYChart';
import { exportActions } from '../components/ExportActions';
import { fmtDay, fmtNum, fmtPct } from '../core/format';
import { DAY_MS } from '../data/calendar';
import { engine } from '../data/market';
import { dividendGrowth, dividends, keyStats, splitRatio, splits, splitType, type Dividend, type StockSplit } from '../data/fundamentals';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import { useFundamentals } from '../data/live/yfund';
import { sourceLabel } from '../components/Source';

/** One line of the history: a cash dividend, or a split the record dates the same way (Bloomberg lists both). */
type Row = { kind: 'dividend'; ex: number; d: Dividend } | { kind: 'split'; ex: number; x: StockSplit };

export function DVD({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const { status } = useFundamentals(s);
  const list = dividends(s);
  const sp = splits(s);
  const rows: Row[] = [...list.map((d): Row => ({ kind: 'dividend', ex: d.ex, d })), ...sp.map((x): Row => ({ kind: 'split', ex: x.date, x }))].sort((a, b) => b.ex - a.ex);
  const ks = keyStats(s);
  const daily = engine.daily(s.id);
  const ccy = s.ccy === 'GBp' ? 'GBp' : s.ccy;
  const byYear = new Map<number, number>();
  for (const d of list) {
    if (d.type === 'Projected' || d.type === 'Expected' || !Number.isFinite(d.amount)) continue;
    const y = new Date(d.ex).getUTCFullYear();
    byYear.set(y, (byYear.get(y) ?? 0) + d.amount);
  }
  const years = [...byYear.entries()].sort((a, b) => a[0] - b[0]);
  // An ex-date today is the current one; "next" is strictly after today.
  const today = engine.today * DAY_MS;
  const next = list.filter((d) => d.ex > today).sort((a, b) => a.ex - b.ex)[0];
  const last = list.find((d) => d.ex <= today);
  // The record comes with the price history, so it reaches back as far as the first daily bar.
  const growth5 = dividendGrowth(list.filter((d) => d.ex <= today), today, daily.length ? daily.t[0] : NaN);
  const csv = () => [
    ['Declared', 'Ex-date', 'Record', 'Payable', 'Amount', 'Frequency', 'Type'],
    ...rows.map((r) => (r.kind === 'split' ? ['', fmtDay(r.ex, true), '', '', splitRatio(r.x), '', splitType(r.x)] : [fmtDay(r.d.declared, true), fmtDay(r.d.ex, true), fmtDay(r.d.record, true), fmtDay(r.d.pay, true), Number.isFinite(r.d.amount) ? r.d.amount : '', r.d.freq, r.d.type])),
  ];
  return (
    <div>
      <FnHeader code="DIVIDENDS" title="Dividend History" sec={s} sub={<>{ccy} per share · dividends and splits · {sourceLabel(engine.isExternal(s.id) ? 'ok' : status, 'schedule generated; real data needs the desktop app')}</>} actions={exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_DVD.csv`, csv)} />
      <QuoteStrip sec={s} />
      {list.length === 0 ? (
        <div className="empty">
          {engine.realOnly && !engine.isExternal(s.id)
            ? 'Loading the dividend record from Yahoo Finance…'
            : engine.realOnly
              ? `No cash dividends for ${s.name} in the source's ten-year record.`
              : `${s.name} does not pay a regular cash dividend.`}
        </div>
      ) : null}
      {list.length > 0 && (
        <div className="cols">
          <Section title="Summary">
            <KV
              items={[
                ['Indicated annual', Number.isFinite(s.eq!.dps) ? `${fmtNum(s.eq!.dps, 2)} ${ccy}` : '--'],
                ['Dividend yield 12M', fmtPct(ks.divYld, 2, false)],
                ['Payout ratio', fmtPct(ks.payout, 1, false)],
                ['Frequency', list[0].freq],
                ['Last ex-date', last ? `${fmtDay(last.ex)} · ${fmtAmount(last.amount)} ${ccy}` : '--'],
                ['Next ex-date', next ? `${fmtDay(next.ex)} (${next.type})` : '--'],
                ['Dividend growth 5Y (12M, annual rate)', fmtPct(growth5, 1)],
                ['Last split', sp[0] ? `${fmtDay(sp[0].date)} · ${splitRatio(sp[0])}` : engine.realOnly || engine.isExternal(s.id) ? 'None in the record' : '--'],
                ['Last price', fmtNum(engine.quote(s.id)!.last, s.dec)],
              ]}
            />
          </Section>
          <Section title="Dividends per share by year">
            <XYChart height={170} series={[{ label: 'DPS', color: '#ff9e1b', kind: 'bar', points: years.map(([y, v]) => ({ x: y, y: v, label: String(y) })) }]} xTicks={years.map(([y]) => ({ v: y, label: String(y) }))} yZero yFormat={(v) => fmtNum(v, 2)} />
          </Section>
        </div>
      )}
      {rows.length > 0 && (
        <>
          <table className="tbl zebra">
            <thead>
              <tr>
                <th>Declared</th>
                <th>Ex-date</th>
                <th>Record</th>
                <th>Payable</th>
                <th className="num">Amount</th>
                <th>Frequency</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) =>
                r.kind === 'split' ? (
                  <tr key={`split:${r.ex}`}>
                    <td>--</td>
                    <td className="amber">{fmtDay(r.ex)}</td>
                    <td>--</td>
                    <td>--</td>
                    <td className="num white" title={`${r.x.numerator} new shares for every ${r.x.denominator}`}>
                      {splitRatio(r.x)}
                    </td>
                    <td>--</td>
                    <td className="cyan">{splitType(r.x)}</td>
                  </tr>
                ) : (
                  <tr key={r.ex}>
                    <td>{Number.isFinite(r.d.declared) ? fmtDay(r.d.declared) : '--'}</td>
                    <td className="amber">{fmtDay(r.d.ex)}</td>
                    <td>{fmtDay(r.d.record)}</td>
                    <td>{fmtDay(r.d.pay)}</td>
                    <td className="num white">{fmtAmount(r.d.amount)}</td>
                    <td>{r.d.freq}</td>
                    <td className={r.d.type === 'Projected' || r.d.type === 'Expected' ? 'yellow' : ''}>{r.d.type}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
          <div className="note">
            Dividend growth 5Y: the compound annual rate from the dividends that went ex in the 12 months to this date five years ago to those in the past 12 months; -- unless the record covers that earlier year in full, with dividends paid before it began and in both years.
            {sp.length ? ' Splits as Yahoo\'s price history records them, on their effective date; it records some spin-offs as fractional splits too. Dividend amounts are on the current share basis (adjusted for later splits).' : ''}
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
