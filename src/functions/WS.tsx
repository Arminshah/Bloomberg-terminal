import { useEffect, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { SecLink } from '../components/cells';
import { SimBadge } from '../components/Source';
import { exportActions } from '../components/ExportActions';
import { fmtBig, fmtNum, fmtPct } from '../core/format';
import { engine, useTick } from '../data/market';
import { averageVolume, marketCap, periodChange, range52w } from '../data/analytics';
import { extendedSessions } from '../data/live/yahoo';
import { useFundamentalsFor } from '../data/live/yfund';
import { withBook } from '../data/live/nasdaq-book';
import { resolveSecurity, searchSecurities } from '../data/registry';
import { sortWatchlistRows, WATCHLIST_COLUMNS, watchlistExport, watchlistRow, type WatchlistColumn, type WatchlistRow } from '../data/watchlist-columns';
import { FUNDAMENTAL_COLUMNS, fundamentalColumn, fundamentalFields, isFundamental } from '../data/worksheet-fields';
import type { SecurityDef } from '../data/types';
import { flash, usePanelId } from '../terminal/panel';
import { DEFAULT_WORKSHEET_COLUMNS, worksheets, type Worksheet } from '../terminal/userdata';
import type { FnProps } from '../terminal/types';
import { FieldCell } from './W';

/**
 * W, worksheets: tables of the securities you choose by the fields you choose, the market fields the watchlist shows
 * and fundamentals (market value, enterprise value, valuation and quality ratios), each cell with its source on hover,
 * several sheets kept apart from the watchlists, sorted by any column and exported with every cell's source.
 */

/** Every column a worksheet offers: the watchlist's market fields (not its intraday sparkline), then fundamentals. */
export const WORKSHEET_COLUMNS: readonly WatchlistColumn[] = [
  ...WATCHLIST_COLUMNS.filter((c) => c.id !== 'ARMIN_TODAY'),
  ...FUNDAMENTAL_COLUMNS.map((c) => ({ id: c.id, label: c.label, numeric: c.format !== 'text' })),
];
const BY_ID = new Map(WORKSHEET_COLUMNS.map((c) => [c.id, c]));

/** A sheet's columns in order, unknown or repeated IDs dropped; the defaults when none are left. */
export function sheetColumns(ids: readonly string[] | undefined): WatchlistColumn[] {
  const known = [...new Set((ids ?? []).filter((id) => BY_ID.has(id)))];
  return (known.length ? known : DEFAULT_WORKSHEET_COLUMNS).map((id) => BY_ID.get(id)!);
}

/** One row: the watchlist's market fields with the fundamental ones added. */
export function worksheetRow(id: string, sec: SecurityDef | undefined, now: number): WatchlistRow {
  const row = watchlistRow(id, sec, withBook(id, engine.quote(id)), now, { ytd: periodChange(id, 'YTD'), y1: periodChange(id, '1Y'), today: [], extended: extendedSessions(id, now), avgVolume: averageVolume(id), range52: range52w(id), marketCap: marketCap(id) });
  for (const [k, f] of fundamentalFields(sec)) row.fields.set(k, f);
  return row;
}

function FundamentalCell({ id, row }: { id: string; row: WatchlistRow }) {
  const f = row.fields.get(id);
  const c = fundamentalColumn(id)!;
  if (!f || f.value === null) return <span className="muted" title={f?.note ?? 'Not available for this security.'} />;
  const v = f.value;
  const shown = c.format === 'usd' ? fmtBig(Number(v)) : c.format === 'pct' ? (id === 'ARMIN_REV_GROWTH' ? fmtPct(Number(v), 1) : `${fmtNum(Number(v), 1)}%`) : c.format === 'ratio' ? fmtNum(Number(v), id === 'ARMIN_PB' || id === 'ARMIN_BETA' || id === 'ARMIN_EPS_LTM' ? 2 : 1) : String(v);
  return <span title={`${f.name} (${f.unit}) · ${f.source} · ${f.status}\n${f.definition}\n${f.note}`}>{shown}</span>;
}

export function WS({ route }: FnProps) {
  const panel = usePanelId();
  useTick(2);
  const st = worksheets.use((s) => s);
  // W TECH opens the sheet whose name starts with TECH, as WATCHLIST TECH opens a list.
  const wanted = route.args?.trim().toUpperCase();
  useEffect(() => {
    if (!wanted) return;
    const i = worksheets.get().sheets.findIndex((x) => x.name.toUpperCase().startsWith(wanted));
    if (i >= 0) worksheets.set((s) => ({ ...s, active: i }));
    else flash(panel, `No sheet named ${wanted}: New sheet makes one`, 'error');
  }, [wanted, panel]);
  const active = Math.min(st.active, st.sheets.length - 1);
  const sheet = st.sheets[active];
  const [text, setText] = useState('');
  const [picking, setPicking] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const columns = sheetColumns(sheet.columns);
  const defs = sheet.ids.map((id) => engine.get(id)).filter((d): d is SecurityDef => !!d);
  const wantsFundamentals = columns.some((c) => isFundamental(c.id) && c.id !== 'ARMIN_SECTOR' && c.id !== 'ARMIN_INDUSTRY');
  useFundamentalsFor(wantsFundamentals ? defs.filter((d) => d.cls === 'equity') : []);
  const now = engine.now();
  const rows = sortWatchlistRows(sheet.ids.map((id) => worksheetRow(id, engine.get(id), now)), sheet.sort, columns);
  const hits = text.trim() ? searchSecurities(text, 6) : [];
  const update = (patch: Partial<Worksheet>) => worksheets.set((s) => ({ ...s, sheets: s.sheets.map((x, i) => (i === active ? { ...x, ...patch } : x)) }));
  const add = (id: string) => {
    if (sheet.ids.includes(id)) flash(panel, `${id} is already on ${sheet.name}`, 'error');
    else update({ ids: [...sheet.ids, id] });
    setText('');
  };
  const toggle = (id: string) => update({ columns: sheet.columns.includes(id) ? sheet.columns.filter((c) => c !== id) : [...sheet.columns, id] });
  const sortBy = (id: string) => update({ sort: sheet.sort?.column === id ? (sheet.sort.direction === 'desc' ? { column: id, direction: 'asc' } : undefined) : { column: id, direction: 'desc' } });
  const csv = () => watchlistExport(rows, columns, now);
  const groups: [string, readonly WatchlistColumn[]][] = [
    ['Market', WORKSHEET_COLUMNS.filter((c) => !isFundamental(c.id))],
    ['Fundamentals', WORKSHEET_COLUMNS.filter((c) => isFundamental(c.id))],
  ];
  return (
    <div>
      <FnHeader
        code="WORKSHEET"
        title="Worksheets"
        sub={<>{engine.realOnly ? null : <><SimBadge /> demo figures; real ones in the desktop app · </>}{sheet.ids.length} securities · {columns.length} columns</>}
        tabs={st.sheets.map((x, i) => ({ n: i + 1, label: x.name }))}
        tab={active + 1}
        onTab={(n) => worksheets.set((s) => ({ ...s, active: n - 1 }))}
        actions={exportActions(panel, `${sheet.name.replace(/\W+/g, '_')}_worksheet.csv`, csv)}
      />
      <div className="chart-tools pad-s">
        {renaming ? (
          <input
            className="inp"
            autoFocus
            aria-label="Sheet name"
            defaultValue={sheet.name}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const name = (e.target as HTMLInputElement).value.trim();
                if (name) update({ name });
                setRenaming(false);
              }
              if (e.key === 'Escape') setRenaming(false);
            }}
            onBlur={() => setRenaming(false)}
          />
        ) : (
          <span style={{ position: 'relative' }}>
            <input
              className="inp"
              style={{ width: 220 }}
              placeholder="+ Add security (ticker or name)"
              aria-label="Add security to sheet"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const r = resolveSecurity(text) ?? hits[0]?.def;
                  if (r) add(r.id);
                }
              }}
            />
            {hits.length > 0 && (
              <div className="ac" style={{ left: 0, right: 'auto', minWidth: 320 }}>
                {hits.map(({ def }) => (
                  <div key={def.id} className="ac-item" onMouseDown={(e) => { e.preventDefault(); add(def.id); }}>
                    <span className="k">{def.id}</span>
                    <span>{def.name}</span>
                    <span />
                  </div>
                ))}
              </div>
            )}
          </span>
        )}
        <button type="button" className={`btn${picking ? ' on' : ''}`} onClick={() => setPicking(!picking)}>
          Columns
        </button>
        <button type="button" className="btn" onClick={() => setRenaming(true)}>
          Rename
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => worksheets.set((s) => ({ sheets: [...s.sheets, { name: `Sheet ${s.sheets.length + 1}`, ids: [], columns: DEFAULT_WORKSHEET_COLUMNS }], active: s.sheets.length }))}
        >
          New sheet
        </button>
        {st.sheets.length > 1 && (
          <button type="button" className="btn" onClick={() => worksheets.set((s) => ({ sheets: s.sheets.filter((_, i) => i !== active), active: Math.max(0, active - 1) }))}>
            Delete sheet
          </button>
        )}
      </div>
      {picking && (
        <div className="ws-picker pad-s" aria-label="Pick columns">
          {groups.map(([name, cols]) => (
            <fieldset key={name}>
              <legend>{name}</legend>
              {cols.map((c) => (
                <label key={c.id} className="ws-col">
                  <input type="checkbox" checked={columns.some((x) => x.id === c.id)} onChange={() => toggle(c.id)} /> {c.label}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      )}
      <div className="tbl-wrap">
        <table className="tbl" aria-label="Worksheet">
          <thead>
            <tr>
              <th>Security</th>
              {columns.map((c) => (
                <th key={c.id} className={`sortable${c.numeric ? ' num' : ''}`} onClick={() => sortBy(c.id)} title="Click to sort">
                  {c.label}
                  {sheet.sort?.column === c.id ? (sheet.sort.direction === 'desc' ? ' ▼' : ' ▲') : ''}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const sec = engine.get(r.id);
              return (
                <tr key={r.id}>
                  <td>{sec ? <SecLink id={r.id}>{sec.ticker}</SecLink> : <span className="muted">{r.id}</span>}</td>
                  {columns.map((c) => (
                    <td key={c.id} className={c.numeric ? 'num' : undefined}>
                      {isFundamental(c.id) ? <FundamentalCell id={c.id} row={r} /> : <FieldCell column={c} row={r} sec={sec} quote={engine.quote(r.id)} now={now} />}
                    </td>
                  ))}
                  <td>
                    <button type="button" className="link-btn" aria-label={`Remove ${r.id}`} onClick={() => update({ ids: sheet.ids.filter((x) => x !== r.id) })}>
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <div className="empty">Add securities with the box above.</div>}
      <div className="note">
        Fundamentals are worked out as PEERS works them out, from the companies&apos; statements and the current price; a stock&apos;s cell is blank until its
        statements load, and other securities have none. Hover a cell for its source and definition. Sheets are kept apart from the watchlists; the
        export lists every cell&apos;s source.
      </div>
    </div>
  );
}
