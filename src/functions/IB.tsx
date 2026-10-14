import { useEffect, useRef, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { fmtTime } from '../core/format';
import { botReply, contacts, ensureRooms, postMessage } from '../data/chat';
import { engine } from '../data/market';
import { chats } from '../terminal/userdata';
import { settings } from '../terminal/settings';
import type { FnProps } from '../terminal/types';

export function IB({ route }: FnProps) {
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
  }, [room?.messages.length]);
  useEffect(() => {
    if (room && room.unread) chats.set((s) => ({ ...s, rooms: s.rooms.map((r) => (r.id === room.id ? { ...r, unread: 0 } : r)) }));
  }, [room?.id, room?.unread]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = () => {
    const t = text.trim();
    if (!t || !room) return;
    postMessage(room.id, 'ME', t);
    setText('');
    const rid = room.id;
    const who = room.who;
    // The bot answers at once; the short pause only keeps the reply below your message.
    setTimeout(() => {
      const reply = rid === 'helpdesk' ? botReply(t) : `Thanks: ${botReply(t)}`;
      if (reply) postMessage(rid, who, reply);
    }, 150);
  };
  if (!room) return null;
  return (
    <div className="fn-fill">
      <FnHeader code="MESSAGES" title="Help Desk Messages" sub={engine.realOnly ? 'A rule-based help desk bot that answers with the quotes and announcements the app has loaded' : `Signed in as ${user} · desks are simulated contacts`} />
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
                <div className="txt">{m.text}</div>
              </div>
            ))}
            <div ref={end} />
          </div>
          <div className="chat-input">
            <input
              className="inp wide"
              aria-label="Message"
              placeholder={room.id === 'helpdesk' ? `Ask for a quote (AAPL), ${engine.realOnly ? 'news FOMC' : 'news NVDA'}, eco, movers…` : `Message ${room.name}`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button type="button" className="btn primary" onClick={send}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
