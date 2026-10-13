import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { fmtDate, fmtStamp, fmtTime } from '../core/format';
import { engine } from '../data/market';
import { news, NEWS_TOPICS, storyMatches, type Story } from '../data/news';
import { OFFICIAL_FEEDS } from '../data/live/officialnews';
import { feedStatus } from '../data/live/status';
import { desktopData } from '../data/live/yahoo';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

const PUBLISHERS = OFFICIAL_FEEDS.map((f) => f.publisher).join(', ');

function StoryView({ story, onBack }: { story: Story; onBack: () => void }) {
  return (
    <article className="story">
      <button type="button" className="btn show-m" onClick={onBack}>
        ‹ Headlines
      </button>
      <div className="meta">
        <span className="amber">{story.source}</span>
        <span title="Publication time, as the publisher gives it">
          Published {fmtDate(story.time)} {fmtTime(story.time)}
        </span>
        {story.fetched ? <span className="muted">Received {fmtTime(story.fetched)}</span> : null}
        <span className="badge live">OFFICIAL</span>
      </div>
      <h2>{story.headline}</h2>
      {story.body.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {story.url && (
        <p>
          <a href={story.url} target="_blank" rel="noreferrer noopener" className="blue">
            Read it at {story.source} ↗
          </a>
        </p>
      )}
    </article>
  );
}

function NewsScreen({ code, title, initialTopic, query }: { code: string; title: string; initialTopic?: string; query?: string }) {
  const panel = usePanelId();
  const stories = news.use((n) => n.stories);
  const feed = feedStatus.use((f) => f.news);
  const detail = feedStatus.use((f) => f.detail.news);
  const [topic, setTopic] = useState(initialTopic ?? 'ALL');
  const [q, setQ] = useState(query ?? '');
  const [sel, setSel] = useState<string | null>(null);
  const tabs = [{ n: 1, label: 'All' }, ...NEWS_TOPICS.map((t, i) => ({ n: i + 2, label: t.label }))];
  const topicCode = (n: number) => (n === 1 ? 'ALL' : NEWS_TOPICS[n - 2].code);
  const tabN = topic === 'ALL' ? 1 : NEWS_TOPICS.findIndex((t) => t.code === topic) + 2;
  const list = useMemo(() => stories.filter((s) => storyMatches(s, topic, undefined, q.trim() || undefined)).slice(0, 300), [stories, topic, q]);
  const current = list.find((s) => s.id === sel) ?? (sel ? stories.find((s) => s.id === sel) : undefined) ?? list[0];
  const empty = !desktopData()
    ? 'The browser demo has no news: headlines come only from official publishers, in the desktop app. Nothing is generated.'
    : feed === 'connecting'
      ? 'Loading official announcements…'
      : feed === 'error'
        ? `The official publishers did not answer (${detail ?? 'no detail'}). They are tried again every 10 minutes.`
        : 'No announcements match.';
  return (
    <div className="fn-fill">
      <FnHeader
        code={code}
        title={title}
        sub={`${list.length} announcements · official publishers: ${PUBLISHERS} · times as each publisher gives them`}
        tabs={tabs}
        tab={tabN}
        onTab={(n) => {
          setTopic(topicCode(n));
          setSel(null);
        }}
      />
      <div className="chart-tools">
        <label className="fld" htmlFor={`news-q-${panel}`}>
          Search
        </label>
        <input id={`news-q-${panel}`} className="inp" style={{ width: 220 }} value={q} placeholder="keyword…" onChange={(e) => setQ(e.target.value)} />
        <span className="muted hide-m">Press releases, published a few times a day: not a breaking-news wire</span>
      </div>
      <div className={`news${sel ? ' reading' : ''}`} style={{ flex: 1, minHeight: 0 }}>
        <div className="news-list" role="list">
          {list.length === 0 && <div className="empty">{empty}</div>}
          {list.map((s) => (
            <div key={s.id} role="listitem" className={`news-item real${current?.id === s.id ? ' sel' : ''}`} onClick={() => setSel(s.id)}>
              <span className="time" title="Publication time">
                {fmtStamp(s.time, engine.now())}
              </span>
              <span className="hl">{s.headline}</span>
              <span className="src">{s.source}</span>
            </div>
          ))}
        </div>
        {current ? <StoryView story={current} onBack={() => setSel(null)} /> : <div className="empty">Select a headline.</div>}
      </div>
    </div>
  );
}

export function TOP({ route }: FnProps) {
  const arg = route.args?.toUpperCase();
  const topic = arg && NEWS_TOPICS.some((t) => t.code === arg) ? arg : 'ALL';
  return <NewsScreen code="TOP" title="Official Announcements" initialTopic={topic} />;
}

export function N(props: FnProps) {
  const { route, sec } = props;
  const arg = route.args?.toUpperCase();
  const topic = arg && NEWS_TOPICS.some((t) => t.code === arg) ? arg : undefined;
  if (sec) return <CN {...props} />;
  return <NewsScreen code="N" title="News Search" initialTopic={topic} query={topic ? undefined : route.args} />;
}

/**
 * Company news. No permitted news feed covers companies; a company's own
 * announcements are its filings (8-K current reports and the rest), which the
 * filings screen shows from SEC EDGAR.
 */
export function CN({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  return (
    <div>
      <FnHeader code="CN" title="Company News" sec={s} sub="A company's own announcements" />
      <div className="pad">
        <p>
          No news feed with terms that allow it is connected for companies, and Yahoo&apos;s news is switched off. A company&apos;s own announcements are its filings: current reports (8-K), results and ownership filings, from SEC
          EDGAR for companies that file there.
        </p>
        <button type="button" className="btn primary" onClick={() => execute(panel, `${s.id} FILE`)}>
          Open its filings
        </button>
      </div>
    </div>
  );
}
