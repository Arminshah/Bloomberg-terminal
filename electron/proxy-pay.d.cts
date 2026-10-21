// Types for proxy-pay.cjs, for the tests that import it.
export interface PayExecutive { name: string; title: string; years: { year: number; salary: number; total: number }[] }
export function parseSummaryCompensation(html: unknown): PayExecutive[] | null;
export function cellText(html: string): string;
export function amount(s: string): number;
export function splitNameTitle(s: string): { name: string; title: string };
