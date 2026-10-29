/** Per-dataset confirmation. Observation and publication dates must never be inferred from receipt time. */
export interface DatasetHealth {
  attemptedAt: number;
  checkedAt?: number;
  receivedAt?: number;
  sourceDate?: string;
  source?: string;
  state: 'current' | 'cached' | 'error';
  error?: string;
}

export interface DatasetResult {
  at: number;
  ok: boolean;
  checkedAt?: number;
  receivedAt?: number;
  cached?: boolean;
  stale?: boolean;
  sourceDate?: string;
  source?: string;
  error?: string;
}

/** A failed attempt retains the value's successful-check clock; an unchanged successful fetch advances it. */
export function datasetHealth(previous: DatasetHealth | undefined, result: DatasetResult): DatasetHealth {
  const valid = result.ok && !result.stale && !result.error;
  const fresh = valid && !result.cached;
  return {
    ...previous,
    attemptedAt: result.at,
    ...(result.source ? { source: result.source } : {}),
    ...(valid && result.sourceDate ? { sourceDate: result.sourceDate } : {}),
    ...(fresh ? { checkedAt: result.checkedAt ?? result.at, receivedAt: result.receivedAt ?? result.at } : {}),
    state: fresh ? 'current' : valid ? 'cached' : 'error',
    error: valid ? undefined : result.error ?? 'The source did not provide a valid current answer.',
  };
}
