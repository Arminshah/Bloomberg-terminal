// Types for news.cjs, for the tests that import it.
type NewsSource = 'finnhub-market' | 'finnhub-company' | 'marketaux' | 'marketwatch' | 'edgar-8k' | 'yahoo-rss' | 'euronext-pr' | 'alpaca-market' | 'alpaca-company' | 'massive-market' | 'massive-company' | 'google-news-market' | 'google-news-breaking' | 'google-news-search' | 'google-news-company';
export const SOURCES: Record<NewsSource, { provider: string; credential?: string; credential2?: string; gate?: string; ttl: number; agent?: boolean }>;
export const EDITIONS: Record<string, { hl: string; lang: string }>;
export const FINANCE_WORDS: Record<string, string[]>;
export const COUNTRY_WORDS: Record<string, string[]>;
export const KIND_WORDS: Record<string, string[]>;
export function newsRequest(source: unknown, arg: unknown, key: string, key2?: string, now?: number): { url: string; headers: Record<string, string>; ttl: number; provider: string } | null;
