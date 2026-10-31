// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect, useMemo, useRef, useState } from 'react';
import { isBreakingStory } from '../data/live/breaking';
import { FnHeader } from '../components/FnHeader';
import { fmtDate, fmtStamp, fmtTime } from '../core/format';
import { engine } from '../data/market';
import { useProviderReport } from '../data/providers';
import { secTicker } from '../data/live/sec';
import { combinedFeed, MARKET_EDITIONS, MARKET_SOURCES, marketNews, newsAvailable, sameTicker, storiesFor, useMarketNews, watchSymbols, type FeedState, type MarketStory } from '../data/live/marketnews';
import { securityNews, useSecuritiesNews } from '../data/live/secnews';
import { watchlists } from '../terminal/userdata';
import { execute } from '../terminal/exec';
import { flash, useMenu, useNumberedRows, usePanelId } from '../terminal/panel';
import { firstRowNumber } from '../terminal/numbering';
import { sourceCode } from '../data/sourcecode';
import type { FnProps, MenuItem } from '../terminal/types';

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

/** A story's header line as CN gives it: the publication date with the four-digit year, the time to the second and the source's code. */
export function storyStamp(story: Pick<MarketStory, 'time' | 'publisher'>): string {
  return `${fmtDate(story.time, undefined, true)} ${fmtTime(story.time)} [${sourceCode(story.publisher)}]`;
}

function Reader({ story, symbol, onBack }: { story: MarketStory; symbol?: string; onBack: () => void }) {
  return (
    <article className="story">
      <button type="button" className="btn show-m" onClick={onBack}>
        ‹ Headlines
      </button>
      <div className="meta">
        <span className="muted story-stamp" title="Publication time, as the source gives it, and the source's code">
          {storyStamp(story)}
        </span>
        <span className="amber">{story.publisher}</span>
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

/**
 * The terminal's Top Ranked News: of the last day's stories, those most sources carry, then those tagged with the
 * company, newest first among equals. Stories carried once and untagged are not ranked.
 */
export function rankStories(stories: MarketStory[], now: number, symbol?: string, n = 3): MarketStory[] {
  const score = (s: MarketStory) => (s.feeds.length - 1) * 3 + (symbol && s.tickers.includes(symbol) ? 1 : 0) + (s.filing ? -2 : 0);
  return stories
    .filter((s) => now - s.time < 24 * 3_600_000 && s.feeds.length > 1 && !s.filing)
    .sort((a, b) => score(b) - score(a) || b.time - a.time)
    .slice(0, n);
}

/** A story list's headlines in the order shown and the story open in the reader. */
export interface StoryReader {
  now: number;
  /** With `ranked`, the stories under Top Ranked News; the rest follow under Time Ordered News. */
  top: MarketStory[];
  stories: MarketStory[];
  /** The story chosen, or the first headline until one is. */
  current?: MarketStory;
  /** The headlines just above and below the open one, which a story's 4) Previous and 3) Next open. */
  prev?: MarketStory;
  next?: MarketStory;
  /** A story was chosen: on a phone the reader then takes the list's place. */
  reading: boolean;
  open: (story: MarketStory | null) => void;
  /** Opens a story from 4) Previous or 3) Next; `stepped` counts those, so the list brings the open headline into view. */
  step: (story: MarketStory) => void;
  stepped: number;
}

/** The list's order at `now` with the story `sel` open (the first headline when none is), and that story's neighbours. */
export function storyOrder(given: MarketStory[], now: number, sel: string | null, symbol?: string, ranked = 0): Pick<StoryReader, 'top' | 'stories' | 'current' | 'prev' | 'next'> {
  // With `ranked`, the top stories head the list under Top Ranked News; the rest follow under Time Ordered News.
  const top = ranked ? rankStories(given, now, symbol, ranked) : [];
  const stories = top.length ? [...top, ...given.filter((s) => !top.includes(s))] : given;
  const at = Math.max(0, stories.findIndex((s) => s.id === sel));
  return { top, stories, current: stories[at], prev: at > 0 ? stories[at - 1] : undefined, next: stories[at + 1] };
}

/** A story list's state, held by a screen that steps through its stories (COMPANYNEWS) and given to StoryPane. */
export function useStoryReader(given: MarketStory[], symbol?: string, ranked = 0): StoryReader {
  const [sel, setSel] = useState<string | null>(null);
  const [stepped, setStepped] = useState(0);
  const now = engine.now();
  return {
    now,
    ...storyOrder(given, now, sel, symbol, ranked),
    reading: !!sel,
    open: (s) => setSel(s?.id ?? null),
    step: (s) => {
      setSel(s.id);
      setStepped((n) => n + 1);
    },
    stepped,
  };
}

/** A story's numbered action on CN's function bar; with nowhere to go it is disabled, and `why` says so. */
export interface StoryStep extends MenuItem {
  to?: MarketStory;
  why: string;
}

/**
 * CN's 4) Previous and 3) Next, in the function bar's order: they open the headline above and below the open story
 * in the list's order. At the list's ends, or with no story, the button is disabled and its number says why.
 */
export function storySteps(reader: Pick<StoryReader, 'current' | 'prev' | 'next' | 'step'>, panel: number): StoryStep[] {
  const action = (n: number, label: string, to: MarketStory | undefined, end: string): StoryStep => {
    const why = reader.current ? end : 'No story is open';
    return { n, label, to, why, run: () => (to ? reader.step(to) : flash(panel, why, 'error')) };
  };
  return [action(4, 'Previous', reader.prev, 'No previous story: the first headline is open'), action(3, 'Next', reader.next, 'No next story: the last headline is open')];
}

interface StoryListProps {
  empty: string;
  symbol?: string;
  fresh?: number;
  first?: number;
  breaking?: boolean;
}

/**
 * Headlines on the left, the selected story on the right. Headlines are numbered from `first`, clear of the
 * screen's own tabs and actions, and typing a headline's number and GO opens it. With `fresh`, stories published
 * less than that many milliseconds ago are marked NEW, and each line shows its age.
 */
export function StoryList({ stories, ranked = 0, ...props }: StoryListProps & { stories: MarketStory[]; ranked?: number }) {
  const reader = useStoryReader(stories, props.symbol, ranked);
  return <StoryPane reader={reader} {...props} />;
}

/** StoryList, its state held by the screen (useStoryReader), so the screen's own actions can open its stories. */
export function StoryPane({ reader, empty, symbol, fresh, first = 1, breaking = false }: StoryListProps & { reader: StoryReader }) {
  const { now, top, stories, current } = reader;
  const nums = useNumberedRows('story-list', stories, first, reader.open, (s) => s.title);
  const list = useRef<HTMLDivElement>(null);
  // After 4) Previous or 3) Next, the open story's headline scrolls into view if the list had it out of sight.
  useEffect(() => {
    if (reader.stepped) list.current?.querySelector('.news-item.sel')?.scrollIntoView({ block: 'nearest' });
  }, [reader.stepped]);
  return (
    <div className={`news${reader.reading ? ' reading' : ''}`} style={{ flex: 1, minHeight: 0 }}>
      <div className="news-list" role="list" ref={list}>
        {stories.length === 0 && <div className="empty">{empty}</div>}
        {stories.map((s, i) => [
          top.length && i === 0 ? <div key="h-top" className="news-head" role="presentation">Top Ranked News</div> : null,
          top.length && i === top.length ? <div key="h-time" className="news-head" role="presentation">Time Ordered News</div> : null,
          <div key={s.id} role="listitem" className={`news-item numbered real${current?.id === s.id ? ' sel' : ''}${fresh && now - s.time < fresh ? ' fresh' : ''}`} onClick={() => reader.open(s)}>
            <span className="news-n">{nums[i] !== undefined ? `${nums[i]})` : ''}</span>
            <span className="time" title={`Published ${fmtDate(s.time)} ${fmtTime(s.time)}`}>
              {fresh ? ageText(now - s.time) : fmtStamp(s.time, now)}
            </span>
            <span className="hl">
              {breaking && isBreakingStory(s, now) ? <span className="badge brk" title="Breaking: published in the last two hours, reporting an event that moves a stock">BREAKING</span> : null}
              {fresh && now - s.time < fresh ? <span className="badge new">NEW</span> : null}
              {fresh && s.feeds.length > 1 ? <span className="badge src-n" title={`Carried by ${s.feeds.join(', ')}`}>{s.feeds.length}×</span> : null}
              {s.title}
              {s.tickers.length ? <span className="muted"> · {s.tickers.slice(0, 4).join(' ')}</span> : null}
              <Sentiment story={s} symbol={symbol} />
            </span>
            <span className="src" title={s.publisher}>{sourceCode(s.publisher)}</span>
          </div>,
        ])}
      </div>
      {current ? <Reader key={current.id} story={current} symbol={symbol} onBack={() => reader.open(null)} /> : <div className="empty">Select a headline.</div>}
    </div>
  );
}

/** How long ago, in the units a reader scans: 4m, 2h 05m, 3d. */
export function ageText(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** One source's state in a few words. */
export function feedWord(name: string, f: FeedState | undefined, extra = ''): string {
  if (!f) return `${name}: not asked yet`;
  switch (f.state) {
    case 'ok':
      // An answer's message says what its count is of ("among its latest 10").
      return `${name}: ${f.count ?? 0}${f.stale ? ' (stale)' : ''}${f.at ? ` at ${fmtTime(f.at, false)}` : ''}${extra || (f.message ? ` ${f.message}` : '')}`;
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
        <StoryList stories={list} first={firstRowNumber([...TABS.map((x) => x.n), TABS.length + 1])} empty={t || q.trim() ? `No story matches in what the sources returned.` : waiting ? 'Loading market news…' : 'No source has returned stories: the line above says why for each; keys and switches are on PROVIDERS.'} symbol={t || undefined} ranked={t || q.trim() ? 0 : 4} />
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
  // Every source that covers the security: Finnhub, Alpaca, Massive and Marketaux for a US stock, Yahoo's headlines
  // for anything Yahoo quotes, Google News in the languages of its market, Euronext's releases for a stock listed there.
  const v = useSecuritiesNews([s]);
  const { stories, states } = useMemo(() => securityNews(s), [s, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const status = states.map(([n, f]) => feedWord(n, f)).join(' · ');
  const names = states.map(([n]) => n).filter((n) => n !== 'Euronext');
  // The screen holds the list's state so its 4) Previous and 3) Next, typed or clicked, step through the headlines.
  const reader = useStoryReader(stories, symbol ?? undefined, 3);
  const steps = storySteps(reader, panel);
  useMenu('story-steps', steps);
  return (
    <div className="fn-fill">
      <FnHeader
        code="COMPANYNEWS"
        title={s.cls === 'equity' ? 'Company News' : 'News'}
        sec={s}
        sub={states.length ? `${stories.length} stories · ${status}` : 'No news source'}
        right={steps.map((x) => (
          <button key={x.n} type="button" className="act story-step" disabled={!x.to} onClick={x.run} title={x.to ? `${x.to.title} (type ${x.n} and press Enter)` : x.why}>
            <b>{x.n})</b> {x.label}
          </button>
        ))}
      />
      <div className="chart-tools">
        {symbol ? (
          <button type="button" className="btn" onClick={() => execute(panel, `${s.id} FILINGS`)}>
            Its SEC filings
          </button>
        ) : null}
        <span className="muted hide-m">
          {names.length ? `${names.join(', ').replace(/, ([^,]*)$/, ' and $1')} for ${s.ticker}, newest first` : ''}
          {states.some(([n]) => n === 'Euronext') ? `, with ${s.name}'s press releases among Euronext's latest (matched by the issuer's name)` : ''}.
        </span>
      </div>
      {!states.length ? (
        <div className="empty">No news source covers {s.ticker}: news covers stocks, indices, currencies, commodities and coins.</div>
      ) : !newsAvailable() ? (
        <div className="empty">News is read by the desktop app; the browser build has no data source.</div>
      ) : (
        <StoryPane
          reader={reader}
          empty={
            states.some(([, f]) => !f || f.state === 'loading')
              ? 'Loading news…'
              : states.every(([, f]) => f?.state === 'needs-key' || f?.state === 'off')
                ? 'News needs a source switched on with its key (PROVIDERS).'
                : `No recent stories for ${s.ticker} from the sources: the line above says what each returned.`
          }
          symbol={symbol ?? undefined}
          // CN numbers its headlines from 101), clear of the screen's own numbered actions.
          first={101}
        />
      )}
    </div>
  );
}
