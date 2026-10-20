// Types for nasdaq.cjs, for the tests that import it.
export function nasdaqCalendarRequest(date: unknown, now?: number): { url: string; ttl: number; headers: Record<string, string> } | null;
export function nasdaqScreenerRequest(): { url: string; ttl: number; headers: Record<string, string> };
export function nasdaqProblem(text: string): string | null;
