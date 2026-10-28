// Types for nasdaq.cjs, for the tests that import it.
export function nasdaqCalendarRequest(date: unknown, now?: number): { url: string; ttl: number; headers: Record<string, string> } | null;
export function nasdaqEconomicRequest(date: unknown, now?: number): { url: string; ttl: number; headers: Record<string, string> } | null;
export function nasdaqIpoRequest(month: unknown, now?: number): { url: string; ttl: number; headers: Record<string, string> } | null;
export function nasdaqDividendRequest(date: unknown, now?: number): { url: string; ttl: number; headers: Record<string, string> } | null;
export function nasdaqSplitsRequest(): { url: string; ttl: number; headers: Record<string, string> };
export function nasdaqScreenerRequest(): { url: string; ttl: number; headers: Record<string, string> };
export type NasdaqCompanyKind = 'summary' | 'dividends' | 'short-interest' | 'holdings' | 'target' | 'ratings' | 'forecast' | 'earnings-date' | 'profile';
export const COMPANY_KINDS: Record<NasdaqCompanyKind, { path: (symbol: string) => string; ttl: number }>;
export function nasdaqCompanyRequest(kind: unknown, symbol: unknown, now?: number): { url: string; ttl: number; headers: Record<string, string> } | null;
export function nasdaqProblem(text: string): string | null;
export function finraSettlementRequest(date: unknown, now?: number): { url: string; ttl: number; headers: Record<string, string>; body: string } | null;
export function finraShortRequest(symbol: unknown, now?: number, days?: number, limit?: number): { url: string; ttl: number; headers: Record<string, string>; body: string } | null;
