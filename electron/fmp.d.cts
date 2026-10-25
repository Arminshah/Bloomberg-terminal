// Types for fmp.cjs, for the tests that import it.
export const KINDS: Record<'consensus' | 'summary' | 'ratings' | 'grades' | 'estimates' | 'earnings', { path: (symbol: string) => string; ttl: number }>;
export function fmpRequest(kind: unknown, symbol: unknown, key: string): { url: string; ttl: number } | null;
export function fmpCalendarRequest(from: unknown, to: unknown, key: string, now?: number): { url: string; ttl: number } | null;
export function fmpCongressRequest(chamber: unknown, key: string): { url: string; ttl: number } | null;
export function dateWindow(from: unknown, to: unknown, maxDays: number): { a: number; b: number } | null;
