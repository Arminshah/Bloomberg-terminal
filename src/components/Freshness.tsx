import { engine, useInterval, useQuote } from '../data/market';
import { freshnessOf, sessionLabel, type FreshnessLabel } from '../data/freshness';

export type { FreshnessLabel } from '../data/freshness';

const CLASS: Record<FreshnessLabel, string> = {
  'REAL-TIME': 'fr-rt',
  DELAYED: 'fr-delayed',
  'END OF DAY': 'fr-eod',
  REFERENCE: 'fr-ref',
  STALE: 'fr-stale',
  'DEMO DATA': 'fr-demo',
  'UNKNOWN FRESHNESS': 'fr-unknown',
};

/** A freshness label as a badge (src/data/freshness.ts says what each one means). */
export function Freshness({ label, title }: { label: FreshnessLabel; title?: string }) {
  return (
    <span className={`badge ${CLASS[label]}`} title={title}>
      {label}
    </span>
  );
}

/** A security's freshness badge and, apart from it, its market session. */
export function QuoteFreshness({ id, session = true }: { id: string; session?: boolean }) {
  useInterval(15_000);
  const q = useQuote(id);
  if (!q) return null;
  const f = freshnessOf(q, engine.get(id), Date.now());
  const s = session ? sessionLabel(q.session) : null;
  return (
    <>
      {f ? <Freshness label={f.label} title={f.why} /> : <span className="badge fr-unknown">NO DATA</span>}
      {s && (
        <span className="badge session" title="The market's trading session, as the source states it">
          {s}
        </span>
      )}
    </>
  );
}

/** What the one-letter marks next to prices mean. */
export function FreshnessLegend() {
  return (
    <div className="note legend" title="Each price's label rests on what its source states and on the source's own timestamps">
      Marks: none real time · D delayed · E end of day (market closed) · R official reference value · ? timing not stated by the source · S stale (amber) · hover a price for details
    </div>
  );
}
