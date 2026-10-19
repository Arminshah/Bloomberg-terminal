import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { Chg, Section, KV } from '../components/cells';
import { XYChart } from '../components/chart/XYChart';
import { fmtEarnDate, fmtMln, fmtNum } from '../core/format';
import { earningsHistory, earningsReaction, reportCcy, reportSessionDay, type EarningsEvent, type EarningsReaction } from '../data/fundamentals';
import { engine, useHistoryVersion } from '../data/market';
import type { FnProps } from '../terminal/types';
import { useFundamentals } from '../data/live/yfund';
import { sourceLabel } from '../components/Source';
import { analystsAvailable, analystSymbol, useAnalysts, type AnalystPart, type Estimate } from '../data/live/analysts';
import { EstimatesTable, estimateUnit } from './ANR';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import { finnhubAvailable, finnhubSymbol, useFinnhub, type FinnhubPart, type NextReport } from '../data/live/finnhub';
import { useConsensus } from '../data/live/consensus';
import { desktopData } from '../data/live/yahoo';
import { ExpectationsTable, LatestReport, nextRows } from '../components/EarningsExpectations';
import { fmtDay } from '../core/format';
import { DAY_MS } from '../data/calendar';

/** What each reaction compares, in the column beside it. */
const BASIS: Record<EarningsReaction['basis'], string> = {
  'before-open': 'before the open: report day vs prior close',
  'after-close': 'after the close: next session vs report day',
  unknown: 'time not known: report day vs prior close',
  'no-session': 'no session that day: next session vs prior close',
};

/**
 * Earnings: report dates and the reported figures (diluted EPS and revenue as the statements give them), with
 * the share price's close-to-close reaction to each past report from the daily history. For US-listed stocks in
 * the desktop app, also the last four quarters' EPS against the analysts' estimate and the next report's
 * estimates from Finnhub, and annual estimates from Financial Modeling Prep. Nothing is generated.
 */
export function EE({ sec }: FnProps) {
  const s = sec!;
  const { status, real } = useFundamentals(s);
  // The analysts' expectations against the reports (Yahoo research, Finnhub), desktop app only.
  const consensus = useConsensus(desktopData() ? s : undefined);
  useHistoryVersion();
  const hist = earningsHistory(s);
  const daily = engine.daily(s.id);
  const q = engine.quote(s.id);
  // Today's bar is final once the market has closed; while it trades (or the line is simulated) it is still forming.
  const lastFinal = q?.src === 'CLOSE' || q?.src === 'EOD' ? engine.today : engine.today - 1;
  // A report's day where the shares trade: the exchange's time zone from the quote, else New York for US stocks.
  const tz = q?.tz ?? (s.country === 'US' ? 'America/New_York' : undefined);
  const reaction = (h: EarningsEvent) => (h.dateUnknown || (h.actual == null && h.revAct == null) ? null : earningsReaction(daily, reportSessionDay(h.date, tz), h.timing, lastFinal));
  const done = hist.filter((h) => h.actual != null || h.revAct != null);
  const next = hist.find((h) => h.actual == null && h.revAct == null);
  const ccy = reportCcy(s);
  const panel = usePanelId();
  const fmp = analystsAvailable() && !!analystSymbol(s);
  const est = useAnalysts(fmp ? s : undefined, ['estimates']).estimates as AnalystPart<Estimate[]> | undefined;
  const ahead = (est?.data ?? []).find((e) => Date.parse(`${e.date}T00:00:00Z`) > Date.now());
  const fh = finnhubAvailable() && !!finnhubSymbol(s);
  const fparts = useFinnhub(fh ? s : undefined, ['calendar']);
  const cal = fparts.calendar as FinnhubPart<NextReport | null> | undefined;
  const nextFh = cal?.data ?? null;
  const when = (h: string) => (h === 'bmo' ? 'before the open' : h === 'amc' ? 'after the close' : h === 'dmh' ? 'during the session' : '');
  return (
    <div>
      <FnHeader code="EARNINGS" title="Earnings History" sec={s} sub={<>{ccy} · reported figures · {sourceLabel(status, 'demo figures; real data needs the desktop app')}</>} />
      <QuoteStrip sec={s} />
      {consensus ? (
        <Section title="Latest report against expectations" right="analysts' consensus">
          <LatestReport c={consensus} statements={real?.quarterly ?? []} />
        </Section>
      ) : null}
      <Section title="Next report">
        <KV
          items={[
            ['Period', nextFh ? `Q${nextFh.quarter} ${nextFh.year}` : (next?.period ?? '--')],
            ['Date', nextFh ? `${fmtDay(Date.parse(`${nextFh.date}T00:00:00Z`))}${when(nextFh.hour) ? `, ${when(nextFh.hour)}` : ''} (Finnhub)` : next ? fmtEarnDate(next) : '--'],
            ...(consensus && nextRows(consensus.next).length
              ? nextRows(consensus.next)
              : nextFh
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
          <div className="note">Annual provider consensus ({estimateUnit(s, est)}); analysts&apos; estimates, not a forecast by this app. Quarterly estimates against the reports are under Expected and reported, by quarter.</div>
        </Section>
      ) : null}
      {consensus ? (
        <Section title="Expected and reported, by quarter" right={consensus.problems.length ? consensus.problems.join(' ') : undefined}>
          <ExpectationsTable c={consensus} />
          <div className="note">
            Expected: the analysts&apos; average estimate before the report. EPS on the analysts&apos; basis (usually adjusted), as Yahoo Finance or Finnhub reports it, which can differ from the diluted EPS in the statements
            below. Yahoo drops a quarter&apos;s revenue estimate once it is reported: the app keeps the last one it read before the report, and Finnhub (FINNHUB_API_KEY) gives the past year&apos;s.
          </div>
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
              <th className="num" title="Close-to-close change in the share price around the report, from the daily history">
                Price reaction
              </th>
              <th className="hide-m">Reaction measured</th>
            </tr>
          </thead>
          <tbody>
            {[...hist].reverse().map((h) => {
              const r = reaction(h);
              return (
                <tr key={`${h.period}:${h.date}`}>
                  <td className="amber">{h.period}</td>
                  <td>{fmtEarnDate(h, false)}</td>
                  <td className="muted">{h.timing}</td>
                  <td className="num white">{h.actual != null ? fmtNum(h.actual, 2) : h.revAct != null ? '--' : 'Pending'}</td>
                  <td className="num">{h.revAct != null ? fmtMln(h.revAct) : '--'}</td>
                  <td className="num" title={r && Number.isFinite(r.pct) ? `Close of ${fmtDay(r.to * DAY_MS)} against close of ${fmtDay(r.from * DAY_MS)}` : undefined}>
                    {r ? <Chg v={r.pct} pct dec={1} /> : '--'}
                  </td>
                  <td className="muted hide-m">{r ? BASIS[r.basis] : h.dateUnknown ? 'report date not given' : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="note">
          Reported figures from the company&apos;s statements. Price reaction: the share price&apos;s close-to-close change around each past report, from the daily closes (split-adjusted, dividends not added back). A
          report before the open is measured on the report day against the previous close, one after the close on the next session against the report day&apos;s close; where the time is not known, the report day
          against the previous close is used and the row says so. -- until both closes are final.
        </div>
      </Section>
    </div>
  );
}
