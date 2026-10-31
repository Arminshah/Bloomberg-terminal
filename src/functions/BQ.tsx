// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { QuoteFreshness } from '../components/Freshness';
import { useEffect, useMemo } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Flash } from '../components/Flash';
import { ChartView } from '../components/chart/ChartView';
import type { ChartOptions } from '../components/chart/PriceChart';
import { DayChg, KV, Section } from '../components/cells';
import { TopOfBook, BookTable } from './DEPTH';
import { peText } from './DESEquity';
import { TapeSource, TradeTape } from './TAS';
import { SimBadge } from '../components/Source';
import { AnalystSummary, useAnalystSnapshot } from '../components/AnalystSummary';
import { useFundamentals } from '../data/live/yfund';
import { fmtBig, fmtDay, fmtMln, fmtNum, fmtPct, fmtStamp, fmtTime } from '../core/format';
import { engine, useQuote, useTick } from '../data/market';
import { rangeStats } from '../data/analytics';
import { keyStats, nextEarnings } from '../data/fundamentals';
import { NextEarnings } from '../components/NextEarnings';
import { MarketValue } from '../components/MarketValue';
import { news } from '../data/news';
import { execute } from '../terminal/exec';
import { requestCompanyNews } from '../data/live/feeds';
import { iexFreshness, useIex, type IexState } from '../data/live/alpaca';
import { securityNews, useSecuritiesNews, type NewsReach } from '../data/live/secnews';
import { secTicker } from '../data/live/sec';
import { usePanelId } from '../terminal/panel';
import type { Quote, SecurityDef } from '../data/types';
import type { FnProps } from '../terminal/types';
import { sourceCode } from '../data/sourcecode';
import { quoteAuditState } from '../data/live/quote-audit';
import { settleDue } from '../data/live/settled-volume';
import { nasdaqTicker } from '../data/live/nasdaq-book';
import { dayNum } from '../data/calendar';
import '../styles/quote-terminal.css';

const QUOTE_REACH: NewsReach = { massive: false, marketaux: false };

/**
 * A US stock's finished session not yet checked against Nasdaq's historical record: its open, high, low and volume
 * are the price source's own readings, which can miss a print (Apple on 30 October 2026: a low of 342.35 against the
 * official 334.35) until the record arrives.
 */
export function provisionalSession(id: string, q: Quote, now = Date.now()): boolean {
  if (!engine.realOnly || q.sessionSettled || q.src === 'SIM' || q.src === 'NONE' || nasdaqTicker(id) === null) return false;
  const d = engine.daily(id);
  return d.length > 0 && settleDue(dayNum(d.t[d.length - 1]), now);
}

export function BQ({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const q = useQuote(s.id)!;
  useTick(1);
  useEffect(() => requestCompanyNews(s.id), [s.id]);
  useFundamentals(s.eq ? s : undefined);
  const rs = rangeStats(s.id);
  const intra = engine.intraday(s.id);
  const stories = news.use((n) => n.stories);
  const related = stories.filter((x) => x.tickers.includes(s.id)).slice(0, 8);
  // On real data: IEX quotes from Alpaca for US-listed stocks, and the latest news of any security from every source
  // that covers it (Massive's 5 calls a minute and Marketaux's daily allowance are left to COMPANYNEWS).
  const usStock = engine.realOnly ? secTicker(s) : null;
  const iexState = useIex(usStock ? s : undefined);
  const nv = useSecuritiesNews([engine.realOnly ? s : null], QUOTE_REACH);
  const { stories: allNews, states: newsStates } = useMemo(() => (engine.realOnly ? securityNews(s, QUOTE_REACH) : { stories: [], states: [] }), [s, nv]); // eslint-disable-line react-hooks/exhaustive-deps
  const companyNews = allNews.slice(0, 8);
  const newsNote = newsStates.some(([, f]) => f?.state === 'ok')
    ? 'No recent stories from the sources.'
    : newsStates.some(([, f]) => !f || f.state === 'loading')
      ? 'Loading company news…'
      : newsStates.map(([n, f]) => `${n}: ${f?.message ?? 'no answer'}`).join(' · ');
  let vwap = NaN;
  {
    let pv = 0;
    let v = 0;
    for (let i = 0; i < intra.length; i++) {
      pv += ((intra.h[i] + intra.l[i] + intra.c[i]) / 3) * intra.v[i];
      v += intra.v[i];
    }
    if (v > 0) vwap = pv / v;
  }
  const options: ChartOptions = useMemo(
    () => ({ type: 'mountain', dec: s.dec, label: s.ticker, intraday: true, overlays: [], lower: [], compare: [], percent: false, annotate: false, refLine: { value: engine.prevClose(s.id), label: 'Prev' }, initialBars: 100000, timeLabel: (t) => fmtTime(t, false) }),
    [s],
  );
  const y = s.quote === 'yield';
  const ks = s.eq ? keyStats(s) : undefined;
  const ne = s.eq ? nextEarnings(s) : undefined;
  // Price target, ratings and the next quarter's estimate from the parts ANALYSTS and EARNINGS load.
  const analysts = useAnalystSnapshot(s);
  const tradable = s.cls === 'equity' || s.cls === 'crypto' || s.cls === 'commodity' || s.cls === 'future';
  return (
    <div className="quote-terminal" data-audit-state={JSON.stringify(quoteAuditState(s, q, ks ? ks.mcap * 1e6 : undefined, Date.now()))}>
      <FnHeader
        code="QUOTE"
        title="Quote"
        sec={s}
        actions={[
          { n: 1, label: 'Chart', onClick: () => execute(panel, `${s.id} CHART`) },
          { n: 2, label: 'Profile', onClick: () => execute(panel, `${s.id} PROFILE`) },
          ...(!engine.realOnly || s.cls === 'equity' ? [{ n: 3, label: 'News', onClick: () => execute(panel, `${s.id} COMPANYNEWS`) }] : []),
          ...(engine.realOnly && s.cls === 'equity'
            ? [
                // SEC filings exist for US-listed companies only.
                ...(usStock ? [{ n: 4, label: 'Filings', onClick: () => execute(panel, `${s.id} FILINGS`) }] : []),
                { n: 5, label: 'Analysts', onClick: () => execute(panel, `${s.id} ANALYSTS`) },
              ]
            : []),
        ]}
      />
      <div className="cols quote-overview">
        <Section
          title="Quote"
          right={
            <>
              {q.provider ? `${q.provider} ` : ''}
              <QuoteFreshness id={s.id} />
            </>
          }
        >
          <div className="quote-identity">
            <span className="quote-security">{s.id}</span>
            <span className="quote-venue">{[s.exch ?? s.cmd?.exch ?? s.fut?.exch, y ? 'Yield %' : s.ccy].filter(Boolean).join(' · ')}</span>
          </div>
          <dl className={`quote-summary${y ? ' quote-summary-yield' : ''}`}>
            <div className="quote-last">
              <dt>{y ? 'Last yield (%)' : 'Last price'}</dt>
              <dd>
                <Flash value={q.last} className={`white ${q.tick > 0 ? 'arrow-up' : q.tick < 0 ? 'arrow-dn' : ''}`}>
                  {fmtNum(q.last, s.dec)}
                </Flash>
              </dd>
            </div>
            <div>
              <dt>{y ? 'Net change (bp)' : 'Net change'}</dt>
              <dd><DayChg q={q} bp={y} dec={s.dec} /></dd>
            </div>
            {!y ? <div><dt>% change</dt><dd><DayChg q={q} pct /></dd></div> : null}
          </dl>
          <dl className="quote-inside">
            <div><dt>{y ? 'Bid yield (%)' : 'Bid'}</dt><dd>{fmtNum(q.bid, s.dec)}</dd></div>
            <div><dt>{y ? 'Ask yield (%)' : 'Ask'}</dt><dd>{fmtNum(q.ask, s.dec)}</dd></div>
          </dl>
          {/* Outside the regular session the source's bid and offer are extended-hours quotes. */}
          {q.src === 'CLOSE' ? <div className="quote-session-note">Bid / ask outside the regular session</div> : null}
          <div className="quote-session-stats">
            <KV
              items={[
                ['Open', fmtNum(q.open, s.dec)],
                ['Day high', fmtNum(q.high, s.dec)],
                ['Day low', fmtNum(q.low, s.dec)],
                ['Previous close', fmtNum(q.prevClose, s.dec)],
              ]}
            />
            <KV
              items={[
                ...(q.volume > 0 ? ([[q.volumeUnit ? `Volume (${q.volumeUnit})` : 'Volume', fmtBig(q.volume)], ['VWAP', fmtNum(vwap, s.dec)], ['Avg vol 30D', fmtBig(rs.avgVol30)]] as [string, string][]) : []),
                ['52-week range', `${fmtNum(rs.lo52, s.dec)} – ${fmtNum(rs.hi52, s.dec)}`],
              ]}
            />
          </div>
          {provisionalSession(s.id, q) ? (
            <div className="quote-session-note" data-testid="provisional-session" title="Nasdaq's historical record gives a finished session's official open, high, low and consolidated volume; the app asks for it once the session ends.">
              Provisional: the price source&apos;s open, high, low and volume, until Nasdaq&apos;s official session record arrives
            </div>
          ) : null}
          <div className="quote-update"><span>Last update</span><span>{q.src === 'EOD' || q.dayOnly ? `as of ${fmtDay(q.time)}` : fmtStamp(q.time)}</span></div>
        </Section>
        <Section title="Intraday" right={`prev ${fmtNum(q.prevClose, s.dec)}`} className="quote-intraday">
          <div className="quote-chart">
            <ChartView series={intra} options={options} resetKey={s.id} />
          </div>
        </Section>
      </div>
      <div className="cols">
        {tradable ? (
          engine.realOnly ? (
            <Section title="Best bid and offer" right={q.src === 'CLOSE' ? 'level 1 from the source, outside the regular session' : 'level 1 from the source'}>
              <TopOfBook sec={s} />
            </Section>
          ) : (
            <Section title="Depth (top 5)" right={<SimBadge />}>
              <BookTable sec={s} levels={5} compact />
            </Section>
          )
        ) : null}
        {tradable ? (
          <Section title="Trades" right={<TapeSource id={s.id} short />}>
            <div style={{ maxHeight: 220, overflow: 'auto' }}>
              <TradeTape sec={s} rows={15} />
            </div>
          </Section>
        ) : null}
        <Section title={ks ? 'Key statistics' : 'Statistics'}>
          {ks ? (
            <KV
              items={[
                ['Market cap', <MarketValue key="mc" sec={s}>{`${fmtMln(ks.mcap)} ${ks.tradeCcy}`}</MarketValue>],
                ['P/E LTM', Number.isFinite(ks.pe) && ks.pe > 0 ? fmtNum(ks.pe, 1) : peText(NaN, ks.epsLtm)],
                ['Dividend yield 12M', fmtPct(ks.divYld, 2, false)],
                ['Beta (5Y monthly)', fmtNum(ks.beta, 2)],
                ['Next earnings', <NextEarnings key="ne" sec={s} ne={ne} />],
                ['Realised vol 30D', `${fmtNum(rs.vol30, 1)}%`],
              ]}
            />
          ) : (
            <KV
              items={[
                ['Realised vol 30D', `${fmtNum(rs.vol30, 1)}${y ? ' bp' : '%'}`],
                ['Realised vol 90D', `${fmtNum(rs.vol90, 1)}${y ? ' bp' : '%'}`],
                ['52W high date', fmtDay(rs.hi52t)],
                ['52W low date', fmtDay(rs.lo52t)],
              ]}
            />
          )}
          {s.cls === 'equity' ? (
            <>
              <div className="pad-s amber">Analyst consensus</div>
              <AnalystSummary sec={s} snap={analysts} />
            </>
          ) : null}
        </Section>
      </div>
      {engine.realOnly ? (
        usStock || newsStates.length ? (
          <div className="cols">
            {iexState ? (
              <Section
                title="IEX (Alpaca)"
                right={
                  <>
                    <span className="badge sim" title="One exchange's trades and quotes, not the whole US market">
                      IEX ONLY
                    </span>
                    {iexState.stale ? <span className="badge sim"> STALE</span> : null}
                  </>
                }
              >
                <IexPanel st={iexState} sec={s} q={q} />
              </Section>
            ) : null}
            <Section
              title={s.cls === 'equity' ? 'Company news' : 'Latest news'}
              right={
                <button type="button" className="act" onClick={() => execute(panel, `${s.id} COMPANYNEWS`)}>
                  All news ›
                </button>
              }
            >
              {companyNews.length ? (
                companyNews.map((st) => (
                  <a key={st.id} className="news-item real" href={st.url} target="_blank" rel="noreferrer noopener" title={st.title}>
                    <span className="time">{fmtStamp(st.time, engine.now())}</span>
                    <span className="hl">{st.title}</span>
                    <span className="src" title={st.publisher}>{sourceCode(st.publisher)}</span>
                  </a>
                ))
              ) : (
                <div className="note">
                  {newsNote}{' '}
                  {usStock ? (
                    <>
                      A company&apos;s own announcements are its filings:{' '}
                      <button type="button" className="act" onClick={() => execute(panel, `${s.id} FILINGS`)}>
                        FILINGS ›
                      </button>
                    </>
                  ) : null}
                </div>
              )}
            </Section>
          </div>
        ) : null
      ) : (
        <Section title="Latest news" right={<button type="button" className="act" onClick={() => execute(panel, `${s.id} COMPANYNEWS`)}>All news ›</button>}>
          {related.length === 0 ? (
            <div className="note">No recent stories.</div>
          ) : (
            related.map((st) => (
              <div key={st.id} className={`news-item${st.hot ? ' hot' : ''}`} onClick={() => execute(panel, `${s.id} COMPANYNEWS`)}>
                <span className="time">{fmtStamp(st.time, engine.now())}</span>
                <span className="hl">{st.headline}</span>
                <span className="src" title={st.source}>{sourceCode(st.source)}</span>
              </div>
            ))
          )}
        </Section>
      )}
    </div>
  );
}

/** Alpaca's IEX snapshot for a US stock, every figure marked as IEX's alone. */
function IexPanel({ st, sec, q }: { st: IexState; sec: SecurityDef; q: Quote }) {
  const panel = usePanelId();
  if (st.state === 'loading') return <div className="empty">Asking Alpaca for IEX quotes…</div>;
  if (!st.data) {
    return (
      <div className="note">
        {st.message ?? 'No IEX quote.'}{' '}
        {st.state === 'needs-key' || st.state === 'off' ? (
          <button type="button" className="act" onClick={() => execute(panel, 'PROVIDERS')}>
            PROVIDERS ›
          </button>
        ) : null}
      </div>
    );
  }
  const d = st.data;
  const dec = sec.dec;
  const freshness = iexFreshness(d, engine.now());
  const diff = Number.isFinite(q.last) ? d.last - q.last : NaN;
  const side = (px: number, size: number) => (px > 0 ? `${fmtNum(px, dec)} × ${fmtBig(size, 0)}` : '--');
  return (
    <>
      <KV
        items={[
          [
            'Last trade on IEX',
            <span key="l">
              <span className="white b">{fmtNum(d.last, dec)}</span>{Number.isFinite(d.lastAt) ? <span className="muted"> × {fmtBig(d.lastSize, 0)} at {fmtStamp(d.lastAt, engine.now())}{freshness.tradeStale ? ' (not current)' : ''}</span> : null}
            </span>,
          ],
          ['vs the quote above', Number.isFinite(diff) ? <span key="d" className={diff > 0 ? 'up' : diff < 0 ? 'dn' : 'muted'}>{`${diff > 0 ? '+' : ''}${fmtNum(diff, dec)}`}</span> : '--'],
          ['IEX bid / ask (IEX only)', `${side(d.bid, d.bidSize)} / ${side(d.ask, d.askSize)}`],
          ['IEX quote time', Number.isFinite(d.quoteAt) ? `${fmtStamp(d.quoteAt, engine.now())}${freshness.quoteStale ? ' (not current)' : ''}` : '--'],
          [`IEX volume ${fmtDay(d.dayAt)} (IEX only)`, Number.isFinite(d.volume) ? fmtBig(d.volume) : '--'],
          ['IEX day range (IEX only)', d.low > 0 ? `${fmtNum(d.low, dec)} - ${fmtNum(d.high, dec)}` : '--'],
          ['Response fetched', st.at ? fmtStamp(st.at, engine.now()) : '--'],
        ]}
      />
      <div className="note">
        IEX only: trades and quotes on one exchange, not the whole US market. The bid and ask are IEX&apos;s own, not the national best; volume and range count IEX trades alone. A recently fetched response can contain older trades or quotes, including when IEX is quiet or closed.{st.stale && st.message ? ` Latest request: ${st.message}` : ''}
      </div>
    </>
  );
}
