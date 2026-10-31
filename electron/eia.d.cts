export type EiaKind = 'storage-report' | 'storage-history' | 'petroleum' | 'gas-monthly';
export function eiaRequest(kind: string, now?: number): { url: string; keyed: boolean; ttl: number } | null;
export function withKey(url: string, key: string): string;
export const STORAGE_SERIES: string[];
export const PETROLEUM_SERIES: string[];
export const GAS_MONTHLY_SERIES: string[];
export const STORAGE_REPORT: string;
