import { useRef, useState } from 'react';
import { Section } from './cells';
import { fmtDateTime } from '../core/format';
import { checkResearchAccess, type ResearchCheck } from '../data/live/research-check';

export function ResearchAccessCheck() {
  const [symbol, setSymbol] = useState('APLD');
  const [checkedSymbol, setCheckedSymbol] = useState('');
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<ResearchCheck[]>([]);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const run = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setChecks([]); setError('');
    const ticker = symbol.trim().toUpperCase();
    setCheckedSymbol(ticker);
    try { setChecks(await checkResearchAccess(ticker, window.arminDesktop ?? {})); }
    catch (err) { setError((err as Error).message); }
    finally { pending.current = false; setBusy(false); }
  };
  return <Section title="Research access check" right="per symbol and endpoint">
    <div className="pad-s">
      <p className="muted">Tests FMP targets/ratings/estimates, Finnhub recommendation counts, Equibles estimates and the Yahoo research fallback for this ticker. Uses your saved keys and the normal caches and limits. A provider answering one endpoint does not establish access to its other endpoints or symbols.</p>
      <label>US ticker <input aria-label="Research test ticker" value={symbol} onChange={(event) => setSymbol(event.target.value)} disabled={busy} style={{ width: 100 }} /></label>{' '}
      <button type="button" className="btn primary" disabled={busy} onClick={() => void run()}>{busy ? 'Checking research…' : 'Test research access'}</button>
      {error && <p className="amber" role="status">{error}</p>}
    </div>
    {!!checks.length && <table className="tbl" aria-label={`Research access results for ${checkedSymbol}`}><thead><tr><th scope="col">Dataset · {checkedSymbol}</th><th scope="col">Result</th><th scope="col">Details</th><th scope="col">Response received</th></tr></thead><tbody>
      {checks.map((check) => <tr key={check.dataset}><td className="white">{check.dataset}</td><td className={check.state === 'Answered' ? 'up' : 'amber'}>{check.state}</td><td>{check.detail}</td><td>{check.at ? fmtDateTime(check.at) : '--'}</td></tr>)}
    </tbody></table>}
  </Section>;
}
