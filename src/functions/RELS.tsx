// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { FnHeader } from '../components/FnHeader';
import { RealBadge } from '../components/Source';
import { exportActions } from '../components/ExportActions';
import { Section } from '../components/cells';
import { fmtBig, fmtNum, fmtPct } from '../core/format';
import { EU_EXCHANGES } from '../data/listings';
import { COMPOSITE_COUNTRY, figiListingsAvailable, secSiblings, useFigiListings, type FigiListing } from '../data/live/related';
import { loadSecCompanies, resolveFiler, secAvailable, secTicker, SEC_DESKTOP_ONLY, useSecLoad, type SecCompany, type SecResult } from '../data/live/sec';
import { useYahooQuotes } from '../data/live/yquotes';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * RELS, a company's related securities: every ticker the SEC lists under its CIK (other share classes, preferred
 * shares and other listed securities), each with its name, exchange, price and value from Yahoo Finance, and the
 * listings of its share class in other countries from OpenFIGI. Bonds and options are on their own screens.
 */

/** The app's market codes for the European exchanges it can open (LN, SW, FP...). */
const OPENABLE = new Set(Object.values(EU_EXCHANGES).map((e) => e.code));

async function loadSiblings(ticker: string, force: boolean): Promise<SecResult<{ name: string; cik: number; securities: SecCompany[] }>> {
  const filer = await resolveFiler(ticker, force);
  if (!filer.ok) return filer;
  const list = await loadSecCompanies();
  if (!list.ok) return list;
  return { ok: true, data: { name: filer.data.title, cik: filer.data.cik, securities: secSiblings(list.data, filer.data.cik, filer.data.ticker) }, at: list.at };
}

export function RELS({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const ticker = secTicker(s);
  const load = useSecLoad(secAvailable() && ticker ? `rels:${ticker}` : null, (force) => loadSiblings(ticker!, force));
  const data = load.result?.ok ? load.result.data : null;
  const securities = data?.securities ?? [];
  const quotes = useYahooQuotes(securities.map((c) => c.ticker));
  const figi = useFigiListings(ticker);
  const listings = figi?.listings ?? [];
  const open = (command: string) => execute(panel, command);
  const csv = () => [
    ['Kind', 'Ticker', 'Name', 'Exchange', 'Type', 'Last', 'Currency'],
    ...securities.map((c) => {
      const q = quotes.get(c.ticker);
      return ['SEC', c.ticker, q?.longName ?? q?.shortName ?? '', q?.fullExchangeName ?? '', q?.quoteType ?? '', q?.regularMarketPrice ?? '', q?.currency ?? ''];
    }),
    ...listings.map((l) => ['OpenFIGI', l.ticker, l.name, `${l.exchCode}${COMPOSITE_COUNTRY[l.exchCode] ? ` (${COMPOSITE_COUNTRY[l.exchCode]})` : ''}`, l.securityType, '', '']),
  ];
  const secStatus = !ticker
    ? 'The SEC lists the securities of US-registered companies; this one has no US ticker.'
    : !secAvailable()
      ? `${SEC_DESKTOP_ONLY} The browser demo has none, and none are generated.`
      : load.result && !load.result.ok
        ? load.result.message
        : !data
          ? 'Reading the SEC’s list of tickers…'
          : '';
  const figiStatus = !ticker || !figiListingsAvailable()
    ? ''
    : !figi
      ? 'Asking OpenFIGI for the share class’s listings…'
      : figi.gated
        ? 'OpenFIGI is switched off (OPENFIGI_ENABLED on PROVIDERS).'
        : figi.error
          ? `OpenFIGI did not answer: ${figi.error}`
          : figi.none
            ? 'OpenFIGI knows no US listing for this ticker.'
            : !listings.length
              ? figi.status === 429 ? 'OpenFIGI asked the app to slow down; try again in a minute.' : 'OpenFIGI lists no other listing.'
              : '';
  const listingRow = (l: FigiListing) => {
    const code = OPENABLE.has(l.exchCode) ? l.exchCode : '';
    return (
      <tr key={l.figi} className={code ? 'click' : undefined} onClick={code ? () => open(`${l.ticker} ${code} EQUITY`) : undefined} title={code ? `Open ${l.ticker} ${code}` : undefined}>
        <td className="amber">{l.exchCode}</td>
        <td>{COMPOSITE_COUNTRY[l.exchCode] ?? ''}</td>
        <td className="white">{l.ticker}</td>
        <td className="hide-m">{l.name}</td>
        <td className="muted hide-m">{l.securityType}</td>
      </tr>
    );
  };
  return (
    <div>
      <FnHeader
        code="RELATED"
        title="Related Securities"
        sec={s}
        sub={<><RealBadge /> SEC company tickers, prices from Yahoo Finance, listings from OpenFIGI</>}
        actions={exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_RELS.csv`, csv)}
      />
      <Section title={`Securities filed under ${data?.name ?? s.name}${data ? ` (CIK ${data.cik})` : ''}`}>
        {secStatus ? (
          <div className="empty">{secStatus}</div>
        ) : (
          <table className="tbl" aria-label="Securities filed with the SEC">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Name</th>
                <th className="hide-m">Type</th>
                <th className="hide-n">Exchange</th>
                <th className="num">Last</th>
                <th className="num">Change</th>
                <th className="num hide-m">Market value</th>
              </tr>
            </thead>
            <tbody>
              {securities.map((c, i) => {
                const q = quotes.get(c.ticker);
                const chg = Number(q?.regularMarketChangePercent);
                return (
                  <tr key={c.ticker} className="click" onClick={() => open(`${c.ticker.replace('-', '/')} US EQUITY PROFILE`)}>
                    <td className={i === 0 ? 'yellow' : 'amber'}>{c.ticker}</td>
                    <td>{q?.longName ?? q?.shortName ?? ''}</td>
                    <td className="muted hide-m">{q?.quoteType ? String(q.quoteType).toLowerCase() : ''}</td>
                    <td className="hide-n">{q?.fullExchangeName ?? ''}</td>
                    <td className="num white">{Number.isFinite(q?.regularMarketPrice) ? `${fmtNum(q.regularMarketPrice, 2)}${q.currency && q.currency !== 'USD' ? ` ${q.currency}` : ''}` : ''}</td>
                    <td className={`num ${chg > 0 ? 'up' : chg < 0 ? 'dn' : ''}`}>{Number.isFinite(chg) ? fmtPct(chg, 2) : ''}</td>
                    <td className="num hide-m">{Number.isFinite(q?.marketCap) ? fmtBig(q.marketCap, 2) : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>
      {ticker && figiListingsAvailable() && (
        <Section title={`Listings of the share class${figi?.shareClassFIGI ? ` (${figi.shareClassFIGI})` : ''}`}>
          {figiStatus ? (
            <div className="empty">{figiStatus}</div>
          ) : (
            <table className="tbl" aria-label="Listings of the share class">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Country</th>
                  <th>Ticker</th>
                  <th className="hide-m">Name</th>
                  <th className="hide-m">Type</th>
                </tr>
              </thead>
              <tbody>{listings.map(listingRow)}</tbody>
            </table>
          )}
        </Section>
      )}
      <div className="note">
        The SEC&apos;s list gives every ticker filed under the company&apos;s CIK (share classes, preferred shares and other listed securities); names,
        exchanges and prices are Yahoo Finance&apos;s, blank where Yahoo has none. Listings are OpenFIGI&apos;s composite line for each country, coded
        as OpenFIGI codes them; a European one the app carries opens on a click.
      </div>
    </div>
  );
}
