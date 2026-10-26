// Types for openfigi.cjs, for the tests that import it.
import type { FigiHit } from '../src/data/live/thirteenf';
export const MAPPING_URL: string;
export const LIMITS: { keyed: { jobs: number; perMinute: number }; open: { jobs: number; perMinute: number } };
export const CODE: RegExp;
export function cleanCodes(codes: unknown, max?: number): string[] | null;
export function idType(code: string): 'ID_CUSIP' | 'ID_CINS';
export function mappingJobs(codes: string[]): { idType: string; idValue: string; exchCode: string }[];
export function parseMapping(text: string, codes: string[]): Record<string, FigiHit> | null;
export class FigiStore {
  constructor(max?: number);
  get(code: string, now?: number): { at: number; value: FigiHit } | undefined;
  set(code: string, value: FigiHit, at?: number): void;
  load(saved: unknown): void;
  toJSON(): Record<string, { at: number; value: FigiHit }>;
}
export function usTicker(ticker: unknown): string | null;
export function tickerJobs(ticker: string): { idType: string; idValue: string; exchCode: string }[];
export function shareClassJobs(figi: string): { idType: string; idValue: string }[];
export function shareClassOf(text: string): { shareClassFIGI: string; name: string } | null;
export function compositesOf(text: string): { exchCode: string; ticker: string; name: string; securityType: string; figi: string }[] | null;
