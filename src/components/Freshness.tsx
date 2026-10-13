/**
 * The freshness label every figure carries: what kind of data it is, as far
 * as the source lets the app know. A quote fetched seconds ago is not called
 * real-time for that reason; the label comes from the source's own terms and
 * timestamps.
 */
export type FreshnessLabel = 'REAL-TIME' | 'DELAYED' | 'END OF DAY' | 'REFERENCE' | 'STALE' | 'DEMO DATA' | 'UNKNOWN FRESHNESS';

const CLASS: Record<FreshnessLabel, string> = {
  'REAL-TIME': 'fr-rt',
  DELAYED: 'fr-delayed',
  'END OF DAY': 'fr-eod',
  REFERENCE: 'fr-ref',
  STALE: 'fr-stale',
  'DEMO DATA': 'fr-demo',
  'UNKNOWN FRESHNESS': 'fr-unknown',
};

export function Freshness({ label, title }: { label: FreshnessLabel; title?: string }) {
  return (
    <span className={`badge ${CLASS[label]}`} title={title}>
      {label}
    </span>
  );
}
