# Armin Terminal 2.19.0

This release adds five functions from the reference's function list: the supply chain analysis shown in the owner's screenshot (SPLC), group ranked returns (GRR), the buyback summary (BBK), capital raisings (IPO) and document search (DS). All of them use free sources and need no new key. SPLC, BBK and DS read SEC filings with the `SEC_USER_AGENT` already set in PROVIDERS.

## SPLC: Supply Chain Analysis

The layout follows the reference screen. Suppliers are on the left, customers on the right and the company in the middle; the competitors it names are along the bottom. Every box is coloured by the day's change (or by the share stated) and opens that company's PROFILE. Its ⓘ mark shows the statement and filing behind it.

- **Where it comes from:** the SEC's full-text search finds the annual reports (10-K, 20-F, 40-F) of the last 18 months that name the company by its legal name. The desktop app reads each one and keeps only the sentences that name the company. Rules classify those sentences:
  - **Suppliers** state how much of their revenue the company brings (Fabrinet: NVIDIA 16.3% in fiscal 2026; Cirrus Logic: Apple 91%; Skyworks 67%; Qorvo 50%).
  - **Customers** name the company as a supplier (CoreWeave, Nebius and HP for NVIDIA) or resell its products (Ingram Micro: 21% of its sales are Apple products; TD SYNNEX 12%).
  - **Competitors**, and **partnerships and stakes**, which are kept apart (NVIDIA's investments in CoreWeave, Coherent, Intel...).
- **The company's own report** adds the suppliers and competitors it names (NVIDIA: TSMC, Samsung, Hon Hai, Wistron and Fabrinet; AMD, Intel, Broadcom, the cloud companies...). It also adds its large customers with their shares of revenue, named or unnamed (NVIDIA: two direct customers at 22% and 14%, shown as revenue quantified 36%).
- Tabs: Summary, Suppliers, Customers, Competitors, Partners & Investors, Filings Read. Controls: Source, Sort By (Company Exposure, Market Cap, Name, Latest Filing), Filter By, Color Coding and Peers. The sentences are kept on disk for a month, so reopening a company is instant.
- SPLC shows only what companies disclose. Most name only the customers above 10% of revenue, and many leave them unnamed. The cost-of-goods and capex shares in the reference screen come from a licensed dataset and are not estimated here.

## GRR: Group Ranked Returns

The S&P 500's GICS sectors or sub-industries, and the Nasdaq-100's and Dow's sectors, ranked by return over a day, a week, one, three or six months, the year to date or a year. Weighting is by market value (the change in the members' combined value) or equal. Each group shows its best and worst member, and opens onto all its members.

## BBK: Buyback Summary

From the company's SEC filings:

- cash spent on buybacks each quarter or year (quarters reported only as year-to-date totals are calculated and marked);
- shares bought back and the average price paid, with dividends paid beside them;
- the share count on each report's cover, and the repurchase program's authorization and remaining amount;
- the buyback, dividend and shareholder yields on today's market value.

Apple: $82.2B over the last four quarters, 305M shares at $269.59 on average, a 1.66% buyback yield and 1.98% shareholder yield, with shares down 1.66% in a year.

## IPO: Capital Raisings

US IPOs priced, expected, filed and withdrawn in a period, from Nasdaq's IPO calendar (all US exchanges, no key). It shows the money raised against the same months a year earlier, each new listing's first-day and since-offer returns from Yahoo's closes, and the best and worst performers. SPACs are left out unless included. Follow-on offerings and M&A are not covered.

## DS: Document Search

Words searched in the text of every SEC filing and exhibit since 2001, for the loaded company or all companies. Filters cover the kind of document (annual and quarterly reports, 8-Ks, proxies, prospectuses, ownership, mergers) and the dates, with form facets and relevance or date order. Clicking a document shows the sentences where it matches, with the words highlighted.

## Other changes

- The menu lists SPLC under Comparative Analytics, BBK under Company Analysis, DS under Research & Estimates, and GRR and IPO with the index and market functions.
- Typed names: SPLC, GRR, BBK, IPO and DS.

Validation: 940 unit tests, 35 browser tests and 31 Electron tests (a new one runs SPLC through the real desktop path on fixture filings); ESLint, TypeScript and the production build. The desktop app was run on live data: SPLC for NVIDIA, Apple and Fabrinet, GRR for the S&P 500, BBK for Apple, IPO for the last three months, and DS for "supply chain" in Apple's filings.
