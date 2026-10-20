import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { Section } from '../components/cells';
import { DataTable } from '../components/DataTable';
import { exportActions } from '../components/ExportActions';
import { sourceLabel } from '../components/Source';
import { fmtBig, fmtDay, fmtInt, fmtNum } from '../core/format';
import { useFundamentals, type Officer } from '../data/live/yfund';
import { yahooSymbolFor } from '../data/live/yahoo';
import { secAvailable, secTicker, useSecLoad } from '../data/live/sec';
import { loadProxyPay, type PayYear, type ProxyPay } from '../data/live/proxypay';
import { CODES, loadInsiders, summarize, type InsiderReport, type Person, type Trade } from '../data/live/insiders';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

const money = (v: number) => (Number.isFinite(v) ? fmtBig(v) : '--');
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
/** Shares as a count: whole up to ten million, then in M/B. */
const qty = (v: number) => (!Number.isFinite(v) ? '--' : Math.abs(v) >= 1e7 ? fmtBig(v) : fmtInt(v));
const signed = (v: number) => (Number.isFinite(v) && v !== 0 ? <span className={v > 0 ? 'up' : 'dn'}>{v > 0 ? '+' : '-'}{qty(Math.abs(v))}</span> : <span className="muted">{v === 0 ? '0' : '--'}</span>);
const nonzero = (v: number, fmt: (x: number) => string) => (v ? fmt(v) : <span className="muted">0</span>);

/** "Director", "10% owner" or the officer title the insider filed. */
const role = (p: Person['owner']) => [p.title, !p.title && p.officer ? 'Officer' : '', p.director ? 'Director' : '', p.tenPercent ? '10% owner' : ''].filter(Boolean).join(' · ') || '--';

/** Yahoo's officer and the Form 4 filer that are the same person: the same last name and one first name the start of the other. */
export function matchOfficer(o: Officer, people: Person[]): Person | undefined {
  const words = (s: string) => s.toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !/^(jr|sr|ii|iii|iv|phd|md|cpa|esq)$/.test(w));
  const mine = words(o.name);
  if (mine.length < 2) return undefined;
  const last = mine[mine.length - 1];
  const hits = people.filter((p) => {
    const theirs = words(p.owner.name);
    if (theirs.length < 2 || theirs[theirs.length - 1] !== last) return false;
    return theirs[0].startsWith(mine[0]) || mine[0].startsWith(theirs[0]);
  });
  return hits.length === 1 ? hits[0] : undefined;
}

function InsiderSection({ report }: { report: InsiderReport }) {
  const [all, setAll] = useState(false);
  const { people, all: total } = useMemo(() => summarize(report.trades), [report]);
  const trades = all ? report.trades : report.trades.slice(0, 40);
  const tally = (label: string, t: { shares: number; value: number; count: number }, withValue = true) =>
    t.count ? <span>{label} <span className="white">{qty(t.shares)}</span> shares{withValue && t.value ? <> (<span className="white">{money(t.value)}</span>)</> : null}</span> : null;
  return (
    <>
      <div className="pad-s insider-total">
        <span className="amber">Since {fmtDay(ms(report.since))}</span>
        <span>{report.read} of {report.filings} Form 4 filings read{report.unread ? ` (${report.unread} without readable XML)` : ''}</span>
        {total.bought.count ? <span><span className="up">{total.buyers} {total.buyers === 1 ? 'buyer' : 'buyers'}</span> bought <span className="white">{qty(total.bought.shares)}</span> shares ({money(total.bought.value)})</span> : <span className="muted">no purchases</span>}
        {total.sold.count ? <span><span className="dn">{total.sellers} {total.sellers === 1 ? 'seller' : 'sellers'}</span> sold <span className="white">{qty(total.sold.shares)}</span> shares ({money(total.sold.value)})</span> : <span className="muted">no sales</span>}
        {tally('awarded', total.awarded, false)}
        {tally('options exercised on', total.exercised, false)}
        {tally('withheld for tax', total.taxWithheld, false)}
        <span>net {signed(total.netShares)} shares</span>
      </div>
      <DataTable
        rows={people}
        rowKey={(p) => p.owner.cik || p.owner.secName}
        numbered
        columns={[
          { key: 'n', label: 'Insider', render: (p) => <span className="white" title={`As filed: ${p.owner.secName}`}>{p.owner.name}</span>, sort: (p) => p.owner.name },
          { key: 'r', label: 'Relationship', render: (p) => role(p.owner), sort: (p) => role(p.owner), hideW: true },
          { key: 'bs', label: 'Bought', title: 'Shares bought on the market (code P)', num: true, render: (p) => nonzero(p.bought.shares, qty), sort: (p) => p.bought.shares },
          { key: 'bv', label: 'Bought $', title: 'Value of the purchases at the prices filed', num: true, render: (p) => nonzero(p.bought.value, money), sort: (p) => p.bought.value, hideN: true },
          { key: 'ss', label: 'Sold', title: 'Shares sold on the market (code S)', num: true, render: (p) => nonzero(p.sold.shares, qty), sort: (p) => p.sold.shares },
          { key: 'sv', label: 'Sold $', title: 'Value of the sales at the prices filed', num: true, render: (p) => nonzero(p.sold.value, money), sort: (p) => p.sold.value, hideN: true },
          { key: 'a', label: 'Received', title: 'Shares and units granted or awarded by the company (code A)', num: true, render: (p) => nonzero(p.awarded.shares, qty), sort: (p) => p.awarded.shares, hideM: true },
          { key: 'og', label: 'Options granted', title: 'Options and other derivatives granted (code A), in underlying shares', num: true, render: (p) => nonzero(p.optionsGranted.shares, qty), sort: (p) => p.optionsGranted.shares, hideW: true },
          { key: 'x', label: 'Exercised', title: 'Options exercised or converted (codes M, X, C), in underlying shares', num: true, render: (p) => nonzero(p.exercised.shares, qty), sort: (p) => p.exercised.shares, hideM: true },
          { key: 't', label: 'Tax withheld', title: 'Shares withheld or delivered to pay tax or an exercise price (code F)', num: true, render: (p) => nonzero(p.taxWithheld.shares, qty), sort: (p) => p.taxWithheld.shares, hideW: true },
          { key: 'net', label: 'Net shares', title: 'Shares acquired less shares disposed, options excluded', num: true, render: (p) => signed(p.netShares), sort: (p) => p.netShares },
          { key: 'h', label: 'Held after', title: 'Shares held directly after the latest transaction filed', num: true, render: (p) => <span title={p.heldAsOf ? `as of ${fmtDay(ms(p.heldAsOf))}` : undefined}>{qty(p.heldAfter)}</span>, sort: (p) => p.heldAfter, hideN: true },
          { key: 'l', label: 'Last trade', num: true, render: (p) => fmtDay(ms(p.last)), sort: (p) => p.last, hideM: true },
        ]}
      />
      <div className="sect-h" style={{ marginTop: 6 }}>
        Transactions{' '}
        <span className="right">
          {report.trades.length > 40 ? <button type="button" className="act" onClick={() => setAll((v) => !v)}>{all ? 'Latest 40' : `All ${report.trades.length}`}</button> : `${report.trades.length} filed`}
        </span>
      </div>
      <DataTable
        rows={trades}
        rowKey={(t, i) => `${t.link}:${i}`}
        columns={[
          { key: 'd', label: 'Date', render: (t) => fmtDay(ms(t.date)), sort: (t) => t.date },
          { key: 'n', label: 'Insider', render: (t) => <span className="white">{t.owner.name}</span>, sort: (t) => t.owner.name },
          { key: 'r', label: 'Relationship', render: (t) => role(t.owner), hideW: true },
          { key: 'c', label: 'Transaction', render: (t: Trade) => <span className={t.kind === 'buy' ? 'up' : t.kind === 'sell' ? 'dn' : ''} title={`Form 4 code ${t.code}${t.security ? ` · ${t.security}` : ''}${Number.isFinite(t.exercisePrice) ? ` · exercise price ${fmtNum(t.exercisePrice, 2)}` : ''}`}>{CODES[t.code] ?? `Code ${t.code}`}{t.derivative && t.kind !== 'exercise' ? ' (derivative)' : ''}{t.plan && (t.kind === 'sell' || t.kind === 'buy') ? ' · 10b5-1' : ''}</span>, sort: (t) => t.code },
          { key: 's', label: 'Shares', num: true, render: (t) => signed(t.acquired ? t.shares : -t.shares), sort: (t) => (t.acquired ? t.shares : -t.shares) },
          { key: 'p', label: 'Price', num: true, render: (t) => (Number.isFinite(t.price) && t.price > 0 ? fmtNum(t.price, 2) : <span className="muted">{t.price === 0 ? '0.00' : '--'}</span>), sort: (t) => t.price },
          { key: 'v', label: 'Value', num: true, render: (t) => (Number.isFinite(t.price) && t.price > 0 && Number.isFinite(t.shares) ? money(t.shares * t.price) : <span className="muted">--</span>), sort: (t) => t.shares * t.price, hideN: true },
          { key: 'h', label: 'Held after', num: true, render: (t) => <span title={t.direct ? 'Held directly' : 'Held indirectly'}>{qty(t.after)}{t.direct ? '' : ' (I)'}</span>, sort: (t) => t.after, hideN: true },
          { key: 'f', label: 'Filing', render: (t) => <a className="blue" href={t.link} target="_blank" rel="noreferrer noopener" title={`Filed ${fmtDay(ms(t.filed))}`}>Form 4 ›</a>, hideW: true },
        ]}
      />
      <div className="note">
        From the insiders&apos; Form 4 filings on SEC EDGAR, as filed: purchases and sales on the market (codes P, S), shares and options granted by the company (A), options exercised (M, X, C), shares
        withheld for tax or an exercise price (F), gifts (G) and others. Values use the prices filed; awards usually carry none. Held after is the direct holding after the latest transaction a
        filing reports. 10b5-1 marks a trade the filer ticked as made under a Rule 10b5-1 plan, or one whose footnotes name one. Hover a name for its spelling as filed.
      </div>
    </>
  );
}

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
            <td className="amber">{r.first ? fmtDay(ms(r.y.end), true) : ''}</td>
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
  const insiders = useSecLoad(secAvailable() && secTicker(s) ? `insiders:${s.id}` : null, () => loadInsiders(s));
  const people = useMemo(() => (insiders.result?.ok ? summarize(insiders.result.data.trades).people : []), [insiders.result]);
  const csv = () => [
    ['Name', 'Source-reported title', 'Source-reported age', 'Year born', 'Yahoo reported Pay (not SEC total compensation)', 'Options exercised', 'Options unexercised', 'Pay currency', 'Pay fiscal year', 'Profile received UTC'],
    ...officers.map((o) => [o.name, o.title, num(o.age), num(o.yearBorn), num(o.totalPay), num(o.exercised), num(o.unexercised), 'not stated by Yahoo', num(o.fiscalYear), real ? new Date(real.fetched).toISOString() : '']),
    ...(insiders.result?.ok && insiders.result.data.trades.length
      ? [[], ['Form 4 transactions (SEC EDGAR)'], ['Date', 'Insider (as filed)', 'Relationship', 'Code', 'Transaction', 'Shares', 'Acquired or disposed', 'Price', 'Held after', 'Ownership', '10b5-1', 'Filed', 'Filing'],
         ...insiders.result.data.trades.map((t) => [t.date, t.owner.secName, role(t.owner), t.code, CODES[t.code] ?? '', num(t.shares), t.acquired ? 'A' : 'D', num(t.price), num(t.after), t.direct ? 'Direct' : 'Indirect', t.plan ? 'yes' : '', t.filed, t.link])]
      : []),
  ];
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
              { key: 'x', label: 'Options exercised', title: 'Value of the options exercised in the pay fiscal year (Yahoo)', num: true, render: (o) => fmtInt(o.exercised), sort: (o) => o.exercised, hideM: true },
              { key: 'u', label: 'Options unexercised', title: 'Value of the options held and not exercised (Yahoo)', num: true, render: (o) => fmtInt(o.unexercised), sort: (o) => o.unexercised, hideW: true },
              { key: 'y', label: 'Pay fiscal year', num: true, render: (o) => (Number.isFinite(o.fiscalYear) ? String(o.fiscalYear) : '--'), sort: (o) => o.fiscalYear, hideN: true },
              ...(people.length
                ? [
                    { key: 'h', label: 'Shares held', title: 'Held directly after the latest Form 4 transaction (SEC EDGAR)', num: true, render: (o: Officer) => { const p = matchOfficer(o, people); return p ? <span title={`${p.owner.secName}, as of ${p.heldAsOf ? fmtDay(ms(p.heldAsOf)) : '--'}`}>{qty(p.heldAfter)}</span> : <span className="muted">--</span>; }, sort: (o: Officer) => matchOfficer(o, people)?.heldAfter ?? NaN, hideN: true },
                    { key: 'nb', label: 'Net 12M', title: 'Shares acquired less disposed in the Form 4 filings read (options excluded)', num: true, render: (o: Officer) => { const p = matchOfficer(o, people); return p ? signed(p.netShares) : <span className="muted">--</span>; }, sort: (o: Officer) => matchOfficer(o, people)?.netShares ?? NaN, hideW: true },
                  ]
                : []),
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
        <Section title="Insider transactions, last 12 months (SEC Form 4)" right={insiders.result?.ok ? `${insiders.result.data.trades.length} transactions` : 'SEC EDGAR'}>
          {insiders.loading || !insiders.result ? (
            <div className="empty">Reading the insiders&apos; Form 4 filings from SEC EDGAR…</div>
          ) : !insiders.result.ok ? (
            <div className="empty">{insiders.result.message}</div>
          ) : !insiders.result.data.trades.length ? (
            <div className="empty">No insider transactions in {s.name}&apos;s Form 4 filings of the last 12 months{insiders.result.data.filings ? ` (${insiders.result.data.filings} filings, none readable)` : ''}.</div>
          ) : (
            <InsiderSection report={insiders.result.data} />
          )}
        </Section>
      ) : null}
      {secAvailable() && secTicker(s) ? (
        <Section
          title="Total compensation, from the proxy statement"
          right={proxy.result?.ok && proxy.result.data ? <a href={proxy.result.data.link} target="_blank" rel="noreferrer noopener" className="blue">{proxy.result.data.filing.form} filed {fmtDay(ms(proxy.result.data.filing.filed), true)} ›</a> : 'SEC EDGAR'}
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
