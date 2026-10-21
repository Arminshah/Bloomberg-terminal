import { useEffect, useMemo, useState } from 'react';
import { isMaterialHeadline } from '../data/live/breaking';
import { FnHeader } from '../components/FnHeader';
import { engine } from '../data/market';
import { news } from '../data/news';
import { BREAKING_SOURCES, combinedFeed, MARKET_EDITIONS, marketNews, mergeStories, newsAvailable, officialStories, sameTicker, storiesFor, useBreakingNews, type MarketStory } from '../data/live/marketnews';
import { LIST_REACH, securitiesNews, useSecuritiesNews } from '../data/live/secnews';
import type { SecurityDef } from '../data/types';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import { firstRowNumber } from '../terminal/numbering';
import { favourites, watchlists } from '../terminal/userdata';
import { dismissAllFavAlerts, dismissFavAlert, favAlerts } from '../terminal/favalerts';
import type { FnProps } from '../terminal/types';
import { fmtDate, fmtTime } from '../core/format';
import { ageText, feedWord, StoryList } from './MNEWS';

const HOUR = 3_600_000;
/** A story published in the last 15 minutes is marked NEW. */
const FRESH = 15 * 60_000;

const TABS = [
  { n: 1, label: 'Last hour', window: HOUR, scope: 'all' },
  { n: 2, label: 'Last 4 hours', window: 4 * HOUR, scope: 'all' },
  { n: 3, label: 'Last 24 hours', window: 24 * HOUR, scope: 'all' },
  { n: 4, label: '★ Favourites', window: 24 * HOUR, scope: 'fav' },
  { n: 5, label: 'Watchlist', window: 24 * HOUR, scope: 'watch' },
] as const;

/** BREAKING FAV, BREAKING WATCH, BREAKING 4H and BREAKING TODAY open those tabs. */
function tabFor(args: string | undefined): number {
  const a = (args ?? '').trim().toUpperCase();
  if (/^FAV/.test(a)) return 4;
  if (/^W(ATCH)?/.test(a)) return 5;
  if (/^4H?$/.test(a)) return 2;
  if (/^(TODAY|24H?|DAY)$/.test(a)) return 3;
  return 1;
}

const defsOf = (ids: string[]) => ids.map((id) => engine.get(id)).filter((d): d is SecurityDef => !!d);
const rootTicker = (d: SecurityDef) => d.ticker.split(' ')[0];

/** The stories about some securities: those found for them, and the market's stories tagged with their tickers. */
function aboutThese(all: MarketStory[], found: MarketStory[], defs: SecurityDef[]): MarketStory[] {
  const ids = new Set(found.map((s) => s.id));
  const tickers = defs.map(rootTicker);
  return mergeStories([found, all.filter((s) => !ids.has(s.id) && s.tickers.some((t) => tickers.some((x) => sameTicker(t, x))))]);
}

/** The pop-ups about favourites not dismissed yet, newest first, with the same actions as the pop-ups themselves. */
function NotDismissed({ panel, now }: { panel: number; now: number }) {
  const open = favAlerts.use((s) => s.open);
  if (!open.length) return null;
  return (
    <div className="fav-missed" role="region" aria-label="Pop-ups about your favourites not dismissed">
      <div className="fav-missed-head">
        <span>
          ★ {open.length} pop-up{open.length === 1 ? '' : 's'} not dismissed
        </span>
        <button type="button" className="btn" onClick={dismissAllFavAlerts}>
          Dismiss all
        </button>
      </div>
      {open.map((a) => (
        <div key={a.id} className="fav-missed-row">
          <span className="time" title={`Published ${fmtDate(a.time)} ${fmtTime(a.time)}`}>
            {ageText(now - a.time)}
          </span>
          {a.sec ? (
            <button type="button" className="link" title={`${a.sec}: company news (COMPANYNEWS)`} onClick={() => execute(panel, `${a.sec} COMPANYNEWS`)}>
              {a.tickers.join(' ')}
            </button>
          ) : (
            <span className="link">{a.tickers.join(' ')}</span>
          )}
          <a href={a.url} target="_blank" rel="noreferrer noopener" title={a.title} onClick={() => dismissFavAlert(a.id)}>
            {a.title}
          </a>
          <span className="src">{a.publisher}</span>
          <button type="button" className="toast-x" aria-label={`Dismiss: ${a.title}`} title="Dismiss" onClick={() => dismissFavAlert(a.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * BREAKING (FIRST, BN): the newest stories from every news source, the official announcements and your favourites'
 * news, newest first, with their age; a story published in the last 15 minutes is marked NEW and a story several
 * sources carried shows how many. The fast sources are asked every 2 to 3 minutes while it is open.
 */
export function BREAKING({ route }: FnProps) {
  const panel = usePanelId();
  const [tab, setTab] = useState(() => tabFor(route.args));
  const [q, setQ] = useState('');
  // Only the stories reporting an event that moves a stock (src/data/live/breaking.ts).
  const [only, setOnly] = useState(false);
  const v = useBreakingNews();
  const favIds = favourites.use((s) => s.ids);
  const wl = watchlists.use((w) => w.lists[w.active] ?? w.lists[0]);
  const favDefs = useMemo(() => defsOf(favIds), [favIds]);
  const watchDefs = useMemo(() => defsOf(wl?.ids ?? []), [wl]);
  const scope = TABS[tab - 1].scope;
  // Favourites' news is read on every tab, so their stories count as breaking; a watchlist's only on its tab.
  const vf = useSecuritiesNews(favDefs, LIST_REACH);
  const vw = useSecuritiesNews(scope === 'watch' ? watchDefs : [], LIST_REACH);
  const official = news.use((n) => n.stories);
  const feeds = marketNews.use((s) => s.feeds);
  // Ages move on even when no source has answered.
  const [, setClock] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setClock((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const now = engine.now();

  const { all, fav, watch } = useMemo(() => {
    const favFound = securitiesNews(favDefs, LIST_REACH);
    const market = mergeStories([storiesFor(BREAKING_SOURCES), officialStories(official), favFound]);
    return {
      all: market,
      fav: aboutThese(market, favFound, favDefs),
      watch: scope === 'watch' ? aboutThese(market, securitiesNews(watchDefs, LIST_REACH, 40), watchDefs) : [],
    };
  }, [v, vf, vw, official, favDefs, watchDefs, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const window = TABS[tab - 1].window;
  const words = q.trim().toLowerCase();
  const list = (scope === 'fav' ? fav : scope === 'watch' ? watch : all).filter(
    // A time more than five minutes ahead is a source's error, not news from the future.
    (s) => s.time >= now - window && s.time <= now + 5 * 60_000 && (!words || `${s.title} ${s.summary ?? ''} ${s.tickers.join(' ')}`.toLowerCase().includes(words)) && (!only || isMaterialHeadline(s.title)),
  );
  const fresh = list.filter((s) => now - s.time < FRESH).length;
  const sources = [
    feedWord('Finnhub', combinedFeed([feeds['finnhub-market'], feeds['finnhub-market:merger']])),
    feedWord('Alpaca', feeds['alpaca-market']),
    feedWord('Google News', combinedFeed(MARKET_EDITIONS.map((e) => feeds[`google-news-breaking:${e}`]))),
    feedWord('Massive', feeds['massive-market']),
  ].join(' · ');
  const empty =
    scope === 'fav' && !favDefs.length
      ? 'No favourites yet: ☆ beside a security\'s name stars it, and its stories show here.'
      : words
        ? 'No story matches in this window.'
        : Object.keys(feeds).length === 0
          ? 'Loading the latest news…'
          : `No story in the ${TABS[tab - 1].label.toLowerCase().replace('★ ', '')} yet: a wider window (2, 3) shows more.`;
  return (
    <div className="fn-fill">
      <FnHeader
        code="BREAKING"
        title="Breaking News"
        sub={`${list.length} stories · ${fresh} in the last 15 minutes${list[0] ? ` · newest ${ageText(now - list[0].time)}` : ''} · ${sources}`}
        tabs={TABS.map((t) => ({ n: t.n, label: t.label }))}
        tab={tab}
        onTab={setTab}
        actions={[
          { n: 6, label: 'Market news', onClick: () => execute(panel, 'MARKETNEWS'), title: 'All market news (MARKETNEWS)' },
          { n: 7, label: 'Favourites', onClick: () => execute(panel, 'FAVOURITES NEWS'), title: 'Your favourites with their news (FAVOURITES)' },
        ]}
      />
      <div className="chart-tools">
        <label className="fld" htmlFor={`bn-q-${panel}`}>
          Search
        </label>
        <input id={`bn-q-${panel}`} className="inp" style={{ width: 200 }} value={q} placeholder="keyword or ticker…" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        <button type="button" className={`act${only ? ' on' : ''}`} aria-pressed={only} onClick={() => setOnly(!only)} title="Only stories reporting an event that moves a stock: results, guidance, rating changes, deals, approvals, offerings, management changes, legal action, large share moves">
          Breaking only
        </button>
        <span className="muted hide-m">BREAKING: a stock-moving event of the last two hours · NEW: published in the last 15 minutes · 2×: carried by two sources · refreshed every 1 to 3 minutes while open</span>
      </div>
      {scope === 'fav' ? <NotDismissed panel={panel} now={now} /> : null}
      {!newsAvailable() ? (
        <div className="empty">Breaking news is read by the desktop app; the browser build has no data source.</div>
      ) : (
        <StoryList stories={list} fresh={FRESH} breaking first={firstRowNumber([...TABS.map((t) => t.n), 6, 7])} empty={only && !words ? 'No stock-moving story in this window: switch Breaking only off for every headline.' : empty} />
      )}
      <div className="note">
        Every market news source (Finnhub, Benzinga through Alpaca, Massive, Google News&apos;s search of the last hour, MarketWatch if switched on, the SEC&apos;s 8-K filings, Euronext), the official announcements and your
        favourites&apos; news. Alpaca&apos;s free plan delivers stories 15 minutes after publication; Google lists a story when it finds it. New stories on your favourites pop up and stay until you close them (those not
        dismissed are listed on 4) ★ Favourites); central bank announcements pop up for a few seconds (SETTINGS: Pop up flash headlines).
      </div>
    </div>
  );
}
