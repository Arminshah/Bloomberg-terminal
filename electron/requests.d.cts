export interface ProviderProblem {
  kind: string;
  message: string;
}

export interface RequesterProviders {
  providerMessage(text: string, secrets?: string[]): string;
  providerPayloadProblem(provider: string, text: string, secrets?: string[]): ProviderProblem | null;
  withinDailyCap(provider: string): boolean;
  slot(provider: string, max: number, windowMs: number): Promise<void>;
  recordRequest(provider: string): number;
  recordResult(provider: string, status: number, error?: unknown, startedAt?: number): void;
  recordProblem(provider: string, kind: string, message: string): void;
  errorKind(status: number, error?: unknown): string;
}

export interface RequesterResponse {
  status: number;
  ok: boolean;
  headers?: { get(name: string): string | null };
  body?: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
}

export interface RequestResult {
  status: number;
  text: string;
  at?: number;
  cached?: boolean;
  stale?: boolean;
  error?: string;
  budget?: boolean;
  retryAt?: number;
}

export type RequestPace = [perWindow: number, windowMs: number, perHour?: number];
export type Requester = (provider: string, url: string, headers: Record<string, string>, ttl: number, pace: RequestPace, secrets?: string[], userAgent?: string, transport?: { method: 'POST'; body: string }) => Promise<RequestResult>;

export function createRequester(dependencies: {
  providers: RequesterProviders;
  fetch(url: string, init: RequestInit): Promise<RequesterResponse>;
  agent(): string;
  validate?(provider: string, url: string, text: string): ProviderProblem | null;
  timeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  refresh?: { expired(provider: string, keptAt: number): boolean };
}): Requester;

export function retryAfter(value: string | null | undefined, now: number): number;
