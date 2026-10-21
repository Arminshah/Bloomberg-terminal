// Types for supply-chain.cjs, for the tests that import it.
export const TERMS: string[];
export const SETS: Record<'reports' | 'prospectus' | 'current', { forms: string; days: number }>;
export const EXTRACTION: number;
export function ftsUrl(arg: unknown, now?: number): string | null;
export function searchUrl(arg: unknown): string | null;
export function docUrl(path: unknown): string | null;
export function htmlToText(html: string): string;
export function splitSentences(text: string): string[];
export function namePattern(names: string[]): { test(s: string): boolean };
export function cleanNames(names: unknown): string[] | null;
export function mentionSentences(text: string, names: string[], max?: number): string[];
export function ownSentences(text: string, max?: number): string[];
export class SentenceStore {
  constructor(max?: number);
  key(kind: string, path: string, names?: string[]): string;
  get(key: string, now?: number): { at: number; sentences: string[] } | undefined;
  set(key: string, value: { at: number; sentences: string[] }): void;
  toJSON(): [string, { at: number; sentences: string[] }][];
  load(entries: unknown, now?: number): void;
}
