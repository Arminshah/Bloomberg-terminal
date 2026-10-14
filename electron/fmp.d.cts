// Types for fmp.cjs, for the tests that import it.
export const KINDS: Record<'consensus' | 'summary' | 'ratings' | 'grades' | 'estimates', { path: (symbol: string) => string; ttl: number }>;
export function fmpRequest(kind: unknown, symbol: unknown, key: string): { url: string; ttl: number } | null;
