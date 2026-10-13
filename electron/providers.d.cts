// Types for providers.cjs, for the tests that import it.
export const CREDENTIALS: Record<'FRED_API_KEY' | 'MASSIVE_API_KEY' | 'SEC_USER_AGENT' | 'COINGECKO_API_KEY', { label: string; valid: (v: string) => boolean }>;
export function credential(name: string): { value: string; source: string | null };
export const SETTINGS: Record<'YAHOO_PRICES_ENABLED' | 'KRAKEN_ENABLED', { label: string; default: boolean }>;
export function setting(name: string): { value: boolean; source: string | null };
export function settingStatus(): Record<string, { label: string; value: boolean; source: string | null }>;
export function saveSetting(name: string, value: boolean): void;
export function parseSwitch(v: string): boolean;
export function credentialStatus(): Record<string, { label: string; configured: boolean; valid: boolean; source: string | null }>;
export function saveCredential(name: string, value: string): void;
export function clearCredential(name: string): void;
export function recordRequest(provider: string): void;
export function recordResult(provider: string, status: number, err?: unknown): void;
export function recordProblem(provider: string, kind: string, message: string): void;
export function providerMessage(text: string, secrets?: string[]): string;
export function providerStats(): Record<string, { lastMinute: number; total: number; lastSuccessAt: number | null; lastErrorAt: number | null; lastError: string | null; lastErrorKind: string | null }>;
export function slot(provider: string, max: number, windowMs: number): Promise<void>;
export function parseDotEnv(text: string): Record<string, string>;
export function errorKind(status: number, err?: unknown): string;
