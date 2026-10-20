// Types for nasdaq.cjs, for the tests that import it.
export function nasdaqCalendarRequest(date: unknown, now?: number): { url: string; ttl: number; headers: Record<string, string> } | null;
export function nasdaqScreenerRequest(): { url: string; ttl: number; headers: Record<string, string> };
export type NasdaqCompanyKind = 'summary' | 'dividends' | 'short-interest' | 'holdings' | 'target' | 'ratings' | 'forecast' | 'earnings-date';
export const COMPANY_KINDS: Record<NasdaqCompanyKind, { path: (symbol: string) => string; ttl: number }>;
export function nasdaqCompanyRequest(kind: unknown, symbol: unknown): { url: string; ttl: number; headers: Record<string, string> } | null;
export function nasdaqProblem(text: string): string | null;
