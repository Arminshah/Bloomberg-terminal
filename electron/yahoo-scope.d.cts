// Types for yahoo-scope.cjs, for the tests that import it.
export const ALLOWED: RegExp;
export const ANALYST_MODULES: string[];
export const ANALYST_FIELDS: Record<string, string[]>;
export const QUOTE_ANALYST_FIELDS: string[];
export function yahooRequest(path: string): string;
export function withoutRestricted<T>(path: string, data: T): T;
