// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { FnHeader } from '../components/FnHeader';
import { DataTable } from '../components/DataTable';
import { KV, LivePx, SecLink, Section } from '../components/cells';
import { fmtInt, fmtNum } from '../core/format';
import { engine, useTick } from '../data/market';
import { resolveSecurity } from '../data/registry';
import type { SecurityDef } from '../data/types';
import { analytics, settlementDate } from '../finance/bonds';
import { usePanelId } from '../terminal/panel';
import { openSecurity } from '../components/cells';
import { NoBondData } from '../components/Source';
import { TreasuryDebt } from './TreasuryDebt';
import type { FnProps } from '../terminal/types';

function bonds(): SecurityDef[] {
  return engine.securities.filter((d) => d.cls === 'bond');
}

const years = (d: SecurityDef) => (Date.parse(`${d.bond!.maturity}T00:00:00Z`) - engine.now()) / (365.25 * 86_400_000);

function issuerOf(d: SecurityDef): string {
  return d.bond!.issuer ? engine.get(d.bond!.issuer)!.name : 'United States Treasury';
}

function issuerRoot(d: SecurityDef): string {
  return d.yk === 'Govt' ? 'T' : d.ticker.split(' ')[0];
}

/** Parses "AAPL CORP", "T GOVT" or "IBM" into an issuer root and sector. */
function parseIssuer(args: string | undefined, sec?: SecurityDef): { root: string; yk: 'Corp' | 'Govt' | 'All' } {
  if (sec?.cls === 'bond') return { root: issuerRoot(sec), yk: sec.yk === 'Govt' ? 'Govt' : 'Corp' };
  if (sec?.cls === 'equity') return { root: sec.ticker.split(' ')[0], yk: 'Corp' };
  const t = (args ?? '').trim().toUpperCase().split(/\s+/).filter(Boolean);
  let yk: 'Corp' | 'Govt' | 'All' = 'All';
  if (t.length && (t[t.length - 1] === 'CORP' || t[t.length - 1] === 'GOVT')) yk = t.pop() === 'CORP' ? 'Corp' : 'Govt';
  let root = t.join(' ');
  if (yk === 'Govt' && ['T', 'US', 'UST', 'TSY'].includes(root)) root = 'T';
  return { root, yk };
}

function matchesIssuer(d: SecurityDef, root: string): boolean {
  if (!root) return true;
  if (d.yk === 'Govt') return ['T', 'US', 'UST', 'TREASURY'].includes(root) || 'UNITED STATES TREASURY'.includes(root);
  const r = issuerRoot(d);
  return r === root || issuerOf(d).toUpperCase().includes(root);
}

interface Row {
  d: SecurityDef;
  y: number;
  spread: number;
  dur: number;
  yrs: number;
}

function rowsFor(list: SecurityDef[]): Row[] {
  const settle = settlementDate(new Date(engine.now()));
  return list.map((d) => {
    const by = engine.bondYields(d.id)!;
    const b = d.bond!;
    const a = analytics({ coupon: b.coupon, maturity: new Date(`${b.maturity}T00:00:00Z`), freq: 2 }, settle, by.last);
    return { d, y: by.last, spread: by.spread, dur: a.modified, yrs: years(d) };
  });
}

/** The U.S. Treasury named in the arguments: "T GOVT", "UST", "TREASURY" (a bare "T" is AT&T's stock). */
export function namesTreasury(args: string | undefined): boolean {
  const t = (args ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  return /^(?:T|US|UST|TSY|US TREASURY|TREASURY|UNITED STATES TREASURY) GOVT$/.test(t) || /^(?:UST|TSY|TREASURY|US TREASURY|UNITED STATES TREASURY)$/.test(t);
}

/** DDIS: an issuer's debt distribution by maturity. */
export function DDIS(props: FnProps) {
  if (engine.realOnly) {
    // The Treasury's own statement lists every marketable security it has outstanding; no free source does that for
    // other issuers.
    if (namesTreasury(props.route.args)) return <TreasuryDebt />;
    return (
      <div>
        <NoBondData code="DEBTPROFILE" title="Debt Distribution" />
        <div className="note">For the U.S. Treasury&apos;s marketable debt by maturity, from its monthly statement of the public debt, type DEBTPROFILE T GOVT.</div>
      </div>
    );
  }
  return <DDISSim {...props} />;
}

function DDISSim({ route, sec }: FnProps) {
  useTick(5);
  const panel = usePanelId();
  const { root } = parseIssuer(route.args, sec);
  const target = root || 'AAPL';
  const list = bonds().filter((d) => matchesIssuer(d, target) && (target === 'T' ? d.yk === 'Govt' : d.yk === 'Corp'));
  const rows = rowsFor(list).sort((a, b) => a.yrs - b.yrs);
  const eq = target !== 'T' ? resolveSecurity(target, 'Equity') : undefined;
  const total = rows.reduce((s, r) => s + (r.d.bond!.amount ?? 0), 0);
  const wCpn = rows.reduce((s, r) => s + r.d.bond!.coupon * (r.d.bond!.amount ?? 0), 0) / (total || 1);
  const wYrs = rows.reduce((s, r) => s + r.yrs * (r.d.bond!.amount ?? 0), 0) / (total || 1);
  const wSprd = rows.reduce((s, r) => s + r.spread * (r.d.bond!.amount ?? 0), 0) / (total || 1);
  // Bucket amounts by maturity year.
  const byYear = new Map<number, number>();
  for (const r of rows) {
    const y = Number(r.d.bond!.maturity.slice(0, 4));
    byYear.set(y, (byYear.get(y) ?? 0) + (r.d.bond!.amount ?? 0));
  }
  const yearsList = [...byYear.keys()].sort((a, b) => a - b);
  const maxAmt = Math.max(1, ...byYear.values());
  if (rows.length === 0) {
    return (
      <div>
        <FnHeader code="DEBTPROFILE" title="Debt Distribution" />
        <p className="pad">
          No bonds for <span className="yellow">{target}</span> in the Armin universe. Issuers covered: {[...new Set(bonds().filter((d) => d.yk === 'Corp').map(issuerRoot))].join(', ')} and US Treasuries (T).
        </p>
      </div>
    );
  }
  return (
    <div>
      <FnHeader code="DEBTPROFILE" title="Debt Distribution" sec={eq} sub={`${rows[0] ? issuerOf(rows[0].d) : target} · bonds in the Armin universe`} />
      <div className="cols">
        <Section title="Summary">
          <KV
            items={[
              ['Issuer', rows[0] ? issuerOf(rows[0].d) : target],
              ['Bonds', String(rows.length)],
              ['Amount outstanding', `USD ${fmtInt(total)}MM`],
              ['Weighted avg coupon', `${fmtNum(wCpn, 3)}%`],
              ['Weighted avg life', `${fmtNum(wYrs, 1)} years`],
              ['Weighted avg spread', `${fmtNum(wSprd, 0)} bp`],
              ['Composite rating', rows[0].d.bond!.rating ?? 'AA+'],
            ]}
          />
          {eq && (
            <div className="pad row">
              <button type="button" className="btn" onClick={() => openSecurity(panel, eq.id, undefined, 'PROFILE')}>
                Equity profile
              </button>
              <button type="button" className="btn" onClick={() => openSecurity(panel, eq.id, undefined, 'MENU')}>
                Equity menu
              </button>
            </div>
          )}
        </Section>
        <Section title="Maturity profile (USD MM)">
          <div className="ddis-bars" role="img" aria-label="Amount outstanding by maturity year">
            {yearsList.map((y) => (
              <div key={y} className="ddis-col" title={`${y}: ${fmtInt(byYear.get(y)!)}MM`}>
                <span className="ddis-amt">{fmtInt(byYear.get(y)!)}</span>
                <span className="ddis-bar" style={{ height: `${(byYear.get(y)! / maxAmt) * 100}%` }} />
                <span className="ddis-yr">{String(y).slice(2)}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
      <DataTable
        rows={rows}
        rowKey={(r) => r.d.id}
        columns={[
          { key: 't', label: 'Security', render: (r) => <SecLink id={r.d.id}>{r.d.ticker}</SecLink> },
          { key: 'sn', label: 'Seniority', hideM: true, render: (r) => r.d.bond!.seniority ?? '' },
          { key: 'a', label: 'Amt $MM', num: true, render: (r) => fmtInt(r.d.bond!.amount ?? 0), sort: (r) => r.d.bond!.amount ?? 0 },
          { key: 'pct', label: '% of total', num: true, hideM: true, render: (r) => fmtNum(((r.d.bond!.amount ?? 0) / total) * 100, 1), sort: (r) => r.d.bond!.amount ?? 0 },
          { key: 'p', label: 'Price', num: true, render: (r) => <LivePx id={r.d.id} /> },
          { key: 'y', label: 'Yield', num: true, render: (r) => fmtNum(r.y, 3), sort: (r) => r.y },
          { key: 's', label: 'Sprd bp', num: true, render: (r) => fmtNum(r.spread, 0), sort: (r) => r.spread },
        ]}
      />
    </div>
  );
}

