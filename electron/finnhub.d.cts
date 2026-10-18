// Types for finnhub.cjs, for the tests that import it.
export type FinnhubKind = 'profile' | 'metric' | 'recommendation' | 'earnings' | 'calendar' | 'quote';
export const KINDS: Record<FinnhubKind, { path: (symbol: string, now: number) => string; ttl: number }>;
export function finnhubRequest(kind: unknown, symbol: unknown, now?: number): { url: string; ttl: number } | null;
export function finnhubHeaders(key: string): Record<string, string>;
