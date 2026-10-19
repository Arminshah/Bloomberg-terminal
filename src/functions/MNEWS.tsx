import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { fmtDate, fmtStamp, fmtTime } from '../core/format';
import { engine } from '../data/market';
import { useProviderReport } from '../data/providers';
import { secTicker } from '../data/live/sec';
import {
  combinedFeed,
  companyFeeds,
  companyStories,
  euronextReleases,
  googleNews,
  MARKET_EDITIONS,
  MARKET_SOURCES,
  marketNews,
  mergeStories,
  newsAvailable,
  onEuronext,
  sameTicker,
  storiesFor,
  useCompanyNews,
  useEuronextReleases,
  useGoogleNews,
  useMarketNews,
  useYahooHeadlines,
  watchSymbols,
  yahooHeadlines,
  type FeedState,
  type MarketStory,
} from '../data/live/marketnews';
import { yahooSymbolFor } from '../data/live/yahoo';
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
 * MARKETNEWS (TOP): market news merged from Finnhub (general news and mergers), Alpaca (Benzinga's wire), Massive,
 * Google News's market search (US and UK editions), MarketWatch and Marketaux (your active watchlist, one
 * request an hour), with the SEC's latest 8-K filings and Euronext's latest press releases, without duplicates.
 * Filter by ticker or keyword; 4) opens the official announcements (HEADLINES).
 */
export function MNEWS({ route, sec }: FnProps) {
  const panel = usePanelId();
  const [tab, setTab] = useState(1);
  // "MARKETNEWS NVDA" arrives with NVDA as the security, "MARKETNEWS AI" as text.
  const [ticker, setTicker] = useState((route.args ?? '').trim().toUpperCase() || secTicker(sec) || '');
  const [q, setQ] = useState('');
  const wl = watchlists.use((w) => w.lists[w.active] ?? w.lists[0]);
  const watch = useMemo(() => [...new Set((wl?.ids ?? []).map((id) => secTicker(engine.get(id))).filter((t): t is string => !!t))].slice(0, 20), [wl]);
  const v = useMarketNews(watch);
  const feeds = marketNews.use((s) => s.feeds);
  const [report] = useProviderReport(5000);
  const used = report?.providers.marketaux?.today;
  const all = useMemo(() => storiesFor(MARKET_SOURCES), [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = ticker.replace(/^\$/, '');
  const list = all.filter((s) => TABS[tab - 1].test(s) && (!t || s.tickers.some((x) => sameTicker(x, t)) || s.title.toUpperCase().includes(t)) && (!q.trim() || `${s.title} ${s.summary ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))).slice(0, 500);
  const mk = watch.length ? feeds[`marketaux:${watchSymbols(watch)}`] : undefined;
  const waiting = Object.keys(feeds).length === 0 || Object.values(feeds).some((f) => f.state === 'loading' || f.state === 'idle');
  const status = [
    feedWord('Finnhub', combinedFeed([feeds['finnhub-market'], feeds['finnhub-market:merger']])),
    feedWord('Alpaca', feeds['alpaca-market']),
    feedWord('Massive', feeds['massive-market']),
    feedWord('Google News', combinedFeed(MARKET_EDITIONS.map((e) => feeds[`google-news-market:${e}`]))),
    feedWord('MarketWatch', feeds.marketwatch),
    feedWord('SEC 8-K', feeds['edgar-8k']),
    feedWord('Euronext', feeds['euronext-pr']),
    feedWord('Marketaux', mk, used != null ? ` · ${used} of 90 requests today` : ''),
  ].join(' · ');
  return (
    <div className="fn-fill">
      <FnHeader
        code="MARKETNEWS"
        title="Market News"
        sub={`${list.length} stories · ${status}`}
        tabs={TABS.map((x) => ({ n: x.n, label: x.label }))}
        tab={tab}
        onTab={setTab}
        actions={[{ n: TABS.length + 1, label: 'Official', onClick: () => execute(panel, 'HEADLINES'), title: 'Official announcements from central banks, the BEA and ESMA (HEADLINES)' }]}
      />
      <div className="chart-tools">
        <label className="fld" htmlFor={`mn-t-${panel}`}>
          Ticker
        </label>
        <input id={`mn-t-${panel}`} className="inp" style={{ width: 90 }} value={ticker} placeholder="AAPL" onChange={(e) => setTicker(e.target.value.toUpperCase())} onKeyDown={(e) => e.stopPropagation()} />
        <label className="fld" htmlFor={`mn-q-${panel}`}>
          Search
        </label>
        <input id={`mn-q-${panel}`} className="inp" style={{ width: 200 }} value={q} placeholder="keyword…" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        <span className="muted hide-m">Marketaux covers your watchlist{wl ? ` (${wl.name})` : ''}: 3 stories an hour on its free plan. Official announcements: {TABS.length + 1}) or HEADLINES.</span>
      </div>
      {!newsAvailable() ? (
        <div className="empty">Market news is read by the desktop app; the browser build has no data source.</div>
      ) : (
        <StoryList stories={list} empty={t || q.trim() ? `No story matches in what the sources returned.` : waiting ? 'Loading market news…' : 'No source has returned stories: the line above says why for each; keys and switches are on PROVIDERS.'} symbol={t || undefined} />
      )}
      <div className="note">
        Sources: Finnhub, Benzinga through Alpaca (15 minutes late on its free plan), Massive, Marketaux, Google News, the SEC&apos;s 8-K filings, Euronext and, if switched on, MarketWatch. A story carried by two
        sources shows once. Keys and switches are on{' '}
        <button type="button" className="act" onClick={() => execute(panel, 'PROVIDERS')}>
          PROVIDERS ›
        </button>
      </div>
    </div>
  );
}

/**
 * COMPANYNEWS: a US company's news from Finnhub (the last week), Alpaca, Massive and Marketaux, with a way to its
 * SEC filings; for any stock, Yahoo Finance's headlines and Google News's search in its market's languages; and
 * for a stock listed on Euronext, its press releases among Euronext's latest.
 */
export function CompanyNews({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const symbol = secTicker(s);
  // Yahoo's headlines cover any market Yahoo lists (Brussels, Paris, Amsterdam...), with or without keys.
  const ysym = s.cls === 'equity' ? (yahooSymbolFor(s) ?? s.yahoo ?? null) : null;
  // Euronext's feed holds its issuers' latest releases; a stock listed there gets those its company issued.
  const euronext = onEuronext(s);
  // Google News searches the company's name in the languages of its market (Dutch, French and English for Brussels).
  const gsec = s.cls === 'equity' ? s : null;
  const v = useCompanyNews(symbol);
  const vy = useYahooHeadlines(ysym);
  const vg = useGoogleNews(gsec);
  const ve = useEuronextReleases(euronext);
  const feeds = marketNews.use((x) => x.feeds);
  const yh = yahooHeadlines(ysym);
  const gn = googleNews(gsec);
  const en = euronext ? euronextReleases(s.name) : { stories: [] };
  // Google's links go through news.google.com, so it comes last: a story another source carries keeps that link.
  const stories = useMemo(() => mergeStories([symbol ? companyStories(symbol) : [], yh.stories, en.stories, gn.stories]), [symbol, ysym, gsec, euronext, s.name, v, vy, vg, ve]); // eslint-disable-line react-hooks/exhaustive-deps
  const { finnhub: fin, marketaux: mk, alpaca: al, massive: ms } = symbol ? companyFeeds(feeds, symbol) : {};
  const states = [...(symbol ? [fin, al, ms, mk] : []), ...(ysym ? [yh.feed] : []), ...(gsec ? [gn.feed] : []), ...(euronext ? [en.feed] : [])];
  const enWord = en.feed?.state === 'ok' ? feedWord('Euronext', { ...en.feed, count: en.stories.length }, ` among its latest ${en.feed.count ?? 0}`) : feedWord('Euronext', en.feed);
  const status = [
    ...(symbol ? [feedWord('Finnhub', fin), feedWord('Alpaca', al), feedWord('Massive', ms), feedWord('Marketaux', mk)] : []),
    ...(ysym ? [feedWord('Yahoo Finance', yh.feed)] : []),
    ...(gsec ? [feedWord('Google News', gn.feed)] : []),
    ...(euronext ? [enWord] : []),
  ].join(' · ');
  return (
    <div className="fn-fill">
      <FnHeader code="COMPANYNEWS" title="Company News" sec={s} sub={symbol || ysym || gsec || euronext ? `${stories.length} stories · ${status}` : 'Stocks'} />
      <div className="chart-tools">
        {symbol ? (
          <button type="button" className="btn" onClick={() => execute(panel, `${s.id} FILINGS`)}>
            Its SEC filings
          </button>
        ) : null}
        <span className="muted hide-m">
          {symbol ? "News from Finnhub (the last week), Alpaca, Massive and Marketaux, Yahoo Finance headlines and Google News" : 'Yahoo Finance headlines and Google News'} for {s.ticker}, newest first
          {euronext ? `, with ${s.name}'s press releases among Euronext's latest (matched by the issuer's name)` : ''}.
        </span>
      </div>
      {!symbol && !ysym && !gsec && !euronext ? (
        <div className="empty">Company news covers stocks; {s.ticker} is not one.</div>
      ) : !newsAvailable() ? (
        <div className="empty">Company news is read by the desktop app; the browser build has no data source.</div>
      ) : (
        <StoryList
          stories={stories}
          empty={
            states.some((f) => !f || f.state === 'loading')
              ? 'Loading company news…'
              : states.every((f) => f?.state === 'needs-key' || f?.state === 'off')
                ? 'Company news needs a source switched on with its key (PROVIDERS).'
                : `No recent stories for ${s.ticker} from the sources: the line above says what each returned.`
          }
          symbol={symbol ?? ysym ?? undefined}
        />
      )}
    </div>
  );
}
