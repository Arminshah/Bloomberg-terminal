# Armin Terminal 2.17.0

This release fills the screens that showed "--" when Yahoo Finance gave no data, adds Alpha Vantage's earnings history and estimates, fixes Nasdaq requests that never answered, and shows the remaining dates in the DD/MM/YYYY order.

- **Fewer "--" when Yahoo refuses its session:** when Yahoo refuses the app a session (EU cookies, or its rate limit), it gives no company summary, and PROFILE, HOLDERS, DIVIDENDS, ANALYSTS and EARNINGS lost most of their figures at once. US-listed stocks now take what Yahoo leaves empty from sources without a key, and Yahoo's own figures are never replaced:
  - **Nasdaq:** market value, shares outstanding, industry and description, the annual dividend and its ex-date, institutional ownership with the number of holders and the largest holders, the price target with its range, the buy/hold/sell count with the mean rating, the coming quarters' and years' EPS consensus, and the next report date with its session.
  - **FINRA:** short interest and days to cover for stocks listed outside Nasdaq.
  - EVENTS for one stock shows its next report from Nasdaq when no other source dates it.
  - **SEC EDGAR:** headquarters, fiscal year end, and the officers who filed Form 4s (when Yahoo lists none).
  - The stock on screen asks for all of these; peers in a table ask only for their market value.
- **Revenue expected for past quarters:** with your `ALPHA_VANTAGE_API_KEY`, EARNINGS fills each past quarter's expected revenue and EPS, the report date and the pre- or post-market session, and the coming quarters' EPS and revenue estimates. ANALYSTS gets the annual estimates from the same answer. The free key allows 25 requests a day, so the two requests per company are made only for the stock on screen and kept on disk for three days. Revenue estimates are used only for companies reporting in dollars.
- **Report dates and sessions:** where the statements give no report date, EARNINGS takes it from the company's own results filing (SEC 8-K item 2.02). The filing time sets the session: before 9:30 New York time is pre-market, from 16:00 after the close. A filing during the session leaves the session unknown, because the 8-K can follow the press release. The next report comes from Nasdaq when no other source names it.
- **Dividends:** DIVIDENDS shows each payment's declared, record and payable dates from Nasdaq's dividend record (Nasdaq-listed stocks), and a declared dividend before it goes ex. A date no source gives is now a blank cell instead of "--".
- **Nasdaq requests fixed:** Nasdaq's servers silently drop requests whose User-Agent contains a web address or the word Electron, so in 2.16.0 the EVENTS market calendar never received Nasdaq's data. Nasdaq requests now carry the app's plain name and version.
- **Dates:** FILINGS (coverage notes, latest current report, column and cell tooltips), the statement-supplement notes, "read on" estimate labels, recommendation periods, the debt snapshot and ECB fixing labels follow the DD/MM/YYYY setting. CSV exports keep YYYY-MM-DD.
- **Quieter source notes:** EARNINGS names unavailable sources in the section header only when nothing could be shown; otherwise they are in a tooltip. A source with EPS estimates only shows no empty revenue columns.

Coverage still depends on the providers. Nasdaq has no revenue estimates and covers dividend dates and short interest for Nasdaq listings only; FINRA publishes short interest twice a month. Alpha Vantage needs your key. Figures no source gives stay blank rather than being estimated.

Validation: 896 unit tests, 35 browser tests and 30 Electron tests; ESLint, TypeScript and production build. The desktop app was also run against the live sources (Yahoo, Nasdaq, FINRA, SEC EDGAR) for AAPL, KO and SOFI. Alpha Vantage was checked only with its public demo answers, not with a personal key.
