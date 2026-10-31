// Types for eod.cjs, for the tests that import it.
export const PROVIDERS: Record<'massive' | 'alphavantage' | 'tiingo' | 'twelvedata', { credential: string; perMinute: number; perHour?: number; perDay: number; gate?: string }>;
export function eodRequest(provider: unknown, ticker: unknown, from: unknown, to: unknown, key: string): { url: string; headers: Record<string, string> } | null;
export function takeDaily(provider: string, now?: number): boolean;
export function massiveDividendsRequest(ticker: string, key: string): { url: string; headers: Record<string, string> } | null;
