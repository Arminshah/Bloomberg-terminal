// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect, useState, type ReactNode } from 'react';
import { CapLink } from '../components/CapLink';
import { FnHeader } from '../components/FnHeader';
import { exportActions } from '../components/ExportActions';
import { LivePx, openSecurity } from '../components/cells';
import { fmtBig, fmtNum, fmtPct, fmtSigned, fmtStamp } from '../core/format';
import { engine, useTick } from '../data/market';
import { BOARD_INDICES, indexData, memberReturn, useIndexMembers, type Board, type Member } from '../data/live/index-members';
import { loadNews, marketNews, newsAvailable, type MarketStory } from '../data/live/marketnews';
import type { SecurityDef } from '../data/types';
import { HeatTreemap, type HeatGroup } from '../components/HeatTreemap';
import { industryGroup } from '../data/gics';
import { execute } from '../terminal/exec';
import { useNumberedRows, usePanelId } from '../terminal/panel';
import { heatColour, useColourScheme } from '../terminal/palette';

/** The indices whose whole membership the app can load, in the selector's order. */
export const BOARD_CHOICES = ['SPX Index', 'NDX Index', 'INDU Index'];

const sign = (v: number) => (v > 0 ? 'up' : v < 0 ? 'dn' : '');

/** The amber index selector at the top left of the index monitors; choosing one reopens the screen on it. */
export function IndexPicker({ ix, fn }: { ix: SecurityDef; fn: string }) {
  const panel = usePanelId();
  const choices = BOARD_CHOICES.includes(ix.id) ? BOARD_CHOICES : [ix.id, ...BOARD_CHOICES];
  return (
    <select className="sel-inp idx-pick" aria-label="Index" value={ix.id} onChange={(e) => execute(panel, `${e.target.value} ${fn}`)}>
      {choices.map((id) => (
        <option key={id} value={id}>
          {id}
        </option>
      ))}
    </select>
  );
}

/** Opens a member's screen: its line in the app when there is one, else a lookup of the US ticker. */
export function openMember(panel: number, m: Member, fn = 'PROFILE') {
  if (m.id) openSecurity(panel, m.id, undefined, fn);
  else execute(panel, `${m.symbol.replace('.', '/')} US EQUITY ${fn}`);
}

/** When the source last answered, for the screens' status lines. */
function asOf(b: Board): string {
  const t = Math.max(...b.members.map((m) => m.time).filter(Number.isFinite), 0);
  return t ? fmtStamp(t) : '--';
}

function boardStatus(b: Board): ReactNode {
  if (b.state === 'error' && !b.members.length) return <div className="empty">{b.message ?? 'The member list could not be loaded.'}</div>;
  if (!b.members.length) return <div className="empty">Loading the members…</div>;
  return null;
}

// ------------------------------------------------------------------- MOV

interface MoverRow {
  key: string;
  label: string;
  member?: Member;
  last: number;
  pct: number;
  points: number;
  volume: number;
}

/** MOV on an index's whole membership: the header block, then the leaders and laggards in index points. */
export function BoardMovers({ ix }: { ix: SecurityDef }) {
  useTick(2);
  const panel = usePanelId();
  const board = useIndexMembers(ix.id)!;
  const [group, setGroup] = useState<'none' | 'sector'>('none');
  const iq = engine.quote(ix.id)!;
  const priced = board.members.filter((m) => Number.isFinite(m.pct));
  const up = priced.filter((m) => m.pct > 0).length;
  const down = priced.filter((m) => m.pct < 0).length;
  const unch = priced.length - up - down;
  const vols = board.members.filter((m) => Number.isFinite(m.volume));
  const vol = vols.reduce((a, m) => a + m.volume, 0);
  const price = board.index.weighting === 'price';
  const dec = price ? 2 : 3;
  let rows: MoverRow[];
  if (group === 'sector') {
    const by = new Map<string, Member[]>();
    for (const m of priced) by.set(m.sector || 'Other', [...(by.get(m.sector || 'Other') ?? []), m]);
    rows = [...by].map(([sector, ms]) => {
      const w = ms.reduce((a, m) => a + (Number.isFinite(m.weight) ? m.weight : 0), 0);
      return {
        key: sector,
        label: sector,
        last: NaN,
        pct: w > 0 ? ms.reduce((a, m) => a + (Number.isFinite(m.weight) ? m.weight * m.pct : 0), 0) / w : NaN,
        points: ms.reduce((a, m) => a + (Number.isFinite(m.points) ? m.points : 0), 0),
        volume: ms.reduce((a, m) => a + (Number.isFinite(m.volume) ? m.volume : 0), 0),
      };
    });
  } else {
    rows = priced.map((m) => ({ key: m.symbol, label: `${m.symbol} US`, member: m, last: m.last, pct: m.pct, points: m.points, volume: m.volume }));
  }
  const score = (r: MoverRow) => (Number.isFinite(r.points) ? r.points : r.pct);
  const leaders = rows.filter((r) => score(r) > 0).sort((a, b) => score(b) - score(a)).slice(0, 25);
  const laggards = rows.filter((r) => score(r) < 0).sort((a, b) => score(a) - score(b)).slice(0, 25);
  const open = (r: MoverRow) => (r.member ? openMember(panel, r.member) : setGroup('none'));
  // Rows are numbered down the leaders, then the laggards, as typed numbers open them.
  const numbered = useNumberedRows('mov-rows', [...leaders, ...laggards], 1, open, (r) => r.label);
  const csv = () => [
    ['Side', 'Ticker', 'Name', 'Price', '%Chg', 'Points', 'Volume'],
    ...leaders.map((r) => ['Leader', r.label, r.member?.name ?? '', r.last, r.pct, r.points, r.volume]),
    ...laggards.map((r) => ['Laggard', r.label, r.member?.name ?? '', r.last, r.pct, r.points, r.volume]),
  ];
  const table = (list: MoverRow[], first: number, title: string) => (
    <div className="mov-side">
      <div className="mov-title">{title}</div>
      <table className="tbl mov-tbl">
        <thead>
          <tr>
            <th>{group === 'sector' ? 'Sector' : 'Ticker'}</th>
            {group === 'none' && <th className="num">Price</th>}
            <th className="num">% Chg</th>
            <th className="num">Points</th>
            <th className="num">Volume</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r, i) => (
            <tr key={r.key} className="click" onClick={() => open(r)} title={r.member ? `${r.member.name} · ${r.member.sector}` : `${r.label}: show its members`}>
              <td>
                <span className="row-no">{numbered[first + i]}.</span>
                <span className={`mov-arrow ${sign(score(r))}`} aria-hidden="true">{score(r) > 0 ? '▲' : '▼'}</span>
                <span className="amber">{r.label}</span>
              </td>
              {group === 'none' && <td className="num white">{fmtNum(r.last, 2)}</td>}
              <td className={`num ${sign(r.pct)}`}>{fmtPct(r.pct, 2)}</td>
              <td className={`num ${sign(r.points)}`}>{fmtSigned(r.points, dec)}</td>
              <td className="num">{Number.isFinite(r.volume) && r.volume > 0 ? fmtBig(r.volume, 1) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const status = boardStatus(board);
  return (
    <div>
      <FnHeader code="CONTRIB" title="Equity Index Movers" sec={ix} actions={exportActions(panel, `${ix.ticker}_movers.csv`, csv)} />
      <div className="chart-tools">
        <IndexPicker ix={ix} fn="CONTRIB" />
        <label className="fld">
          Group By
          <select className="sel-inp" aria-label="Group by" value={group} onChange={(e) => setGroup(e.target.value as 'none' | 'sector')}>
            <option value="none">None</option>
            <option value="sector">Sector</option>
          </select>
        </label>
        <button type="button" className="btn-grey" onClick={() => execute(panel, `${ix.id} CN`)}>News</button>
        <button type="button" className="btn-grey" onClick={() => execute(panel, `${ix.id} MRR`)}>History</button>
      </div>
      <div className="mov-head">
        <HeadCell l="#Up" v={<span className="up">{priced.length ? up : '--'}</span>} />
        <HeadCell l="Last" v={<LivePx id={ix.id} />} />
        <HeadCell l="Open" v={fmtNum(iq.open, 2)} />
        <HeadCell l="#Down" v={<span className="dn">{priced.length ? down : '--'}</span>} />
        <HeadCell l="Net Chg" v={<span className={sign(iq.chg)}>{fmtSigned(iq.chg, 2)}</span>} />
        <HeadCell l="High" v={fmtNum(iq.high, 2)} />
        <HeadCell l="#Unch" v={priced.length ? unch : '--'} />
        <HeadCell l="% Chg" v={<span className={sign(iq.pct)}>{fmtPct(iq.pct, 2)}</span>} />
        <HeadCell l="Low" v={fmtNum(iq.low, 2)} />
        <HeadCell l="#Vol" v={vols.length ? fmtBig(vol, 2) : '--'} />
        <HeadCell l="Time" v={fmtStamp(iq.time)} />
        <span />
      </div>
      {status ?? (
        <div className="mov-cols">
          {table(leaders, 0, 'Leaders')}
          {table(laggards, leaders.length, 'Laggards')}
        </div>
      )}
      <p className="pad-s muted">
        {board.members.length ? `${priced.length} of ${board.members.length} members priced (Yahoo, as of ${asOf(board)}); volumes from Nasdaq. ` : ''}
        {price
          ? `Points = price change ÷ the Dow divisor (the members' previous closes summed, divided by the index's previous close); together ${fmtSigned(board.explained, 2)} against the index's ${fmtSigned(iq.chg, 2)}.`
          : board.weightsFrom
            ? `Points = weight × the index's previous close × the member's change. ${spyWeights(board.weightsFrom)} Together ${fmtSigned(board.explained, 2)} against the index's ${fmtSigned(iq.chg, 2)}.`
            : `Points are estimates: weights from market values (Nasdaq), not the index's float-adjusted weights; together ${fmtSigned(board.explained, 2)} against the index's ${fmtSigned(iq.chg, 2)}.`}
        {` Members from ${board.index.from}.`}
        {board.message ? ` ${board.message}` : ''}
      </p>
    </div>
  );
}

function HeadCell({ l, v }: { l: string; v: ReactNode }) {
  return (
    <span className="mov-hc">
      <span className="lbl">{l}</span>
      <span className="white">{v}</span>
    </span>
  );
}

// ------------------------------------------------------------------- MEMB

/** MEMB: the index's members with their weights, shares, price and market value. */
export function BoardMembers({ ix }: { ix: SecurityDef }) {
  useTick(2);
  const panel = usePanelId();
  const board = useIndexMembers(ix.id)!;
  const [sort, setSort] = useState<'weight' | 'name' | 'pct'>('weight');
  const list = [...board.members].sort((a, b) =>
    sort === 'name' ? a.name.localeCompare(b.name) : sort === 'pct' ? (b.pct || -Infinity) - (a.pct || -Infinity) : (Number.isFinite(b.weight) ? b.weight : -1) - (Number.isFinite(a.weight) ? a.weight : -1),
  );
  const numbered = useNumberedRows('memb-rows', list, 1, (m) => openMember(panel, m), (m) => m.name);
  const price = board.index.weighting === 'price';
  const csv = () => [['Ticker', 'Name', 'Sector', 'Weight %', 'Shares', 'Price', '%Chg', 'Market value USD'], ...list.map((m) => [m.symbol, m.name, m.sector, m.weight * 100, price ? '' : m.cap / m.last, m.last, m.pct, m.cap])];
  const status = boardStatus(board);
  return (
    <div>
      <FnHeader code="MEMBERS" title="Index Members" sec={ix} actions={exportActions(panel, `${ix.ticker}_members.csv`, csv)} />
      <div className="chart-tools">
        <IndexPicker ix={ix} fn="MEMBERS" />
        <label className="fld">
          Sort
          <select className="sel-inp" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as 'weight' | 'name' | 'pct')}>
            <option value="weight">Weight</option>
            <option value="name">Name</option>
            <option value="pct">% Chg</option>
          </select>
        </label>
        <span className="muted">{board.members.length} members</span>
      </div>
      {status ?? (
        <table className="tbl zebra">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Name</th>
              <th className="hide-m">Sector</th>
              <th className="num">Weight</th>
              <th className="num hide-m">{price ? 'Price wt' : 'Shares'}</th>
              <th className="num">Price</th>
              <th className="num">% Chg</th>
              <th className="num">Mkt Val</th>
            </tr>
          </thead>
          <tbody>
            {list.map((m, i) => (
              <tr key={m.symbol} className="click" onClick={() => openMember(panel, m)}>
                <td>
                  <span className="row-no">{numbered[i]})</span> <span className="amber">{m.symbol} US</span>
                </td>
                <td>{m.name}</td>
                <td className="hide-m muted">{m.sector}</td>
                {/* Nasdaq's list gives no market value for a few share classes (Brown-Forman's class B): no weight, shares or value then. */}
                <td className="num white" title={Number.isFinite(m.weight) ? undefined : board.weightsFrom ? "Not in SPY's holdings file" : NO_CAP}>{Number.isFinite(m.weight) ? `${fmtNum(m.weight * 100, 2)}%` : ''}</td>
                <td className="num hide-m">{price ? fmtNum(m.prevClose, 2) : Number.isFinite(m.cap) ? fmtBig(m.cap / m.last, 2) : ''}</td>
                <td className="num white">{fmtNum(m.last, 2)}</td>
                <td className={`num ${sign(m.pct)}`}>{fmtPct(m.pct, 2)}</td>
                <td className="num" title={Number.isFinite(m.cap) ? undefined : NO_CAP}>{Number.isFinite(m.cap) ? <CapLink id={m.id} symbol={m.symbol}>{fmtBig(m.cap, 2)}</CapLink> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="pad-s muted">
        {price
          ? "Price weighted: each member's weight is its price over the members' prices summed."
          : board.weightsFrom
            ? `${spyWeights(board.weightsFrom)} Shares and market value are the company's (Nasdaq's stock list).`
            : "Weights are estimates from market values (Nasdaq's stock list, a company with two share classes shared between them), not the index provider's float-adjusted weights; shares are market value over price."}
        {` Members from ${board.index.from}.`}
      </p>
    </div>
  );
}

const NO_CAP = "Nasdaq's stock list gives no market value for this share class";

/** How SPX's weights are made from SPY's holdings, and what the file leaves out. */
function spyWeights(w: NonNullable<Board['weightsFrom']>): string {
  return `Weights: each member's shares held by State Street's SPY (holdings as of ${w.asOf}) at its previous close; SPY holds the whole index, so these follow S&P's float-adjusted weights.${w.missing.length ? ` Not in that file, so without a weight: ${w.missing.join(', ')}.` : ''}`;
}

// ------------------------------------------------------------------- MRR

const PERIODS = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y'] as const;
type Period = (typeof PERIODS)[number];

/** MRR: the members ranked by price return over a period, the ten best and the ten worst. */
export function BoardRanked({ ix }: { ix: SecurityDef }) {
  useTick(5);
  const panel = usePanelId();
  const board = useIndexMembers(ix.id, { history: true })!;
  const [period, setPeriod] = useState<Period>('YTD');
  const [count, setCount] = useState(10);
  const rows = board.members.map((m) => ({ m, r: memberReturn(board.index.key, m, period) })).filter((x) => Number.isFinite(x.r));
  const best = [...rows].sort((a, b) => b.r - a.r).slice(0, count);
  const worst = [...rows].sort((a, b) => a.r - b.r).slice(0, count);
  const numbered = useNumberedRows('mrr-rows', [...best, ...worst], 1, (x) => openMember(panel, x.m), (x) => x.m.name);
  const avg = rows.length ? rows.reduce((a, x) => a + x.r, 0) / rows.length : NaN;
  const pos = rows.filter((x) => x.r > 0).length;
  const csv = () => [['Rank', 'Ticker', 'Name', `Return ${period} %`], ...[...rows].sort((a, b) => b.r - a.r).map((x, i) => [i + 1, x.m.symbol, x.m.name, x.r])];
  const side = (list: typeof rows, first: number, title: string) => (
    <div className="mov-side">
      <div className="mov-title">{title}</div>
      <table className="tbl mov-tbl">
        <thead>
          <tr>
            <th>Name</th>
            <th className="num">Price</th>
            <th className="num">Return {period}</th>
          </tr>
        </thead>
        <tbody>
          {list.map((x, i) => (
            <tr key={x.m.symbol} className="click" onClick={() => openMember(panel, x.m)} title={`${x.m.symbol} US · ${x.m.sector}`}>
              <td>
                <span className="row-no">{numbered[first + i]})</span> <span className="amber">{x.m.name}</span>
              </td>
              <td className="num white">{fmtNum(x.m.last, 2)}</td>
              <td className={`num ${sign(x.r)}`}>{fmtPct(x.r, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div>
      <FnHeader code="RANKEDRETURNS" title="Member Ranked Returns" sec={ix} actions={exportActions(panel, `${ix.ticker}_ranked_${period}.csv`, csv)} />
      <div className="chart-tools">
        <IndexPicker ix={ix} fn="RANKEDRETURNS" />
        <label className="fld">
          Period
          <select className="sel-inp" aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            {PERIODS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="fld">
          Show
          <select className="sel-inp" aria-label="Members shown" value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>
                Top/Bottom {n}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">
          {rows.length ? (
            <>
              {rows.length} members · average <span className={sign(avg)}>{fmtPct(avg, 2)}</span> · {pos} up, {rows.length - pos} down
            </>
          ) : null}
        </span>
      </div>
      {boardStatus(board) ??
        (rows.length ? (
          <div className="mov-cols">
            {side(best, 0, `Best ${count}`)}
            {side(worst, best.length, `Worst ${count}`)}
          </div>
        ) : (
          <div className="empty">Loading a year of daily closes for the members…</div>
        ))}
      <p className="pad-s muted">Price returns from Yahoo&apos;s daily closes to the latest price, dividends not added back. Members from {board.index.from}.</p>
    </div>
  );
}

export interface GroupRow {
  name: string;
  members: Member[];
  cap: number;
  /** Return by period, cap-weighted on the members' values at the start of the period. */
  ret: Record<Period, number>;
  up: number;
}

/**
 * A group's price return over a period: the change in its members' combined market value, each member's value at
 * the start taken back from its own return (shares held constant), or the members' average when equal-weighted.
 */
export function groupReturn(rs: { cap: number; r: number }[], equal = false): number {
  const ok = rs.filter((x) => Number.isFinite(x.r) && x.r > -100 && (equal || (Number.isFinite(x.cap) && x.cap > 0)));
  if (!ok.length) return NaN;
  if (equal) return ok.reduce((a, x) => a + x.r, 0) / ok.length;
  const now = ok.reduce((a, x) => a + x.cap, 0);
  const then = ok.reduce((a, x) => a + x.cap / (1 + x.r / 100), 0);
  return (now / then - 1) * 100;
}

/** GRR: the index's industry groups (GICS sectors or sub-industries) ranked by return, each with its best and worst members. */
export function BoardGroups({ ix }: { ix: SecurityDef }) {
  useTick(5);
  const panel = usePanelId();
  const board = useIndexMembers(ix.id, { history: true })!;
  const [period, setPeriod] = useState<Period>('YTD');
  const [level, setLevel] = useState<'sector' | 'industry'>('sector');
  const [equal, setEqual] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const by = new Map<string, Member[]>();
  for (const m of board.members) {
    const g = (level === 'sector' ? m.sector : m.industry || m.sector) || 'Unclassified';
    by.set(g, [...(by.get(g) ?? []), m]);
  }
  const rows: GroupRow[] = [...by.entries()].map(([name, members]) => {
    const ret = Object.fromEntries(PERIODS.map((p) => [p, groupReturn(members.map((m) => ({ cap: m.cap, r: memberReturn(board.index.key, m, p) })), equal)])) as Record<Period, number>;
    return { name, members, cap: members.reduce((a, m) => a + (Number.isFinite(m.cap) ? m.cap : 0), 0), ret, up: members.filter((m) => memberReturn(board.index.key, m, period) > 0).length };
  });
  rows.sort((a, b) => (Number.isFinite(b.ret[period]) ? b.ret[period] : -Infinity) - (Number.isFinite(a.ret[period]) ? a.ret[period] : -Infinity));
  const whole = groupReturn(board.members.map((m) => ({ cap: m.cap, r: memberReturn(board.index.key, m, period) })), equal);
  const maxAbs = Math.max(1e-9, ...rows.map((r) => Math.abs(r.ret[period])).filter(Number.isFinite));
  const numbered = useNumberedRows('grr-rows', rows, 1, (r) => setOpen((o) => (o === r.name ? null : r.name)), (r) => r.name);
  const csv = () => [['Rank', level === 'sector' ? 'Sector' : 'Industry', 'Members', 'Market Value', ...PERIODS.map((p) => `Return ${p} %`)], ...rows.map((r, i) => [i + 1, r.name, r.members.length, r.cap, ...PERIODS.map((p) => r.ret[p])])];
  const ranked = (g: GroupRow) => g.members.map((m) => ({ m, r: memberReturn(board.index.key, m, period) })).filter((x) => Number.isFinite(x.r)).sort((a, b) => b.r - a.r);
  const loaded = rows.some((r) => Number.isFinite(r.ret[period]));
  return (
    <div>
      <FnHeader code="GROUPRETURNS" title="Group Ranked Returns" sec={ix} actions={exportActions(panel, `${ix.ticker}_groups_${period}.csv`, csv)} />
      <div className="chart-tools">
        <IndexPicker ix={ix} fn="GROUPRETURNS" />
        <label className="fld">
          Groups
          <select className="sel-inp" aria-label="Groups" value={level} onChange={(e) => setLevel(e.target.value as 'sector' | 'industry')}>
            <option value="sector">Sectors</option>
            <option value="industry">Industries</option>
          </select>
        </label>
        <label className="fld">
          Period
          <select className="sel-inp" aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            {PERIODS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="fld">
          Weighting
          <select className="sel-inp" aria-label="Weighting" value={equal ? 'equal' : 'cap'} onChange={(e) => setEqual(e.target.value === 'equal')}>
            <option value="cap">Market Cap</option>
            <option value="equal">Equal</option>
          </select>
        </label>
        <span className="muted">
          {loaded ? (
            <>
              {rows.length} groups · {ix.ticker.replace(/ Index$/, '')} members together <span className={sign(whole)}>{fmtPct(whole, 2)}</span>
            </>
          ) : null}
        </span>
      </div>
      {boardStatus(board) ??
        (loaded ? (
          <table className="tbl grr-tbl">
            <thead>
              <tr>
                <th>{level === 'sector' ? 'Sector' : 'Industry'}</th>
                <th className="num">#</th>
                <th className="num hide-m">Mkt Val</th>
                <th className="grr-bar-h">{period}</th>
                {PERIODS.filter((p) => p !== period).map((p) => (
                  <th key={p} className="num hide-m">
                    {p}
                  </th>
                ))}
                <th className="hide-m">Best</th>
                <th className="hide-m">Worst</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g, i) => {
                const list = ranked(g);
                const best = list[0];
                const worst = list[list.length - 1];
                const r = g.ret[period];
                return [
                  <tr key={g.name} className="click" onClick={() => setOpen((o) => (o === g.name ? null : g.name))} title="Show the members">
                    <td>
                      <span className="row-no">{numbered[i]})</span> <span className="amber">{g.name}</span> <span className="muted">{open === g.name ? '▾' : '▸'}</span>
                    </td>
                    <td className="num">{g.members.length}</td>
                    <td className="num hide-m">{fmtBig(g.cap, 1)}</td>
                    <td className="grr-bar-cell">
                      <span className={`num ${sign(r)}`}>{fmtPct(r, 2)}</span>
                      <span className="grr-bar">
                        <span className={r >= 0 ? 'up-bg' : 'dn-bg'} style={{ width: `${Number.isFinite(r) ? (Math.abs(r) / maxAbs) * 50 : 0}%`, [r >= 0 ? 'left' : 'right']: '50%' }} />
                      </span>
                    </td>
                    {PERIODS.filter((p) => p !== period).map((p) => (
                      <td key={p} className={`num hide-m ${sign(g.ret[p])}`}>
                        {fmtPct(g.ret[p], 1)}
                      </td>
                    ))}
                    <td className="hide-m">{best ? <>{best.m.symbol} <span className={sign(best.r)}>{fmtPct(best.r, 1)}</span></> : ''}</td>
                    <td className="hide-m">{worst && list.length > 1 ? <>{worst.m.symbol} <span className={sign(worst.r)}>{fmtPct(worst.r, 1)}</span></> : ''}</td>
                  </tr>,
                  open === g.name ? (
                    <tr key={`${g.name}:members`} className="grr-members">
                      <td colSpan={5 + PERIODS.length + 1}>
                        {list.map((x) => (
                          <span key={x.m.symbol} className="grr-member click" onClick={() => openMember(panel, x.m)} title={x.m.name}>
                            <span className="amber">{x.m.symbol}</span> <span className={sign(x.r)}>{fmtPct(x.r, 1)}</span>
                          </span>
                        ))}
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty">Loading a year of daily closes for the members…</div>
        ))}
      <p className="pad-s muted">
        Price returns from Yahoo&apos;s daily closes to the latest price, dividends not added back; a group&apos;s return is the change in its members&apos; combined
        market value (shares held constant){equal ? ', here the members’ average' : ''}. Groups are {board.index.key === 'SPX' ? 'GICS sectors and sub-industries from the S&P 500 member list' : 'the sectors and industries of Nasdaq’s stock list'}. Members from {board.index.from}.
      </p>
    </div>
  );
}

/** For the functions that fall back to the app's universe: whether this index has its whole membership here. */
export function hasBoard(id: string | undefined): boolean {
  return !!id && !!BOARD_INDICES[id];
}


// ------------------------------------------------------------------- IMAP

type ImapView = 'both' | 'table' | 'pie' | 'heat';
type ImapGroup = 'sector' | 'region';
const CAP_BANDS: { label: string; min: number; max: number }[] = [
  { label: 'All', min: 0, max: Infinity },
  { label: 'Mega (> 200B)', min: 200e9, max: Infinity },
  { label: 'Large (10B - 200B)', min: 10e9, max: 200e9 },
  { label: 'Mid (2B - 10B)', min: 2e9, max: 10e9 },
  { label: 'Small (< 2B)', min: 0, max: 2e9 },
];

interface Slice {
  name: string;
  members: Member[];
  weight: number;
  pct: number;
  up: number;
}

/** Weighted change and share up of a group of members. */
function slice(name: string, members: Member[]): Slice {
  let w = 0;
  let sum = 0;
  let wAll = 0;
  for (const m of members) {
    const mw = Number.isFinite(m.weight) ? m.weight : 0;
    wAll += mw;
    if (!Number.isFinite(m.pct)) continue;
    w += mw;
    sum += mw * m.pct;
  }
  const priced = members.filter((m) => Number.isFinite(m.pct));
  return { name, members, weight: wAll, pct: w > 0 ? sum / w : NaN, up: priced.length ? (priced.filter((m) => m.pct > 0).length / priced.length) * 100 : NaN };
}

const heatColor = heatColour;

/** An annular sector from angle a0 to a1 (radians, 0 at the top, clockwise) between radii r0 and r1. */
function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => `${(cx + r * Math.sin(a)).toFixed(2)},${(cy - r * Math.cos(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  if (a1 - a0 >= 2 * Math.PI - 1e-6) a1 = a0 + 2 * Math.PI - 1e-4;
  return `M${p(r1, a0)}A${r1},${r1} 0 ${large} 1 ${p(r1, a1)}L${p(r0, a1)}A${r0},${r0} 0 ${large} 0 ${p(r0, a0)}Z`;
}

/** IMAP on an index's whole membership: a sunburst of groups and members beside a table of the groups. */
export function BoardMap({ ix }: { ix: SecurityDef }) {
  // Heat colours follow the colour scheme.
  useColourScheme();
  useTick(2);
  const panel = usePanelId();
  const board = useIndexMembers(ix.id)!;
  const [view, setView] = useState<ImapView>('both');
  const [group, setGroup] = useState<ImapGroup>('sector');
  const [band, setBand] = useState(0);
  const [focus, setFocus] = useState<string | null>(null);
  const [hover, setHover] = useState<{ title: string; lines: string[] } | null>(null);
  const b = CAP_BANDS[band];
  const shown = board.members.filter((m) => band === 0 || (Number.isFinite(m.cap) && m.cap >= b.min && m.cap < b.max));
  const keyOf = (m: Member) => (group === 'sector' ? m.sector || 'Other' : m.country || 'Other');
  // Drilled into a group: its sub-groups are the sub-industries (sectors) or the sectors (regions).
  const subKey = (m: Member) => (group === 'sector' ? m.industry || 'Other' : m.sector || 'Other');
  const scope = focus ? shown.filter((m) => keyOf(m) === focus) : shown;
  const by = new Map<string, Member[]>();
  for (const m of scope) {
    const k = focus ? subKey(m) : keyOf(m);
    by.set(k, [...(by.get(k) ?? []), m]);
  }
  const slices = [...by].map(([k, ms]) => slice(k, ms)).sort((a, c) => (Number.isFinite(c.pct) ? c.pct : -99) - (Number.isFinite(a.pct) ? a.pct : -99));
  const all = slice(focus ?? 'All Securities', scope);
  const groupWord = group === 'sector' ? (board.index.key === 'SPX' ? 'GICS Sector' : 'Sector') : 'Country';
  const subWord = focus ? (group === 'sector' ? 'Industry' : 'Sector') : groupWord;
  const rows = [all, ...slices];
  const numbered = useNumberedRows('imap-rows', rows, 1, (r) => (r === all ? setFocus(null) : !focus ? setFocus(r.name) : undefined), (r) => r.name);
  const csv = () => [['Name', '%Chg', 'Weight %', 'Up %', 'Members'], ...rows.map((r) => [r.name, r.pct, r.weight * 100, r.up, r.members.length])];
  // The sunburst: inner ring the groups, outer ring their members, angles by weight.
  const size = 460;
  const cx = size / 2;
  const cy = size / 2;
  const total = slices.reduce((a, s) => a + s.weight, 0);
  let a0 = 0;
  const ring = slices.map((s) => {
    const span = total > 0 ? (s.weight / total) * 2 * Math.PI : 0;
    const start = a0;
    a0 += span;
    let m0 = start;
    const kids = [...s.members]
      .filter((m) => Number.isFinite(m.weight) && m.weight > 0)
      .sort((x, y) => y.weight - x.weight)
      .map((m) => {
        const k = s.weight > 0 ? (m.weight / s.weight) * span : 0;
        const r = { m, a0: m0, a1: m0 + k };
        m0 += k;
        return r;
      });
    return { s, a0: start, a1: start + span, kids };
  });
  const tip = (title: string, lines: string[]) => () => setHover({ title, lines });
  // Group labels outside the ring, as the reference draws them, each side kept clear of its neighbours.
  const labels: { name: string; pct: number; x: number; y: number; right: boolean }[] = [];
  for (const side of [true, false]) {
    const list = ring
      .filter((g) => g.a1 - g.a0 > 0.06 && (Math.sin((g.a0 + g.a1) / 2) >= 0) === side)
      .map((g) => ({ g, mid: (g.a0 + g.a1) / 2 }))
      .map(({ g, mid }) => ({ name: g.s.name, pct: g.s.pct, mid, y: cy - 236 * Math.cos(mid) }))
      .sort((p, q) => p.y - q.y);
    let last = -10;
    for (const l of list) {
      const y = Math.max(l.y, last + 26);
      if (y > size + 14) break;
      last = y;
      labels.push({ name: l.name, pct: l.pct, y: y - 6, x: cx + (side ? 1 : -1) * (Math.abs(236 * Math.sin(l.mid)) + 6), right: side });
    }
  }
  const pie = (
    <div className="imap-pie">
      <svg viewBox={`${-150} ${-22} ${size + 300} ${size + 44}`} role="img" aria-label={`${ix.ticker} by ${subWord}`} onMouseLeave={() => setHover(null)}>
        {ring.map(({ s, a0: g0, a1: g1, kids }) => (
          <g key={s.name}>
            <path
              d={arc(cx, cy, 62, 150, g0, g1)}
              fill={heatColor(s.pct)}
              stroke="#000"
              strokeWidth={1.5}
              className={focus ? undefined : 'click'}
              onMouseEnter={tip(s.name, [`%Chg ${fmtPct(s.pct, 2)}`, `Weight ${fmtNum(s.weight * 100, 2)}%`, `Count ${s.members.length}`, focus ? '' : 'Click to drill down'])}
              onClick={() => (!focus ? setFocus(s.name) : undefined)}
            />
            {kids.map(({ m, a0: k0, a1: k1 }) => (
              <path
                key={m.symbol}
                d={arc(cx, cy, 152, 222, k0, k1)}
                fill={heatColor(m.pct)}
                stroke="#000"
                strokeWidth={k1 - k0 > 0.02 ? 1 : 0.4}
                className="click"
                onMouseEnter={tip(m.name, [`${m.symbol} US · ${s.name}`, `%Chg ${fmtPct(m.pct, 2)}`, `Weight ${fmtNum(m.weight * 100, 2)}%`, `Last ${fmtNum(m.last, 2)}`])}
                onClick={() => openMember(panel, m)}
              />
            ))}
          </g>
        ))}
        {labels.map((l) => (
          <text key={l.name} x={l.x} y={l.y} textAnchor={l.right ? 'start' : 'end'} className="imap-lbl">
            <tspan x={l.x}>{l.name}</tspan>
            <tspan x={l.x} dy="1.1em" className={sign(l.pct)}>{fmtPct(l.pct, 2)}</tspan>
          </text>
        ))}
        <circle cx={cx} cy={cy} r={60} fill="#000" className={focus ? 'click' : undefined} onClick={() => setFocus(null)} />
        <text x={cx} y={cy - 4} textAnchor="middle" className="imap-center">
          {focus ? (focus.length > 16 ? `${focus.slice(0, 14)}…` : focus) : `${ix.ticker} by ${group === 'sector' ? (board.index.key === 'SPX' ? 'GICS' : 'Sector') : 'Country'}`}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className={`imap-center ${sign(all.pct)}`}>
          {fmtPct(all.pct, 2)}
        </text>
      </svg>
      {hover && (
        <div className="imap-tip">
          <b>{hover.title}</b>
          {hover.lines.filter(Boolean).map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
  const groupTable = (
    <table className="tbl imap-tbl">
      <thead>
        <tr>
          <th>Name</th>
          <th className="num">%Chg</th>
          <th aria-label="Change bar" />
          <th className="num">Up%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.name} className={i === 0 || !focus ? 'click' : undefined} onClick={() => (i === 0 ? setFocus(null) : !focus ? setFocus(r.name) : undefined)}>
            <td>
              <span className="row-no">{numbered[i]})</span> {i > 0 && !focus ? <span className="muted">&gt; </span> : null}
              <span className={i === 0 ? 'white' : 'amber'}>{r.name}</span>
            </td>
            <td className={`num ${sign(r.pct)}`}>{fmtPct(r.pct, 2)}</td>
            <td className="imap-bar">
              {Number.isFinite(r.pct) && <span className={r.pct >= 0 ? 'up' : 'down'} style={{ width: `${Math.min(100, (Math.abs(r.pct) / 3) * 100)}%` }} />}
            </td>
            <td className="num">{fmtNum(r.up, 1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  const memberTable = (
    <table className="tbl zebra">
      <thead>
        <tr>
          <th>Name</th>
          <th className="hide-m">{group === 'sector' ? 'Sector' : 'Country'}</th>
          <th className="num">Last</th>
          <th className="num">%Chg</th>
          <th className="num">Weight</th>
          <th className="num hide-m">Mkt Cap</th>
          <th className="num hide-m">Volume</th>
        </tr>
      </thead>
      <tbody>
        {[...scope]
          .sort((x, y) => (Number.isFinite(y.weight) ? y.weight : -1) - (Number.isFinite(x.weight) ? x.weight : -1))
          .map((m) => (
            <tr key={m.symbol} className="click" onClick={() => openMember(panel, m)}>
              <td>
                <span className="amber">{m.name}</span> <span className="muted">{m.symbol}</span>
              </td>
              <td className="hide-m muted">{keyOf(m)}</td>
              <td className="num white">{fmtNum(m.last, 2)}</td>
              <td className={`num ${sign(m.pct)}`}>{fmtPct(m.pct, 2)}</td>
              <td className="num">{fmtNum(m.weight * 100, 2)}%</td>
              <td className="num hide-m">{fmtBig(m.cap, 1)}</td>
              <td className="num hide-m">{Number.isFinite(m.volume) ? fmtBig(m.volume, 1) : ''}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
  // The heat map: groups, then their industry groups (GICS, for the S&P 500) or sectors (by country), then the members,
  // sized by estimated index weight.
  const subOf = (m: Member) =>
    group === 'sector' ? (board.index.key === 'SPX' ? industryGroup(m.sector, m.industry) : m.industry || 'Other') : m.sector || 'Other';
  const heatGroups: HeatGroup[] = (() => {
    if (view !== 'heat') return [];
    const top = new Map<string, Map<string, Member[]>>();
    for (const m of scope) {
      const g = keyOf(m);
      const sub = subOf(m);
      if (!top.has(g)) top.set(g, new Map());
      const subs = top.get(g)!;
      subs.set(sub, [...(subs.get(sub) ?? []), m]);
    }
    return [...top].map(([name, subs]) => ({
      name,
      subs: [...subs].map(([sub, ms]) => ({
        name: sub,
        leaves: ms.map((m) => ({
          key: m.symbol,
          label: m.symbol,
          pct: m.pct,
          weight: Number.isFinite(m.weight) && m.weight > 0 ? m.weight : 0,
          info: [m.name, `${m.symbol} US · ${sub}`, `%Chg ${fmtPct(m.pct, 2)}`, `Weight ${fmtNum(m.weight * 100, 2)}%`, `Last ${fmtNum(m.last, 2)}`],
          onClick: () => openMember(panel, m),
        })),
      })),
    }));
  })();
  const unsized = view === 'heat' ? scope.filter((m) => !(Number.isFinite(m.weight) && m.weight > 0)).length : 0;
  const status = boardStatus(board);
  return (
    <div className={view === 'heat' ? 'fn-fill' : undefined}>
      {/* The red bar's Export without a number (TE04 01:55). */}
      <FnHeader
        code="INDEXMAP"
        title="Intraday Market Map"
        sec={ix}
        actions={[
          {
            n: 9951,
            bare: true,
            label: 'Export',
            onClick: () => {},
            menu: exportActions(panel, `${ix.ticker}_map.csv`, csv).map((a) => ({ label: a.label === 'Copy' ? 'Copy to Clipboard' : 'Download as CSV', title: a.title, onClick: a.onClick })),
          },
        ]}
      />
      <div className="chart-tools">
        <IndexPicker ix={ix} fn="INDEXMAP" />
        <span className="fld">
          Group by
          <label className="chk"><input type="radio" name={`imap-g-${panel}`} checked={group === 'region'} onChange={() => { setGroup('region'); setFocus(null); }} /> Region</label>
          <label className="chk"><input type="radio" name={`imap-g-${panel}`} checked={group === 'sector'} onChange={() => { setGroup('sector'); setFocus(null); }} /> Sector</label>
        </span>
        <label className="fld">
          Market Cap (USD)
          <select className="sel-inp" aria-label="Market cap" value={band} onChange={(e) => setBand(Number(e.target.value))}>
            {CAP_BANDS.map((c, i) => (
              <option key={c.label} value={i}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-grey" onClick={() => execute(panel, `${ix.id} RANKEDRETURNS`)}>Historical Performance</button>
      </div>
      <nav className="imap-crumbs" aria-label="Map path">
        <button type="button" className="link" onClick={() => setFocus(null)}>{ix.ticker}</button> &gt; <button type="button" className="link" onClick={() => setFocus(null)}>{group === 'sector' && board.index.key === 'SPX' ? 'GICS' : group === 'sector' ? 'Sector' : 'Region'}</button>
        {focus ? <> &gt; <span className="white">{focus}</span></> : null}
      </nav>
      <nav className="tabs tabs-plain" aria-label="Map views">
        {([['both', 'Pie Chart & Table'], ['table', 'Table'], ['pie', 'Pie Chart'], ['heat', 'Heatmap']] as [ImapView, string][]).map(([k, label]) => (
          <button key={k} type="button" className={`tab${view === k ? ' on' : ''}`} onClick={() => setView(k)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="imap-title">
        <span className="white">{view === 'heat' ? `${ix.ticker}: Intraday Return by ${groupWord} (sized by Weight)` : `${ix.ticker}: Intraday Return by ${subWord}`}</span>
        <span className="white">{scope.length} Securities</span>
      </div>
      {status ??
        (view === 'heat' ? (
          <>
            <div className="heatmap-head">
              <span>
                {focus ?? `${ix.ticker} by ${group === 'sector' ? (board.index.key === 'SPX' ? 'GICS' : 'Sector') : 'Country'}`}, Price Return:{' '}
                <span className={sign(all.pct)}>{fmtPct(all.pct, 2)}</span> (d)
              </span>
              {focus ? (
                <button type="button" className="link" onClick={() => setFocus(null)}>
                  All groups
                </button>
              ) : null}
            </div>
            <HeatTreemap groups={heatGroups} onGroup={focus ? undefined : (name) => setFocus(name)} />
          </>
        ) : view === 'table' ? (
          memberTable
        ) : (
          <div className={view === 'both' ? 'imap-both' : 'imap-only'}>
            {pie}
            {view === 'both' && groupTable}
          </div>
        ))}
      <p className="pad-s muted">
        {view === 'heat' ? 'Tiles' : 'Segments'} sized by estimated index weight and coloured by today&apos;s change (full colour at ±3%). Prices from Yahoo; sectors from{' '}
        {board.index.key === 'SPX' ? 'the GICS classification in the S&P 500 member list' : "Nasdaq's stock list"}
        {view === 'heat' && group === 'sector' ? (board.index.key === 'SPX' ? ', grouped into GICS industry groups by sub-industry' : ", by Nasdaq's industries") : ''}; countries from Nasdaq.
        {view === 'heat' ? ' Click a sector to open it, a tile to open the stock.' : ''}
        {unsized ? ` ${unsized} ${unsized === 1 ? 'member has' : 'members have'} no market value yet and ${unsized === 1 ? 'is' : 'are'} not drawn.` : ''}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------- MOST

const MOST_TABS = ['Volume', 'Chg Up', 'Chg Down', 'Value', '52Wk Highs', '52Wk Lows'] as const;
type MostTab = (typeof MOST_TABS)[number];

/** The highest and lowest daily close of the past year, with today's price. */
function yearRange(m: Member): { hi: number; lo: number } {
  const h = indexData.get().history[m.yahoo];
  if (!h?.c.length) return { hi: NaN, lo: NaN };
  const from = h.t[h.t.length - 1] - 365 * 86_400_000;
  let hi = Number.isFinite(m.last) ? m.last : -Infinity;
  let lo = Number.isFinite(m.last) ? m.last : Infinity;
  for (let i = 0; i < h.t.length; i++) {
    if (h.t[i] < from) continue;
    hi = Math.max(hi, h.c[i]);
    lo = Math.min(lo, h.c[i]);
  }
  return { hi, lo };
}

/** The newest headline Yahoo's feed has for a stock, asked for at most every 15 minutes. */
function useHeadlines(symbols: string[]): Map<string, MarketStory> {
  marketNews.use((s) => s.v);
  const key = symbols.join(',');
  useEffect(() => {
    if (!newsAvailable()) return;
    for (const s of symbols) void loadNews('yahoo-rss', s, 15 * 60_000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const out = new Map<string, MarketStory>();
  for (const s of symbols) {
    const list = marketNews.get().lists[`yahoo-rss:${s}`];
    const top = list?.length ? [...list].sort((a, b) => b.time - a.time)[0] : undefined;
    if (top) out.set(s, top);
  }
  return out;
}

/** MOST on an index's whole membership: the options rail, the activity tabs and each stock's latest headline. */
export function BoardMost({ ix }: { ix: SecurityDef }) {
  useTick(2);
  const panel = usePanelId();
  const [tab, setTab] = useState<MostTab>('Volume');
  const board = useIndexMembers(ix.id, { history: tab === '52Wk Highs' || tab === '52Wk Lows' })!;
  const [rail, setRail] = useState(true);
  const [sector, setSector] = useState('');
  const [capMin, setCapMin] = useState('');
  const [capMax, setCapMax] = useState('');
  const [display, setDisplay] = useState<'name' | 'ticker'>('name');
  const [chg, setChg] = useState<'pct' | 'net'>('pct');
  const sectors = [...new Set(board.members.map((m) => m.sector).filter(Boolean))].sort();
  const lo = Number(capMin) * 1e9 || 0;
  const hi = Number(capMax) * 1e9 || Infinity;
  const pool = board.members.filter((m) => (!sector || m.sector === sector) && (!Number.isFinite(m.cap) || (m.cap >= lo && m.cap <= hi)));
  const value = (m: Member) => (Number.isFinite(m.volume) && Number.isFinite(m.last) ? m.volume * m.last : NaN);
  const ranges = new Map(pool.map((m) => [m.symbol, tab === '52Wk Highs' || tab === '52Wk Lows' ? yearRange(m) : { hi: NaN, lo: NaN }]));
  const score = (m: Member): number => {
    switch (tab) {
      case 'Chg Up':
        return m.pct;
      case 'Chg Down':
        return -m.pct;
      case 'Value':
        return value(m);
      case '52Wk Highs': {
        const r = ranges.get(m.symbol)!;
        return r.hi > 0 ? (m.last / r.hi - 1) * 100 : NaN;
      }
      case '52Wk Lows': {
        const r = ranges.get(m.symbol)!;
        return r.lo > 0 ? -(m.last / r.lo - 1) * 100 : NaN;
      }
      default:
        return m.volume;
    }
  };
  const list = pool
    .filter((m) => Number.isFinite(score(m)))
    .sort((a, b) => score(b) - score(a))
    .slice(0, 40);
  const numbered = useNumberedRows('most-rows', list, 1, (m) => openMember(panel, m), (m) => m.name);
  const news = useHeadlines(list.slice(0, 20).map((m) => m.yahoo));
  const maxVol = Math.max(1, ...list.map((m) => (Number.isFinite(m.volume) ? m.volume : 0)));
  const newsAt = Math.max(0, ...[...news.values()].map((s) => s.time));
  const csv = () => [['Security', 'Ticker', 'Last', '%Chg', 'Net Chg', 'Volume', 'Value USD'], ...list.map((m) => [m.name, m.symbol, m.last, m.pct, m.chg, m.volume, value(m)])];
  const radio = (name: string, on: boolean, set: () => void, label: string) => (
    <label className="chk">
      <input type="radio" name={`${name}-${panel}`} checked={on} onChange={set} /> {label}
    </label>
  );
  return (
    <div>
      <FnHeader code="MOVERS" title="Most Active Securities" sec={ix} actions={exportActions(panel, `${ix.ticker}_most_active.csv`, csv)} />
      <div className="chart-tools">
        <IndexPicker ix={ix} fn="MOVERS" />
        <button type="button" className="btn-grey" onClick={() => execute(panel, `${ix.id} CN`)}>News</button>
        <button type="button" className="btn-grey" onClick={() => execute(panel, `${ix.id} RANKEDRETURNS`)}>Historical Performance</button>
      </div>
      <div className={`most-wrap${rail ? '' : ' no-rail'}`}>
        {rail ? (
          <aside className="most-rail" aria-label="Options">
            <button type="button" className="btn-grey most-hide" onClick={() => setRail(false)}>Hide Options «</button>
            <div className="rail-h">Sector</div>
            <select className="sel-inp" aria-label="Sector" value={sector} onChange={(e) => setSector(e.target.value)}>
              <option value="">All Sectors</option>
              {sectors.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <div className="rail-h">Market Cap (USD bn)</div>
            <div className="rail-row">
              <input className="inp" aria-label="Minimum market cap" placeholder="0" value={capMin} onChange={(e) => setCapMin(e.target.value.replace(/[^\d.]/g, ''))} />
              <span>-</span>
              <input className="inp" aria-label="Maximum market cap" placeholder="Unlim." value={capMax} onChange={(e) => setCapMax(e.target.value.replace(/[^\d.]/g, ''))} />
            </div>
            <div className="rail-h">Security Display</div>
            <div className="rail-row">
              {radio('most-disp', display === 'name', () => setDisplay('name'), 'Name')}
              {radio('most-disp', display === 'ticker', () => setDisplay('ticker'), 'Ticker')}
            </div>
            <div className="rail-h">Price Change</div>
            <div className="rail-row">
              {radio('most-chg', chg === 'pct', () => setChg('pct'), 'Percent')}
              {radio('most-chg', chg === 'net', () => setChg('net'), 'Net')}
            </div>
          </aside>
        ) : (
          <button type="button" className="btn-grey most-show" onClick={() => setRail(true)}>»</button>
        )}
        <div className="most-main">
          <nav className="tabs" aria-label="Activity">
            {MOST_TABS.map((t) => (
              <button key={t} type="button" className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </nav>
          {boardStatus(board) ?? (
            <table className="tbl most-tbl">
              <colgroup>
                <col style={{ width: '24%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '12%' }} />
                {tab === 'Value' || tab === '52Wk Highs' || tab === '52Wk Lows' ? <col style={{ width: '9%' }} /> : null}
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>Security</th>
                  <th className="num">Last</th>
                  <th className="num">{chg === 'pct' ? '%Chg' : 'Net Chg'}</th>
                  <th className="num">Volume</th>
                  {tab === 'Value' && <th className="num">Value</th>}
                  {tab === '52Wk Highs' && <th className="num">52Wk High</th>}
                  {tab === '52Wk Lows' && <th className="num">52Wk Low</th>}
                  <th className="hide-m">News{newsAt ? ` (As of ${fmtStamp(newsAt)})` : ''}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((m, i) => {
                  const story = news.get(m.yahoo);
                  const r = ranges.get(m.symbol)!;
                  return (
                    <tr key={m.symbol} className="click" onClick={() => openMember(panel, m)}>
                      <td className="most-sec">
                        <span className="row-no">{numbered[i]})</span> <span className="amber">{display === 'name' ? m.name : `${m.symbol} US`}</span>
                      </td>
                      <td className="num white">{fmtNum(m.last, 2)}</td>
                      <td className={`num ${sign(m.pct)}`}>{chg === 'pct' ? fmtPct(m.pct, 2) : fmtSigned(m.chg, 2)}</td>
                      <td className="num most-vol">
                        {Number.isFinite(m.volume) && <span className="most-volbar" style={{ width: `${(m.volume / maxVol) * 100}%` }} />}
                        <span className="most-volnum">{Number.isFinite(m.volume) ? fmtBig(m.volume, 2) : ''}</span>
                      </td>
                      {tab === 'Value' && <td className="num">{fmtBig(value(m), 2)}</td>}
                      {tab === '52Wk Highs' && <td className="num">{fmtNum(r.hi, 2)}</td>}
                      {tab === '52Wk Lows' && <td className="num">{fmtNum(r.lo, 2)}</td>}
                      <td className="hide-m most-news">
                        {story ? (
                          <a href={story.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title={`${story.publisher} · ${fmtStamp(story.time)}`}>
                            {story.title}
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <p className="pad-s muted">
        Prices from Yahoo, volumes from Nasdaq, headlines from Yahoo Finance for the first 20 rows. Value = volume × last price.
        {tab === '52Wk Highs' || tab === '52Wk Lows' ? ' 52-week extremes from daily closes; the stocks nearest them first.' : ''} Members from {board.index.from}.
      </p>
    </div>
  );
}
