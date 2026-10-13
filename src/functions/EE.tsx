import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { Section, KV } from '../components/cells';
import { XYChart } from '../components/chart/XYChart';
import { fmtEarnDate, fmtMln, fmtNum } from '../core/format';
import { earningsHistory, reportCcy } from '../data/fundamentals';
import type { FnProps } from '../terminal/types';
import { useFundamentals } from '../data/live/yfund';
import { sourceLabel } from '../components/Source';

/**
 * Earnings: report dates and the reported figures (diluted EPS and revenue as
 * the statements give them). No estimates, consensus or surprises: there is no
 * permitted source for analyst data, and none is generated.
 */
export function EE({ sec }: FnProps) {
  const s = sec!;
  const { status } = useFundamentals(s);
  const hist = earningsHistory(s);
  const done = hist.filter((h) => h.actual != null || h.revAct != null);
  const next = hist.find((h) => h.actual == null && h.revAct == null);
  const ccy = reportCcy(s);
  return (
    <div>
      <FnHeader code="EARNINGS" title="Earnings History" sec={s} sub={<>{ccy} · reported figures · {sourceLabel(status, 'demo figures; real data needs the desktop app')}</>} />
      <QuoteStrip sec={s} />
      <Section title="Next report">
        <KV
          items={[
            ['Period', next?.period ?? '--'],
            ['Date', next ? fmtEarnDate(next) : '--'],
            ['Estimates', 'Not connected: no permitted source for analyst estimates'],
          ]}
        />
      </Section>
      <Section title="Reported diluted EPS by quarter">
        <XYChart
          height={190}
          series={[{ label: 'Diluted EPS', color: '#ff9e1b', kind: 'bar', points: done.filter((h) => h.actual != null).map((h) => ({ x: hist.indexOf(h), y: h.actual!, label: h.period })) }]}
          xTicks={hist.map((h, i) => ({ v: i, label: h.period }))}
          yZero
          yFormat={(v) => fmtNum(v, 2)}
        />
      </Section>
      <Section title="Earnings history" right={hist.some((h) => h.approx) ? '~ date the source marks as expected' : hist.some((h) => h.dateUnknown) ? '-- report date not given by the source' : undefined}>
        <table className="tbl zebra">
          <thead>
            <tr>
              <th>Period</th>
              <th>Date</th>
              <th>Time</th>
              <th className="num" title="Diluted EPS as reported in the statements">
                Diluted EPS
              </th>
              <th className="num">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {[...hist].reverse().map((h) => (
              <tr key={`${h.period}:${h.date}`}>
                <td className="amber">{h.period}</td>
                <td>{fmtEarnDate(h, false)}</td>
                <td className="muted">{h.timing}</td>
                <td className="num white">{h.actual != null ? fmtNum(h.actual, 2) : h.revAct != null ? '--' : 'Pending'}</td>
                <td className="num">{h.revAct != null ? fmtMln(h.revAct) : '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="note">Reported figures from the company's statements. Analyst estimates and surprises are not shown: no permitted source is connected.</div>
      </Section>
    </div>
  );
}
