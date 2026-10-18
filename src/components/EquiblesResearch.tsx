import { useEffect, useRef, useState } from 'react';
import { Section } from './cells';
import { RESEARCH, parseResearch, type ResearchKind } from '../data/live/equibles';
import type { KeyedAnswer } from '../data/live/lookup';

type Result = { answer: KeyedAnswer; report?: { tool: string; report: string } };

/** Requests are explicit, never polled. Display the provider's qualifications verbatim. */
export function EquiblesResearch({ symbol }: { symbol: string }) {
  const [selected, setSelected] = useState<ResearchKind>('estimates');
  const [busy, setBusy] = useState<ResearchKind | null>(null);
  const [results, setResults] = useState<Partial<Record<ResearchKind, Result>>>({});
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(() => () => { generation.current++; }, []);
  const load = async () => {
    if (pending.current || !window.arminDesktop?.equibles) return;
    pending.current = true;
    const current = generation.current;
    const kind = selected;
    setBusy(kind);
    let answer: KeyedAnswer;
    try { answer = await window.arminDesktop.equibles(kind, symbol); }
    catch { answer = { status: 0, text: '', error: 'Equibles research could not be loaded.' }; }
    if (current !== generation.current) return;
    const report = parseResearch(answer.text) ?? undefined;
    setResults((previous) => ({ ...previous, [kind]: { answer, report } }));
    pending.current = false;
    setBusy(null);
  };
  const result = results[selected];
  const answer = result?.answer;
  const error = answer?.missing ? 'Add EQUIBLES_API_KEY on PROVIDERS, then load this research again.'
    : answer?.gated ? 'Equibles is switched off. Enable EQUIBLES_ENABLED on PROVIDERS.'
    : answer?.refused ? 'The configured Equibles key has the wrong format. Check EQUIBLES_API_KEY on PROVIDERS.'
    : answer?.budget ? 'The app has reached its Equibles daily cap. It resets at midnight UTC; other clients share the account allowance.'
    : answer?.error ?? (answer && !result?.report ? 'Equibles returned no readable research.' : undefined);
  return (
    <Section title="Equibles company research" right="on request · estimates, reported data and provider analysis">
      <div className="pad-s">
        <div className="note" style={{ padding: '0 0 8px' }}>Analyst estimates and company research; broker price targets are a separate dataset. Select and load a report. The free account allows 100 requests/day shared with other Equibles clients. Research is kept for six hours; this app caps transport requests at 90/day. Each report shows the first available page (up to 20 rows where supported).</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {RESEARCH.map((item) => <button type="button" className={`btn ${selected === item.kind ? 'primary' : ''}`} aria-pressed={selected === item.kind} key={item.kind} onClick={() => setSelected(item.kind)}>{item.label}</button>)}
        </div>
        <p className="muted">{RESEARCH.find((item) => item.kind === selected)?.description}</p>
        <button type="button" className="btn primary" disabled={busy !== null || !window.arminDesktop?.equibles} onClick={() => void load()}>{busy ? 'Loading Equibles…' : `Load ${RESEARCH.find((item) => item.kind === selected)?.label} for ${symbol}`}</button>
        {!window.arminDesktop?.equibles && <p className="muted">Equibles research requires the desktop app.</p>}
        {error && <p className="amber" role="status">{error}</p>}
        {result?.report && <>
          <div className="note" style={{ paddingLeft: 0 }}>Source: Equibles · {result.report.tool}{answer?.at ? ` · received ${new Date(answer.at).toLocaleString()}` : ''}{answer?.cached ? ' · cached' : ''}{answer?.stale ? ' · STALE, earlier answer retained' : ''}. Reporting dates and any model/AI labels appear in the provider text below.</div>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: 'inherit', lineHeight: 1.6, maxHeight: 600, overflow: 'auto' }} data-testid="equibles-report">{result.report.report}</pre>
        </>}
      </div>
    </Section>
  );
}
