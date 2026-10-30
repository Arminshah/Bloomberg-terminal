// Types for index-members.cjs, for the tests that import it.
export type MembersKind = 'sp500' | 'nasdaq100' | 'ftse100-sections';
export interface MembersRequest { provider: string; url: string; ttl: number; headers: Record<string, string> }
export const LISTS: Record<MembersKind, MembersRequest>;
export function membersRequest(kind: unknown): MembersRequest | null;
export function ftse100Request(section: unknown): MembersRequest | null;
export function nasdaqQuotesRequest(symbols: unknown): MembersRequest | null;
