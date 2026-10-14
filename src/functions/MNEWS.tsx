import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { fmtDate, fmtStamp, fmtTime } from '../core/format';
import { engine } from '../data/market';
import { useProviderReport } from '../data/providers';
import { secTicker } from '../data/live/sec';
import { companyStories, marketNews, newsAvailable, storiesFor, useCompanyNews, useMarketNews, type FeedState, type MarketStory } from '../data/live/marketnews';
import { watchlists } from '../terminal/userdata';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/** A story's sentiment from Marketaux, for one ticker or all it tags. */
function Sentiment({ story, symbol }: { story: MarketStory; symbol?: string }) {
  const list = (story.sentiment ?? []).filter((x) => !symbol || x.symbol === symbol);
  if (!list.length) return null;
  return (
    <span className="muted" title="Marketaux's sentiment for each tagged company, from -1 (negative) to 1 (positive)">
      {' '}
      {list.slice(0, 3).map((x) => (
        <span key={x.symbol} className={x.score > 0.15 ? 'up' : x.score < -0.15 ? 'dn' : 'muted'}>
          {x.symbol} {x.score > 0 ? '+' : ''}
          {x.score.toFixed(2)}{' '}
        </span>
      ))}
    </span>
  );
}

function Reader({ story, symbol, onBack }: { story: MarketStory; symbol?: string; onBack: () => void }) {
  return (
    <article className="story">
      <button type="button" className="btn show-m" onClick={onBack}>
        ‹ Headlines
      </button>
      <div className="meta">
        <span className="amber">{story.publisher}</span>
        <span title="Publication time, as the source gives it">
          Published {fmtDate(story.time)} {fmtTime(story.time)}
        </span>
        <span className="muted">via {story.feeds.join(', ')}</span>
        {story.filing ? <span className="badge live">FILING</span> : null}
      </div>
      <h2>{story.title}</h2>
      {story.summary ? <p>{story.summary}</p> : null}
      {story.tickers.length ? <p className="muted">Tagged: {story.tickers.join(', ')}</p> : null}
      {story.sentiment?.length ? (
        <p>
          Sentiment, from Marketaux: <Sentiment story={story} symbol={symbol} />
        </p>
      ) : null}
      <p>
        <a href={story.url} target="_blank" rel="noreferrer noopener" className="blue">
          Read it at {story.publisher.replace(/ \(company filing\)$/, '')} ↗
        </a>
      </p>
      <p className="faint">Headline, summary and link as the source gives them; the article itself is on the publisher&apos;s site.</p>
    </article>
  );
}

function StoryList({ stories, empty, symbol }: { stories: MarketStory[]; empty: string; symbol?: string }) {
  const [sel, setSel] = useState<string | null>(null);
  const current = stories.find((s) => s.id === sel) ?? stories[0];
  return (
    <div className={`news${sel ? ' reading' : ''}`} style={{ flex: 1, minHeight: 0 }}>
      <div className="news-list" role="list">
        {stories.length === 0 && <div className="empty">{empty}</div>}
        {stories.map((s) => (
          <div key={s.id} role="listitem" className={`news-item real${current?.id === s.id ? ' sel' : ''}`} onClick={() => setSel(s.id)}>
            <span className="time" title="Publication time">
              {fmtStamp(s.time, engine.now())}
            </span>
            <span className="hl">
              {s.title}
              {s.tickers.length ? <span className="muted"> · {s.tickers.slice(0, 4).join(' ')}</span> : null}
              <Sentiment story={s} symbol={symbol} />
            </span>
            <span className="src">{s.publisher.replace(/ \(company filing\)$/, '')}</span>
          </div>
        ))}
      </div>
      {current ? <Reader story={current} symbol={symbol} onBack={() => setSel(null)} /> : <div className="empty">Select a headline.</div>}
    </div>
  );
}

/** One source's state in a few words. */
function feedWord(name: string, f: FeedState | undefined, extra = ''): string {
  if (!f) return `${name}: not asked yet`;
  switch (f.state) {
    case 'ok':
      return `${name}: ${f.count ?? 0}${f.stale ? ' (stale)' : ''}${f.at ? ` at ${fmtTime(f.at, false)}` : ''}${extra}`;
    case 'loading':
      return `${name}: loading`;
    case 'needs-key':
      return `${name}: ${f.message}`;
    case 'budget':
      return `${name}: daily allowance spent${extra}`;
    case 'off':
      return `${name}: ${f.message}`;
    default:
      return `${name}: ${f.message ?? 'error'}`;
  }
}

const TABS = [
  { n: 1, label: 'All', test: () => true },
  { n: 2, label: 'Articles', test: (s: MarketStory) => !s.filing },
  { n: 3, label: 'SEC 8-K filings', test: (s: MarketStory) => !!s.filing },
];

/**
 * MARKETNEWS: market news merged from Finnhub, MarketWatch and Marketaux (your active watchlist, one request
 * an hour), with the SEC's latest 8-K filings, without duplicates. Filter by ticker or keyword.
 */
export function MNEWS({ route }: FnProps) {
  const panel = usePanelId();
  const [tab, setTab] = useState(1);
  const [ticker, setTicker] = useState((route.args ?? '').trim().toUpperCase());
  const [q, setQ] = useState('');
  const wl = watchlists.use((w) => w.lists[w.active] ?? w.lists[0]);
  const watch = useMemo(() => [...new Set((wl?.ids ?? []).map((id) => secTicker(engine.get(id))).filter((t): t is string => !!t))].slice(0, 20), [wl]);
  const v = useMarketNews(watch);
  const feeds = marketNews.use((s) => s.feeds);
  const [report] = useProviderReport(5000);
  const used = report?.providers.marketaux?.today;
  const all = useMemo(() => storiesFor(['finnhub-market', 'marketwatch', 'edgar-8k', 'marketaux']), [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = ticker.replace(/^\$/, '');
  const list = all.filter((s) => TABS[tab - 1].test(s) && (!t || s.tickers.includes(t) || s.title.toUpperCase().includes(t)) && (!q.trim() || `${s.title} ${s.summary ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))).slice(0, 300);
  const mk = Object.entries(feeds).find(([k]) => k.startsWith('marketaux:'))?.[1];
  const waiting = Object.keys(feeds).length === 0 || Object.values(feeds).some((f) => f.state === 'loading' || f.state === 'idle');
  const status = [
    feedWord('Finnhub', feeds['finnhub-market']),
    feedWord('MarketWatch', feeds.marketwatch),
    feedWord('SEC 8-K', feeds['edgar-8k']),
    feedWord('Marketaux', mk, used != null ? ` · ${used} of 90 requests today` : ''),
  ].join(' · ');
  return (
    <div className="fn-fill">
      <FnHeader code="MARKETNEWS" title="Market News" sub={`${list.length} stories · ${status}`} tabs={TABS.map((x) => ({ n: x.n, label: x.label }))} tab={tab} onTab={setTab} />
      <div className="chart-tools">
        <label className="fld" htmlFor={`mn-t-${panel}`}>
          Ticker
        </label>
        <input id={`mn-t-${panel}`} className="inp" style={{ width: 90 }} value={ticker} placeholder="AAPL" onChange={(e) => setTicker(e.target.value.toUpperCase())} onKeyDown={(e) => e.stopPropagation()} />
        <label className="fld" htmlFor={`mn-q-${panel}`}>
          Search
        </label>
        <input id={`mn-q-${panel}`} className="inp" style={{ width: 200 }} value={q} placeholder="keyword…" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        <span className="muted hide-m">Marketaux covers your watchlist{wl ? ` (${wl.name})` : ''}: 3 stories an hour on its free plan. Official announcements: HEADLINES.</span>
      </div>
      {!newsAvailable() ? (
        <div className="empty">Market news is read by the desktop app; the browser build has no data source.</div>
      ) : (
        <StoryList stories={list} empty={t || q.trim() ? `No story matches in what the sources returned.` : waiting ? 'Loading market news…' : 'No source has returned stories: the line above says why for each; keys and switches are on PROVIDERS.'} symbol={t || undefined} />
      )}
      <div className="note">
        Sources: Finnhub market news, Marketaux (tagged with tickers and sentiment), the SEC&apos;s latest 8-K filings and, if you switch it on, MarketWatch top stories (its terms restrict automated access). A story carried by
        two sources shows once. Finnhub and Marketaux need your keys on PROVIDERS; the SEC needs SEC_USER_AGENT.{' '}
        <button type="button" className="act" onClick={() => execute(panel, 'PROVIDERS')}>
          PROVIDERS ›
        </button>
      </div>
    </div>
  );
}

/** COMPANYNEWS: a company's news from Finnhub (the last week) and Marketaux, with a way to its SEC filings. */
export function CompanyNews({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const symbol = secTicker(s);
  const v = useCompanyNews(symbol);
  const feeds = marketNews.use((x) => x.feeds);
  const stories = useMemo(() => (symbol ? companyStories(symbol) : []), [symbol, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const fin = Object.entries(feeds).find(([k]) => symbol && k.startsWith(`finnhub-company:${symbol}|`))?.[1];
  const mk = symbol ? feeds[`marketaux:${symbol}`] : undefined;
  return (
    <div className="fn-fill">
      <FnHeader code="COMPANYNEWS" title="Company News" sec={s} sub={symbol ? `${stories.length} stories · ${feedWord('Finnhub', fin)} · ${feedWord('Marketaux', mk)}` : 'US-listed stocks'} />
      <div className="chart-tools">
        <button type="button" className="btn" onClick={() => execute(panel, `${s.id} FILINGS`)}>
          Its SEC filings
        </button>
        <span className="muted hide-m">News from the last week (Finnhub) and Marketaux&apos;s latest stories tagged {symbol ?? 'with the ticker'}, newest first.</span>
      </div>
      {!symbol ? (
        <div className="empty">Company news here covers US-listed stocks; {s.ticker} is not one.</div>
      ) : !newsAvailable() ? (
        <div className="empty">Company news is read by the desktop app; the browser build has no data source.</div>
      ) : (
        <StoryList
          stories={stories}
          empty={
            fin?.state === 'loading' || mk?.state === 'loading' || (!fin && !mk)
              ? 'Loading company news…'
              : (fin?.state === 'needs-key' || fin?.state === 'off') && (mk?.state === 'needs-key' || mk?.state === 'off')
                ? 'Company news needs your Finnhub key or Marketaux token, with their switches on (PROVIDERS).'
                : `No stories for ${symbol} from the sources in the last week: the line above says what each returned.`
          }
          symbol={symbol}
        />
      )}
    </div>
  );
}
