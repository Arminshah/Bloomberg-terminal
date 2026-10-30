import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as main from '../electron/assistant.cjs';
import { formFilter } from '../src/data/assistant/answers';
import { claudeReply, historyMessages } from '../src/data/assistant/claude';
import { candidates, findLoaded, namePhrases } from '../src/data/assistant/find';
import { intentOf, localReply } from '../src/data/assistant/local';
import type { AssistantAnswer } from '../src/data/assistant/types';
import type { ChatMessage } from '../src/terminal/userdata';

afterEach(() => vi.unstubAllGlobals());

describe('the help desk understands questions', () => {
  // A reply's first lookup of a screen imports the whole function registry, every screen with it; load it here, so
  // each test's time is the reply's own and not the import's.
  beforeAll(async () => {
    await import('../src/terminal/registry');
  }, 60_000);

  it.each([
    ['when are the next earnings for NBIS', 'earnings'],
    ['give me the SEC files for APLD', 'filings'],
    ['what is the analyst consensus for APLD', 'analysts'],
    ['did APLD beat its earnings?', 'results'],
    ['how were the last results of AAPL', 'results'],
    ['news FOMC', 'news'],
    ['news about Tesla', 'news'],
    ['why is NVDA down today?', 'news'],
    ['how do I set an alert', 'howto'],
    ['hi', 'greeting'],
    ['thanks!', 'thanks'],
    ['eco', 'eco'],
    ["what's the P/E of AAPL", 'stats'],
    ['who is the CEO of NFLX', 'management'],
    ['tell me about Apple', 'profile'],
    ['latest 10-K for MSFT', 'filings'],
    ['dividend of KO', 'dividend'],
    ["how's the market", 'market'],
    ['biggest gainers today', 'movers'],
  ])('%s → %s', (q, intent) => {
    expect(intentOf(q)).toBe(intent);
  });

  it('a bare ticker is no intent: the security itself is the question', () => {
    expect(intentOf('AAPL')).toBeNull();
  });

  it('reads a ticker typed in capitals or as a cashtag, not abbreviations or question words', () => {
    expect(candidates('when are the next earnings for NBIS')).toEqual([{ word: 'NBIS', ticker: true }]);
    expect(candidates('did $apld beat the EPS estimate')[0]).toEqual({ word: 'apld', ticker: true });
    expect(candidates('give me the SEC files for APLD').map((c) => c.word)).toEqual(['APLD']);
    // Typed in capitals throughout, case says nothing; question words still drop out.
    expect(candidates('WHEN DOES NVDA REPORT').map((c) => c.word)).toEqual(['NVDA']);
  });

  it('finds securities the app has loaded by ticker, name or terminal form', () => {
    expect(findLoaded('when does AAPL report')?.id).toBe('AAPL US Equity');
    expect(findLoaded("what's the price of apple")?.id).toBe('AAPL US Equity');
    expect(findLoaded('EURUSD Curncy quote')?.id).toBe('EURUSD Curncy');
    expect(findLoaded('when is CPI out')).toBeUndefined();
  });

  it('takes runs of non-question words as company names', () => {
    expect(namePhrases('when does nebius report')).toEqual(['nebius']);
    expect(namePhrases('news on bank of america please')[0]).toBe('bank of america');
  });

  it('reads which filings a question asks for', () => {
    expect(formFilter('latest 10-K')?.test('10-K')).toBe(true);
    expect(formFilter('latest 10-K')?.test('10-Q')).toBe(false);
    expect(formFilter('8-K filings')?.test('8-K/A')).toBe(true);
    expect(formFilter('insider forms')?.test('4')).toBe(true);
    expect(formFilter('SEC files')).toBeUndefined();
  });

  it('answers greetings and asks which security when none is named', async () => {
    expect((await localReply('hello')).text).toMatch(/report next/);
    expect((await localReply('did it beat its earnings?', 'test-room')).text).toMatch(/Which security/);
  });

  it('remembers the security asked about last in the conversation', async () => {
    await localReply('AAPL', 'ctx-room');
    const r = await localReply('what does it do?', 'ctx-room');
    expect(r.text).toMatch(/Apple/);
  });

  it('points to the screens a how-to question asks for', async () => {
    const r = await localReply('how do I set a price alert?');
    expect(r.commands?.[0].command).toMatch(/^(ALRT|ALERTS)\b/);
  });
});

describe('Claude mode', () => {
  const msg = (id: number, from: string, text: string): ChatMessage => ({ id, from, text, at: id });

  it('sends earlier exchanges as plain text, starting with a question and ending with an answer', () => {
    const h = historyMessages([msg(1, 'Help Desk (bot)', 'Welcome'), msg(2, 'ME', 'AAPL'), msg(3, 'Help Desk (bot)', 'AAPL 200'), msg(4, 'ME', 'and MSFT?')]);
    expect(h).toEqual([
      { role: 'user', content: 'AAPL' },
      { role: 'assistant', content: 'AAPL 200' },
    ]);
  });

  it('runs the tools Claude asks for, returns all results in one message and keeps Claude\'s messages unchanged', async () => {
    const thinking = { type: 'thinking', thinking: '', signature: 'sig' };
    const calls: unknown[][] = [];
    const answers: AssistantAnswer[] = [
      {
        stopReason: 'tool_use',
        content: [thinking, { type: 'tool_use', id: 't1', name: 'get_market_overview', input: {} }, { type: 'tool_use', id: 't2', name: 'nope', input: {} }],
      },
      { stopReason: 'end_turn', content: [{ type: 'text', text: 'Markets are mixed.' }], model: 'claude-opus-5-5' },
    ];
    const assistant = vi.fn(async (m: unknown[]) => {
      calls.push(structuredClone(m));
      return answers.shift()!;
    });
    vi.stubGlobal('window', { arminDesktop: { assistant, settings: {} } });
    const r = await claudeReply('how are markets?', []);
    expect(r?.text).toBe('Markets are mixed.');
    expect(assistant).toHaveBeenCalledTimes(2);
    const second = calls[1] as { role: string; content: { type: string; is_error?: boolean; tool_use_id?: string }[] }[];
    expect(second[1].content[0]).toEqual(thinking);
    expect(second[2].role).toBe('user');
    expect(second[2].content.map((b) => b.tool_use_id)).toEqual(['t1', 't2']);
    expect(second[2].content[1].is_error).toBe(true);
  });

  it('leaves the question to the built-in assistant when no key is set', async () => {
    vi.stubGlobal('window', { arminDesktop: { assistant: async () => ({ missing: 'ANTHROPIC_API_KEY' }), settings: {} } });
    expect(await claudeReply('hi', [])).toBeNull();
  });

  it('defines strict tools whose every property is required', () => {
    for (const t of main.TOOLS) {
      expect(t.strict).toBe(true);
      expect(t.input_schema.additionalProperties).toBe(false);
      expect([...t.input_schema.required].sort()).toEqual(Object.keys(t.input_schema.properties).sort());
    }
  });

  it('checks what the page sends before it goes to Anthropic', () => {
    expect(main.checkMessages([{ role: 'user', content: 'hi' }])).toBeNull();
    expect(main.checkMessages([])).toMatch(/empty/);
    expect(main.checkMessages([{ role: 'assistant', content: 'hi' }])).toMatch(/start with a question/);
    expect(main.checkMessages([{ role: 'user', content: [{ type: 'image', source: {} }] }])).toMatch(/only text and tool results/);
    expect(main.checkMessages([{ role: 'system', content: 'x' }])).toMatch(/role/);
  });

  it('never repeats the key in an error', () => {
    const key = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz';
    expect(main.errorText({ status: 500, message: `boom ${key}` }, key)).not.toContain(key);
    expect(main.errorText({ message: `failed for ${key}` }, key)).toContain('[key]');
    expect(main.errorText({ status: 401 }, key)).toMatch(/rejected the API key/);
  });
});
