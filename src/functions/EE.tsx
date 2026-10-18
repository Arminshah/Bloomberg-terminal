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
import { finnhubAvailable, finnhubSymbol, useFinnhub, type EpsSurprise, type FinnhubPart, type NextReport } from '../data/live/finnhub';
import { fmtDay } from '../core/format';

/**
 * Earnings: report dates and the reported figures (diluted EPS and revenue as the statements give them). For
 * US-listed stocks in the desktop app, also the last four quarters' EPS against the analysts' estimate and the
 * next report's estimates from Finnhub, and annual estimates from Financial Modeling Prep. Nothing is generated.
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
  const fh = finnhubAvailable() && !!finnhubSymbol(s);
  const fparts = useFinnhub(fh ? s : undefined, ['earnings', 'calendar']);
  const surprises = fparts.earnings as FinnhubPart<EpsSurprise[]> | undefined;
  const cal = fparts.calendar as FinnhubPart<NextReport | null> | undefined;
  const nextFh = cal?.data ?? null;
  const when = (h: string) => (h === 'bmo' ? 'before the open' : h === 'amc' ? 'after the close' : h === 'dmh' ? 'during the session' : '');
  return (
    <div>
      <FnHeader code="EARNINGS" title="Earnings History" sec={s} sub={<>{ccy} · reported figures · {sourceLabel(status, 'demo figures; real data needs the desktop app')}</>} />
      <QuoteStrip sec={s} />
      <Section title="Next report">
        <KV
          items={[
            ['Period', nextFh ? `Q${nextFh.quarter} ${nextFh.year}` : (next?.period ?? '--')],
            ['Date', nextFh ? `${fmtDay(Date.parse(`${nextFh.date}T00:00:00Z`))}${when(nextFh.hour) ? `, ${when(nextFh.hour)}` : ''} (Finnhub)` : next ? fmtEarnDate(next) : '--'],
            ...(nextFh
              ? ([
                  ['EPS estimate, quarter', Number.isFinite(nextFh.epsEstimate) ? `${fmtNum(nextFh.epsEstimate, 2)} (Finnhub)` : '--'],
                  ['Revenue estimate, quarter', Number.isFinite(nextFh.revenueEstimate) ? `${fmtMln(nextFh.revenueEstimate / 1e6)} (Finnhub)` : '--'],
                ] as [string, string][])
              : []),
            [
              'EPS estimate, fiscal year',
              !fmp
                ? 'US-listed stocks in the desktop app with enabled research sources'
                : ahead
                  ? `${fmtNum(ahead.epsAvg, 2)} for the year to ${fmtEarnDate({ date: Date.parse(`${ahead.date}T00:00:00Z`) }, false)} (${fmtNum(ahead.epsLow, 2)} - ${fmtNum(ahead.epsHigh, 2)}${Number.isFinite(ahead.analystsEps) ? `, ${ahead.analystsEps} analysts` : ''}) · ${est?.source ?? 'FMP'}`
                  : est && est.state !== 'loading' ? 'No structured annual estimate; see ANALYSTS for source availability and company research.' : 'Loading…',
            ],
          ]}
        />
      </Section>
      {fmp ? (
        <Section
          title={`Analyst estimates, by fiscal year${est?.source ? ` (${est.source})` : ''}`}
          right={
            <button type="button" className="act" onClick={() => execute(panel, `${s.id} ANALYSTS`)}>
              ANALYSTS ›
            </button>
          }
        >
          <EstimatesTable part={est} rows={4} />
          <div className="note">Annual provider consensus ({estimateUnit(s, est)}); analysts&apos; estimates, not a forecast by this app. Quarterly estimates and surprises come from Finnhub.</div>
        </Section>
      ) : null}
      {fh ? (
        <Section title="EPS against the analysts' estimate (Finnhub)" right="last four quarters">
          {!surprises || surprises.state === 'loading' ? (
            <div className="empty">Loading from Finnhub…</div>
          ) : !surprises.data?.length ? (
            <div className="empty">{surprises.message ?? 'No quarters from Finnhub.'}</div>
          ) : (
            <table className="tbl zebra">
              <thead>
                <tr>
                  <th>Quarter</th>
                  <th>Period end</th>
                  <th className="num">Actual EPS</th>
                  <th className="num">Estimate</th>
                  <th className="num">Surprise</th>
                  <th className="num">Surprise %</th>
                </tr>
              </thead>
              <tbody>
                {surprises.data.slice(0, 4).map((q) => (
                  <tr key={q.period}>
                    <td className="amber">{`Q${q.quarter} ${q.year}`}</td>
                    <td>{fmtDay(Date.parse(`${q.period}T00:00:00Z`))}</td>
                    <td className="num white">{fmtNum(q.actual, 2)}</td>
                    <td className="num">{fmtNum(q.estimate, 2)}</td>
                    <td className={`num ${q.surprise > 0 ? 'up' : q.surprise < 0 ? 'dn' : ''}`}>{Number.isFinite(q.surprise) ? `${q.surprise > 0 ? '+' : ''}${fmtNum(q.surprise, 2)}` : '--'}</td>
                    <td className={`num ${q.surprisePct > 0 ? 'up' : q.surprisePct < 0 ? 'dn' : ''}`}>{Number.isFinite(q.surprisePct) ? `${q.surprisePct > 0 ? '+' : ''}${fmtNum(q.surprisePct, 1)}%` : '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="note">Quarters as Finnhub labels them; EPS on Finnhub&apos;s basis, which can differ from the diluted EPS in the statements below.</div>
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
