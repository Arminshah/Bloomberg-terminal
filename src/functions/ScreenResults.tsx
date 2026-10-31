// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useState, type MouseEvent, type ReactNode } from 'react';
import { DataTable, type Column } from '../components/DataTable';
import { fmtIso, fmtNum } from '../core/format';
import { columnMean, FIELD, NM, type Candidate, type ScreenRow } from '../data/screen';

/**
 * SCREEN's Results tab for the FTSE 100, laid out as the first portfolio paper's results (its Figure 1.3, 31 January
 * 2019): Name, GM LF sorted from the highest with a bar, ROE LF, Market Cap, Price:D-1, P/E and Total Return YTD,
 * under the summary row "Investable Universe (n)", each of its figures the plain mean of the rows below. The bar
 * follows the sorted column. LF in the paper is the latest filing; here it is the latest fiscal year in Yahoo
 * Finance's annual statements, as the notes and headings say.
 */

const value = (c: Candidate, key: string): number => {
  const v = c.values[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : NaN;
};
const two = (v: number) => fmtNum(v, 2, false);

interface ResultCol {
  key: string;
  label: ReactNode;
  /** The heading's tooltip: what the figure is and where it comes from. */
  title: string;
  text: (v: number) => string;
}

export const RESULT_COLS: ResultCol[] = [
  { key: 'gm', label: 'GM LF', title: "Gross margin, latest fiscal year, %: gross profit over revenue in Yahoo Finance's annual statements. LF here is the latest annual figures, not interim ones.", text: (v) => `${two(v)}%` },
  { key: 'roce', label: 'ROE LF', title: "Return on common equity, latest fiscal year, %: net income to common shareholders over the average of the year's opening and closing common equity, from Yahoo Finance's annual statements.", text: (v) => `${two(v)}%` },
  { key: 'cap', label: 'Market Cap', title: "Market value, billions of pounds: the latest ordinary share count in Yahoo Finance's statements times the last price (a dollar or euro line at today's rate).", text: (v) => `${two(v)}B` },
  { key: 'prev', label: 'Price:D-1', title: "The previous session's close from Yahoo Finance's daily chart, in the line's own currency: pence unless marked.", text: two },
  { key: 'pe@lfy', label: 'P/E', title: "The last price over the latest fiscal year's diluted EPS (Yahoo Finance), in the same currency; n.m. on a loss.", text: two },
  {
    key: 'tr',
    label: (
      <>
        Total Return
        <br />
        YTD
      </>
    ),
    title: "Total return since last year's final close, %, with each dividend reinvested at the close of its ex-date (Yahoo Finance's daily closes and dividends).",
    text: two,
  },
];

/** The previous closes' mean, only when every row with one is in the same currency. */
function priceMean(rows: readonly ScreenRow[]): { mean: number; n: number; ccy?: string; mixed: boolean } {
  const priced = rows.filter((r) => Number.isFinite(value(r.c, 'prev')));
  const ccys = new Set(priced.map((r) => String(r.c.values.ccy ?? '')));
  if (ccys.size > 1) return { mean: NaN, n: priced.length, mixed: true };
  return { ...columnMean(priced.map((r) => value(r.c, 'prev'))), ccy: [...ccys][0], mixed: false };
}

/** The results as a table for export: the summary row first, as on screen. */
export function resultsCsv(rows: readonly ScreenRow[]): (string | number)[][] {
  const mean = (key: string) => (key === 'prev' ? priceMean(rows).mean : columnMean(rows.map((r) => r.c.values[key])).mean);
  const cell = (v: number) => (Number.isFinite(v) ? Number(v.toFixed(6)) : '');
  return [
    ['Name', 'Ticker', 'GM LF (%)', 'ROE LF (%)', 'Market Cap (GBP bn)', 'Price:D-1', 'Currency', 'P/E', 'Total Return YTD (%)', 'Fiscal year end'],
    [`Investable Universe (${rows.length})`, '', ...['gm', 'roce', 'cap', 'prev'].map((k) => cell(mean(k))), priceMean(rows).ccy ?? '', cell(mean('pe@lfy')), cell(mean('tr')), ''],
    ...rows.map((r) => [r.c.name, r.c.ticker, ...['gm', 'roce', 'cap', 'prev'].map((k) => cell(value(r.c, k))), String(r.c.values.ccy ?? ''), r.c.values['pe@lfy'] === NM ? NM : cell(value(r.c, 'pe@lfy')), cell(value(r.c, 'tr')), String(r.c.values.fy ?? '')]),
  ];
}

export function ScreenResults({ rows, empty, onOpen }: { rows: ScreenRow[]; empty: ReactNode; onOpen: (c: Candidate, e?: MouseEvent) => void }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>({ key: 'gm', dir: -1 });
  // The bar's full length is the largest value in the sorted column.
  const largest = sort ? Math.max(0, ...rows.map((r) => Math.abs(value(r.c, sort.key))).filter(Number.isFinite)) : 0;
  const bar = (key: string, v: number) =>
    sort?.key === key && Number.isFinite(v) && largest > 0 ? <span className={`eqs-bar${v < 0 ? ' neg' : ''}`} style={{ width: `${Math.max(1, Math.round((Math.abs(v) / largest) * 48))}px` }} aria-hidden="true" /> : null;
  const ccyOf = (c: Candidate) => String(c.values.ccy ?? '');

  const columns: Column<ScreenRow>[] = [
    {
      key: 'name',
      label: 'Name',
      render: (r) => (
        <>
          <span className="ellipsis eqs-name" title={`${r.c.name} (${r.c.ticker} LN)`}>
            {r.c.name.toUpperCase()}
          </span>
          {r.unknown.length > 0 && (
            <span className="muted" title={`No value for ${r.unknown.map((f) => FIELD[f].label).join(', ')}: kept because the screen keeps stocks with a missing value`}>
              {' ?'}
            </span>
          )}
        </>
      ),
      sort: (r) => r.c.name,
    },
    ...RESULT_COLS.map(
      (col): Column<ScreenRow> => ({
        key: col.key,
        label: col.label,
        title: col.title,
        num: true,
        // Room for the bar (48px at most) beside a figure such as "643.99%" without touching it.
        width: 124,
        cls: () => 'eqs-cell',
        sort: (r) => value(r.c, col.key),
        render: (r) => {
          const v = value(r.c, col.key);
          if (r.c.values[col.key] === NM) return <span title="Not meaningful: a loss">{NM}</span>;
          if (!Number.isFinite(v)) return <span className="muted" title="The source gives no value" />;
          const fy = col.key === 'gm' || col.key === 'roce' || col.key === 'pe@lfy' ? String(r.c.values.fy ?? '') : '';
          const ccy = col.key === 'prev' && ccyOf(r.c) && ccyOf(r.c) !== 'GBp' ? ccyOf(r.c) : '';
          return (
            <span title={fy ? `Fiscal year to ${fmtIso(fy)}` : undefined}>
              {bar(col.key, v)}
              {col.text(v)}
              {ccy && <span className="muted"> {ccy}</span>}
            </span>
          );
        },
      }),
    ),
  ];

  const prices = priceMean(rows);
  const summary = (
    <>
      <tr className="eqs-summary" data-testid="eqs-investable">
        <td className="idx num" />
        <td>Investable Universe ({rows.length})</td>
        {RESULT_COLS.map((col) => {
          const m = col.key === 'prev' ? prices : columnMean(rows.map((r) => r.c.values[col.key]));
          const title =
            col.key === 'prev' && prices.mixed
              ? 'No average: the previous closes are in different currencies'
              : m.n < rows.length
                ? `The plain mean of the ${m.n} of ${rows.length} rows with a value`
                : `The plain mean of the ${rows.length} rows below`;
          return (
            <td key={col.key} className="num eqs-cell" title={title}>
              {Number.isFinite(m.mean) ? (
                <span>
                  {bar(col.key, m.mean)}
                  {col.text(m.mean)}
                  {col.key === 'prev' && prices.ccy && prices.ccy !== 'GBp' && <span className="muted"> {prices.ccy}</span>}
                </span>
              ) : null}
            </td>
          );
        })}
      </tr>
      <tr className="eqs-spacer" aria-hidden="true">
        <td colSpan={RESULT_COLS.length + 2} />
      </tr>
    </>
  );

  return (
    <DataTable
      className="eqs-results"
      rows={rows}
      rowKey={(r) => r.c.ticker}
      numbered={31}
      onRowClick={(r, e) => onOpen(r.c, e)}
      defaultSort={{ key: 'gm', dir: -1 }}
      onSortChange={setSort}
      summary={rows.length ? summary : undefined}
      empty={empty}
      columns={columns}
    />
  );
}
