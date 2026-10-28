// Types for providers.cjs, for the tests that import it.
export type CredentialName =
  | 'FRED_API_KEY' | 'MASSIVE_API_KEY' | 'SEC_USER_AGENT' | 'COINGECKO_API_KEY' | 'ALPHA_VANTAGE_API_KEY' | 'TWELVE_DATA_API_KEY'
  | 'FINNHUB_API_KEY' | 'MARKETAUX_API_TOKEN' | 'TIINGO_API_KEY' | 'ALPACA_API_KEY_ID' | 'ALPACA_API_SECRET_KEY' | 'FMP_API_KEY' | 'OPENFIGI_API_KEY' | 'TIPRANKS_API_KEY' | 'CONGRESS_GOV_API_KEY' | 'ANTHROPIC_API_KEY';
export const CREDENTIALS: Record<CredentialName, { label: string; valid: (v: string) => boolean }>;
export const DAILY: Record<string, { limit: number | null; cap: number }>;
export function parseCredentialList(text: string): { found: { name: CredentialName; value: string }[]; skipped: { line?: number; name?: string; reason: string }[]; notes: { line: number; name: string; note: string }[] };
export function importCredentials(text: string): { saved: string[]; skipped: { line?: number; name?: string; reason: string }[]; notes: { line: number; name: string; note: string }[] };
export function usedToday(provider: string): number;
export function withinDailyCap(provider: string): boolean;
export function credential(name: string): { value: string; source: string | null };
export type SettingName = 'YAHOO_PRICES_ENABLED' | 'YAHOO_RESEARCH_ENABLED' | 'KRAKEN_ENABLED' | 'TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED' | 'MARKETWATCH_RSS_ENABLED' | 'FMP_ENABLED' | 'FINNHUB_ENABLED' | 'OPENFIGI_ENABLED' | 'TIPRANKS_ENABLED' | 'MARKETAUX_ENABLED' | 'ALPACA_ENABLED' | 'ALPACA_IEX_PRICES_ENABLED' | 'TIINGO_ENABLED' | 'YAHOO_RSS_ENABLED' | 'EURONEXT_RSS_ENABLED' | 'GOOGLE_NEWS_RSS_ENABLED' | 'MASSIVE_NEWS_ENABLED' | 'CLAUDE_HELPDESK_ENABLED';
export const SETTINGS: Record<SettingName, { label: string; default: boolean }>;
export function setting(name: string): { value: boolean; source: string | null };
export function settingStatus(): Record<string, { label: string; value: boolean; source: string | null }>;
export function saveSetting(name: string, value: boolean): void;
export function parseSwitch(v: string): boolean;
export function credentialStatus(): Record<string, { label: string; configured: boolean; valid: boolean; source: string | null }>;
export function saveCredential(name: string, value: string): void;
export function clearCredential(name: string): void;
export function recordRequest(provider: string): number;
export function recordResult(provider: string, status: number, err?: unknown, startedAt?: number): void;
export function recordProblem(provider: string, kind: string, message: string): void;
export function providerMessage(text: string, secrets?: string[]): string;
export function providerPayloadProblem(provider: string, text: string, secrets?: string[]): { kind: string; message: string } | null;
export function providerStats(): Record<string, { lastMinute: number; total: number; lastAttemptAt: number | null; lastSuccessAt: number | null; lastLatencyMs: number | null; lastErrorAt: number | null; lastError: string | null; lastErrorKind: string | null }>;
export function slot(provider: string, max: number, windowMs: number): Promise<void>;
export function shared<T>(name: string, identity: string, ttlMs: number, fetcher: () => Promise<T>, keep?: (value: T) => boolean, now?: () => number): Promise<T>;
export function parseDotEnv(text: string): Record<string, string>;
/** Sources the app no longer uses; their saved key and switch are deleted at start. */
export const RETIRED: { credentials: string[]; settings: string[] };
export function withoutRetired<T extends Record<string, unknown>>(data: T | null | undefined, names: string[]): T | null;
export function forgetRetired(): void;
export function errorKind(status: number, err?: unknown): string;
