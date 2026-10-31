export const ENDPOINT: string;
export const TOOLS: Readonly<{ consensus: string; ratings: string }>;
export const MONTHLY_CAP: number;
export function validRequest(kind: string, ticker: string): boolean;
export function toolArguments(tool: unknown, kind: string, ticker: string): Record<string, string> | null;
export function decodeReply(text: string, contentType: string, id: number): { result?: unknown; error?: { message?: string } };
export function readUsage(data: unknown): { used?: number; limit?: number; remaining?: number } | null;
export function createTipRanksClient(dependencies: {
  providers: unknown;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  monthFile?: () => string;
  store?: { read(): unknown; write(month: { month: string; byKey: Record<string, number> }): void };
  now?: () => number;
  timeoutMs?: number;
}): { research(kind: string, ticker: string, key: string): Promise<{ status: number; text: string; error?: string; at?: number; cached?: boolean; budget?: boolean }> };

export function keyId(key: string): string;
