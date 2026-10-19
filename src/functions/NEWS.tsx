import { useEffect, useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { fmtDate, fmtStamp, fmtTime } from '../core/format';
import { engine } from '../data/market';
import { news, NEWS_TOPICS, storyMatches, type Story } from '../data/news';
import { OFFICIAL_FEEDS } from '../data/live/officialnews';
import { feedStatus } from '../data/live/status';
import { desktopData } from '../data/live/yahoo';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import { CompanyNews, feedWord, StoryList } from './MNEWS';
import { loadNews, MARKET_SOURCES, marketNews, mergeStories, newsAvailable, officialStories, SEARCHABLE, storiesFor, useMarketNews } from '../data/live/marketnews';
import { execute } from '../terminal/exec';

// The searches Google is asked for (the main process checks them again): words, digits, quotes, $, %, & and the like.

/**
 * NEWS <words>: every story the app holds whose headline or summary has all the words (market news from each
 * source, the official announcements), with Google News's search for them over the last week. Bare NEWS lists
 * the newest of everything.
 */
function NewsSearch({ query }: { query?: string }) {
  const panel = usePanelId();
  const [text, setText] = useState(query ?? '');
  const [asked, setAsked] = useState((query ?? '').trim());
  const v = useMarketNews([]);
  const official = news.use((n) => n.stories);
  const feeds = marketNews.use((s) => s.feeds);
  const arg = asked && SEARCHABLE.test(asked) ? `US:en|${asked}` : '';
  useEffect(() => {
    if (!arg || !newsAvailable()) return;
    void loadNews('google-news-search', arg, 10 * 60_000);
    const t = setInterval(() => void loadNews('google-news-search', arg, 10 * 60_000), 5 * 60_000);
    return () => clearInterval(t);
  }, [arg]);
  const stories = useMemo(() => {
    const words = asked.toLowerCase().replace(/"/g, ' ').split(/\s+/).filter(Boolean);
    const google = arg ? (marketNews.get().lists[`google-news-search:${arg}`] ?? []) : [];
    const local = mergeStories([storiesFor(MARKET_SOURCES), officialStories(official)]).filter((s) => words.every((w) => `${s.title} ${s.summary ?? ''} ${s.tickers.join(' ')}`.toLowerCase().includes(w)));
    return mergeStories([local, google]).slice(0, 500);
  }, [asked, arg, official, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const google = arg ? feedWord('Google News search', feeds[`google-news-search:${arg}`]) : '';
  return (
    <div className="fn-fill">
      <FnHeader
        code="NEWS"
        title="News Search"
        sub={`${stories.length} stories${asked ? ` for "${asked}"` : ''} · market news, official announcements${google ? ` · ${google}` : ''}`}
        actions={[
          { n: 1, label: 'Breaking', onClick: () => execute(panel, 'BREAKING'), title: 'The last hour from every source (BREAKING)' },
          { n: 2, label: 'Market news', onClick: () => execute(panel, 'MARKETNEWS') },
          { n: 3, label: 'Official', onClick: () => execute(panel, 'HEADLINES'), title: 'Official announcements by topic (HEADLINES)' },
        ]}
      />
      <div className="chart-tools">
        <label className="fld" htmlFor={`news-s-${panel}`}>
          Search
        </label>
        <input
          id={`news-s-${panel}`}
          className="inp"
          style={{ width: 260 }}
          value={text}
          placeholder="words, a ticker, a company…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') setAsked(text.trim());
          }}
        />
        <button type="button" className="btn" onClick={() => setAsked(text.trim())}>
          Search
        </button>
        <span className="muted hide-m">Enter searches the stories the app holds and Google News for the last week</span>
      </div>
      {!newsAvailable() ? (
        <div className="empty">News is read by the desktop app; the browser build has no data source.</div>
      ) : (
        <StoryList stories={stories} empty={asked ? `Searching for "${asked}"…` : 'Loading the latest news…'} />
      )}
    </div>
  );
}

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

/** HEADLINES: the official announcements. TOP opens the market news (MARKETNEWS), as on a Bloomberg terminal. */
export function HEADLINES({ route }: FnProps) {
  const arg = route.args?.toUpperCase();
  const topic = arg && NEWS_TOPICS.some((t) => t.code === arg) ? arg : 'ALL';
  return <NewsScreen code="HEADLINES" title="Official Announcements" initialTopic={topic} />;
}

export function N(props: FnProps) {
  const { route, sec } = props;
  const arg = route.args?.toUpperCase();
  const topic = arg && NEWS_TOPICS.some((t) => t.code === arg) ? arg : undefined;
  if (sec) return <CN {...props} />;
  // NEWS CB, NEWS SPEECH: the official announcements on that topic; anything else searches all news.
  if (topic) return <NewsScreen code="NEWS" title="Official Announcements" initialTopic={topic} />;
  return <NewsSearch query={route.args} />;
}

/** Company news: Finnhub and Marketaux through the desktop app (functions/MNEWS.tsx). */
export function CN(props: FnProps) {
  return <CompanyNews {...props} />;
}
