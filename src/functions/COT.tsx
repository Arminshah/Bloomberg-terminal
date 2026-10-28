import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Section } from '../components/cells';
import { XYChart } from '../components/chart/XYChart';
import { RealBadge } from '../components/Source';
import { fmtDay, fmtNum } from '../core/format';
import { COMMODITY_CODES, COT_MARKETS, cotAvailable, cotRows, FINANCIAL_CODES, GROUP_LABEL, MAIN_GROUP, parseCot, reportLate, SECOND_GROUP, useCot, type CotMode, type CotReport, type CotRow } from '../data/live/cftc';
import { engine } from '../data/market';
import type { FnProps } from '../terminal/types';

/**
 * COT, the CFTC's Commitments of Traders: each market's positions by category of reportable trader, held on a
 * Tuesday and published by the CFTC the following Friday. Disaggregated for commodities (managed money first),
 * Traders in Financial Futures for financial futures (leveraged funds first), Legacy for both (non-commercial
 * first); futures only or futures and options combined. Delayed and aggregated: it shows no single trader and no
 * day after the Tuesday. Desktop app; the CFTC's public reporting platform needs no key.
 */

const REPORTS: { id: CotReport; label: string; about: string }[] = [
  { id: 'disaggregated', label: '1) Commodities (Disaggregated)', about: 'Producers and merchants, swap dealers, managed money and other reportable traders' },
  { id: 'tff', label: '2) Financial (TFF)', about: 'Dealers, asset managers, leveraged funds and other reportable traders' },
  { id: 'legacy', label: '3) Legacy (all)', about: 'Non-commercial and commercial traders' },
];

const day = (iso: string) => (iso ? fmtDay(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)) : '');
const signed = (v: number) => (Number.isFinite(v) ? `${v > 0 ? '+' : ''}${fmtNum(v, 0)}` : '');
const cls = (v: number) => (v > 0 ? 'up' : v < 0 ? 'dn' : '');
/** The CFTC platform's publication time, in UTC. */
const stamp = (iso: string) => (iso ? `${day(iso)} ${iso.slice(11, 16)} UTC` : '--');

function History({ report, mode, code }: { report: CotReport; mode: CotMode; code: string }) {
  const part = useCot('history', report, mode, code);
  if (!part || part.state === 'loading') return <div className="empty">Loading two years of positions…</div>;
  if (part.state !== 'ok' || !part.text) return <div className="empty amber">{part.message ?? 'No history from the CFTC.'}</div>;
  const parsed = parseCot(part.text, report);
  if ('error' in parsed) return <div className="empty amber">{parsed.error}</div>;
  const weeks = [...(parsed.get(code) ?? [])].reverse();
  if (!weeks.length) return <div className="empty amber">The CFTC has no rows for this market in the report chosen.</div>;
  const series = [MAIN_GROUP[report], SECOND_GROUP[report]].map((key, i) => ({
    label: `${GROUP_LABEL[key]} net`,
    color: i === 0 ? '#ffb547' : '#45d3e6',
    points: weeks.map((w) => ({ x: Date.parse(`${w.positionDate}T00:00:00Z`), y: w.groups.find((g) => g.key === key)!.net })),
  }));
  const last = weeks[weeks.length - 1];
  return (
    <>
      <XYChart height={200} series={series} xFormat={(v) => fmtDay(v)} yFormat={(v) => fmtNum(v, 0)} refLines={[{ y: 0, color: '#555' }]} />
      <table className="tbl" data-testid="cot-groups">
        <thead>
          <tr>
            <th>{last.market}</th>
            <th className="num">Long</th>
            <th className="num">Short</th>
            <th className="num">Net</th>
          </tr>
        </thead>
        <tbody>
          {last.groups.map((g) => (
            <tr key={g.key}>
              <td>{g.label}</td>
              <td className="num">{fmtNum(g.long, 0)}</td>
              <td className="num">{fmtNum(g.short, 0)}</td>
              <td className={`num ${cls(g.net)}`}>{signed(g.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note">Contracts, each report from {day(weeks[0].positionDate)} to {day(last.positionDate)}; spreading positions are left out of the nets. Open interest {fmtNum(last.openInterest, 0)} on {day(last.positionDate)}.</div>
    </>
  );
}

export function COT({ sec }: FnProps) {
  const fromSec = sec ? [...COT_MARKETS].find(([, id]) => id === sec.id)?.[0] : undefined;
  const [report, setReport] = useState<CotReport>(fromSec && FINANCIAL_CODES.includes(fromSec) ? 'tff' : 'disaggregated');
  const [mode, setMode] = useState<CotMode>('futures');
  const [chosen, setChosen] = useState<string | undefined>(fromSec);
  const part = useCot('latest', report, mode);
  const header = <FnHeader code="COT" title="Commitments of Traders" sub={cotAvailable() ? <><RealBadge /> CFTC: delayed, aggregated positions of reportable traders</> : "The CFTC's reports are read by the desktop app"} />;
  if (!cotAvailable()) {
    return (
      <div>
        {header}
        <div className="empty">The Commitments of Traders are the CFTC&apos;s, read by the desktop app from its public reporting platform. The browser demo has none, and none are generated.</div>
      </div>
    );
  }
  const codes = report === 'disaggregated' ? COMMODITY_CODES : report === 'tff' ? FINANCIAL_CODES : [...COMMODITY_CODES, ...FINANCIAL_CODES];
  const parsed = part?.state === 'ok' && part.text ? parseCot(part.text, report) : null;
  const rows: CotRow[] = parsed && !('error' in parsed) ? cotRows(parsed, report, codes) : [];
  const pick = chosen && rows.some((r) => r.pos.code === chosen) ? chosen : rows[0]?.pos.code;
  const latest = rows.reduce((m, r) => (r.pos.positionDate > m ? r.pos.positionDate : m), '');
  const published = rows.filter((r) => r.pos.positionDate === latest).reduce((m, r) => (r.pos.published > m ? r.pos.published : m), '');
  const main = GROUP_LABEL[MAIN_GROUP[report]];
  const second = GROUP_LABEL[SECOND_GROUP[report]];
  return (
    <div>
      {header}
      <nav className="tabs" aria-label="COT report">
        {REPORTS.map((r) => (
          <button key={r.id} type="button" className={`tab${report === r.id ? ' on' : ''}`} title={r.about} onClick={() => setReport(r.id)}>
            {r.label}
          </button>
        ))}
        <span className="muted" style={{ margin: '0 8px' }}>|</span>
        {(['futures', 'combined'] as CotMode[]).map((m) => (
          <button key={m} type="button" className={`tab${mode === m ? ' on' : ''}`} onClick={() => setMode(m)}>
            {m === 'futures' ? 'Futures only' : 'Futures and options'}
          </button>
        ))}
      </nav>
      {!part || part.state === 'loading' ? (
        <div className="empty">Loading the CFTC&apos;s report…</div>
      ) : part.state !== 'ok' ? (
        <div className="empty amber">{part.message}</div>
      ) : parsed && 'error' in parsed ? (
        <div className="empty amber">{parsed.error}</div>
      ) : (
        <>
          <table className="tbl" data-testid="cot-table">
            <thead>
              <tr>
                <th>Market</th>
                <th className="num">Positions on</th>
                <th className="num">Open interest</th>
                <th className="num">{main} net</th>
                <th className="num" title="Against the previous report (usually the Tuesday before)">Change</th>
                <th className="num hide-m">Net % of OI</th>
                <th className="num hide-m">{second} net</th>
                <th className="num hide-m">Published (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.pos.code} className={`click${r.pos.code === pick ? ' sel' : ''}`} onClick={() => setChosen(r.pos.code)}>
                  <td title={`CFTC code ${r.pos.code}`}>
                    <span className="white">{engine.get(COT_MARKETS.get(r.pos.code) ?? '')?.ticker ?? ''}</span> {r.pos.market}
                  </td>
                  <td className="num">{day(r.pos.positionDate)}</td>
                  <td className="num">{fmtNum(r.pos.openInterest, 0)}</td>
                  <td className={`num white ${cls(r.main.net)}`}>{signed(r.main.net)}</td>
                  <td className={`num ${cls(r.change)}`} title={r.priorDate ? `Since ${day(r.priorDate)}` : 'No report within the ten days before'}>{signed(r.change)}</td>
                  <td className="num hide-m">{Number.isFinite(r.netPctOi) ? `${fmtNum(r.netPctOi, 1)}%` : ''}</td>
                  <td className={`num hide-m ${cls(r.second.net)}`}>{signed(r.second.net)}</td>
                  <td className="num hide-m muted">{stamp(r.pos.published)}{r.pos.updated ? ' (revised)' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {latest && reportLate(latest, Date.now()) ? (
            <div className="empty amber" data-testid="cot-late">
              The newest report the CFTC has published holds positions of {day(latest)}: later ones are late. The CFTC held its reports back during the federal shutdown of October 2025 and published them up to 50 days late.
            </div>
          ) : null}
          <div className="note">
            Positions held at the close on {latest && new Date(`${latest}T00:00:00Z`).getUTCDay() !== 2 ? '' : 'Tuesday '}{day(latest)}, published by the CFTC {published ? `on ${stamp(published)}` : ''}: delayed and aggregated, by category of reportable trader, in contracts. Net is long minus short, spreading left out; the change is against the previous report (usually the Tuesday before; a holiday moves the date). {mode === 'futures' ? 'Futures only.' : 'Futures and options combined, options as futures equivalents.'} Source: CFTC Commitments of Traders ({REPORTS.find((r) => r.id === report)!.label.replace(/^\d\) /, '')}, public reporting platform).
          </div>
          {pick ? (
            <Section title={`${rows.find((r) => r.pos.code === pick)?.pos.market ?? ''}: two years`} right={`${main} and ${second} net`}>
              <History report={report} mode={mode} code={pick} />
            </Section>
          ) : null}
        </>
      )}
    </div>
  );
}
