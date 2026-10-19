import { useCallback, useEffect, useRef, useState } from 'react';
import { Section } from './cells';
import { Markdown } from './Markdown';
import { RESEARCH, parseResearch, type ResearchKind } from '../data/live/equibles';
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
          <div className="note" style={{ paddingLeft: 0 }}>Source: Equibles ({result.report.tool}){answer?.at ? ` · received ${new Date(answer.at).toLocaleString()}` : ''}{answer?.cached ? ' · cached' : ''}{answer?.stale ? ' · STALE, earlier answer retained' : ''}</div>
          <div style={{ maxHeight: 600, overflow: 'auto' }}>
            <Markdown text={result.report.report} testId="equibles-report" />
          </div>
        </>}
      </div>
    </Section>
  );
}
