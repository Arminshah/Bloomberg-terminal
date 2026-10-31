// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import type { MouseEvent, ReactNode } from 'react';
import { Chg, openSecurity } from '../components/cells';
import { fmtInt } from '../core/format';
import { engine } from '../data/market';
import { FTSE_SOURCE, useFtse100, type FtseMember, type MemberFigures } from '../data/live/ftse100';
import { BOARD_INDICES, membersAvailable, useIndexMembers, type Member } from '../data/live/index-members';
import type { SecurityDef } from '../data/types';
import { execute } from '../terminal/exec';
import { primaryMnemonic } from '../terminal/legacy';
import { useMenu, usePanelId } from '../terminal/panel';
import { settings } from '../terminal/settings';
import type { MenuItem } from '../terminal/types';
import { Box } from './DESEquity';

/**
 * PROFILE's Members line and Movers table for an index, as DES's index description gives them: the member count with
 * the numbers rising, falling and unchanged on the day, then the four leaders and four laggers by the day's change.
 * Only the index's real membership counts: MEMBERS's lists for the S&P 500, the Nasdaq-100 and the Dow, Wikipedia's
 * list for the FTSE 100 (SCREEN's FTSE 100 universe). Members load only while the page shows them.
 */

/** A member's move on the day. */
export interface MemberMove {
  /** As the terminal writes a member, ticker and market: AAPL US, BATS LN. */
  ticker: string;
  name: string;
  /** The day's change in percent; NaN while the member has no price for the day. */
  pct: number;
  /** The member's line in the app, when it has one. */
  id?: string;
  /** The security typed to look it up when the app has no line for it: BRK/B US, BT/A LN. */
  lookup: string;
}

export interface MemberBreadth {
  /** Members in the index's list. */
  members: number;
  /** Members with a change on the day. */
  priced: number;
  up: number;
  down: number;
  unch: number;
}

/** The members rising, falling and unchanged on the day; a member without a change is counted in none of the three. */
export function memberBreadth(moves: readonly { pct: number }[]): MemberBreadth {
  let up = 0;
  let down = 0;
  let unch = 0;
  for (const m of moves) {
    if (!Number.isFinite(m.pct)) continue;
    if (m.pct > 0) up++;
    else if (m.pct < 0) down++;
    else unch++;
  }
  return { members: moves.length, priced: up + down + unch, up, down, unch };
}

/**
 * The Movers table's two sides: the `n` members up the most on the day, largest rise first, and the `n` down the most,
 * largest fall first. A leader rose and a lagger fell, so a side holds fewer than `n` on a day few members moved that
 * way; a member without a change is on neither. Equal changes go in ticker order.
 */
export function leadersLaggers<T extends { ticker: string; pct: number }>(moves: readonly T[], n = 4): { leaders: T[]; laggers: T[] } {
  const byTicker = (a: T, b: T) => a.ticker.localeCompare(b.ticker);
  return {
    leaders: moves.filter((m) => m.pct > 0).sort((a, b) => b.pct - a.pct || byTicker(a, b)).slice(0, n),
    laggers: moves.filter((m) => m.pct < 0).sort((a, b) => a.pct - b.pct || byTicker(a, b)).slice(0, n),
  };
}

/** The S&P 500's, the Nasdaq-100's or the Dow's members with the day's change from Yahoo, as MEMBERS lists them. */
export function boardMoves(members: readonly Member[]): MemberMove[] {
  return members.map((m) => ({ ticker: `${m.symbol} US`, name: m.name, pct: m.pct, ...(m.id ? { id: m.id } : {}), lookup: `${m.symbol.replace('.', '/')} US` }));
}

/**
 * The FTSE 100's members with their change on the latest session: the latest price in Yahoo Finance's daily prices
 * over the close before it, as SCREEN's FTSE 100 universe has it. A member whose prices stop before the latest session
 * another member reaches has no change (its figures are older, or it did not trade), not an earlier day's.
 */
export function ftseMoves(members: readonly FtseMember[], by: Readonly<Record<string, MemberFigures>>, known: (id: string) => boolean = (id) => !!engine.get(id)): MemberMove[] {
  const latest = members.map((m) => by[m.yahoo]?.daily?.lastDay ?? '').sort().at(-1) ?? '';
  return members.map((m) => {
    const d = by[m.yahoo]?.daily;
    const id = `${m.root} LN Equity`;
    return {
      ticker: `${m.root} LN`,
      name: m.name,
      pct: d && d.lastDay === latest && d.prev > 0 ? (d.last / d.prev - 1) * 100 : NaN,
      ...(known(id) ? { id } : {}),
      lookup: `${m.root} LN`,
    };
  });
}

/** The terminal's buttons on the index description: 6) Members, 8) Movers, 9) to 12) the leaders, 13) to 16) the laggers. */
const MEMBERS_N = 6;
const MOVERS_N = 8;
const LEADERS_N = 9;
const LAGGERS_N = 13;
const SIDE = 4;

/**
 * The Members line and the Movers table. `blank` says why there are no members to show (loading, no source), as the
 * title of each "--"; `members` and `movers` are the functions the line and the band open, when they cover the index.
 */
export function IndexMembersView({ sec, moves, blank, members, movers, source }: { sec: SecurityDef; moves: readonly MemberMove[]; blank?: string; members?: string; movers?: string; source?: ReactNode }) {
  const panel = usePanelId();
  const mnemonics = settings.use((s) => s.mnemonics);
  const name = (code: string) => (mnemonics ? primaryMnemonic(code) : code);
  const b = memberBreadth(moves);
  const { leaders, laggers } = leadersLaggers(moves, SIDE);
  const open = (m: MemberMove, e?: MouseEvent) => (m.id ? openSecurity(panel, m.id, e, 'PROFILE') : execute(panel, `${m.lookup} Equity PROFILE`));
  // A number is shown and answers only where it opens something.
  const items: MenuItem[] = [
    ...(members ? [{ n: MEMBERS_N, label: 'Members', run: () => execute(panel, `${sec.id} ${members}`) }] : []),
    ...(movers ? [{ n: MOVERS_N, label: 'Movers', run: () => execute(panel, `${sec.id} ${movers}`) }] : []),
    ...leaders.map((m, i) => ({ n: LEADERS_N + i, label: m.ticker, run: () => open(m) })),
    ...laggers.map((m, i) => ({ n: LAGGERS_N + i, label: m.ticker, run: () => open(m) })),
  ];
  useMenu('des-index-members', items);
  const head = members ? (
    <>
      <b className="des-n">{MEMBERS_N})</b> Members<span className="des-fn"> | {name(members)} »</span>
    </>
  ) : (
    'Members'
  );
  // Prices still to come: the members are listed, none has a change yet.
  const why = blank ?? (b.members && !b.priced ? 'No member has a price for the day yet' : undefined);
  const dash = (title: string | undefined) => <span title={title}>--</span>;
  const cell = (m: MemberMove | undefined, n: number) =>
    m ? (
      <button type="button" className="des-link" title={`${n} <GO> or click: ${m.name}`} onClick={(e) => open(m, e)}>
        <span className="muted">{n})</span> <span className="amber">{m.ticker}</span>
      </button>
    ) : null;
  return (
    <>
      <div className="row pad-s des-members">
        {/* The link takes the line's amber (.des-link inherits its colour). */}
        <span className="amber">
          {members ? (
            <button type="button" className="des-link" title={`${MEMBERS_N} <GO> or click: ${members}`} onClick={() => execute(panel, `${sec.id} ${members}`)}>
              {head}
            </button>
          ) : (
            head
          )}
        </span>
        {b.members ? <span className="white">{fmtInt(b.members)}</span> : <span className="white">{dash(blank)}</span>}
        {b.members ? (
          <>
            <span className="up" title="Members up on the day">↑{why ? dash(why) : b.up}</span>
            <span className="dn" title="Members down on the day">↓{why ? dash(why) : b.down}</span>
            <span className="muted" title="Members unchanged on the day">→ {why ? dash(why) : b.unch}</span>
            {!why && b.priced < b.members ? <span className="muted" title="Members without a price for the day are in none of the three counts">({b.priced} of {b.members} priced)</span> : null}
          </>
        ) : null}
      </div>
      <Box n={movers ? MOVERS_N : undefined} title="Movers" fn={movers} sec={sec}>
        <table className="tbl des-movers">
          <thead>
            <tr>
              <th>Leaders</th>
              <th className="num">% Chg</th>
              <th>Laggers</th>
              <th className="num">% Chg</th>
            </tr>
          </thead>
          <tbody>
            {why || (!leaders.length && !laggers.length) ? (
              <tr>
                {[0, 1, 2, 3].map((k) => (
                  <td key={k} className={k % 2 ? 'num' : undefined}>
                    {dash(why ?? 'No member moved on the day')}
                  </td>
                ))}
              </tr>
            ) : (
              Array.from({ length: SIDE }, (_, i) => (
                <tr key={i}>
                  <td>{cell(leaders[i], LEADERS_N + i)}</td>
                  <td className="num">{leaders[i] ? <Chg v={leaders[i].pct} dec={2} /> : null}</td>
                  <td>{cell(laggers[i], LAGGERS_N + i)}</td>
                  <td className="num">{laggers[i] ? <Chg v={laggers[i].pct} dec={2} /> : null}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Box>
      {source ? <div className="note">{source}</div> : null}
    </>
  );
}

function BoardIndexMembers({ sec }: { sec: SecurityDef }) {
  const board = useIndexMembers(sec.id)!;
  const blank = board.members.length ? undefined : board.state === 'error' ? board.message ?? 'The member list could not be loaded.' : 'Loading the members…';
  return (
    <IndexMembersView
      sec={sec}
      moves={boardMoves(board.members)}
      blank={blank}
      members="MEMBERS"
      movers="CONTRIB"
      source={`Members from ${board.index.from}; each member's change on the day from Yahoo's prices, refreshed every minute.${board.members.length && board.message ? ` ${board.message}` : ''}`}
    />
  );
}

function FtseIndexMembers({ sec }: { sec: SecurityDef }) {
  const { list, by, problem } = useFtse100(true);
  const blank = list?.members?.length ? undefined : list?.state === 'error' ? `Wikipedia's FTSE 100 list did not load: ${list.message ?? 'no answer'}` : 'Loading the members…';
  // MEMBERS has no FTSE 100 list and CONTRIB ranks only the app's own London stocks, so the line and the band open
  // nothing here.
  return (
    <IndexMembersView
      sec={sec}
      moves={ftseMoves(list?.members ?? [], by)}
      blank={blank}
      source={
        <>
          Members from {FTSE_SOURCE}
          {list?.asOf ? `, after the changes on ${list.asOf}` : ''}; each member&apos;s change is its latest price in Yahoo Finance&apos;s daily prices over the close before it, refreshed every half hour.
          {list?.state === 'error' && list.members?.length ? ` The latest request for the list failed: ${list.message}` : ''}
          {problem ? ` ${problem}` : ''}
        </>
      }
    />
  );
}

/** The Members line and Movers table for an index: its real members where the app can load them, else labelled blanks. */
export function IndexMembers({ sec }: { sec: SecurityDef }) {
  // A volatility index has no members.
  if (sec.ticker === 'VIX') return null;
  if (membersAvailable() && BOARD_INDICES[sec.id]) return <BoardIndexMembers sec={sec} />;
  if (membersAvailable() && sec.id === 'UKX Index') return <FtseIndexMembers sec={sec} />;
  const why = membersAvailable()
    ? `The app does not load the membership of ${sec.id}: it has the members of the S&P 500, the Nasdaq-100, the Dow and the FTSE 100.`
    : "The index's members need the desktop app, which loads them from public lists.";
  return <IndexMembersView sec={sec} moves={[]} blank={why} members="MEMBERS" movers="CONTRIB" />;
}
