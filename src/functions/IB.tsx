import { useEffect, useRef, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { fmtTime } from '../core/format';
import { botReply, contacts, ensureRooms, postMessage } from '../data/chat';
import { claudeAvailable } from '../data/assistant/claude';
import { engine } from '../data/market';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import { chats } from '../terminal/userdata';
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
          {st.rooms.map((r) => (
            <div key={r.id} className={`chat-room${r.id === room.id ? ' on' : ''}`} onClick={() => chats.set((s) => ({ ...s, active: r.id }))}>
              <span>{r.name}</span>
              {r.unread > 0 && <span className="badge hot">{r.unread}</span>}
            </div>
          ))}
        </nav>
        <div className="chat-main">
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
          <div className="chat-input">
            <input
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
        </div>
      </div>
    </div>
  );
}
