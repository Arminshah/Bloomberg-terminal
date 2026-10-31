import { useEffect, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Freshness } from '../components/Freshness';
import { Section } from '../components/cells';
import { XYChart } from '../components/chart/XYChart';
import { palette, useColourScheme } from '../terminal/palette';
import { fmtBig, fmtNum, fmtPct, fmtTime } from '../core/format';
import { krakenOwns, krakenPairFor, loadKrakenBook, type KrakenBook } from '../data/live/kraken';
import { engine, useTick } from '../data/market';
import { orderBook, type Level } from '../data/book';
import type { SecurityDef } from '../data/types';
import type { FnProps } from '../terminal/types';
import { RealBadge, SimBadge } from '../components/Source';

/** Level 1 on real data: the source's best bid and offer, with no invented depth behind them. */
export function TopOfBook({ sec }: { sec: SecurityDef }) {
  useTick(1);
  const q = engine.quote(sec.id)!;
  const has = Number.isFinite(q.bid) && Number.isFinite(q.ask);
  if (!has) return <div className="empty">No bid or offer from the source right now{q.src === 'CLOSE' ? ' (market closed)' : ''}.</div>;
  const spread = q.ask - q.bid;
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th className="num">Bid</th>
          <th className="num">Ask</th>
          <th className="num">Spread</th>
          <th className="num hide-m">Spread bp</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="num up b">{fmtNum(q.bid, sec.dec)}</td>
          <td className="num dn b">{fmtNum(q.ask, sec.dec)}</td>
          <td className="num">{fmtNum(spread, sec.dec)}</td>
          <td className="num hide-m">{fmtNum((spread / ((q.bid + q.ask) / 2)) * 10000, 1)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function BookTable({ sec, levels = 10, compact }: { sec: SecurityDef; levels?: number; compact?: boolean }) {
  useTick(1);
  const b = orderBook(sec.id, levels);
  const max = Math.max(...b.bids.map((x) => x.size), ...b.asks.map((x) => x.size));
  const cum = (xs: Level[]) => {
    let c = 0;
    return xs.map((x) => (c += x.size));
  };
  const cb = cum(b.bids);
  const ca = cum(b.asks);
  const sizeDec = sec.cls === 'crypto' ? 3 : 0;
  return (
    <table className="tbl">
      <thead>
        <tr>
          {!compact && <th className="num hide-m">#Ord</th>}
          {!compact && <th className="num hide-m">Cum</th>}
          <th className="num">Bid size</th>
          <th className="num">Bid</th>
          <th className="num">Ask</th>
          <th className="num">Ask size</th>
          {!compact && <th className="num hide-m">Cum</th>}
          {!compact && <th className="num hide-m">#Ord</th>}
        </tr>
      </thead>
      <tbody>
        {b.bids.map((bid, i) => {
          const ask = b.asks[i];
          return (
            <tr key={i}>
              {!compact && <td className="num muted hide-m">{bid.orders}</td>}
              {!compact && <td className="num muted hide-m">{fmtBig(cb[i])}</td>}
              <td className="num" style={{ background: `linear-gradient(to left, color-mix(in srgb, var(--up) 28%, transparent) ${(bid.size / max) * 100}%, transparent 0)` }}>
                {sizeDec ? fmtNum(bid.size, sizeDec) : fmtBig(bid.size)}
              </td>
              <td className={`num ${i === 0 ? 'up b' : 'up'}`}>{fmtNum(bid.px, sec.dec)}</td>
              <td className={`num ${i === 0 ? 'dn b' : 'dn'}`}>{fmtNum(ask.px, sec.dec)}</td>
              <td className="num" style={{ background: `linear-gradient(to right, color-mix(in srgb, var(--dn) 28%, transparent) ${(ask.size / max) * 100}%, transparent 0)` }}>
                {sizeDec ? fmtNum(ask.size, sizeDec) : fmtBig(ask.size)}
              </td>
              {!compact && <td className="num muted hide-m">{fmtBig(ca[i])}</td>}
              {!compact && <td className="num muted hide-m">{ask.orders}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The book is always modelled; on real data its top level is the real bid and offer. */
export function BookSource({ id }: { id: string }) {
  const q = engine.quote(id);
  const touch = engine.isExternal(id) && q && Number.isFinite(q.bid) && Number.isFinite(q.ask);
  if (engine.realOnly) {
    return (
      <>
        <RealBadge /> best bid and offer from the source · deeper levels have no free feed
      </>
    );
  }
  return (
    <>
      <SimBadge /> order book{touch ? ' around the real best bid and offer' : ''} · no depth feed is available
    </>
  );
}

const BOOK_MS = 3_000;

/**
 * Kraken's own order book for a crypto line: the best levels on each side as
 * the exchange publishes them, asked for every few seconds while the screen
 * is open. It is one exchange's book, not the whole market's.
 */
function KrakenDepth({ sec: s }: { sec: SecurityDef }) {
  const [book, setBook] = useState<(KrakenBook & { at: number }) | null>(null);
  const [failed, setFailed] = useState<{ at: number; n: number } | null>(null);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      const b = await loadKrakenBook(s.id, 15).catch(() => null);
      if (!live) return;
      if (b) {
        setBook(b);
        setFailed(null);
      } else setFailed((f) => ({ at: Date.now(), n: (f?.n ?? 0) + 1 }));
      timer = setTimeout(() => void load(), BOOK_MS);
    };
    void load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [s.id]);
  const pair = krakenPairFor(s.id);
  const stale = !!failed && !!book;
  const sizeDec = 4;
  const rows = book ? Math.max(book.bids.length, book.asks.length) : 0;
  let cb = 0;
  let ca = 0;
  const cumBid = book?.bids.map((l) => (cb += l.volume)) ?? [];
  const cumAsk = book?.asks.map((l) => (ca += l.volume)) ?? [];
  const spread = book?.asks[0] && book?.bids[0] ? book.asks[0].price - book.bids[0].price : NaN;
  const mid = book?.asks[0] && book?.bids[0] ? (book.asks[0].price + book.bids[0].price) / 2 : NaN;
  return (
    <div>
      <FnHeader
        code="DEPTH"
        title="Market Depth"
        sec={s}
        sub={
          <>
            Kraken order book, {pair?.base}/USD, top 15 levels ·{' '}
            {book ? (
              stale ? (
                <Freshness label="STALE" title={`Kraken has not answered since ${fmtTime(book.at)}; the book shown is from then`} />
              ) : (
                <Freshness label="REAL-TIME" title={`Kraken's book as of ${fmtTime(book.at)} (Kraken server time), asked for every ${BOOK_MS / 1000} s`} />
              )
            ) : null}
          </>
        }
      />
      {!book ? (
        <div className="empty">{failed ? 'Kraken did not answer; trying again every few seconds (PROVIDERS shows why).' : 'Loading the order book from Kraken…'}</div>
      ) : (
        <>
          <div className="chart-tools">
            <span>
              <span className="lbl">Spread</span> {fmtNum(spread, s.dec)} ({fmtNum((spread / mid) * 10000, 2)} bp)
            </span>
            <span>
              <span className="lbl">Bid volume</span> {fmtNum(cb, sizeDec)} {pair?.base}
            </span>
            <span>
              <span className="lbl">Ask volume</span> {fmtNum(ca, sizeDec)} {pair?.base}
            </span>
            <span className="muted">as of {fmtTime(book.at)} (Kraken server time)</span>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th className="num hide-m">Cum</th>
                <th className="num">Bid size</th>
                <th className="num">Bid</th>
                <th className="num">Ask</th>
                <th className="num">Ask size</th>
                <th className="num hide-m">Cum</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, i) => {
                const b = book.bids[i];
                const a = book.asks[i];
                return (
                  <tr key={i}>
                    <td className="num muted hide-m">{b ? fmtNum(cumBid[i], sizeDec) : ''}</td>
                    <td className="num" title={b ? `Level changed ${fmtTime(b.time)}` : undefined}>
                      {b ? fmtNum(b.volume, sizeDec) : ''}
                    </td>
                    <td className="num up">{b ? fmtNum(b.price, s.dec) : ''}</td>
                    <td className="num dn">{a ? fmtNum(a.price, s.dec) : ''}</td>
                    <td className="num" title={a ? `Level changed ${fmtTime(a.time)}` : undefined}>
                      {a ? fmtNum(a.volume, sizeDec) : ''}
                    </td>
                    <td className="num muted hide-m">{a ? fmtNum(cumAsk[i], sizeDec) : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="note">Sizes in {pair?.base}. Kraken&apos;s own resting orders only: other exchanges trade the same asset at their own prices, and a displayed level is not a guaranteed fill.</div>
        </>
      )}
    </div>
  );
}

export function DEPTH({ sec }: FnProps) {
  const s = sec!;
  if (engine.realOnly && krakenOwns(s.id)) return <KrakenDepth sec={s} />;
  if (engine.realOnly) {
    return (
      <div>
        <FnHeader code="DEPTH" title="Market Depth" sec={s} sub={<BookSource id={s.id} />} />
        <Section title="Top of book" right={engine.quote(s.id)?.src === 'CLOSE' ? 'outside the regular session' : undefined}>
          <TopOfBook sec={s} />
        </Section>
        <div className="note">The desktop app shows the best bid and offer the source publishes. Full order book depth needs an exchange data feed, so no levels behind the top are shown.</div>
      </div>
    );
  }
  return <DepthSim sec={s} />;
}

function DepthSim({ sec: s }: { sec: SecurityDef }) {
  useColourScheme();
  const colours = palette();
  useTick(1);
  const b = orderBook(s.id, 15);
  const bidTot = b.bids.reduce((a, x) => a + x.size, 0);
  const askTot = b.asks.reduce((a, x) => a + x.size, 0);
  let c = 0;
  const bidPts = b.bids.map((x) => ({ x: x.px, y: (c += x.size) })).reverse();
  c = 0;
  const askPts = b.asks.map((x) => ({ x: x.px, y: (c += x.size) }));
  const spread = b.asks[0].px - b.bids[0].px;
  return (
    <div>
      <FnHeader code="DEPTH" title="Market Depth" sec={s} sub={<BookSource id={s.id} />} />
      <div className="chart-tools">
        <span>
          <span className="amber">Spread</span> {fmtNum(spread, s.dec)} ({fmtNum((spread / b.bids[0].px) * 10000, 1)} bp)
        </span>
        <span>
          <span className="amber">Bid depth</span> {fmtBig(bidTot)} <span className="amber">Ask depth</span> {fmtBig(askTot)}
        </span>
        <span>
          <span className="amber">Imbalance</span> <span className={bidTot > askTot ? 'up' : 'dn'}>{fmtPct(((bidTot - askTot) / (bidTot + askTot)) * 100, 1)}</span>
        </span>
      </div>
      <div className="cols">
        <Section title="Order book">
          <BookTable sec={s} levels={15} />
        </Section>
        <Section title="Cumulative depth">
          <XYChart
            height={330}
            series={[
              { label: 'Bids', color: colours.up, points: bidPts, width: 2 },
              { label: 'Asks', color: colours.dn, points: askPts, width: 2 },
            ]}
            xFormat={(v) => fmtNum(v, s.dec)}
            yFormat={(v) => fmtBig(v)}
            yZero
          />
        </Section>
      </div>
    </div>
  );
}
