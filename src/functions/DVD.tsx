import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { Section, KV } from '../components/cells';
import { XYChart } from '../components/chart/XYChart';
import { exportActions } from '../components/ExportActions';
import { fmtDay, fmtNum, fmtPct } from '../core/format';
import { engine } from '../data/market';
import { dividends, keyStats } from '../data/fundamentals';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import { useFundamentals } from '../data/live/yfund';
import { sourceLabel } from '../components/Source';

export function DVD({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const { status } = useFundamentals(s);
  const list = dividends(s);
  const ks = keyStats(s);
  const ccy = s.ccy === 'GBp' ? 'GBp' : s.ccy;
  const byYear = new Map<number, number>();
  for (const d of list) {
    if (d.type === 'Projected') continue;
    const y = new Date(d.ex).getUTCFullYear();
    byYear.set(y, (byYear.get(y) ?? 0) + d.amount);
  }
  const years = [...byYear.entries()].sort((a, b) => a[0] - b[0]);
  const csv = () => [['Declared', 'Ex-date', 'Record', 'Payable', 'Amount', 'Frequency', 'Type'], ...list.map((d) => [fmtDay(d.declared, true), fmtDay(d.ex, true), fmtDay(d.record, true), fmtDay(d.pay, true), d.amount, d.freq, d.type])];
  return (
    <div>
      <FnHeader code="DVD" title="Dividend & Split History" sec={s} sub={<>{ccy} per share · {sourceLabel(engine.isExternal(s.id) ? 'ok' : status, 'schedule generated; real data needs the desktop app')}</>} actions={exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_DVD.csv`, csv)} />
      <QuoteStrip sec={s} />
      {list.length === 0 ? (
        <div className="empty">{s.name} does not pay a regular cash dividend.</div>
      ) : (
        <>
          <div className="cols">
            <Section title="Summary">
              <KV
                items={[
                  ['Indicated annual', `${fmtNum(s.eq!.dps, 2)} ${ccy}`],
                  ['Dividend yield', fmtPct(ks.divYld, 2, false)],
                  ['Payout ratio', fmtPct(ks.payout, 1, false)],
                  ['Frequency', list[0].freq],
                  ['Next ex-date', `${fmtDay(list[0].ex)} (${list[0].type})`],
                  ['Last price', fmtNum(engine.quote(s.id)!.last, s.dec)],
                ]}
              />
            </Section>
            <Section title="Dividends per share by year">
              <XYChart height={170} series={[{ label: 'DPS', color: '#ff9e1b', kind: 'bar', points: years.map(([y, v]) => ({ x: y, y: v, label: String(y) })) }]} xTicks={years.map(([y]) => ({ v: y, label: String(y) }))} yZero yFormat={(v) => fmtNum(v, 2)} />
            </Section>
          </div>
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
              {list.map((d) => (
                <tr key={d.ex}>
                  <td>{Number.isFinite(d.declared) ? fmtDay(d.declared) : '--'}</td>
                  <td className="amber">{fmtDay(d.ex)}</td>
                  <td>{fmtDay(d.record)}</td>
                  <td>{fmtDay(d.pay)}</td>
                  <td className="num white">{fmtNum(d.amount, 4)}</td>
                  <td>{d.freq}</td>
                  <td className={d.type === 'Projected' ? 'yellow' : ''}>{d.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
