// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Section } from '../components/cells';
import { DataTable } from '../components/DataTable';
import { exportActions } from '../components/ExportActions';
import { sourceLabel } from '../components/Source';
import { fmtBig, fmtDay, fmtInt, fmtNum } from '../core/format';
import { useFundamentals, type Officer } from '../data/live/yfund';
import { yahooSymbolFor } from '../data/live/yahoo';
import { secAvailable, secTicker, useSecLoad } from '../data/live/sec';
import { loadProxyPay, type Executive, type PayYear, type ProxyPay } from '../data/live/proxypay';
import { CODES, loadInsiders, summarize, type InsiderReport, type Person, type Trade } from '../data/live/insiders';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import type { SecurityDef } from '../data/types';

const money = (v: number) => (Number.isFinite(v) ? fmtBig(v) : '');
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
/** Shares as a count: whole up to ten million, then in M/B. */
const qty = (v: number) => (!Number.isFinite(v) ? '' : Math.abs(v) >= 1e7 ? fmtBig(v) : fmtInt(v));
const signed = (v: number) => (Number.isFinite(v) && v !== 0 ? <span className={v > 0 ? 'up' : 'dn'}>{v > 0 ? '+' : '-'}{qty(Math.abs(v))}</span> : '');
/** A count or value of nothing is left blank: a column of zeros says nothing. */
const nonzero = (v: number, fmt: (x: number) => string) => (v ? fmt(v) : '');

/** "Director", "10% owner" or the officer title the insider filed. */
const role = (p: Person['owner']) => [p.title, !p.title && p.officer ? 'Officer' : '', p.director ? 'Director' : '', p.tenPercent ? '10% owner' : ''].filter(Boolean).join(' · ');

const nameWords = (s: string) =>
  s.toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !/^(mr|mrs|ms|dr|jr|sr|ii|iii|iv|phd|md|cpa|esq|cfa)$/.test(w));

/**
 * The same person under two spellings: the same last name, and a first name the start of the other's
 * ("Wes"/"Wesley") or found among the other's names ("Saidal Mohmand"/"Mohammad Saidal L. Mohmand").
 */
export function sameName(a: string, b: string): boolean {
  const x = nameWords(a);
  const y = nameWords(b);
  if (x.length < 2 || y.length < 2 || x[x.length - 1] !== y[y.length - 1]) return false;
  const first = (w: string) => NICKNAMES[w] ?? w;
  const [p, q] = [first(x[0]), first(y[0])];
  return p.startsWith(q) || q.startsWith(p) || y.slice(0, -1).map(first).includes(p) || x.slice(0, -1).map(first).includes(q);
}

/** Short forms of first names a proxy statement and a profile spell differently ("Kate Adams", "Katherine L. Adams"). */
const NICKNAMES: Record<string, string> = {
  kate: 'katherine', katie: 'katherine', kathy: 'katherine', cathy: 'catherine', bob: 'robert', rob: 'robert', bobby: 'robert', bill: 'william', will: 'william', billy: 'william',
  jim: 'james', jimmy: 'james', mike: 'michael', mick: 'michael', dick: 'richard', rick: 'richard', rich: 'richard', tom: 'thomas', tony: 'anthony', steve: 'steven',
  dave: 'david', dan: 'daniel', danny: 'daniel', chuck: 'charles', charlie: 'charles', ted: 'edward', ed: 'edward', ned: 'edward', jack: 'john', johnny: 'john',
  liz: 'elizabeth', beth: 'elizabeth', betsy: 'elizabeth', peggy: 'margaret', meg: 'margaret', maggie: 'margaret', sue: 'susan', jen: 'jennifer', jenny: 'jennifer',
  chris: 'christopher', matt: 'matthew', pat: 'patrick', larry: 'lawrence', jerry: 'gerald', greg: 'gregory', joe: 'joseph', ben: 'benjamin', sam: 'samuel',
  andy: 'andrew', drew: 'andrew', nick: 'nicholas', alex: 'alexander', fred: 'frederick', hank: 'henry', harry: 'henry', jeff: 'jeffrey', doug: 'douglas', ken: 'kenneth',
  ron: 'ronald', don: 'donald', ray: 'raymond', phil: 'philip', pete: 'peter', stan: 'stanley', vince: 'vincent', walt: 'walter', zach: 'zachary', abby: 'abigail',
};

/** Yahoo's officer and the Form 4 filer that are the same person (one match only). */
export function matchOfficer(o: Officer, people: Person[]): Person | undefined {
  const hits = people.filter((p) => sameName(o.name, p.owner.name));
  return hits.length === 1 ? hits[0] : undefined;
}

/** A company's executive: Yahoo's officer and the proxy statement's named executive, whichever lists them. */
interface ExecRow {
  name: string;
  title: string;
  age: number;
  /** The Summary Compensation Table's latest year, salary and total. */
  pay?: { year: number; salary: number; total: number; previous?: number };
  person?: Person;
  /** The title the profile or the proxy gives, when the latest Form 4 names another. */
  listedTitle?: string;
}

const CHIEF_EXECUTIVE = /\b(?:CEO|Chief Executive)\b/i;

/** The named executives first (largest pay first), then the other officers in Yahoo's order. */
export function executiveRows(officers: Officer[], executives: Executive[], people: Person[]): ExecRow[] {
  const used = new Set<Officer>();
  const rows: ExecRow[] = executives.map((e) => {
    const o = officers.find((x) => !used.has(x) && sameName(x.name, e.name));
    if (o) used.add(o);
    const [y, prev] = e.years;
    return { name: o?.name ?? e.name, title: o?.title || e.title, age: o?.age ?? NaN, pay: { ...y, ...(prev ? { previous: prev.total } : {}) } };
  });
  rows.sort((a, b) => (b.pay?.total ?? 0) - (a.pay?.total ?? 0));
  for (const o of officers) if (!used.has(o)) rows.push({ name: o.name, title: o.title, age: o.age });
  for (const r of rows) {
    const hits = people.filter((p) => sameName(r.name, p.owner.name));
    if (hits.length === 1) r.person = hits[0];
    // The officer's latest Form 4 names the role now; a profile and a proxy statement lag appointments (Apple in
    // October 2026: Tim Cook still "Chief Executive Officer" in both, "Executive Chair" in his Form 4 filings, with
    // John Ternus filing as CEO).
    const filed = r.person?.owner.officer ? r.person.owner.title.trim() : '';
    if (filed && filed.toLowerCase() !== r.title.trim().toLowerCase()) {
      r.listedTitle = r.title;
      r.title = filed;
    }
  }
  // Officers who file Form 4 but whom neither the profile nor the proxy lists yet.
  for (const p of people) {
    if (!p.owner.officer || !p.owner.title.trim() || rows.some((r) => r.person === p || sameName(r.name, p.owner.name))) continue;
    rows.push({ name: p.owner.name, title: p.owner.title.trim(), age: NaN, person: p });
  }
  // The chief executive first.
  const ceo = rows.findIndex((r) => CHIEF_EXECUTIVE.test(r.title) && !/\b(?:former|retired|interim)\b/i.test(r.title));
  if (ceo > 0) rows.unshift(...rows.splice(ceo, 1));
  return rows;
}

export function InsiderSection({ report }: { report: InsiderReport }) {
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
          { key: 'p', label: 'Price', num: true, render: (t) => (Number.isFinite(t.price) && t.price > 0 ? fmtNum(t.price, 2) : ''), sort: (t) => t.price },
          { key: 'v', label: 'Value', num: true, render: (t) => (Number.isFinite(t.price) && t.price > 0 && Number.isFinite(t.shares) ? money(t.shares * t.price) : ''), sort: (t) => t.shares * t.price, hideN: true },
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

/** The insiders' Form 4 transactions once read, or what is happening while they are not. */
function InsiderBody({ s, insiders }: { s: SecurityDef; insiders: ReturnType<typeof useInsiders> }) {
  if (insiders.loading || !insiders.result) return <div className="empty">Reading the insiders&apos; Form 4 filings from SEC EDGAR…</div>;
  if (!insiders.result.ok) return <div className="empty">{insiders.result.message}</div>;
  if (!insiders.result.data.trades.length) {
    return <div className="empty">No insider transactions in {s.name}&apos;s Form 4 filings of the last 12 months{insiders.result.data.filings ? ` (${insiders.result.data.filings} filings, none readable)` : ''}.</div>;
  }
  return <InsiderSection report={insiders.result.data} />;
}

/** A company's Form 4 filings of the last 12 months, read from SEC EDGAR for a US-listed company (desktop app). */
function useInsiders(s: SecurityDef) {
  return useSecLoad(secAvailable() && secTicker(s) ? `insiders:${s.id}` : null, () => loadInsiders(s));
}

/** Every Form 4 transaction, as a CSV's rows. */
function insiderCsv(trades: Trade[]): (string | number)[][] {
  return [
    ['Date', 'Insider (as filed)', 'Relationship', 'Code', 'Transaction', 'Shares', 'Acquired or disposed', 'Price', 'Held after', 'Ownership', '10b5-1', 'Filed', 'Filing'],
    ...trades.map((t) => [t.date, t.owner.secName, role(t.owner), t.code, CODES[t.code] ?? '', num(t.shares), t.acquired ? 'A' : 'D', num(t.price), num(t.after), t.direct ? 'Direct' : 'Indirect', t.plan ? 'yes' : '', t.filed, t.link]),
  ];
}

/**
 * INSD, the guides' Insider Shareholder Activity (N02): the insiders' Form 4 purchases, sales, awards and exercises of
 * the last 12 months on their own screen, each with its filing, and a CSV. MANAGEMENT shows the same beside the
 * officers.
 */
export function INSD({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const insiders = useInsiders(s);
  const trades = insiders.result?.ok ? insiders.result.data.trades : [];
  return (
    <div>
      <FnHeader
        code="INSIDERS"
        title="Insider Transactions"
        sec={s}
        sub="Form 4 filings on SEC EDGAR, last 12 months"
        actions={trades.length ? exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_INSD.csv`, () => insiderCsv(trades)) : undefined}
      />
      {!secAvailable() ? (
        <div className="empty">Insiders&apos; Form 4 filings are read from SEC EDGAR in the desktop app; none are generated.</div>
      ) : !secTicker(s) ? (
        <div className="empty">Insiders file Form 4 with the SEC for US-listed companies; {s.id} is not one the app can match to an SEC filer.</div>
      ) : (
        <InsiderBody s={s} insiders={insiders} />
      )}
    </div>
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
            <td>{r.name}</td>
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
  const officers = useMemo(() => real?.officers ?? [], [real]);
  const symbol = yahooSymbolFor(s);
  const proxy = useSecLoad(secAvailable() && secTicker(s) ? `proxypay:${s.id}` : null, () => loadProxyPay(s));
  const insiders = useInsiders(s);
  const people = useMemo(() => (insiders.result?.ok ? summarize(insiders.result.data.trades).people : []), [insiders.result]);
  const executives = useMemo(() => (proxy.result?.ok ? (proxy.result.data?.executives ?? []) : []), [proxy.result]);
  const rows = useMemo(() => executiveRows(officers, executives, people), [officers, executives, people]);
  const csv = () => [
    ['Name', 'Title', 'Age', 'Total pay (Summary Compensation Table, USD)', 'Salary (USD)', 'Pay fiscal year', 'Prior year total (USD)', 'Shares held (Form 4)', 'Net shares 12M (Form 4)'],
    ...rows.map((r) => [r.name, r.title, num(r.age), num(r.pay?.total ?? NaN), num(r.pay?.salary ?? NaN), r.pay ? r.pay.year : '', num(r.pay?.previous ?? NaN), num(r.person?.heldAfter ?? NaN), num(r.person?.netShares ?? NaN)]),
    ...(insiders.result?.ok && insiders.result.data.trades.length ? [[], ['Form 4 transactions (SEC EDGAR)'], ...insiderCsv(insiders.result.data.trades)] : []),
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
  } else if (!officers.length && !executives.length) {
    body = <div className="empty">{real.statsFrom === 'Finnhub' ? "Yahoo refused its company summary this time, and Finnhub's profile lists no officers." : `Yahoo Finance lists no officers for ${s.name}.`}</div>;
  } else {
    const payYear = rows.find((r) => r.pay)?.pay?.year;
    body = (
      <>
        <Section
          title="Executives"
          right={`${rows.length} listed${executives.length ? ` · pay from the ${proxy.result?.ok && proxy.result.data ? `${proxy.result.data.filing.form} filed ${fmtDay(ms(proxy.result.data.filing.filed), true)}` : 'proxy statement'}` : ''} · officers from Yahoo Finance, received ${fmtDay(real.fetched)}`}
        >
          <DataTable
            rows={rows}
            rowKey={(r, i) => `${r.name}:${i}`}
            numbered
            columns={[
              { key: 'n', label: 'Name', render: (r) => <span className="white">{r.name}</span>, sort: (r) => r.name },
              { key: 't', label: 'Title', render: (r) => (r.listedTitle || r.person?.owner.officer ? <span title={`${r.person ? `As the latest Form 4 (${fmtDay(ms(r.person.last))}) gives it` : ''}${r.listedTitle ? `; the profile or proxy statement lists: ${r.listedTitle}` : ''}`}>{r.title}</span> : r.title), sort: (r) => r.title },
              { key: 'a', label: 'Age', num: true, render: (r) => (Number.isFinite(r.age) ? fmtInt(r.age) : ''), sort: (r) => r.age, hideM: true },
              ...(executives.length
                ? [
                    {
                      key: 'tc',
                      label: `Total pay${payYear ? ` FY${String(payYear).slice(2)}` : ''}`,
                      title: "The proxy statement's Summary Compensation Table total for the fiscal year: salary, bonus, stock and option awards at their grant-date value, incentive pay and other compensation, in US dollars",
                      num: true,
                      render: (r: ExecRow) =>
                        r.pay ? (
                          <span className="white" title={`Fiscal year ${r.pay.year}${Number.isFinite(r.pay.previous) ? ` · the year before: ${fmtBig(r.pay.previous!)}` : ''}`}>{fmtBig(r.pay.total)}</span>
                        ) : (
                          <span className="muted" title="Companies report pay for their named executive officers only">not disclosed</span>
                        ),
                      sort: (r: ExecRow) => r.pay?.total ?? NaN,
                    },
                    { key: 'sl', label: 'Salary', title: 'Base salary for the same fiscal year', num: true, render: (r: ExecRow) => (r.pay && r.pay.salary > 0 ? fmtBig(r.pay.salary) : ''), sort: (r: ExecRow) => r.pay?.salary ?? NaN, hideM: true },
                    { key: 'pv', label: 'Prior year', title: 'Total pay the fiscal year before', num: true, render: (r: ExecRow) => (Number.isFinite(r.pay?.previous) ? fmtBig(r.pay!.previous!) : ''), sort: (r: ExecRow) => r.pay?.previous ?? NaN, hideW: true },
                  ]
                : []),
              ...(people.length
                ? [
                    { key: 'h', label: 'Shares held', title: 'Held directly after the latest Form 4 transaction (SEC EDGAR)', num: true, render: (r: ExecRow) => (r.person ? <span title={`${r.person.owner.secName}${r.person.heldAsOf ? `, as of ${fmtDay(ms(r.person.heldAsOf))}` : ''}`}>{qty(r.person.heldAfter)}</span> : ''), sort: (r: ExecRow) => r.person?.heldAfter ?? NaN, hideN: true },
                    { key: 'nb', label: 'Net 12M', title: 'Shares acquired less disposed in the Form 4 filings read (options excluded)', num: true, render: (r: ExecRow) => (r.person ? signed(r.person.netShares) : ''), sort: (r: ExecRow) => r.person?.netShares ?? NaN, hideW: true },
                  ]
                : []),
            ]}
          />
        </Section>
        <div className="note">
          {executives.length
            ? 'Total pay: the latest proxy statement’s Summary Compensation Table, which covers the named executive officers (the chief executive, the finance chief and the three other best paid); a company does not report other officers’ pay. '
            : proxy.loading
              ? 'Reading the latest proxy statement for each executive’s pay… '
              : ''}
          Titles and ages as Yahoo Finance&apos;s company profile gives them; it can lag appointments and departures.
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
        actions={rows.length ? exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_MGMT.csv`, csv) : undefined}
      />
      {body}
      {secAvailable() && secTicker(s) ? (
        <Section title="Insider transactions, last 12 months (SEC Form 4)" right={insiders.result?.ok ? `${insiders.result.data.trades.length} transactions` : 'SEC EDGAR'}>
          <InsiderBody s={s} insiders={insiders} />
        </Section>
      ) : null}
      {secAvailable() && secTicker(s) ? (
        <Section
          title="Chief executive's pay against performance (proxy statement)"
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
