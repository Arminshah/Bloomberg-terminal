export const FED_PRESS_URLS: string[];
export const FEED_ACCEPT: string;
export function fetchFedPress(fetch: (url: string, init: RequestInit) => Promise<{ status: number; ok: boolean; text(): Promise<string> }>, init: RequestInit): Promise<{ status: number; text: string; sourceLabel?: string; fallback?: boolean; error?: string }>;
