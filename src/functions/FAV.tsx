import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { FreshnessLegend } from '../components/Freshness';
import { exportActions } from '../components/ExportActions';
import { FavStar } from '../components/FavStar';
import { SecLink, openSecurity } from '../components/cells';
import { engine, useTick } from '../data/market';
import { periodChange } from '../data/analytics';
import { watchlistColumns, watchlistExport, watchlistRow } from '../data/watchlist-columns';
import { newsAvailable } from '../data/live/marketnews';
import { extendedSessions } from '../data/live/yahoo';
import { useExtendedSessionQuotes } from '../data/live/extended-hours';
import { LIST_REACH, securitiesNews, useSecuritiesNews } from '../data/live/secnews';
import { resolveSecurity, searchSecurities } from '../data/registry';
import type { SecurityDef } from '../data/types';
import { flash, usePanelId } from '../terminal/panel';
import { favourites, toggleFavourite } from '../terminal/userdata';
import type { FnProps } from '../terminal/types';
import { FieldCell } from './W';
import { StoryList } from './MNEWS';
import { firstRowNumber } from '../terminal/numbering';

/** News is read for the first 20 favourites, so a long list cannot exceed the sources' limits. */
const NEWS_MAX = 20;

/** Each favourite's fields, in WATCHLIST's default columns, with the time they were read. */
function favouriteRows(ids: string[]) {
  const now = engine.now();
  const columns = watchlistColumns(undefined);
  const rows = ids.map((id) => {
    const intra = engine.intraday(id);
    return watchlistRow(id, engine.get(id), engine.quote(id), now, {
      ytd: periodChange(id, 'YTD'),
      today: intra ? Array.from(intra.c.subarray(0, intra.length)) : [],
      intradayTime: intra?.length ? intra.t[intra.length - 1] : undefined,
      extended: extendedSessions(id, now),
    });
  });
  return { now, columns, rows };
}

/** The favourites with WATCHLIST's default fields: click a row to open it, ★ to unstar, the arrows to reorder. */
function FavouriteQuotes({ ids, onMove }: { ids: string[]; onMove: (i: number, d: -1 | 1) => void }) {
  const panel = usePanelId();
  useTick(1);
  useExtendedSessionQuotes(ids);
  const { now, columns, rows } = favouriteRows(ids);
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Security</th>
            {columns.map((c) => (
              <th key={c.id} className={`${c.numeric ? 'num' : ''}${c.compact ? '' : ' hide-m'}`} title={c.id}>
                {c.label}
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 2} className="empty">
                No favourites yet. Star a security with ☆ beside its name (any screen&apos;s header, the watchlist) or add one above.
              </td>
            </tr>
          )}
          {rows.map((row, i) => {
            const d = engine.get(row.id);
            const q = engine.quote(row.id);
            return (
              <tr key={row.id} className="click" onClick={(e) => openSecurity(panel, row.id, e)}>
                <td className="nowrap">
                  <FavStar id={row.id} />
                  {d ? <SecLink id={row.id}>{d.ticker}</SecLink> : <span title="Security definition is unavailable in this session.">{row.id}</span>}
                </td>
                {columns.map((c) => (
                  <td key={c.id} className={`${c.numeric ? 'num' : 'ellipsis'}${c.compact ? '' : ' hide-m'}${c.id === 'PX_LAST' ? ' white' : ''}`} style={c.numeric || c.id === 'ARMIN_TODAY' ? undefined : { maxWidth: 240 }}>
                    <FieldCell column={c} row={row} sec={d} quote={q} now={now} />
                  </td>
                ))}
                <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="act" aria-label="Move up" disabled={i === 0} onClick={() => onMove(i, -1)}>
                    ▲
                  </button>
                  <button type="button" className="act" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => onMove(i, 1)}>
                    ▼
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * FAVOURITES (FAV): the securities you starred, with live prices (1) and their news merged (2). ☆ beside a
 * security's name in any screen's header, the watchlist or a search stars it; the command line offers favourites
 * as soon as it is clicked.
 */
export function FAV({ route }: FnProps) {
  const panel = usePanelId();
  const ids = favourites.use((s) => s.ids);
  const [tab, setTab] = useState(/^NEWS/i.test(route.args?.trim() ?? '') ? 2 : 1);
  const [text, setText] = useState('');
  const hits = text.trim() ? searchSecurities(text, 6) : [];
  const defs = useMemo(() => ids.map((id) => engine.get(id)).filter((d): d is SecurityDef => !!d), [ids]);
  const v = useSecuritiesNews(tab === 2 ? defs : [], LIST_REACH, NEWS_MAX);
  const stories = useMemo(() => (tab === 2 ? securitiesNews(defs, LIST_REACH, NEWS_MAX) : []), [tab, defs, v]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (id: string) => {
    if (ids.includes(id)) flash(panel, `${id} is already a favourite`, 'error');
    else toggleFavourite(id);
    setText('');
  };
  const move = (i: number, d: -1 | 1) => {
    const next = [...ids];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    favourites.set({ ids: next });
  };
  const csv = () => {
    const { now, columns, rows } = favouriteRows(ids);
    return watchlistExport(rows, columns, now);
  };
  return (
    <div className={tab === 2 ? 'fn-fill' : undefined}>
      <FnHeader
        code="FAVOURITES"
        title="Favourites"
        sub={tab === 2 ? `${stories.length} stories on ${Math.min(defs.length, NEWS_MAX)} favourites` : `${ids.length} securities`}
        tabs={[
          { n: 1, label: 'Quotes' },
          { n: 2, label: 'News' },
        ]}
        tab={tab}
        onTab={setTab}
        actions={tab === 1 ? exportActions(panel, 'favourites.csv', csv) : []}
      />
      <div className="chart-tools">
        <span style={{ position: 'relative' }}>
          <input
            className="inp"
            style={{ width: 220 }}
            placeholder="+ Add favourite (ticker or name)"
            aria-label="Add a favourite"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                const r = resolveSecurity(text) ?? hits[0]?.def;
                if (r) add(r.id);
              }
            }}
          />
          {hits.length > 0 && (
            <div className="ac" style={{ left: 0, right: 'auto', minWidth: 320 }}>
              {hits.map(({ def }) => (
                <div
                  key={def.id}
                  className="ac-item"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    add(def.id);
                  }}
                >
                  <span className="k">{def.id}</span>
                  <span>{def.name}</span>
                  <span />
                </div>
              ))}
            </div>
          )}
        </span>
        <span className="muted hide-m">☆ beside a security&apos;s name stars it anywhere · the command line shows favourites as soon as you click it</span>
      </div>
      {tab === 1 ? (
        <>
          <FavouriteQuotes ids={ids} onMove={move} />
          <FreshnessLegend />
        </>
      ) : !newsAvailable() ? (
        <div className="empty">News is read by the desktop app; the browser build has no data source.</div>
      ) : (
        <StoryList
          stories={stories}
          first={firstRowNumber([1, 2])}
          empty={defs.length ? 'Loading the news of your favourites…' : 'No favourites yet: star a security with ☆ beside its name.'}
        />
      )}
      {tab === 2 && defs.length > NEWS_MAX ? <div className="note">News covers the first {NEWS_MAX} favourites; reorder them on 1) Quotes.</div> : null}
    </div>
  );
}
