// Types for congress.cjs, for the tests that import it.
import type { AnnualReport, HouseFiling, Member, TradeReport } from '../src/data/live/congress';
export const READER_VERSION: number;
export const ASSET_TYPES: Record<string, string>;
export function filingYear(y: unknown, now?: Date): number | null;
export function docRef(arg: unknown, now?: Date): { year: number; docId: string } | null;
export function indexUrl(year: number): string;
export function ptrUrl(year: number, docId: string): string;
export function annualUrl(year: number, docId: string): string;
export function unzipFile(buf: unknown, name: string, maxBytes?: number): Buffer | null;
export function usDate(s: unknown): string;
export function parseHouseIndex(text: unknown): HouseFiling[] | null;
export function labelOf(text: string): { key: string; value: string } | null;
export function amountRange(text: unknown): { min: number; max: number | null } | null;
export function assetParts(text: unknown): { name: string; ticker: string; code: string; account?: string };
type Lines = { pages: { page: number; lines: { y: number; cells: { x: number; text: string }[] }[] }[] };
export function parsePtr(doc: Lines): TradeReport;
export function parseAnnual(doc: Lines): AnnualReport;
export function parseHouseMembers(xml: unknown): Member[] | null;
export function parseSenators(xml: unknown): Member[] | null;
export class FmpTradeLog {
  constructor(max?: number);
  rows: (Record<string, unknown> & { chamber: string; disclosureDate: string })[];
  gaps: { chamber: string; from: string; to: string; at: number }[];
  since: Record<string, string>;
  add(chamber: string, list: unknown[], at?: number): number;
  load(saved: unknown): void;
  toJSON(): unknown;
}
