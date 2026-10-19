import type { ChatMessage } from '../../terminal/userdata';
import {
  analystReply,
  dividendReply,
  ecoReply,
  filingsReply,
  managementReply,
  marketReply,
  moversReply,
  newsReply,
  newsSearchReply,
  nextEarningsReply,
  profileReply,
  quoteReply,
  resultsReply,
  statsReply,
  type Reply,
} from './answers';
import { findSecurity } from './find';
import { functionsReply } from './local';
import type { Block } from './types';

/**
 * The help desk's Claude mode: the conversation goes to Claude through the main process (electron/assistant.cjs,
 * with the owner's ANTHROPIC_API_KEY), and each tool Claude calls is answered here from the app's own sources.
 */

type Message = { role: 'user' | 'assistant'; content: string | Block[] };

/** Claude mode is possible: the desktop app (whether a key is set, the main process says). */
export function claudeAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.assistant === 'function' && window.arminDesktop.settings?.CLAUDE_HELPDESK_ENABLED !== false;
}

/** At most this many requests to Claude for one question. */
const MAX_ROUNDS = 8;
/** The earlier exchanges sent along with a question. */
const HISTORY = 16;

const FORM_WORDS: Record<string, string> = { annual: '10-K', quarterly: '10-Q', current: '8-K', proxy: 'proxy', ownership: 'insider', offering: 'offering' };

/** Runs one tool call against the app's data; the reply's commands and links are kept for the chat. */
export async function runTool(name: string, input: Record<string, unknown>): Promise<Reply & { error?: boolean }> {
  const text = (k: string) => (typeof input[k] === 'string' ? (input[k] as string).trim() : '');
  const security = async () => {
    const asked = text('security');
    if (!asked) return { error: 'No security was named.' };
    // A single word is read as a ticker first ("nvda"), then as a name ("Nebius").
    const found = await findSecurity(/^[A-Za-z][A-Za-z0-9./-]{0,7}$/.test(asked) ? `$${asked.toUpperCase()}` : asked);
    if (found.def) return { def: found.def };
    return { error: found.tried ? `${found.tried} was not found: ${found.problem}` : `No security matches "${asked}". Try its ticker.` };
  };
  const withSecurity = async (fn: (d: NonNullable<Awaited<ReturnType<typeof findSecurity>>['def']>) => Promise<Reply> | Reply) => {
    const s = await security();
    return 'def' in s && s.def ? fn(s.def) : { text: s.error ?? 'No security.', error: true };
  };
  switch (name) {
    case 'get_quote':
      return withSecurity(quoteReply);
    case 'get_next_earnings':
      return withSecurity(nextEarningsReply);
    case 'get_earnings_results':
      return withSecurity(resultsReply);
    case 'get_sec_filings':
      return withSecurity((d) => filingsReply(d, FORM_WORDS[text('form')] ?? ''));
    case 'get_analyst_consensus':
      return withSecurity(analystReply);
    case 'get_company_profile':
      return withSecurity(profileReply);
    case 'get_management':
      return withSecurity(managementReply);
    case 'get_dividends':
      return withSecurity(dividendReply);
    case 'get_key_stats':
      return withSecurity(statsReply);
    case 'get_news':
      if (text('security')) return withSecurity((d) => newsReply(d, 8));
      return text('query') ? newsSearchReply(text('query'), 8) : newsReply(undefined, 8);
    case 'get_market_overview':
      return marketReply();
    case 'get_economic_calendar':
      return ecoReply();
    case 'get_top_movers':
      return moversReply();
    case 'find_terminal_functions':
      return (await functionsReply(text('query'))) ?? { text: 'No screen matches that.' };
    default:
      return { text: `Unknown tool ${name}.`, error: true };
  }
}

/** A tool's answer as Claude reads it: the text, then the links it can cite. */
function toolText(r: Reply): string {
  const links = (r.links ?? []).map((l) => `${l.label}: ${l.url}`);
  const screens = (r.commands ?? []).map((c) => c.command);
  return [r.text, links.length ? `Links:\n${links.join('\n')}` : '', screens.length ? `Screens: ${screens.join(', ')}` : ''].filter(Boolean).join('\n\n');
}

/** The earlier exchanges as plain text, starting with a question (the bot's welcome is left out). */
export function historyMessages(history: ChatMessage[]): Message[] {
  const out: Message[] = [];
  for (const m of history.slice(-HISTORY)) {
    const role = m.from === 'ME' ? 'user' : 'assistant';
    if (!out.length && role === 'assistant') continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content = `${last.content as string}\n\n${m.text}`;
    else out.push({ role, content: m.text });
  }
  // The question being asked follows, so the history ends with the bot's last answer.
  while (out.length && out[out.length - 1].role === 'user') out.pop();
  return out;
}

const NOT_SET: Record<string, string> = {
  gated: 'Claude is switched off (CLAUDE_HELPDESK_ENABLED on PROVIDERS).',
  missing: 'No ANTHROPIC_API_KEY is set on PROVIDERS.',
  refused: 'The ANTHROPIC_API_KEY on PROVIDERS has the wrong format.',
};

/**
 * Claude's answer to a question, or null when Claude is not set up (no key, switched off): the caller then answers
 * with the built-in assistant. `onTool` reports each tool as it runs, for a "looking up…" line.
 */
export async function claudeReply(question: string, history: ChatMessage[], onTool?: (name: string) => void): Promise<(Reply & { model?: string }) | null> {
  if (!claudeAvailable()) return null;
  const today = new Date().toUTCString().slice(0, 22);
  const messages: Message[] = [...historyMessages(history), { role: 'user', content: [{ type: 'text', text: `(Now: ${today} UTC.)\n\n${question}` }] }];
  const commands = new Map<string, { label: string; command: string }>();
  const links = new Map<string, { label: string; url: string }>();
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await window.arminDesktop!.assistant!(messages);
    if (res.gated || res.missing || res.refused) {
      // Only the first request can find Claude unset; later it is a change made meanwhile.
      if (round === 0) return null;
      return { text: NOT_SET[res.gated ? 'gated' : res.missing ? 'missing' : 'refused'] };
    }
    if (res.budget) return { text: "Today's 400 requests to Claude are used up (the app's own ceiling); the built-in assistant answers until midnight UTC." };
    if (res.error || !res.content) return { text: res.error ?? 'Claude did not answer.' };
    // Claude's message goes back unchanged, thinking included.
    messages.push({ role: 'assistant', content: res.content });
    const said = res.content.filter((b) => b.type === 'text').map((b) => String(b.text)).join('\n').trim();
    if (res.stopReason === 'tool_use') {
      const calls = res.content.filter((b) => b.type === 'tool_use');
      const results: Block[] = [];
      for (const call of calls) {
        onTool?.(call.name);
        let r: Reply & { error?: boolean };
        try {
          r = await runTool(call.name, call.input ?? {});
        } catch (err) {
          r = { text: `The lookup failed: ${err instanceof Error ? err.message : String(err)}`, error: true };
        }
        for (const c of r.commands ?? []) commands.set(c.command, c);
        for (const l of r.links ?? []) links.set(l.url, l);
        results.push({ type: 'tool_result', tool_use_id: call.id, content: toolText(r), ...(r.error ? { is_error: true } : {}) });
      }
      messages.push({ role: 'user', content: results });
      continue;
    }
    const tail = res.stopReason === 'max_tokens' ? ' (The answer was cut short.)' : res.stopReason === 'refusal' ? 'Claude declined to answer that.' : '';
    // Only the links Claude's answer mentions, so the chat does not repeat every story it read.
    const cited = [...links.values()].filter((l) => said.includes(l.url));
    return { text: `${said}${tail}`.trim() || 'Claude gave no answer.', commands: [...commands.values()].slice(0, 4), links: cited, model: res.model };
  }
  return { text: 'Claude needed more lookups than allowed for one question; try asking something narrower.', commands: [...commands.values()].slice(0, 4) };
}
