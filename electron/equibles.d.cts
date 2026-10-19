import type { RequesterProviders, RequesterResponse, RequestResult } from './requests.cjs';
export const ENDPOINT: string;
export const TOOLS: Record<string, string>;
export function validRequest(kind: unknown, symbol: unknown): boolean;
export function decodeReply(text: string, contentType: string, id: string): unknown;
export function toolArguments(tool: unknown, symbol: string): Record<string, string | number> | null;
export function createEquiblesClient(deps: { providers: RequesterProviders; fetch(url: string, init: RequestInit): Promise<RequesterResponse>; agent(): string; now?: () => number; sleep?: (ms: number) => Promise<void>; random?: () => number; refresh?: { expired(provider: string, keptAt: number): boolean } }): { research(kind: string, symbol: string, key: string): Promise<RequestResult> };
