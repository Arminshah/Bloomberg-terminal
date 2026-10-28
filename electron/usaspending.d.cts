// Types for usaspending.cjs, for the tests that import it.
export const API: string;
export function usaspendingRequest(kind: unknown, arg: unknown, now?: number): { method: 'GET' | 'POST'; url: string; body?: any } | null;
export function parseUsaspending(kind: string, text: string): Record<string, unknown>[] | null;
