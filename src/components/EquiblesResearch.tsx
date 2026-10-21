import { useCallback, useEffect, useRef, useState } from 'react';
import { Section } from './cells';
import { Markdown } from './Markdown';
import { fmtBig, fmtDateTime, fmtDay, fmtNum } from '../core/format';
import { RESEARCH, estimateTable, guidanceStatus, parseEstimateObservations, parseResearch, type ResearchKind } from '../data/live/equibles';
import type { KeyedAnswer } from '../data/live/lookup';

type Result = { answer: KeyedAnswer; report?: { tool: string; report: string } };

/** One estimate fallback may load automatically; other reports are explicit. Never polled. */
export function EquiblesResearch({ symbol, autoLoad = false }: { symbol: string; autoLoad?: boolean }) {
  const [selected, setSelected] = useState<ResearchKind>('estimates');
  const [busy, setBusy] = useState<ResearchKind | null>(null);
  const [results, setResults] = useState<Partial<Record<ResearchKind, Result>>>({});
  const generation = useRef(0);
  const pending = useRef(false);
  const autoAsked = useRef(false);
  useEffect(() => {
    const currentGeneration = ++generation.current;
    autoAsked.current = false;
    pending.current = false;
    return () => { generation.current = currentGeneration + 1; pending.current = false; };
  }, []);
  const load = useCallback(async (kind: ResearchKind) => {
    if (pending.current || !window.arminDesktop?.equibles) return;
    pending.current = true;
    const current = generation.current;
    setBusy(kind);
    let answer: KeyedAnswer;
    try { answer = await window.arminDesktop.equibles(kind, symbol); }
    catch { answer = { status: 0, text: '', error: 'Equibles research could not be loaded.' }; }
    if (current !== generation.current) return;
    const report = parseResearch(answer.text) ?? undefined;
    setResults((previous) => ({ ...previous, [kind]: { answer, report } }));
    pending.current = false;
    setBusy(null);
  }, [symbol]);
  useEffect(() => {
    if (!autoLoad || autoAsked.current) return;
    autoAsked.current = true;
    void load('estimates');
  }, [autoLoad, load]);
  const result = results[selected];
  const answer = result?.answer;
  const error = answer?.missing ? 'Add EQUIBLES_API_KEY on PROVIDERS, then load this research again.'
    : answer?.gated ? 'Equibles is switched off. Enable EQUIBLES_ENABLED on PROVIDERS.'
    : answer?.refused ? 'The configured Equibles key has the wrong format. Check EQUIBLES_API_KEY on PROVIDERS.'
    : answer?.budget ? 'The app has reached its Equibles daily cap. It resets at midnight UTC; other clients share the account allowance.'
    : answer?.error ?? (answer && !result?.report ? 'Equibles returned no readable research.' : undefined);
  return (
    <Section title="Equibles company research" right="estimates, reported data and provider analysis">
      <div className="pad-s">
        <div className="note" style={{ padding: '0 0 8px' }}>Pick a report, then load it. Each load is one of the free account&apos;s 100 requests a day (the app stops at 90); a report is kept for six hours.</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {RESEARCH.map((item) => <button type="button" className={`btn ${selected === item.kind ? 'primary' : ''}`} aria-pressed={selected === item.kind} key={item.kind} onClick={() => setSelected(item.kind)}>{item.label}</button>)}
        </div>
        <p className="muted">{RESEARCH.find((item) => item.kind === selected)?.description}</p>
        <button type="button" className="btn primary" disabled={busy !== null || !window.arminDesktop?.equibles} onClick={() => void load(selected)}>{busy ? 'Loading Equibles…' : `Load ${RESEARCH.find((item) => item.kind === selected)?.label} for ${symbol}`}</button>
        {!window.arminDesktop?.equibles && <p className="muted">Equibles research requires the desktop app.</p>}
        {error && <p className="amber" role="status">{error}</p>}
        {result?.report && <>
          <div className="note" style={{ paddingLeft: 0 }}>Source: Equibles ({result.report.tool}){answer?.at ? ` · received ${fmtDateTime(answer.at)}` : ''}{answer?.cached ? ' · cached' : ''}{answer?.stale ? ' · STALE, earlier answer retained' : ''}</div>
          <ReportView kind={selected} report={result.report.report} />
        </>}
      </div>
    </Section>
  );
}

const day = (iso: string) => fmtDay(Date.parse(`${iso}T00:00:00Z`));

/** A figure in the report's unit: amounts in K/M/B, per-share figures to the cent. */
function figure(v: number): string {
  if (!Number.isFinite(v)) return '';
  return Math.abs(v) >= 1e5 ? fmtBig(v) : fmtNum(v, Math.abs(v) < 10 ? 2 : 1);
}

/** Equibles' analyst estimates as a table by period; any other report as the provider wrote it. */
function ReportView({ kind, report }: { kind: ResearchKind; report: string }) {
  const rows = kind === 'estimates' ? estimateTable(parseEstimateObservations(report)) : [];
  const status = kind === 'guidance' ? guidanceStatus(report) : null;
  if (rows.length >= 2) {
    const captured = /captured (\d{4}-\d{2}-\d{2})/.exec(report)?.[1];
    return (
      <>
        <table className="tbl zebra" data-testid="equibles-estimates">
          <thead>
            <tr>
              <th>Period ending</th>
              <th>Metric</th>
              <th className="num">Average</th>
              <th className="num">Low</th>
              <th className="num">High</th>
              <th className="num">Analysts</th>
              <th className="num" title="The average 30 days earlier">30 days ago</th>
              <th className="num" title="Change of the average over 30 days">Change</th>
              <th className="num" title="Analysts who raised and lowered their estimate in the last 30 days">Revisions 30d</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const chg = Number.isFinite(r.avg30) && r.avg30 !== 0 ? ((r.avg - r.avg30) / Math.abs(r.avg30)) * 100 : NaN;
              return (
                <tr key={`${r.metric}|${r.dimension}|${r.end}`}>
                  <td className="amber">{day(r.end)}</td>
                  <td className="white">
                    {r.metric}
                    {r.dimension ? <span className="muted"> · {r.dimension}</span> : null}
                    {r.unit ? <span className="muted"> ({r.unit})</span> : null}
                  </td>
                  <td className="num white">{figure(r.avg)}</td>
                  <td className="num">{figure(r.low)}</td>
                  <td className="num">{figure(r.high)}</td>
                  <td className="num">{Number.isFinite(r.analysts) ? fmtNum(r.analysts, 0) : ''}</td>
                  <td className="num">{figure(r.avg30)}</td>
                  <td className={`num ${chg > 0 ? 'up' : chg < 0 ? 'dn' : ''}`}>{Number.isFinite(chg) ? `${chg > 0 ? '+' : ''}${fmtNum(chg, 1)}%` : ''}</td>
                  <td className="num">
                    {Number.isFinite(r.raised30) && r.raised30 > 0 ? <span className="up">▲{r.raised30} </span> : null}
                    {Number.isFinite(r.lowered30) && r.lowered30 > 0 ? <span className="dn">▼{r.lowered30}</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="note">The analysts&apos; consensus as Equibles compiles it{captured ? `, captured ${day(captured)}` : ''}: averages are means; Low and High are the lowest and highest estimates.</div>
      </>
    );
  }
  return (
    <>
      {status ? (
        <p className="amber" data-testid="equibles-guidance-status">
          No newer guidance: the company&apos;s last guidance was filed {day(status.last)}; its filings and calls through {day(status.checked)} give none. The rows below are what it said then, not its current outlook.
        </p>
      ) : null}
      <div style={{ maxHeight: 600, overflow: 'auto' }}>
        <Markdown text={report} testId="equibles-report" />
      </div>
    </>
  );
}
