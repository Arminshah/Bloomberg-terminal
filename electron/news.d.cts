// Types for news.cjs, for the tests that import it.
export const SOURCES: Record<'finnhub-market' | 'finnhub-company' | 'marketaux' | 'marketwatch' | 'edgar-8k' | 'yahoo-rss' | 'euronext-pr', { provider: string; credential?: string; gate?: string; ttl: number; agent?: boolean }>;
export function newsRequest(source: unknown, arg: unknown, key: string): { url: string; headers: Record<string, string>; ttl: number; provider: string } | null;
