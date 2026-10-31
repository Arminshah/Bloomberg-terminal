import { useEffect, useRef, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { fmtTime } from '../core/format';
import { botReply, contacts, ensureRooms, postMessage } from '../data/chat';
import { claudeAvailable } from '../data/assistant/claude';
import { engine } from '../data/market';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import { chats } from '../terminal/userdata';
import { navigate } from '../terminal/state';
import { settings } from '../terminal/settings';
import type { FnProps } from '../terminal/types';

/** What the help desk is doing while it looks something up, by Claude's tool names. */
const LOOKING: Record<string, string> = {
  get_quote: 'the price',
  get_next_earnings: 'the earnings calendar',
  get_earnings_results: 'the earnings results',
  get_sec_filings: 'SEC filings',
  get_analyst_consensus: 'analyst research',
  get_news: 'the news',
  get_company_profile: 'the company profile',
  get_management: 'the management',
  get_dividends: 'dividends',
  get_key_stats: 'key figures',
  get_market_overview: 'the markets',
  get_economic_calendar: 'the economic calendar',
  get_top_movers: 'the movers',
  find_terminal_functions: 'the terminal\'s screens',
};

/** Questions the help desk answers, offered while its conversation is empty. */
const EXAMPLES = ['When does NVDA report?', 'Did AAPL beat last quarter?', 'SEC filings for TSLA', 'How do I set a price alert?'];

/** The help desk's questions offered in the Live Help window too. */
export const HELP_EXAMPLES = EXAMPLES;

/**
 * Starts a help desk conversation from outside the screen (the Live Help window): the panel shows the help desk and the
 * question is asked there, the answer arriving as it would from the screen's own box.
 */
export async function askHelpDesk(panel: number, question: string): Promise<void> {
  const t = question.trim();
  if (!t) return;
  ensureRooms();
  chats.set((s) => ({ ...s, active: 'helpdesk' }));
  navigate(panel, { fn: 'MESSAGES', args: 'HELP' });
  const room = chats.get().rooms.find((r) => r.id === 'helpdesk');
  const history = room?.messages ?? [];
  postMessage('helpdesk', 'ME', t);
  try {
    const reply = await botReply(t, 'helpdesk', history, () => undefined);
    if (reply.text) postMessage('helpdesk', room?.who ?? 'HELP DESK', reply.text, { commands: reply.commands, links: reply.links });
  } catch (err) {
    postMessage('helpdesk', room?.who ?? 'HELP DESK', `Something went wrong while answering: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Who answers the help desk, and where a question goes. */
function whoAnswers(): string {
  return claudeAvailable()
    ? 'With an Anthropic key on PROVIDERS, Claude answers from the app\'s data, and your question goes to Anthropic. Without one, the built-in assistant answers in the app and nothing goes to an AI service.'
    : 'The built-in assistant answers in the app, from the sources it reads: prices, earnings, filings, analysts, news and its screens. Nothing you type goes to an AI service.';
}

export function IB({ route }: FnProps) {
  const panel = usePanelId();
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    ensureRooms();
    if (route.args === 'HELP') chats.set((s) => ({ ...s, active: 'helpdesk' }));
  }, [route.args]);
  const all = chats.use((s) => s);
  const user = settings.use((s) => s.userName);
  // Rooms saved by an earlier version may include simulated desks; the desktop app shows only real contacts.
  const allowed = new Set(contacts().map((c) => c.id));
  const st = { ...all, rooms: all.rooms.filter((r) => allowed.has(r.id)) };
  const room = st.rooms.find((r) => r.id === st.active) ?? st.rooms[0];
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [room?.messages.length, busy]);
  useEffect(() => {
    if (room && room.unread) chats.set((s) => ({ ...s, rooms: s.rooms.map((r) => (r.id === room.id ? { ...r, unread: 0 } : r)) }));
  }, [room?.id, room?.unread]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async () => {
    const t = text.trim();
    if (!t || !room || busy) return;
    const rid = room.id;
    const who = room.who;
    const history = room.messages;
    postMessage(rid, 'ME', t);
    setText('');
    setBusy('Looking it up…');
    try {
      const reply = await botReply(t, rid, history, (tool) => setBusy(`Looking up ${LOOKING[tool] ?? 'the data'}…`));
      if (reply.text) postMessage(rid, who, rid === 'helpdesk' ? reply.text : `Thanks: ${reply.text}`, { commands: reply.commands, links: reply.links });
    } catch (err) {
      postMessage(rid, who, `Something went wrong while answering: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };
  if (!room) return null;
  // Until something is asked, the help desk opens on its own page (its greeting aside): what it is, who answers,
  // examples, and the question box.
  const welcome = room.id === 'helpdesk' && !room.messages.some((m) => m.from === 'ME') && !busy;
  const input = (
    <div className={`chat-input${welcome ? ' desk' : ''}`}>
      <input
        ref={box}
        className="inp wide"
        aria-label="Message"
        placeholder={room.id === 'helpdesk' ? 'Ask anything: when does NVDA report? did AAPL beat? SEC filings for TSLA…' : `Message ${room.name}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void send();
          }
        }}
      />
      <button type="button" className="btn primary" disabled={!!busy} onClick={() => void send()}>
        Send
      </button>
    </div>
  );
  const newChat = () => chats.set((s) => ({ ...s, rooms: s.rooms.map((r) => (r.id === 'helpdesk' ? { ...r, messages: [], unread: 0 } : r)) }));
  return (
    <div className="fn-fill">
      <FnHeader
        code="MESSAGES"
        title="Help Desk Messages"
        sub={
          claudeAvailable()
            ? 'Help desk: Claude answers with the app\'s data when ANTHROPIC_API_KEY is set (PROVIDERS); otherwise the built-in assistant'
            : engine.realOnly
              ? 'Help desk: answers from the app\'s sources on prices, earnings, filings, analysts, news and screens'
              : `Signed in as ${user} · desks are simulated contacts`
        }
      />
      <div className="chat" style={{ flex: 1, minHeight: 0 }}>
        <nav className="chat-rooms" aria-label="Chats">
          {room.id === 'helpdesk' && !welcome && !busy && (
            <button type="button" className="chat-new" onClick={newChat} title="Start again with an empty help desk conversation">
              ＋ New chat
            </button>
          )}
          {st.rooms.map((r) => (
            <div key={r.id} className={`chat-room${r.id === room.id ? ' on' : ''}`} onClick={() => chats.set((s) => ({ ...s, active: r.id }))}>
              <span>{r.name}</span>
              {r.unread > 0 && <span className="badge hot">{r.unread}</span>}
            </div>
          ))}
        </nav>
        <div className="chat-main">
          {welcome ? (
            <div className="desk-welcome">
              <div className="desk-mark" aria-hidden="true">?</div>
              <h2 className="desk-title">HELP DESK</h2>
              <p className="desk-sub">{whoAnswers()}</p>
              {input}
              <div className="desk-examples" aria-label="Example questions">
                {EXAMPLES.map((q) => (
                  <button key={q} type="button" className="act" onClick={() => { setText(q); box.current?.focus(); }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
          <>
          <div className="chat-msgs" role="log" aria-live="polite">
            {room.messages.length === 0 && <div className="empty">No messages yet. Say hello.</div>}
            {room.messages.map((m) => (
              <div key={m.id} className={`msg${m.from === 'ME' ? ' me' : ''}`}>
                <div className="who">
                  {m.from === 'ME' ? user : m.from}
                  <time>{fmtTime(m.at, false)}</time>
                </div>
                <div className="txt">
                  {m.text}
                  {m.links?.length ? (
                    <div className="msg-links">
                      {m.links.map((l) => (
                        <a key={l.url} href={l.url} target="_blank" rel="noreferrer noopener" className="blue">
                          {l.label}
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {m.commands?.length ? (
                    <div className="msg-cmds">
                      {m.commands.map((c) => (
                        <button key={c.command} type="button" className="act" title={c.command} onClick={() => execute(panel, c.command)}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {busy && room.id === 'helpdesk' ? <div className="msg"><div className="txt muted">{busy}</div></div> : null}
            <div ref={end} />
          </div>
          {input}
          </>
          )}
        </div>
      </div>
    </div>
  );
}
