export interface NikkeiMonth { sq: string; month: string; settle: number; theoretical: number }
export const PAGES: { settlement: string; oi: string };
export function latestFile(html: string, kind: 'settlement' | 'oi'): { file: string; date: string } | null;
export function jpxFileUrl(kind: string, file: string): string | null;
export function nikkeiSettlements(csv: string): { close: number; months: NikkeiMonth[] } | { error: string };
export function nikkeiOpenInterest(buf: Buffer): Record<string, { volume: number; openInterest: number }> | { error: string };
export function frontMonth(months: NikkeiMonth[], date: string): NikkeiMonth | undefined;
