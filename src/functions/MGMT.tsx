import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { Section } from '../components/cells';
import { DataTable } from '../components/DataTable';
import { exportActions } from '../components/ExportActions';
import { sourceLabel } from '../components/Source';
import { fmtBig, fmtDay, fmtInt } from '../core/format';
import { useFundamentals } from '../data/live/yfund';
import { yahooSymbolFor } from '../data/live/yahoo';
import { secAvailable, secTicker, useSecLoad } from '../data/live/sec';
import { loadProxyPay, type PayYear, type ProxyPay } from '../data/live/proxypay';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

const money = (v: number) => (Number.isFinite(v) ? fmtBig(v) : '--');

/** The pay-versus-performance table of the latest proxy statement: the chief executive's and the others' pay by year. */
function ProxyPayTable({ pay }: { pay: ProxyPay }) {
  const rows: { y: PayYear; name: string; total: number; paid: number; first: boolean }[] = [];
  for (const y of pay.years) {
    if (y.peos.length > 1) y.peos.forEach((p, i) => rows.push({ y, name: p.name, total: p.total, paid: p.paid, first: i === 0 }));
    else rows.push({ y, name: y.peos[0]?.name ?? '', total: y.peoTotal, paid: y.peoPaid, first: true });
  }
  return (
    <table className="tbl zebra">
      <thead>
        <tr>
          <th>Fiscal year to</th>
          <th>Chief executive</th>
          <th className="num" title="Summary Compensation Table total: salary, bonus, stock and option awards at grant-date value, incentive pay, pension changes and other compensation">Total compensation</th>
          <th className="num" title="Compensation actually paid (SEC definition): the total with equity awards valued at year end instead of at grant">Actually paid</th>
          <th className="num hide-m" title="The other named executive officers, on average">Other executives, avg total</th>
          <th className="num hide-m">Other executives, avg paid</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.y.end}:${i}`}>
            <td className="amber">{r.first ? r.y.end : ''}</td>
            <td>{r.name || '--'}</td>
            <td className="num white">{money(r.total)}</td>
            <td className="num">{money(r.paid)}</td>
            <td className="num hide-m">{r.first ? money(r.y.neoAvgTotal) : ''}</td>
            <td className="num hide-m">{r.first ? money(r.y.neoAvgPaid) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Management: the company's officers as Yahoo Finance's company profile lists them (desktop app), with title, age,
 * year of birth and Yahoo's "Pay", and, for a US-listed company, the executives'
 * total compensation from its latest proxy statement. Nothing is generated in the browser.
 */
export function MGMT({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const { real, status } = useFundamentals(s);
  const officers = real?.officers ?? [];
  const symbol = yahooSymbolFor(s);
  const proxy = useSecLoad(secAvailable() && secTicker(s) ? `proxypay:${s.id}` : null, () => loadProxyPay(s));
  const csv = () => [['Name', 'Source-reported title', 'Source-reported age', 'Year born', 'Yahoo reported Pay (not SEC total compensation)', 'Options exercised', 'Pay currency', 'Pay fiscal year', 'Profile received UTC'], ...officers.map((o) => [o.name, o.title, num(o.age), num(o.yearBorn), num(o.totalPay), num(o.exercised), 'not stated by Yahoo', num(o.fiscalYear), real ? new Date(real.fetched).toISOString() : ''])];
  let body;
  if (status === 'sim') {
    body = (
      <div className="empty">
        Company officers are not part of the demo data: the desktop app lists them from Yahoo Finance&apos;s company profile.{s.eq?.ceo ? ` Chief executive in the built-in profile: ${s.eq.ceo}.` : ''}
      </div>
    );
  } else if (!real) {
    body = <div className="empty">{status === 'error' ? 'No company profile from Yahoo Finance for this company.' : 'Loading the company profile from Yahoo Finance…'}</div>;
  } else if (!officers.length) {
    body = <div className="empty">{real.statsFrom === 'Finnhub' ? "Yahoo refused its company summary this time, and Finnhub's profile lists no officers." : `Yahoo Finance lists no officers for ${s.name}.`}</div>;
  } else {
    body = (
      <>
        <Section title="Company officers, as reported by Yahoo" right={`${officers.length} listed · profile received ${fmtDay(real.fetched)}`}>
          <DataTable
            rows={officers}
            rowKey={(o, i) => `${o.name}:${i}`}
            numbered
            columns={[
              { key: 'n', label: 'Name', render: (o) => <span className="white">{o.name}</span>, sort: (o) => o.name },
              { key: 't', label: 'Reported title', render: (o) => o.title || '--', sort: (o) => o.title },
              { key: 'a', label: 'Reported age', num: true, render: (o) => fmtInt(o.age), sort: (o) => o.age },
              { key: 'b', label: 'Born', num: true, render: (o) => (Number.isFinite(o.yearBorn) ? String(o.yearBorn) : '--'), sort: (o) => o.yearBorn, hideM: true },
              { key: 'p', label: 'Yahoo Pay', title: 'Yahoo reported Pay; currency is not supplied. This is not the SEC total compensation figure below.', num: true, render: (o) => fmtInt(o.totalPay), sort: (o) => o.totalPay },
              { key: 'x', label: 'Options exercised', num: true, render: (o) => fmtInt(o.exercised), sort: (o) => o.exercised, hideM: true },
              { key: 'y', label: 'Pay fiscal year', num: true, render: (o) => (Number.isFinite(o.fiscalYear) ? String(o.fiscalYear) : '--'), sort: (o) => o.fiscalYear },
            ]}
          />
        </Section>
        <div className="note">
          Yahoo&apos;s company profile can lag appointments and departures. Titles and ages are source-reported; the received date is when the app fetched the profile, not when those facts became effective. The fiscal year applies to pay, not to the title or age.
          Yahoo calls Pay &quot;salary, bonuses, etc.&quot; and does not supply its currency. It must not be read as the SEC total compensation figure, which includes equity awards and appears below when available. Options exercised is the value exercised in the pay fiscal year. A reported zero remains zero; -- means absent.
          {symbol ? <> <a className="blue" href={`https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/profile/`} target="_blank" rel="noreferrer noopener">View the source profile ›</a></> : null}
        </div>
      </>
    );
  }
  return (
    <div>
      <FnHeader
        code="MANAGEMENT"
        title="Management"
        sec={s}
        sub={<>Company officers · {sourceLabel(status, 'officers come from Yahoo Finance in the desktop app; none are generated')}</>}
        actions={officers.length ? exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_MGMT.csv`, csv) : undefined}
      />
      <QuoteStrip sec={s} />
      {body}
      {secAvailable() && secTicker(s) ? (
        <Section
          title="Total compensation, from the proxy statement"
          right={proxy.result?.ok && proxy.result.data ? <a href={proxy.result.data.link} target="_blank" rel="noreferrer noopener" className="blue">{proxy.result.data.filing.form} filed {proxy.result.data.filing.filed} ›</a> : 'SEC EDGAR'}
        >
          {proxy.loading || !proxy.result ? (
            <div className="empty">Loading the latest proxy statement from SEC EDGAR…</div>
          ) : !proxy.result.ok ? (
            <div className="empty">{proxy.result.message}</div>
          ) : !proxy.result.data ? (
            <div className="empty">
              No pay-versus-performance table in {s.name}&apos;s latest proxy statements on EDGAR. A company files one (DEF 14A) before its annual meeting; a newly listed company may not have filed one yet.
            </div>
          ) : (
            <>
              <ProxyPayTable pay={proxy.result.data} />
              <div className="note">
                As the company tagged its pay-versus-performance table, in US dollars. Total compensation is the Summary Compensation Table&apos;s total: salary, bonus, stock and option awards at their
                grant-date value, incentive pay, pension changes and other compensation. Actually paid is the SEC&apos;s measure that values equity awards at year end, so it moves with the share price.
              </div>
            </>
          )}
        </Section>
      ) : null}
    </div>
  );
}

const num = (v: number) => (Number.isFinite(v) ? v : '');
