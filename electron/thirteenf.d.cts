// Types for thirteenf.cjs, for the tests that import it.
import type { Cover13F, Line13F } from '../src/data/live/thirteenf';
export function folderPath(cik: unknown, accession: unknown): string | null;
export function parseCover(xml: unknown): Cover13F | null;
export function parseInfoTable(xml: unknown): { holdings: Line13F[]; rows: number; valueSum: number; unread: number } | null;
export function tableCandidates(names: unknown): string[];
export function text(s: string): string;
export const FILE: RegExp;
