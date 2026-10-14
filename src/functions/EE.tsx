import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { Section, KV } from '../components/cells';
import { XYChart } from '../components/chart/XYChart';
import { fmtEarnDate, fmtMln, fmtNum } from '../core/format';
import { earningsHistory, reportCcy } from '../data/fundamentals';
import type { FnProps } from '../terminal/types';
import { useFundamentals } from '../data/live/yfund';
import { sourceLabel } from '../components/Source';
import { analystsAvailable, analystSymbol, useAnalysts, type AnalystPart, type Estimate } from '../data/live/analysts';
import { EstimatesTable, estimateUnit } from './ANR';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';

/**
 * Earnings: report dates and the reported figures (diluted EPS and revenue as the statements give them), with
 * analysts' annual estimates from Financial Modeling Prep for US-listed stocks in the desktop app. No quarterly
 * consensus or surprises: FMP's free plan is asked for annual estimates only, and none is generated.
 */
export function EE({ sec }: FnProps) {
  const s = sec!;
  const { status } = useFundamentals(s);
  const hist = earningsHistory(s);
  const done = hist.filter((h) => h.actual != null || h.revAct != null);
  const next = hist.find((h) => h.actual == null && h.revAct == null);
  const ccy = reportCcy(s);
  const panel = usePanelId();
  const fmp = analystsAvailable() && !!analystSymbol(s);
  const est = useAnalysts(fmp ? s : undefined, ['estimates']).estimates as AnalystPart<Estimate[]> | undefined;
  const ahead = (est?.data ?? []).find((e) => Date.parse(`${e.date}T00:00:00Z`) > Date.now());
  return (
    <div>
      <FnHeader code="EARNINGS" title="Earnings History" sec={s} sub={<>{ccy} · reported figures · {sourceLabel(status, 'demo figures; real data needs the desktop app')}</>} />
      <QuoteStrip sec={s} />
      <Section title="Next report">
        <KV
          items={[
            ['Period', next?.period ?? '--'],
            ['Date', next ? fmtEarnDate(next) : '--'],
            [
              'EPS estimate, fiscal year',
              !fmp
                ? 'US-listed stocks in the desktop app, with FMP_API_KEY'
                : ahead
                  ? `${fmtNum(ahead.epsAvg, 2)} for the year to ${fmtEarnDate({ date: Date.parse(`${ahead.date}T00:00:00Z`) }, false)} (${fmtNum(ahead.epsLow, 2)} - ${fmtNum(ahead.epsHigh, 2)}${Number.isFinite(ahead.analystsEps) ? `, ${ahead.analystsEps} analysts` : ''})`
                  : (est?.message ?? (est?.state === 'ok' ? 'None from FMP' : 'Loading…')),
            ],
          ]}
        />
      </Section>
      {fmp ? (
        <Section
          title="Analyst estimates, by fiscal year (Financial Modeling Prep)"
          right={
            <button type="button" className="act" onClick={() => execute(panel, `${s.id} ANALYSTS`)}>
              ANALYSTS ›
            </button>
          }
        >
          <EstimatesTable part={est} rows={4} />
          <div className="note">Annual consensus as FMP gathers it ({estimateUnit(s)}); analysts&apos; estimates, not a forecast by this app. Quarterly estimates and surprises are not shown.</div>
        </Section>
      ) : null}
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
        <div className="note">Reported figures from the company&apos;s statements.</div>
      </Section>
    </div>
  );
}
