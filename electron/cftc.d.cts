export type CotReport = 'legacy' | 'disaggregated' | 'tff';
export type CotMode = 'futures' | 'combined';
export function cftcRequest(kind: string, report: string, mode: string, code?: string, now?: number): { url: string; ttl: number } | null;
export const DATASETS: Record<CotReport, Record<CotMode, string>>;
export const GROUPS: Record<CotReport, [string, string, string][]>;
export const COMMODITY_CODES: string[];
export const FINANCIAL_CODES: string[];
