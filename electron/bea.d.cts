export type BeaKind = 'gdp-contributions' | 'personal-income';
export function beaRequest(kind: string, now?: number): { url: string; ttl: number } | null;
export function withKey(url: string, key: string): string;
export function withoutRequest(text: string): string;
export const TABLES: Record<BeaKind, { table: string; frequency: string; years: number }>;
