import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { Section, Chg, KV } from '../components/cells';
import { XYChart } from '../components/chart/XYChart';
import { fmtEarnDate, fmtMln, fmtNum } from '../core/format';
import { earningsHistory, estimates, reportCcy } from '../data/fundamentals';
import type { FnProps } from '../terminal/types';
import { useFundamentals } from '../data/live/yfund';
import { sourceLabel } from '../components/Source';

export function EE({ sec }: FnProps) {
  const s = sec!;
  const { status } = useFundamentals(s);
  const hist = earningsHistory(s);
  const est = estimates(s);
  const done = hist.filter((h) => h.actual != null);
  const next = hist.find((h) => h.actual == null);
  const beats = done.filter((h) => (h.surprise ?? 0) > 0).length;
  const ccy = reportCcy(s);
  return (
    <div>
      <FnHeader code="EE" title="Earnings & Estimates" sec={s} sub={<>{ccy} · {sourceLabel(status, 'estimates generated; real data needs the desktop app')}</>} />
      <QuoteStrip sec={s} />
      <div className="cols">
        <Section title="Next report">
          <KV
            items={[
              ['Period', next?.period ?? '--'],
              ['Expected date', next ? fmtEarnDate(next) : '--'],
              ['EPS estimate', next ? fmtNum(next.estimate, 2) : '--'],
              ['Revenue estimate', next ? fmtMln(next.revEst) : '--'],
              [`Beat rate (${done.length}Q)`, `${beats} of ${done.length}`],
              ['Avg surprise', `${fmtNum(done.reduce((a, h) => a + (h.surprise ?? 0), 0) / Math.max(1, done.length), 1)}%`],
            ]}
          />
        </Section>
        <Section title="Annual consensus">
          <table className="tbl">
            <thead>
              <tr>
                <th>Period</th>
                <th className="num">EPS</th>
                <th className="num">Range</th>
                <th className="num">Revenue</th>
                <th className="num">EPS growth</th>
              </tr>
            </thead>
            <tbody>
              {[est.fy1, est.fy2].map((e) => (
                <tr key={e.label}>
                  <td className="amber">{e.label}</td>
                  <td className="num white">{fmtNum(e.eps, 2)}</td>
                  <td className="num">
                    {fmtNum(e.epsLo, 2)} - {fmtNum(e.epsHi, 2)}
                  </td>
                  <td className="num">{fmtMln(e.rev)}</td>
                  <td className="num">
                    <Chg v={e.growth} pct dec={1} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
      <Section title="EPS actual vs estimate">
        <XYChart
          height={190}
          series={[
            { label: 'Estimate', color: '#5c5c5c', kind: 'bar', points: hist.map((h, i) => ({ x: i, y: h.estimate, label: h.period })) },
            { label: 'Actual', color: '#ff9e1b', kind: 'bar', points: done.map((h) => ({ x: hist.indexOf(h), y: h.actual!, label: h.period })) },
          ]}
          xTicks={hist.map((h, i) => ({ v: i, label: h.period }))}
          yZero
          yFormat={(v) => fmtNum(v, 2)}
        />
      </Section>
      <Section title="Earnings history" right={hist.some((h) => h.approx) ? '~ date the source marks as estimated' : hist.some((h) => h.dateUnknown) ? '-- report date not given by the source' : undefined}>
        <table className="tbl zebra">
          <thead>
            <tr>
              <th>Period</th>
              <th>Date</th>
              <th>Time</th>
              <th className="num">EPS est</th>
              <th className="num">EPS actual</th>
              <th className="num">Surprise</th>
              <th className="num hide-m">Rev est</th>
              <th className="num hide-m">Rev actual</th>
            </tr>
          </thead>
          <tbody>
            {[...hist].reverse().map((h) => (
              <tr key={`${h.period}:${h.date}`}>
                <td className="amber">{h.period}</td>
                <td>{fmtEarnDate(h, false)}</td>
                <td className="muted">{h.timing}</td>
                <td className="num">{fmtNum(h.estimate, 2)}</td>
                <td className="num white">{h.actual != null ? fmtNum(h.actual, 2) : 'Pending'}</td>
                <td className="num">{h.surprise != null ? <Chg v={h.surprise} pct dec={1} /> : '--'}</td>
                <td className="num hide-m">{fmtMln(h.revEst)}</td>
                <td className="num hide-m">{h.revAct != null ? fmtMln(h.revAct) : '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
