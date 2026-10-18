import type { KeyedAnswer } from './lookup';
import { parseConsensus, parseEstimates, parseFinnhubRatings, parseRatings, type AnalystKind } from './analysts';
import { parseResearch } from './equibles';
import { parseYahooResearch, yahooResearchPath, type YahooResearchApi } from './yahoo-research';

export type ResearchApi = {
  analysts?: (kind: AnalystKind, symbol: string) => Promise<KeyedAnswer>;
  finnhubResearch?: (kind: 'ratings', symbol: string) => Promise<KeyedAnswer>;
  equibles?: (kind: 'estimates', symbol: string) => Promise<KeyedAnswer>;
  yahoo?: YahooResearchApi;
  settings?: Record<string, boolean>;
};
export type ResearchCheck = { dataset: string; state: string; detail: string; at?: number };

/** User-triggered, per-endpoint evidence; never interpret a valid key as data access. */
export async function checkResearchAccess(symbol: string, api: ResearchApi): Promise<ResearchCheck[]> {
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) throw new Error('Enter one US stock ticker, such as APLD.');
  const requests: { dataset: string; send: () => Promise<KeyedAnswer | undefined> | undefined; parse: (text: string) => { data: unknown } | { error: string } }[] = [
    { dataset: 'FMP price targets', send: () => api.analysts?.('consensus', symbol), parse: parseConsensus },
    { dataset: 'FMP ratings', send: () => api.analysts?.('ratings', symbol), parse: parseRatings },
    { dataset: 'FMP annual estimates', send: () => api.analysts?.('estimates', symbol), parse: parseEstimates },
    { dataset: 'Finnhub recommendation counts', send: () => api.finnhubResearch?.('ratings', symbol), parse: (text: string) => parseFinnhubRatings(text, symbol) },
    { dataset: 'Equibles analyst estimates', send: () => api.equibles?.('estimates', symbol), parse: (text: string) => { const parsed = parseResearch(text); return parsed ? { data: parsed } : { error: 'No readable report in the answer.' }; } },
  ];
  if (api.yahoo) requests.push({
    dataset: 'Yahoo analyst research',
    send: async () => {
      const gate = api.settings?.YAHOO_PRICES_ENABLED === false ? 'YAHOO_PRICES_ENABLED' : api.settings?.YAHOO_RESEARCH_ENABLED === false ? 'YAHOO_RESEARCH_ENABLED' : undefined;
      if (gate) return { status: 0, text: '', gated: gate };
      const response = await api.yahoo!(yahooResearchPath(symbol));
      if (response.disabled) return { status: 0, text: '', gated: 'YAHOO_PRICES_ENABLED' };
      if (response.session === false) return { status: response.status, text: '', error: 'Yahoo refused the session; open Yahoo consent on PROVIDERS.' };
      return { status: response.status, text: response.status === 200 ? JSON.stringify(response.data ?? null) : '', at: response.status === 200 ? Date.now() : undefined };
    },
    parse: (text: string) => {
      try {
        const parsed = parseYahooResearch(JSON.parse(text), symbol);
        if ('error' in parsed) return parsed;
        const d = parsed.data;
        return { data: d.consensus || d.ratings || d.grades.length || d.estimates.length ? d : null };
      } catch { return { error: 'Yahoo returned no readable research.' }; }
    },
  });
  const checks: ResearchCheck[] = [];
  // Sequential requests make a small, bounded self-test and share normal broker caps/caches.
  for (const request of requests) {
    let answer: KeyedAnswer | undefined;
    try { answer = await request.send(); } catch { checks.push({ dataset: request.dataset, state: 'Error', detail: 'The request could not be completed.' }); continue; }
    if (!answer) { checks.push({ dataset: request.dataset, state: 'Unavailable', detail: 'This desktop bridge does not expose the adapter.' }); continue; }
    let state = 'Error';
    let detail = answer.error ?? (answer.status ? `HTTP ${answer.status}` : 'No response');
    if (answer.missing || answer.refused) { state = 'Needs key'; detail = answer.missing ? `Configure ${answer.missing} on PROVIDERS.` : 'The configured key has the wrong format.'; }
    else if (answer.gated) { state = 'Switched off'; detail = answer.gated; }
    else if (answer.text) {
      const parsed = request.parse(answer.text);
      if ('error' in parsed) detail = parsed.error ?? 'Unrecognized research response.';
      else if (answer.stale) { state = 'Stale'; detail = `Earlier answer retained; ${detail}.`; }
      else if (!parsed.data || (Array.isArray(parsed.data) && !parsed.data.length)) { state = 'No data'; detail = 'The endpoint answered but returned no usable records for this symbol.'; }
      else { state = 'Answered'; detail = answer.cached ? 'Cached answer; not a new provider access check.' : 'Valid response. Inspect the report for coverage, dates and source qualifications.'; }
    } else if ([401, 402, 403].includes(answer.status) || /premium|subscription|key.*invalid|access denied/i.test(detail)) state = 'Denied';
    else if (answer.budget || answer.status === 429 || answer.retryAt) state = 'Rate limited';
    checks.push({ dataset: request.dataset, state, detail, at: answer.at });
  }
  return checks;
}
