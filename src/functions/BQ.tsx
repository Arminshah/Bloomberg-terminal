import { QuoteFreshness } from '../components/Freshness';
import { useEffect, useMemo } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Flash } from '../components/Flash';
import { ChartView } from '../components/chart/ChartView';
import type { ChartOptions } from '../components/chart/PriceChart';
import { DayChg, KV, Section } from '../components/cells';
import { TopOfBook, BookTable } from './DEPTH';
import { TapeSource, TradeTape } from './TAS';
import { SimBadge } from '../components/Source';
import { useFundamentals } from '../data/live/yfund';
import { fmtBig, fmtDay, fmtEarnDate, fmtMln, fmtNum, fmtPct, fmtStamp, fmtTime } from '../core/format';
import { engine, useQuote, useTick } from '../data/market';
import { rangeStats } from '../data/analytics';
import { keyStats, nextEarnings } from '../data/fundamentals';
import { news } from '../data/news';
import { execute } from '../terminal/exec';
import { requestCompanyNews } from '../data/live/feeds';
import { useIex, type IexState } from '../data/live/alpaca';
import { companyStories, marketNews, useCompanyNews } from '../data/live/marketnews';
import { secTicker } from '../data/live/sec';
import { usePanelId } from '../terminal/panel';
import type { Quote, SecurityDef } from '../data/types';
import type { FnProps } from '../terminal/types';

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
  // On real data: IEX quotes from Alpaca and the company's news from Finnhub, for US-listed stocks.
  const usStock = engine.realOnly ? secTicker(s) : null;
  const iexState = useIex(usStock ? s : undefined);
  const nv = useCompanyNews(usStock, false);
  const feeds = marketNews.use((x) => x.feeds);
  const companyNews = useMemo(() => (usStock ? companyStories(usStock).slice(0, 8) : []), [usStock, nv]); // eslint-disable-line react-hooks/exhaustive-deps
  const newsFeed = usStock ? Object.entries(feeds).find(([k]) => k.startsWith(`finnhub-company:${usStock}|`))?.[1] : undefined;
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
  const tradable = s.cls === 'equity' || s.cls === 'crypto' || s.cls === 'commodity' || s.cls === 'future';
  return (
    <div>
      <FnHeader
        code="QUOTE"
        title="Quote"
        sec={s}
        sub={s.name}
        actions={[
          { n: 1, label: 'Chart', onClick: () => execute(panel, `${s.id} CHART`) },
          { n: 2, label: 'Profile', onClick: () => execute(panel, `${s.id} PROFILE`) },
          ...(!engine.realOnly || s.cls === 'equity' ? [{ n: 3, label: 'News', onClick: () => execute(panel, `${s.id} COMPANYNEWS`) }] : []),
          ...(engine.realOnly && s.cls === 'equity'
            ? [
                { n: 4, label: 'Filings', onClick: () => execute(panel, `${s.id} FILINGS`) },
                { n: 5, label: 'Analysts', onClick: () => execute(panel, `${s.id} ANALYSTS`) },
              ]
            : []),
        ]}
      />
      <div className="cols">
        <Section
          title="Quote"
          right={
            <>
              {q.provider ? `${q.provider} ` : ''}
              <QuoteFreshness id={s.id} />
            </>
          }
        >
          <div className="pad row" style={{ alignItems: 'baseline', gap: 14 }}>
            <Flash value={q.last} className={`white ${q.tick > 0 ? 'arrow-up' : q.tick < 0 ? 'arrow-dn' : ''}`}>
              <span style={{ fontSize: 30, fontWeight: 600 }}>{fmtNum(q.last, s.dec)}</span>
            </Flash>
            <span style={{ fontSize: 'var(--fs-xl)' }}>
              {y ? (
                <DayChg q={q} bp unit=" bp" />
              ) : (
                <>
                  <DayChg q={q} dec={s.dec} />{'  '}
                  <DayChg q={q} pct />
                </>
              )}
            </span>
          </div>
          <KV
            items={[
              // Outside the regular session the source's bid and offer are extended-hours quotes.
              [q.src === 'CLOSE' ? 'Bid / Ask (outside session)' : 'Bid / Ask', Number.isFinite(q.bid) ? `${fmtNum(q.bid, s.dec)} / ${fmtNum(q.ask, s.dec)}` : '--'],
              ['Open', fmtNum(q.open, s.dec)],
              ['Day high / low', `${fmtNum(q.high, s.dec)} / ${fmtNum(q.low, s.dec)}`],
              ['Previous close', fmtNum(q.prevClose, s.dec)],
              ...(q.volume > 0 ? ([['Volume', fmtBig(q.volume)], ['VWAP', fmtNum(vwap, s.dec)], ['Avg vol 30D', fmtBig(rs.avgVol30)]] as [string, string][]) : []),
              ['52-week range', `${fmtNum(rs.lo52, s.dec)} - ${fmtNum(rs.hi52, s.dec)}`],
              ['Last update', q.src === 'EOD' || q.dayOnly ? `as of ${fmtDay(q.time)}` : fmtStamp(q.time)],
            ]}
          />
        </Section>
        <Section title="Intraday" right={`prev ${fmtNum(q.prevClose, s.dec)}`}>
          <div style={{ height: 250, display: 'flex' }}>
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
                ['Market cap', `${fmtMln(ks.mcap)} ${ks.tradeCcy}`],
                ['P/E LTM', fmtNum(ks.pe, 1)],
                ['Dividend yield 12M', fmtPct(ks.divYld, 2, false)],
                ['Beta (5Y monthly)', fmtNum(ks.beta, 2)],
                ['Next earnings', ne ? fmtEarnDate(ne) : '--'],
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
        </Section>
      </div>
      {engine.realOnly ? (
        usStock ? (
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
              title="Company news"
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
                    <span className="src">{st.publisher.replace(/ \(company filing\)$/, '')}</span>
                  </a>
                ))
              ) : (
                <div className="note">
                  {newsFeed?.state === 'needs-key' || newsFeed?.state === 'off'
                    ? `Company news: ${newsFeed.message}`
                    : newsFeed?.state === 'error'
                      ? `Finnhub: ${newsFeed.message}`
                      : newsFeed?.state === 'ok'
                        ? 'No stories in the last week from Finnhub.'
                        : 'Loading company news…'}{' '}
                  A company&apos;s own announcements are its filings:{' '}
                  <button type="button" className="act" onClick={() => execute(panel, `${s.id} FILINGS`)}>
                    FILINGS ›
                  </button>
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
                <span className="src">{st.source}</span>
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
  const diff = Number.isFinite(q.last) ? d.last - q.last : NaN;
  const side = (px: number, size: number) => (px > 0 ? `${fmtNum(px, dec)} × ${fmtBig(size, 0)}` : '--');
  return (
    <>
      <KV
        items={[
          [
            'Last trade on IEX',
            <span key="l">
              <span className="white b">{fmtNum(d.last, dec)}</span> <span className="muted">× {fmtBig(d.lastSize, 0)} at {fmtStamp(d.lastAt, engine.now())}</span>
            </span>,
          ],
          ['vs the quote above', Number.isFinite(diff) ? <span key="d" className={diff > 0 ? 'up' : diff < 0 ? 'dn' : 'muted'}>{`${diff > 0 ? '+' : ''}${fmtNum(diff, dec)}`}</span> : '--'],
          ['IEX bid / ask (IEX only)', `${side(d.bid, d.bidSize)} / ${side(d.ask, d.askSize)}`],
          [`IEX volume ${fmtDay(d.dayAt)} (IEX only)`, Number.isFinite(d.volume) ? fmtBig(d.volume) : '--'],
          ['IEX day range (IEX only)', d.low > 0 ? `${fmtNum(d.low, dec)} - ${fmtNum(d.high, dec)}` : '--'],
          ['Received', st.at ? fmtTime(st.at) : '--'],
        ]}
      />
      <div className="note">
        IEX only: trades and quotes on one exchange, not the whole US market. The bid and ask are IEX&apos;s own, not the national best; volume and range count IEX trades alone.{st.stale && st.message ? ` Latest request: ${st.message}` : ''}
      </div>
    </>
  );
}
