import { useEffect, useMemo, useState } from 'react';
import './filings.css';
import { FnHeader } from '../components/FnHeader';
import { Freshness } from '../components/Freshness';
import { KV, Section } from '../components/cells';
import { fmtDay, fmtNum, fmtTime } from '../core/format';
import {
  EIGHT_K_ITEMS,
  FACT_LINES,
  FORM_GROUPS,
  SEC_DESKTOP_ONLY,
  cik10,
  coverShares,
  filingLinks,
  formGroup,
  lineValues,
  loadCompanyFacts,
  loadFiler,
  loadFilingPage,
  loadSecCompanies,
  periodColumns,
  periodDays,
  reportingCurrency,
  reportingCurrencies,
  resolveFiler,
  searchCompanies,
  secAvailable,
  secTicker,
  standaloneQuarterValues,
  useSecLoad,
  type Filing,
  type FactLine,
  type PeriodKind,
  type Reported,
  type SecResult,
} from '../data/live/sec';
import type { SecurityDef } from '../data/types';
import { reportCcy, type FinPeriod } from '../data/fundamentals';
import { resolveSecurity } from '../data/registry';
import { lookupSecurity, type LookupResult } from '../data/live/lookup';
import { useFundamentals } from '../data/live/yfund';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * A company's filings from SEC EDGAR, with links to the documents on sec.gov,
 * and the figures it reported in its XBRL financial statements. Any SEC filer
 * can be found by ticker, name or CIK. Filing dates, accession numbers, periods
 * and units are shown as the SEC gives them; nothing is estimated.
 */

const CODE = 'FILINGS';
const TITLE = 'Company Filings';

const isoMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const day = (iso?: string) => (iso ? fmtDay(isoMs(iso)) : '--');
/** The same with the four-digit year, for sentences and tooltips. */
const longDay = (iso?: string) => (iso ? fmtDay(isoMs(iso), true) : '--');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Fiscal year end as the SEC gives it (MMDD), in words. */
function fiscalYearEnd(mmdd?: string): string {
  if (!mmdd) return '--';
  const m = Number(mmdd.slice(0, 2));
  const d = Number(mmdd.slice(2));
  return m >= 1 && m <= 12 ? `${d} ${MONTHS[m - 1]}` : mmdd;
}

function Problem({ result }: { result: Extract<SecResult<unknown>, { ok: false }> }) {
  const panel = usePanelId();
  return (
    <div className="pad" role="status">
      <p className={result.reason === 'not-found' ? 'muted' : 'amber'}>{result.message}</p>
      {(result.reason === 'needs-agent' || result.reason === 'refused') && (
        <button type="button" className="btn primary" onClick={() => execute(panel, 'PROVIDERS')}>
          Open the provider screen
        </button>
      )}
    </div>
  );
}

/** When the copy on screen was fetched, and whether a refresh failed since. */
function Fetched({ at, stale, what }: { at: number; stale?: boolean; what: string }) {
  return stale ? (
    <Freshness label="STALE" title={`${what} fetched ${fmtDay(at)} ${fmtTime(at)}; the latest refresh failed`} />
  ) : (
    <Freshness label="REFERENCE" title={`${what} as EDGAR disseminates them, fetched ${fmtTime(at)}. Filings are documents, not prices.`} />
  );
}

export function FILINGS({ route, sec }: FnProps) {
  const arg = route.args?.trim() ?? '';
  const cikArg = !sec && /^(CIK)?\d{1,10}$/i.test(arg) ? Number(arg.replace(/^CIK/i, '')) : null;
  const ticker = sec ? secTicker(sec) : !cikArg && arg ? arg.toUpperCase() : null;
  if (!secAvailable()) {
    return (
      <div>
        <FnHeader code={CODE} title={TITLE} sec={sec} />
        <div className="pad muted">{SEC_DESKTOP_ONLY}</div>
      </div>
    );
  }
  if (sec && !ticker) return <CompanySearch sec={sec} initial={sec.name} note={`${sec.id} is not a US-listed stock in this app. Companies that file with the SEC can be found by name:`} />;
  if (!ticker && !cikArg) return <CompanySearch />;
  return <Filer key={`${ticker}:${cikArg}`} sec={sec} ticker={ticker} cik={cikArg} />;
}

// ------------------------------------------------------------------ search

function CompanySearch({ sec, initial, note }: { sec?: SecurityDef; initial?: string; note?: string }) {
  const panel = usePanelId();
  const [q, setQ] = useState(initial ?? '');
  const list = useSecLoad('companies', (force) => loadSecCompanies(force));
  const hits = useMemo(() => (list.result?.ok ? searchCompanies(list.result.data, q) : []), [list.result, q]);
  return (
    <div className="fn-fill">
      <FnHeader code={CODE} title={TITLE} sec={sec} sub="SEC EDGAR company search" right={list.result?.ok ? <Fetched at={list.result.at} stale={list.result.stale} what="The SEC's company list" /> : undefined} />
      <div className="chart-tools">
        <label className="fld" htmlFor={`filings-q-${panel}`}>
          Company
        </label>
        <input id={`filings-q-${panel}`} className="inp" style={{ width: 260 }} value={q} placeholder="ticker, name or CIK" autoFocus onChange={(e) => setQ(e.target.value)} />
        <span className="muted hide-m">{list.result?.ok ? `${fmtNum(list.result.data.length, 0)} tickers in the SEC's list` : ''}</span>
      </div>
      {note && <div className="note">{note}</div>}
      {!list.result ? (
        <div className="empty">Loading the SEC&apos;s company list…</div>
      ) : !list.result.ok ? (
        <Problem result={list.result} />
      ) : !q.trim() ? (
        <div className="empty">Type a ticker, a company name or a CIK.</div>
      ) : hits.length === 0 ? (
        <div className="empty">No SEC filer matches. The list covers companies with tickers; the SEC notes it is updated periodically, without a guarantee of accuracy or scope.</div>
      ) : (
        <table className="tbl zebra">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Company (EDGAR conformed name)</th>
              <th className="num">CIK</th>
            </tr>
          </thead>
          <tbody>
            {hits.map((c) => (
              <tr key={`${c.cik}:${c.ticker}`} className="click" onClick={() => execute(panel, `${CODE} CIK${c.cik}`)}>
                <td className="yellow">{c.ticker}</td>
                <td>{c.title}</td>
                <td className="num muted">{cik10(c.cik)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- filings

const FACTS_TAB = FORM_GROUPS.length + 2;

function Filer({ sec, ticker, cik: cikArg }: { sec?: SecurityDef; ticker: string | null; cik: number | null }) {
  const who = useSecLoad(ticker && !cikArg ? `ticker:${ticker}` : null, (force) => resolveFiler(ticker!, force));
  const cik = cikArg ?? (who.result?.ok ? who.result.data.cik : null);
  const filer = useSecLoad(cik ? `filer:${cik}` : null, (force) => loadFiler(cik!, force));
  const [tab, setTab] = useState(1);
  const [q, setQ] = useState('');
  const [older, setOlder] = useState<{ loaded: string[]; filings: Filing[]; loading: boolean; error?: string }>({ loaded: [], filings: [], loading: false });
  const panel = usePanelId();

  const f = filer.result?.ok ? filer.result.data : null;
  const all = useMemo(() => (f ? [...f.filings, ...older.filings] : []), [f, older.filings]);
  const group = tab >= 2 && tab < FACTS_TAB ? FORM_GROUPS[tab - 2].group : null;
  const needle = q.trim().toUpperCase();
  const list = useMemo(
    () =>
      all.filter((x) => {
        if (group && formGroup(x.form) !== group) return false;
        if (!needle) return true;
        const items = (x.items ?? []).map((i) => `${i} ${EIGHT_K_ITEMS[i] ?? ''}`).join(' ');
        return x.form.toUpperCase().startsWith(needle) || `${x.desc ?? ''} ${items} ${x.accession}`.toUpperCase().includes(needle);
      }),
    [all, group, needle],
  );
  const nextPage = f?.pages.find((p) => !older.loaded.includes(p.name));
  const latestAnnual = f?.filings.find((x) => /^(10-K|20-F|40-F)$/.test(x.form));

  const tabs = [{ n: 1, label: 'All' }, ...FORM_GROUPS.map((g, i) => ({ n: i + 2, label: g.label })), { n: FACTS_TAB, label: 'Reported figures' }];
  const reload = () => {
    if (!cikArg) who.reload();
    filer.reload();
  };
  const loadOlder = () => {
    if (!nextPage) return;
    setOlder((o) => ({ ...o, loading: true, error: undefined }));
    void loadFilingPage(nextPage.name).then((r) =>
      setOlder((o) => (r.ok ? { loaded: [...o.loaded, nextPage.name], filings: [...o.filings, ...r.data], loading: false } : { ...o, loading: false, error: r.message })),
    );
  };

  const head = (sub?: string) => (
    <FnHeader
      code={CODE}
      title={f ? f.name : TITLE}
      sec={sec}
      sub={sub ?? (f ? `SEC EDGAR · CIK ${cik10(f.cik)}` : 'SEC EDGAR')}
      tabs={f ? tabs : undefined}
      tab={tab}
      onTab={setTab}
      actions={f ? [{ n: FACTS_TAB + 1, label: 'Refresh', onClick: reload, title: 'Ask the SEC again' }] : []}
      right={filer.result?.ok ? <Fetched at={filer.result.at} stale={filer.result.stale} what="Filings" /> : undefined}
    />
  );

  if (!cikArg && who.result && !who.result.ok) {
    return (
      <div>
        {head()}
        <Problem result={who.result} />
        {who.result.reason === 'not-found' && (
          <div className="pad">
            <button type="button" className="btn" onClick={() => execute(panel, CODE)}>
              Search EDGAR by company name
            </button>
          </div>
        )}
      </div>
    );
  }
  if (filer.result && !filer.result.ok) {
    return (
      <div>
        {head()}
        <Problem result={filer.result} />
      </div>
    );
  }
  if (!f) {
    return (
      <div>
        {head()}
        <div className="empty">Loading filings from SEC EDGAR…</div>
      </div>
    );
  }

  return (
    <div className="fn-fill">
      {head()}
      {tab === FACTS_TAB ? (
        <ReportedFigures cik={f.cik} security={sec?.id ?? (ticker || f.tickers[0])} filings={f.filings} onCurrentReports={() => setTab(3)} />
      ) : (
        <>
          <div className="cols">
            <Section title="Filer">
              <KV
                // Lines the SEC's record has nothing for (a company that never changed its name) are left out.
                items={known([
                  ['CIK', cik10(f.cik)],
                  ['Tickers', f.tickers.length ? f.tickers.map((t, i) => `${t}${f.exchanges[i] ? ` (${f.exchanges[i]})` : ''}`).join(', ') : ''],
                  ['Industry (SIC)', f.sic ? `${f.sic} ${f.sicDescription ?? ''}`.trim() : ''],
                  ['Former name', f.formerNames.length ? `${f.formerNames[0].name}${f.formerNames[0].to ? ` (until ${day(f.formerNames[0].to)})` : ''}` : ''],
                ])}
              />
            </Section>
            <Section title="Reporting">
              <KV
                items={known([
                  ['Filer category', f.category ?? ''],
                  ['Fiscal year ends', fiscalYearEnd(f.fiscalYearEnd)],
                  ['Incorporated in', f.stateOfIncorporation ?? ''],
                  ['Latest annual report', latestAnnual ? `${latestAnnual.form} filed ${day(latestAnnual.filed)}` : ''],
                ])}
              />
            </Section>
          </div>
          <div className="chart-tools">
            <label className="fld" htmlFor={`filings-f-${panel}`}>
              Filter
            </label>
            <input id={`filings-f-${panel}`} className="inp" style={{ width: 200 }} value={q} placeholder="form or words, e.g. 10-K, 2.02" onChange={(e) => setQ(e.target.value)} />
            <span className="muted hide-m">{group ? FORM_GROUPS.find((g) => g.group === group)!.about : `${list.length} of ${all.length} filings`}</span>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <table className="tbl zebra">
              <thead>
                <tr>
                  <th title="The date the SEC deems the filing made">Filed</th>
                  <th>Form</th>
                  <th title="Period the report covers">Period</th>
                  <th>Description</th>
                  <th title="On sec.gov">Documents</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 500).map((x) => (
                  <FilingRow key={x.accession} cik={f.cik} f={x} />
                ))}
              </tbody>
            </table>
            {list.length === 0 && <div className="empty">No filings of this kind in the filings loaded.</div>}
            {list.length > 500 && <div className="note">Showing the latest 500 of {list.length}; filter to narrow.</div>}
            <div className="note">
              {nextPage ? (
                <>
                  The list above is the SEC&apos;s recent filings file (at least a year, or 1,000 filings).{' '}
                  <button type="button" className="btn" disabled={older.loading} onClick={loadOlder}>
                    {older.loading ? 'Loading…' : `Load older filings: ${day(nextPage.from)} to ${day(nextPage.to)} (${fmtNum(nextPage.count, 0)})`}
                  </button>
                  {older.error && <span className="amber"> {older.error}</span>}
                </>
              ) : (
                'Every filing EDGAR lists for this company is shown.'
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Rows with something to show. */
const known = (rows: [string, string][]) => rows.filter(([, v]) => v && v !== '--');

/** What a form is, as the SEC names it, for filings whose document has no description of its own. */
const FORM_NAMES: Record<string, string> = {
  '3': 'Initial statement of beneficial ownership of securities',
  '4': 'Statement of changes in beneficial ownership of securities',
  '5': 'Annual statement of changes in beneficial ownership of securities',
  '144': 'Notice of proposed sale of securities (Rule 144)',
  PX14A6G: 'Notice of exempt solicitation',
  PX14A6N: 'Notice of exempt solicitation (non-management)',
  'DEF 14A': 'Definitive proxy statement',
  DEFA14A: 'Additional definitive proxy soliciting materials',
  'SC 13G': 'Beneficial ownership report (passive investor)',
  'SC 13G/A': 'Beneficial ownership report, amended (passive investor)',
  'SC 13D': 'Beneficial ownership report (active investor)',
  'SC 13D/A': 'Beneficial ownership report, amended (active investor)',
  'S-8': 'Registration of securities for employee benefit plans',
  'S-3ASR': 'Automatic shelf registration statement',
  FWP: 'Free writing prospectus',
  '424B2': 'Prospectus',
  '424B5': 'Prospectus supplement',
  '11-K': 'Annual report of an employee stock purchase or savings plan',
  SD: 'Specialized disclosure report',
  ARS: 'Annual report to security holders',
  CORRESP: 'Correspondence with the SEC staff',
  UPLOAD: 'Letter from the SEC staff',
  'CERT': 'Certification of listing by an exchange',
  '8-A12B': 'Registration of a class of securities on an exchange',
  'IRANNOTICE': 'Notice of disclosure of Iran-related activities',
};

function FilingRow({ cik, f }: { cik: number; f: Filing }) {
  const links = filingLinks(cik, f);
  const items = f.items?.length ? f.items.map((i) => (EIGHT_K_ITEMS[i] ? `${i} ${EIGHT_K_ITEMS[i]}` : `Item ${i}`)).join('; ') : '';
  const desc = f.desc && f.desc.toUpperCase() !== f.form.toUpperCase() ? f.desc : FORM_NAMES[f.form.toUpperCase()] ?? '';
  return (
    <tr>
      <td title={f.accepted ? `EDGAR acceptance time as the submissions file gives it: ${f.accepted.replace('T', ' ').replace(/\.000Z$/, '')}` : undefined}>{day(f.filed)}</td>
      <td className="amber">{f.form}</td>
      <td>{f.report ? day(f.report) : ''}</td>
      <td>
        {items || desc || <span className="muted">{f.form}</span>}
        {items && desc ? <span className="muted"> · {desc}</span> : null}
      </td>
      <td className="nowrap">
        {links.doc && (
          <a href={links.doc} target="_blank" rel="noreferrer noopener" className="blue" title={`${f.doc}${f.size ? ` · filing ${fmtNum(f.size / 1024, 0)} KB in all` : ''}`}>
            Document
          </a>
        )}
        {links.doc ? ' · ' : ''}
        <a href={links.index} target="_blank" rel="noreferrer noopener" className="blue" title={`Every document in accession ${f.accession}`}>
          Index
        </a>
      </td>
    </tr>
  );
}

// -------------------------------------------------------- reported figures

const SECTIONS: { key: FactLine['section']; label: string }[] = [
  { key: 'income', label: 'Income statement' },
  { key: 'cash', label: 'Cash flow' },
  { key: 'balance', label: 'Balance sheet' },
];

function ReportedFigures({ cik, security, filings, onCurrentReports }: { cik: number; security?: string; filings: Filing[]; onCurrentReports: () => void }) {
  const panel = usePanelId();
  const facts = useSecLoad(`facts:${cik}`, (force) => loadCompanyFacts(cik, force));
  const [kind, setKind] = useState<PeriodKind>('annual');
  const [selectedCurrency, setSelectedCurrency] = useState<string>();
  const view = useMemo(() => {
    if (!facts.result?.ok) return null;
    const table = facts.result.data.facts;
    const currencies = reportingCurrencies(table);
    const latestCurrency = reportingCurrency(table);
    const ccy = currencies.some((c) => c.currency === selectedCurrency) ? selectedCurrency! : latestCurrency;
    const cols = periodColumns(facts.result.data, ccy, kind, kind === 'annual' ? 6 : 8, true);
    const rows = FACT_LINES.map((line) => ({ line, values: kind === 'quarter' ? standaloneQuarterValues(table, line, ccy) : lineValues(table, line, ccy, kind) })).filter((r) => cols.some((c) => r.values.has(c.end)));
    const biggest = Math.max(0, ...rows.filter((r) => r.line.measure === 'money').flatMap((r) => cols.map((c) => Math.abs(r.values.get(c.end)?.val ?? 0))));
    const latestAnnual = periodColumns(facts.result.data, ccy, 'annual', 1).at(-1)?.end;
    const latestQuarter = periodColumns(facts.result.data, ccy, 'quarter', 20, true).filter((c) => c.kind === 'quarter').at(-1)?.end;
    return { ccy, currencies, latestCurrency, latestAnnual, latestQuarter, cols, rows, moneyDec: biggest >= 1e10 ? 0 : 1, shares: coverShares(table) };
  }, [facts.result, kind, selectedCurrency]);

  if (!facts.result) return <div className="empty">Loading reported figures from SEC EDGAR…</div>;
  if (!facts.result.ok) {
    return facts.result.reason === 'not-found' ? (
      <>
        <div className="pad muted">The SEC has no XBRL financial data for this filer. Companies that file financial statements tag them in XBRL; funds, trusts and some foreign filers do not.</div>
        {security && <ProviderQuarters security={security} />}
      </>
    ) : (
      <Problem result={facts.result} />
    );
  }
  const v = view!;
  const latestShown = kind === 'annual' ? v.latestAnnual : v.latestQuarter;
  const olderCoverage = !!latestShown && Date.now() - isoMs(latestShown) > (kind === 'annual' ? 550 : 200) * 86_400_000;
  const latestCurrent = filings.filter((f) => formGroup(f.form) === 'current').sort((a, b) => b.filed.localeCompare(a.filed))[0];
  const fmt = (line: FactLine, r: Reported) => (line.measure === 'perShare' ? fmtNum(r.val, 2) : fmtNum(r.val / 1e6, line.measure === 'money' ? v.moneyDec : 1));
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <div className="chart-tools">
        <button type="button" className={`chip${kind === 'annual' ? ' on' : ''}`} onClick={() => setKind('annual')}>
          Annual
        </button>
        <button type="button" className={`chip${kind === 'quarter' ? ' on' : ''}`} onClick={() => setKind('quarter')}>
          Quarterly
        </button>
        <span className="muted">
          {v.ccy} millions, per-share figures in {v.ccy} · <Fetched at={facts.result.at} stale={facts.result.stale} what="Company facts" />
        </span>
        {v.currencies.length > 1 && <label className="muted">Reporting currency{' '}
          <select className="inp" aria-label="SEC reporting currency" value={v.ccy} onChange={(e) => setSelectedCurrency(e.target.value)}>
            {v.currencies.map((c) => <option key={c.currency} value={c.currency}>{c.currency} · through {c.latestPeriod}{c.currency === v.latestCurrency ? ' · latest' : ''}</option>)}
          </select>
        </label>}
      </div>
      <div className="note" role="status" data-testid="sec-coverage">
        {olderCoverage && <span className="amber">OLDER COVERAGE · {kind === 'annual' ? 'Annual' : 'Standalone quarterly'} SEC figures shown here end at {longDay(latestShown)}. </span>}
        {v.ccy !== v.latestCurrency && <span className="amber">Historical currency selected. The latest monetary reporting is in {v.latestCurrency}. </span>}
        SEC statement coverage in {v.ccy}: latest annual period {v.latestAnnual ? longDay(v.latestAnnual) : 'not available'}; latest standalone or calculated quarter {v.latestQuarter ? longDay(v.latestQuarter) : 'not available'}.
        {!v.latestQuarter && <> Foreign filers can publish interim results in 6-K documents without standalone quarterly figures in this SEC dataset.</>}{' '}
        {latestCurrent && <><a className="amber" href={filingLinks(cik, latestCurrent).doc ?? filingLinks(cik, latestCurrent).index} target="_blank" rel="noreferrer">Latest current report: {latestCurrent.form} filed {longDay(latestCurrent.filed)}</a>. </>}
        <button type="button" className="btn" onClick={onCurrentReports}>View current reports</button>
        {security && <> <button type="button" className="btn" title="Open financial analysis from company-data providers; its coverage and source can differ from SEC company facts" onClick={() => execute(panel, `${security} FINANCIALS`)}>Other source: financial analysis</button></>}
      </div>
      {v.shares && (
        <div className="note">
          Shares outstanding on the latest cover page: {fmtNum(v.shares.val / 1e6, 1)} million as of {day(v.shares.end)} ({v.shares.form} filed {day(v.shares.filed)})
        </div>
      )}
      {v.cols.length === 0 ? (
        <div className="empty">No {kind === 'annual' ? 'annual' : 'quarterly'} statement figures in this filer&apos;s XBRL data.</div>
      ) : (
        <table className="tbl zebra sec-figures" aria-label="SEC reported figures">
          <colgroup><col style={{ width: '32%' }} />{v.cols.map((c) => <col key={c.end} />)}</colgroup>
          <thead>
            <tr>
              <th scope="col">Reported item</th>
              {v.cols.map((c) => (
                <th key={c.end} className="num" title={c.start ? `${longDay(c.start)} to ${longDay(c.end)} (${periodDays(c.start, c.end)} days)` : `At ${longDay(c.end)}`}>
                  {c.label ?? (c.kind === 'annual' ? 'Year' : 'Quarter')}
                  <br />
                  <span className="muted">{day(c.end)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map((s) => {
              const rows = v.rows.filter((r) => r.line.section === s.key);
              if (!rows.length) return null;
              return [
                <tr key={s.key} className="group">
                  <td colSpan={v.cols.length + 1}>
                    {s.label}
                    {s.key === 'balance' ? ' (at period end)' : ''}
                  </td>
                </tr>,
                ...rows.map(({ line, values }) => (
                  <tr key={line.key}>
                    <td>{line.label}</td>
                    {v.cols.map((c) => {
                      const r = values.get(c.end);
                      if (!r) {
                        const why = line.kind === 'flow' && c.kind !== kind ? 'No separate figure for this period: the annual report gives the full year' : 'Not in the filer\'s XBRL data for this period';
                        return (
                          <td key={c.end} className="num muted" title={why}>
                            --
                          </td>
                        );
                      }
                      const title = [
                        `${r.concept} (${r.unit})`,
                        r.start ? `${longDay(r.start)} to ${longDay(r.end)}` : `At ${longDay(r.end)}`,
                        `${r.form} filed ${longDay(r.filed)}, accession ${r.accn}`,
                        r.derived ? `Calculated quarter: cumulative ${longDay(r.derived.current.start)} to ${longDay(r.derived.current.end)} (${fmtNum(r.derived.current.val, 2)} ${r.unit}, filed ${longDay(r.derived.current.filed)}, accession ${r.derived.current.accn}) minus cumulative ${longDay(r.derived.previous.start)} to ${longDay(r.derived.previous.end)} (${fmtNum(r.derived.previous.val, 2)} ${r.unit}, filed ${longDay(r.derived.previous.filed)}, accession ${r.derived.previous.accn}).` : '',
                        r.derived && r.derived.current.accn !== r.derived.previous.accn ? 'Inputs are from different filings; a restatement or reclassification can affect comparability.' : '',
                        r.restated ? `First reported as ${fmt(line, { ...r, val: r.orig.val })} in the ${r.orig.form} filed ${longDay(r.orig.filed)} (accession ${r.orig.accn})` : '',
                      ]
                        .filter(Boolean)
                        .join('\n');
                      return (
                        <td key={c.end} className="num white" title={title}>
                          <a href={`https://www.sec.gov/Archives/edgar/data/${cik}/${r.accn}-index.html`} target="_blank" rel="noreferrer noopener" className="fact-link">
                            {fmt(line, r)}
                          </a>
                          {r.derived ? <sup className="sec-fact-mark amber" aria-label="Calculated from cumulative disclosures"> c</sup> : r.restated ? <sup className="sec-fact-mark amber" aria-label="Restated"> r</sup> : null}
                        </td>
                      );
                    })}
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
      )}
      {kind === 'quarter' && !v.latestQuarter && security && <ProviderQuarters security={security} />}
      <div className="note">
        Figures as the company tagged them in its XBRL filings: audited in annual reports, unaudited in quarterly ones. Each period shows the figure from the most recent filing that reports it; r marks a period a later filing
        changed (restated or reclassified), with the first figure in its tooltip. c marks an additive quarter calculated as one cumulative monetary flow minus the earlier cumulative flow with the same fiscal start, concept and currency; both inputs and filings are in its tooltip. Inputs from different filings can be affected by restatements or reclassifications. Directly reported quarters take precedence. EPS and weighted shares are never subtracted. Payments are positive numbers and net cash flows carry their sign, as filed. Source: SEC EDGAR company facts.
      </div>
    </div>
  );
}


/** Keep provider coverage distinct from SEC facts, especially for 6-K foreign issuers. */
function ProviderQuarters({ security }: { security: string }) {
  const existing = resolveSecurity(security);
  const [lookup, setLookup] = useState<{ security: string; result: LookupResult }>();
  useEffect(() => {
    if (existing) return;
    let active = true;
    // SEC search accepts raw tickers and CIKs without registering a market
    // security. Resolve the filer's ticker for this session only; do not change
    // the route or add it to the user's saved lists.
    void lookupSecurity(security, false).then((result) => {
      if (active) setLookup({ security, result });
    });
    return () => { active = false; };
  }, [security, existing]);
  const lookedUp = lookup?.security === security ? lookup.result : undefined;
  const def = existing ?? (lookedUp?.ok ? lookedUp.def : undefined);
  const { real, status } = useFundamentals(def);
  if (!def) return <Section title="Other source: quarterly statements" right="Yahoo Finance / financial analysis">
    <div className="note muted">{lookedUp && !lookedUp.ok ? `Provider lookup unavailable: ${lookedUp.reason}. Open the current reports above for original interim statements.` : `Looking up ${security} for provider quarterly coverage…`}</div>
  </Section>;
  const periods = (real?.quarterly ?? []).slice(-8);
  const fields: { label: string; key: keyof FinPeriod; dec?: number }[] = [
    { label: 'Revenue', key: 'rev' }, { label: 'Gross profit', key: 'gp' },
    { label: 'Operating income', key: 'opInc' }, { label: 'Net income available to common shareholders', key: 'ni' },
    { label: 'Diluted EPS', key: 'eps', dec: 2 }, { label: 'Cash from operating activities', key: 'cfo' },
    { label: 'Capital expenditures (outflow)', key: 'capex' }, { label: 'Free cash flow', key: 'fcf' },
    { label: 'Total assets', key: 'totAssets' }, { label: 'Total debt', key: 'debt' }, { label: 'Shareholders’ equity', key: 'equity' },
  ];
  return <Section title="Other source: quarterly statements" right="Yahoo Finance / financial analysis">
    <div className="note">SEC company facts has no standalone quarters for this filer. The separate provider figures below are in {reportCcy(def)} millions except EPS; they are not SEC reported facts. Check the period dates and the company’s current reports for original statements.</div>
    {periods.length ? <table className="tbl zebra sec-figures" aria-label="Provider quarterly statements">
      <colgroup><col style={{ width: '32%' }} />{periods.map((p) => <col key={p.end} />)}</colgroup>
      <thead><tr><th scope="col">Provider item</th>{periods.map((p) => <th key={p.end} className="num">{p.label}<br /><span className="muted">{fmtDay(p.end)}</span></th>)}</tr></thead>
      <tbody>{fields.filter((f) => periods.some((p) => Number.isFinite(p[f.key]))).map((f) => <tr key={f.key}><td>{f.label}</td>{periods.map((p) => <td key={p.end} className="num white">{fmtNum(p[f.key] as number, f.dec ?? 1)}</td>)}</tr>)}</tbody>
    </table> : <div className="note muted">{status === 'loading' ? 'Loading provider quarterly coverage…' : 'The financial-analysis providers have not supplied quarterly figures. Open the current 6-K reports above to read the original interim statements.'}</div>}
  </Section>;
}
