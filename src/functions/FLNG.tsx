import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { RealBadge } from '../components/Source';
import { exportActions } from '../components/ExportActions';
import { DataTable, type Column } from '../components/DataTable';
import { fmtIso, fmtNum } from '../core/format';
import { DAY_MS } from '../data/calendar';
import { loadFilings13F, secAvailable, SEC_DESKTOP_ONLY, useSecLoad, type Filing13F } from '../data/live/sec';
import { usePanelId } from '../terminal/panel';
import { navigate } from '../terminal/state';
import type { FnProps } from '../terminal/types';

/**
 * FLNG, Form 13F filings: the holdings reports investment managers file with the SEC each quarter, found by EDGAR's
 * full-text search, the latest first: those filed in a recent period, or a manager's by name. A row opens the
 * manager's holdings (HOLDINGS), by its CIK, whether or not it has listed shares.
 */

export const SPANS = [
  { n: 1, label: 'Last 3 days', days: 3 },
  { n: 2, label: 'Last week', days: 7 },
  { n: 3, label: 'Last month', days: 31 },
  { n: 4, label: 'Any time', days: 0 },
] as const;

const PAGE = 100;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const quarterOf = (period: string) => (/^\d{4}-\d{2}-\d{2}$/.test(period) ? `Q${Math.ceil(Number(period.slice(5, 7)) / 3)} ${period.slice(0, 4)}` : '');

/** The search the screen asks for: a filer's name, filing dates, or both; "any time" only with a name. */
export function filingQuery(name: string, span: number, now: number, page: number): { name?: string; startdt?: string; enddt?: string; from?: number } | null {
  const days = SPANS.find((s) => s.n === span)?.days ?? 3;
  const n = name.trim();
  if (!days && n.length < 2) return null;
  return { ...(n.length >= 2 ? { name: n } : {}), ...(days ? { startdt: iso(now - days * DAY_MS), enddt: iso(now) } : {}), ...(page ? { from: page * PAGE } : {}) };
}

export const filingIndexUrl = (f: Pick<Filing13F, 'cik' | 'accession'>) => `https://www.sec.gov/Archives/edgar/data/${f.cik}/${f.accession.replace(/-/g, '')}/`;

export function FLNG({ route }: FnProps) {
  const panel = usePanelId();
  const [typed, setTyped] = useState(route.args ?? '');
  const [name, setName] = useState(route.args ?? '');
  const [span, setSpan] = useState<number>(route.args ? 4 : 1);
  const [page, setPage] = useState(0);
  const q = filingQuery(name, span, Date.now(), page);
  const key = q ? JSON.stringify(q) : null;
  const load = useSecLoad(secAvailable() && key ? `flng:${key}` : null, (force) => loadFilings13F(q!, force));
  const res = load.result?.ok ? load.result.data : null;
  const filings = res?.filings ?? [];
  const pages = res ? Math.max(1, Math.ceil(Math.min(res.total, 10_000) / PAGE)) : 1;
  const columns: Column<Filing13F>[] = [
    { key: 'filed', label: 'Filed', render: (f) => fmtIso(f.filed), sort: (f) => f.filed },
    { key: 'filer', label: 'Manager', render: (f) => <span className="amber">{f.filer}</span>, sort: (f) => f.filer },
    { key: 'q', label: 'Quarter', render: (f) => quarterOf(f.period), sort: (f) => f.period },
    { key: 'form', label: 'Form', render: (f) => (f.form.endsWith('/A') ? <span className="yellow" title="An amendment: it restates or adds to the report">{f.form}</span> : f.form), sort: (f) => f.form },
    { key: 'cik', label: 'CIK', render: (f) => <span className="muted">{f.cik}</span>, sort: (f) => f.cik, hideM: true },
    {
      key: 'doc',
      label: 'Filing',
      render: (f) => (
        <a href={filingIndexUrl(f)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="blue">
          SEC ›
        </a>
      ),
      hideN: true,
    },
  ];
  const csv = () => [['Filed', 'Manager', 'CIK', 'Quarter end', 'Form', 'Accession', 'Filing'], ...filings.map((f) => [f.filed, f.filer, f.cik, f.period, f.form, f.accession, filingIndexUrl(f)])];
  const submit = () => {
    setName(typed);
    setPage(0);
  };
  const status = !secAvailable()
    ? `${SEC_DESKTOP_ONLY} The browser demo has no 13F filings, and none are generated.`
    : !q
      ? 'Type a manager’s name to search all its 13F filings, or pick a recent period.'
      : load.result && !load.result.ok
        ? load.result.message
        : !res
          ? 'Searching EDGAR’s 13F filings…'
          : '';
  return (
    <div>
      <FnHeader
        code="FILINGS13F"
        title="13F Filings"
        sub={<><RealBadge /> SEC EDGAR full-text search: Form 13F holdings reports{res ? ` · ${fmtNum(res.total, 0)} match` : ''}</>}
        actions={exportActions(panel, `FLNG_${(name || 'latest').replace(/\W+/g, '_')}_${page + 1}.csv`, csv)}
        controls={
          <div className="chart-tools">
            <input
              className="inp"
              aria-label="Manager name"
              placeholder="Manager name, e.g. Bridgewater"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
            <button type="button" className="btn" onClick={submit}>
              Search
            </button>
            <label className="fld">
              Filed
              <select className="sel-inp" aria-label="Filed" value={span} onChange={(e) => { setSpan(Number(e.target.value)); setPage(0); }}>
                {SPANS.map((s) => (
                  <option key={s.n} value={s.n}>{s.label}</option>
                ))}
              </select>
            </label>
            {res && pages > 1 && (
              <span className="muted">
                <button type="button" className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹</button> Page {page + 1} of {pages}{' '}
                <button type="button" className="btn" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>›</button>
              </span>
            )}
          </div>
        }
      />
      {status ? (
        <div className="empty">{status}</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={filings}
            rowKey={(f) => f.accession}
            onRowClick={(f) => navigate(panel, { fn: 'HOLDINGS', args: `CIK ${f.cik}` })}
            numbered={10}
            empty="No 13F filing matches."
          />
          <div className="note">
            Form 13F is filed within 45 days of each quarter&apos;s end by every investment manager with discretion over $100 million or more of US-listed
            stocks, options and convertible bonds. A row opens the manager&apos;s holdings; amendments (13F-HR/A) restate or add to a report.
          </div>
        </>
      )}
    </div>
  );
}
