// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect, useMemo, useRef, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { DataTable } from '../components/DataTable';
import { LivePx, SecLink, openSecurity } from '../components/cells';
import { SimBadge } from '../components/Source';
import { exportActions } from '../components/ExportActions';
import { fmtDay, fmtInt, fmtNum } from '../core/format';
import { engine, useTick } from '../data/market';
import type { SecurityDef } from '../data/types';
import { BOND_FIELDS, BOUNDARY_LABEL, boundariesFor, describeSearch, matchesAfterEach, RATINGS, issuedSinceStatement, runSearch, treasuryInstruments, type BondCrit, type BondField, type Instrument } from '../data/bond-search';
import { fiscalAvailable, parseMspd, useFiscal } from '../data/live/fiscal';
import { fedinvest, fedInvestAvailable, loadFedInvest, treasuryIdByCusip } from '../data/live/fedinvest';
import { execute } from '../terminal/exec';
import { useMenu, usePanelId } from '../terminal/panel';
import { currentRoute, terminal } from '../terminal/state';
import { leaveTabs, noteTab } from '../terminal/tab-history';
import { setSubpageBack } from '../terminal/subpage';
import type { FnProps, MenuItem } from '../terminal/types';

/** The demo's bonds as SRCH instruments: simulated, said so on the screen. */
function demoInstruments(): Instrument[] {
  return engine.securities
    .filter((d) => d.cls === 'bond' && d.bond)
    .map((d) => ({
      id: d.id,
      name: d.ticker,
      type: d.yk === 'Govt' ? 'Govt' : 'Corp',
      issuer: d.bond!.issuer ? engine.get(d.bond!.issuer)?.name ?? d.bond!.issuer : 'United States Treasury',
      rating: d.bond!.rating,
      coupon: d.bond!.coupon,
      maturity: d.bond!.maturity,
      amountMM: d.bond!.amount ?? NaN,
      secId: d.id,
    }));
}

/** The criteria "AAPL CORP", "T GOVT" or a loaded bond or stock start the search with. */
export function initialCrits(args: string | undefined, sec: SecurityDef | undefined, real: boolean): BondCrit[] {
  const out: BondCrit[] = [];
  const words = (args ?? '').trim().toUpperCase().split(/\s+/).filter(Boolean);
  const key = words[words.length - 1];
  if (key === 'CORP' || key === 'GOVT') words.pop();
  if (!real && (key === 'CORP' || key === 'GOVT')) out.push({ field: 'type', boundary: 'include', value: key === 'CORP' ? 'Corp' : 'Govt' });
  const root = sec?.cls === 'equity' ? sec.ticker.split(' ')[0] : words.join(' ');
  if (root && !['T', 'US', 'UST', 'TSY', 'TREASURY'].includes(root) && !real) out.push({ field: 'issuer', boundary: 'include', value: root });
  return out;
}

/** Example searches, in the app's own words, for each universe. */
const EXAMPLES: Record<'real' | 'demo', { name: string; crits: BondCrit[] }[]> = {
  real: [
    { name: 'Treasuries maturing in 20 years or more', crits: [{ field: 'maturity', boundary: 'gt', value: '20' }] },
    { name: 'Notes and bonds paying 4% or more', crits: [{ field: 'type', boundary: 'include', value: 'Notes, Bonds' }, { field: 'coupon', boundary: 'gt', value: '3.999' }] },
    { name: 'Bills maturing within three months', crits: [{ field: 'type', boundary: 'include', value: 'Bills' }, { field: 'maturity', boundary: 'lt', value: '0.25' }] },
    { name: 'The largest issues: over $100bn outstanding', crits: [{ field: 'amount', boundary: 'gt', value: '100000' }] },
    { name: 'Inflation-protected securities (TIPS)', crits: [{ field: 'type', boundary: 'include', value: 'TIPS' }] },
  ],
  demo: [
    { name: 'Investment-grade corporates', crits: [{ field: 'type', boundary: 'include', value: 'Corp' }, { field: 'rating', boundary: 'gt', value: 'BBB-' }] },
    { name: 'Coupons of 5% or more', crits: [{ field: 'coupon', boundary: 'gt', value: '4.999' }] },
    { name: 'Maturing within five years', crits: [{ field: 'maturity', boundary: 'lt', value: '5' }] },
  ],
};

/**
 * SRCH, Fixed Income Search, as TE07 02:23 lays it out: the instruments and sources, a table of criteria joined by
 * And with the matches after each, an amber row to add one, the count and "1) Results", which opens the results on a
 * page of their own (Back returns). The desktop app searches every marketable US Treasury on the Treasury's monthly
 * statement; the browser demo searches its simulated bonds.
 */
export function SRCH({ route, sec }: FnProps) {
  useTick(5);
  const panel = usePanelId();
  const real = engine.realOnly;
  const { mspd } = useFiscal();
  const debt = useMemo(() => (real && mspd?.state === 'ok' && mspd.text ? parseMspd(mspd.text) : null), [real, mspd]);
  // The results' prices and links, and the notes and bonds issued since the statement: FedInvest's Treasuries.
  const fed = fedinvest.use((x) => x);
  useEffect(() => {
    if (real && fedInvestAvailable() && fed.state === 'off') void loadFedInvest();
  }, [real, fed.state]);
  const listed = useMemo<Instrument[]>(() => (real ? (debt && !('error' in debt) ? treasuryInstruments(debt) : []) : demoInstruments()), [real, debt]);
  const since = useMemo(() => (real && listed.length && fed.latest ? issuedSinceStatement(listed, fed.latest.rows.values()) : []), [real, listed, fed.latest]);
  const universe = useMemo(() => (since.length ? [...listed, ...since] : listed), [listed, since]);
  const [crits, setCrits] = useState<BondCrit[]>(() => initialCrits(route.args, sec, real));
  const [tab, setTab] = useState(41);
  const [page, setPage] = useState<'criteria' | 'results'>('criteria');
  const secOf = (i: Instrument) => i.secId ?? (i.cusip ? treasuryIdByCusip(i.cusip) : undefined);
  // Back steps from the results to the criteria, from the mouse's button and the keyboard's alike (as EQS).
  const shownRoute = terminal.use((st) => currentRoute(st, panel));
  const fresh = useRef(true);
  useEffect(() => {
    noteTab(panel, shownRoute, page === 'results' ? 2 : 1, (n) => setPage(n === 2 ? 'results' : 'criteria'), fresh.current);
    fresh.current = false;
  }, [panel, shownRoute, page]);
  useEffect(() => () => leaveTabs(panel, shownRoute), [panel, shownRoute]);
  useEffect(() => {
    if (page !== 'results') return;
    setSubpageBack(panel, () => setPage('criteria'));
    return () => setSubpageBack(panel, undefined);
  }, [panel, page]);
  const now = engine.now();
  const left = matchesAfterEach(universe, crits, now);
  const found = runSearch(universe, crits, now);
  const fields = BOND_FIELDS.filter((f) => !real || ['type', 'maturity', 'coupon', 'amount'].includes(f.id));
  const universeName = real ? 'US Treasuries' : 'Demo bonds';
  const asOf = real && debt && !('error' in debt) ? debt.recordDate : new Date(now).toISOString().slice(0, 10);
  const setCrit = (i: number, patch: Partial<BondCrit>) => setCrits(crits.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const addField = (field: BondField) => setCrits([...crits, { field, boundary: boundariesFor(field)[0], value: '' }]);
  const menu: MenuItem[] = page === 'criteria' ? [{ n: 1, label: 'Results', run: () => setPage('results') }] : [];
  useMenu('srch', menu);
  const csv = () => [
    ['Security', 'CUSIP', 'Type', 'Issuer', 'Rating', 'Coupon %', 'Maturity', 'Amount outstanding USD MM'],
    ...found.map((i) => [i.name, i.cusip ?? '', i.type, i.issuer ?? '', i.rating ?? '', Number.isFinite(i.coupon) ? i.coupon : '', i.maturity, Number.isFinite(i.amountMM) ? i.amountMM : '']),
  ];
  const status = !real
    ? null
    : !fiscalAvailable()
      ? "Treasury securities come from the Treasury's monthly statement of the public debt, read by the desktop app."
      : !mspd || mspd.state === 'loading'
        ? "Loading the Treasury's statement of the public debt…"
        : mspd.state !== 'ok'
          ? mspd.message ?? 'No statement from Fiscal Data.'
          : debt && 'error' in debt
            ? debt.error
            : null;

  return (
    <div className="fixed-page">
      <FnHeader
        code="BONDSEARCH"
        title="Fixed Income Search"
        tabs={[{ n: 41, label: 'Build/Edit Search' }, { n: 43, label: 'Example Searches' }]}
        tab={tab}
        onTab={(n) => { setTab(n); setPage('criteria'); }}
        plainTabs
        tabNumbers={false}
        subTabs={tab === 41 && page === 'criteria' ? [{ n: 11, label: 'Build with Criterion' }] : undefined}
        subTab={11}
        onSubTab={() => {}}
        sub={real ? 'US Treasuries: the Treasury’s Monthly Statement of the Public Debt' : <><SimBadge /> bonds; real Treasuries in the desktop app</>}
        actions={[
          {
            n: 9981,
            bare: true,
            label: 'Actions',
            onClick: () => {},
            menu: [
              { label: 'See Results', onClick: () => setPage('results') },
              { label: 'Clear the Criteria', onClick: () => setCrits([]) },
              ...exportActions(panel, 'fixed-income-search.csv', csv).map((a, i) => ({ label: a.label === 'Copy' ? 'Copy Results to Clipboard' : 'Download Results as CSV', title: a.title, sep: i === 0, onClick: a.onClick })),
            ],
          },
        ]}
      />
      {page === 'results' ? (
        <>
          <div className="eqs-res-h">
            <button type="button" className="link-btn" onClick={() => setPage('criteria')} title="<Back> or End">‹ Search Criteria</button>
            <span className="white">{fmtInt(found.length)} Instruments</span>
            <span className="muted">{describeSearch(universeName, crits)}</span>
          </div>
          <DataTable
            rows={found}
            rowKey={(i) => i.id}
            numbered
            onRowClick={(i, e) => { const id = secOf(i); if (id) openSecurity(panel, id, e); }}
            defaultSort={{ key: 'm', dir: 1 }}
            empty={status ?? 'No instrument matches. Loosen a criterion.'}
            columns={[
              { key: 'n', label: 'Security', render: (i) => { const id = secOf(i); return id ? <SecLink id={id}>{i.name}</SecLink> : <span className="amber">{i.name}</span>; }, sort: (i) => i.name },
              ...(real ? [{ key: 'c', label: 'CUSIP', render: (i: Instrument) => i.cusip ?? '', sort: (i: Instrument) => i.cusip ?? '' }] : [{ key: 'i', label: 'Issuer', hideM: true, render: (i: Instrument) => <span className="ellipsis" style={{ maxWidth: 200, display: 'inline-block' }}>{i.issuer}</span>, sort: (i: Instrument) => i.issuer ?? '' }]),
              { key: 't', label: 'Type', render: (i) => i.type, sort: (i) => i.type },
              { key: 'p', label: 'Cpn', num: true, render: (i) => (Number.isFinite(i.coupon) ? fmtNum(i.coupon, 3) : '--'), sort: (i) => (Number.isFinite(i.coupon) ? i.coupon : -1) },
              { key: 'm', label: 'Maturity', render: (i) => fmtDay(Date.parse(`${i.maturity}T00:00:00Z`)), sort: (i) => i.maturity },
              ...(real ? [] : [{ key: 'r', label: 'Rtg', render: (i: Instrument) => i.rating ?? '', sort: (i: Instrument) => RATINGS.indexOf(i.rating ?? 'CCC') }]),
              { key: 'a', label: 'Amt Out (USD MM)', num: true, render: (i) => (Number.isFinite(i.amountMM) ? fmtInt(i.amountMM) : '--'), sort: (i) => (Number.isFinite(i.amountMM) ? i.amountMM : -1) },
              { key: 'x', label: 'Price', num: true, render: (i: Instrument) => { const id = secOf(i); return id ? <LivePx id={id} /> : ''; }, sort: (i: Instrument) => { const id = secOf(i); return id ? engine.quote(id)?.last ?? 0 : 0; } },
            ]}
          />
          {real ? <p className="pad-s muted">Amounts are the statement&apos;s outstanding amounts at its date ({fmtDay(Date.parse(`${asOf}T00:00:00Z`))}), all issues of a CUSIP together.{since.length ? ` ${fmtInt(since.length)} notes and bonds issued since then come from FedInvest's list, with no amount until the next statement.` : ''} {fed.latest ? `Prices: TreasuryDirect FedInvest's Sell prices of ${fmtDay(Date.parse(`${fed.latest.date}T00:00:00Z`))} for notes and bonds (bills, TIPS and FRNs have none here); a row opens its Treasury.` : fed.state === 'loading' ? "Loading the Treasury's prices from FedInvest…" : fed.state === 'error' ? `FedInvest unavailable: ${fed.error}` : ''}</p> : null}
        </>
      ) : tab === 43 ? (
        <div className="srch-examples">
          {EXAMPLES[real ? 'real' : 'demo'].map((x) => (
            <button key={x.name} type="button" className="eqs-item amber" onClick={() => { setCrits(x.crits); setTab(41); }}>
              {x.name}
            </button>
          ))}
        </div>
      ) : (
        <div className="srch">
          <div className="srch-top">
            <span className="amber">As of</span>
            <span className="eqs-date" title={real ? "The statement's date" : 'Today'}>{fmtDay(Date.parse(`${asOf}T00:00:00Z`))}</span>
            <span className="srch-query" data-testid="srch-query">{describeSearch(universeName, crits)}</span>
          </div>
          <div className="srch-line">
            <span className="amber">Instruments</span>
            <span className="white">{real ? 'US Treasuries, marketable' : 'The demo’s bonds (simulated)'}</span>
            <span className="srch-total white" data-testid="srch-universe">{fmtInt(universe.length)} Instruments</span>
          </div>
          <div className="srch-line">
            <span className="amber">Sources</span>
            <span className="white">{real ? `Monthly Statement of the Public Debt (Treasury Fiscal Data)${since.length ? '; notes and bonds issued since: TreasuryDirect FedInvest' : ''}` : 'Simulated'}</span>
          </div>
          {status ? <p className="amber" role="status">{status}</p> : null}
          <table className="tbl srch-crit">
            <thead>
              <tr>
                <th />
                <th>Field</th>
                <th>Boundaries</th>
                <th>Selected Criteria</th>
                <th className="num">Matches</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {crits.map((c, i) => {
                const f = BOND_FIELDS.find((x) => x.id === c.field)!;
                return (
                  <tr key={i}>
                    <td className="muted">{i ? 'And' : ''}</td>
                    <td>
                      <select className="srch-sel amber" aria-label={`Field ${i + 1}`} value={c.field} onChange={(e) => { const field = e.target.value as BondField; setCrit(i, { field, boundary: boundariesFor(field)[0], value: '', to: undefined }); }}>
                        {fields.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="srch-sel amber" aria-label={`Boundary ${i + 1}`} value={c.boundary} onChange={(e) => setCrit(i, { boundary: e.target.value as BondCrit['boundary'] })}>
                        {boundariesFor(c.field).map((b) => <option key={b} value={b}>{c.field === 'rating' ? 'At least' : BOUNDARY_LABEL[b]}</option>)}
                      </select>
                    </td>
                    <td className="srch-val">
                      {f.kind === 'rating' ? (
                        <select className="srch-sel amber" aria-label={`Criterion ${i + 1}`} value={c.value} onChange={(e) => setCrit(i, { value: e.target.value })}>
                          <option value="">Choose…</option>
                          {RATINGS.map((r) => <option key={r}>{r}</option>)}
                        </select>
                      ) : (
                        <input className="inp" aria-label={`Criterion ${i + 1}`} placeholder={f.kind === 'list' ? (c.field === 'type' ? (real ? 'Bills, Notes, Bonds, TIPS, FRN' : 'Corp, Govt') : 'Name or ticker') : f.unit} value={c.value} onChange={(e) => setCrit(i, { value: e.target.value })} />
                      )}
                      {c.boundary === 'between' && (
                        <>
                          <span className="muted"> and </span>
                          <input className="inp" aria-label={`Upper criterion ${i + 1}`} value={c.to ?? ''} onChange={(e) => setCrit(i, { to: e.target.value })} />
                        </>
                      )}
                    </td>
                    <td className="num amber" data-testid={`srch-left-${i + 1}`}>{left[i] != null ? fmtInt(left[i]!) : ''}</td>
                    <td>
                      <button type="button" className="eqs-remove" aria-label={`Remove criterion ${i + 1}`} title="Remove" onClick={() => setCrits(crits.filter((_, j) => j !== i))}>⊗</button>
                    </td>
                  </tr>
                );
              })}
              <tr className="srch-add">
                <td className="muted">{crits.length ? 'And' : ''}</td>
                <td colSpan={4}>
                  <select className="srch-add-sel" aria-label="Add a criterion" value="" onChange={(e) => e.target.value && addField(e.target.value as BondField)}>
                    <option value="">Fields</option>
                    {fields.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                </td>
                <td />
              </tr>
            </tbody>
          </table>
          <div className="srch-foot">
            <span className="white" data-testid="srch-count">{fmtInt(found.length)} Instruments</span>
            <button type="button" className="gp-plain srch-results" onClick={() => setPage('results')}>1) Results</button>
          </div>
          <div className="eqs-strip">Additional Analysis Options</div>
          <div className="srch-more">
            <button type="button" className="link-btn amber" onClick={() => setPage('results')}>View Results</button>
            {real ? <button type="button" className="link-btn amber" onClick={() => execute(panel, 'DDIS T GOVT')}>Maturity Distribution <span className="white">| DDIS »</span></button> : null}
          </div>
        </div>
      )}
    </div>
  );
}
