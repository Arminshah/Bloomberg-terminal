// Types for alphavantage.cjs, for the tests that import it.
export const KINDS: Record<'earnings' | 'estimates', string>;
export const TTL: number;
export function avEarningsRequest(kind: unknown, symbol: unknown, key: string): { url: string; ttl: number } | null;
export function cacheId(kind: string, symbol: string, key: string): string;
export function createDiskCache(file: () => string, max?: number): { get(id: string): { text: string; at: number } | undefined; set(id: string, text: string, at: number): void };
