# Primary-source checks, 30 October 2026 (Claude, working beside Codex)

Codex's environment could not reach the SEC, Nasdaq or Yahoo directly (proxy 403), so the open questions in `docs/accuracy-v2.29.1.md` that need those sources were checked from a Claude cloud session, which can reach them. This file is kept apart from Codex's documents so that its uncommitted edits there do not conflict. Fold it into `docs/accuracy-v2.29.1.md` and `docs/audit-v2.28-data.md` when convenient.

## 1. Open and volume of finished sessions (fixed, `5f4eebd`)

Nasdaq's historical prices (`api.nasdaq.com/api/quote/{SYMBOL}/historical`), read on 30 October at about 22:10 UTC:

| Session | App (audit 41028233779) | Nasdaq historical | Tiingo/Massive reference |
| --- | --- | --- | --- |
| Walmart 28 Oct, volume | 14.27M | 14,456,440 | 14.46M |
| Walmart 29 Oct, open | 120.83 | 120.74 | 120.74 |
| Walmart 29 Oct, volume | 15.84M | 16,048,290 | 16,048,288 |
| Coca-Cola 29 Oct, volume | 15.38M | 15,872,120 | 15,872,118 |
| Tesla 29 Oct, open | 405.94 | 405.625 | 405.625 |

Yahoo's own daily bars, read at the same time, had also moved to the official figures (Walmart 28 Oct 14,456,400 and open 118.43; 29 Oct 16,048,300 and 120.74; Tesla 29 Oct open 405.63; Coca-Cola 29 Oct 15,872,100). So the references were right, and the app showed Yahoo's provisional first readings of a finished session.

The volume part was already handled by the settled-volume step (Nasdaq's consolidated volume for a finished session). The open was not. Since `5f4eebd`, the same Nasdaq row also settles the official open: the daily bar and quote carry it, `PX_OPEN` names Nasdaq as its source, and Yahoo's next poll or a history reload does not put the provisional open back. Test: `tests/settled-volume.test.ts`, "a finished session's official open", on the Walmart figures above.

The app's capture of Walmart on 30 October after the close showed open 123.15 and volume 29.60M, the same as Yahoo's daily bar at that time. Nasdaq had not yet published 30 October's row, so that session is not yet checked against the official record.

## 2. Lilly's share count (definition, not a conflict)

The 10-Q for the quarter ended 30 September 2026 (filed 29 October, accession 0000059478-26-000108) gives on its cover: "The number of shares of common stock outstanding as of October 26, 2026: Common 940,745,031". Its balance sheet still carries "Employee benefit trust (3,013)", in millions of dollars, unchanged from 31 December 2025.

The 10-K for 2025 (filed 12 February 2026, accession 0000059478-26-000013) explains the trust:

> "We have an employee benefit trust that held 50 million shares of our common stock at both December 31, 2025 and 2024, to provide a source of funds to assist us in meeting our obligations under various employee benefit plans. The cost basis of the shares held in the trust was $3.0 billion at both December 31, 2025 and 2024, and is shown as a reduction of shareholders' equity. Any dividend transactions between us and the trust are eliminated. Stock held by the trust is not considered outstanding in the computation of EPS."

So 940,745,031 − 50,000,000 = 890,745,031, the "about 890.75 million" that Yahoo's market value implies. The two counts are two definitions: the cover count includes the trust's shares; the EPS count and Yahoo's market value leave them out. The trust's holding is stated as of 31 December 2025, and its $3,013 million cost basis is unchanged at 30 September 2026, which is consistent with, but does not by itself prove, an unchanged 50 million shares.

Suggested change (not made here, because Codex's uncommitted work touches the share-label code in `src/data/live/yfund.ts`): when the difference between the SEC cover count and a provider's count equals the trust's 50 million shares, label it as a definitional difference with this quotation instead of "Sources disagree", and keep the market value on the EPS basis.

## 3. Exxon's revenue basis (definition, not a conflict)

Exxon's 10-Q for the quarter ended 30 June 2026 (filed 3 August 2026, accession 0000034088-26-000093), condensed consolidated statement of income, three months ended 30 June 2026, in millions of dollars:

| Line | Q2 2026 |
| --- | --- |
| Sales and other operating revenue | 114,529 |
| Income from equity affiliates | 893 |
| Other income | 595 |
| Total revenues and other income | 116,017 |

All four lines are tagged `us-gaap:Revenues` in the filing's inline XBRL. They differ only by context: 114,529 carries `srt:ProductOrServiceAxis = xom:SalesAndOtherOperatingRevenueMember`, 893 `xom:IncomeFromEquityAffiliatesMember`, 595 `xom:OtherRevenueMember`, and 116,017 has no dimension. The SEC's company-facts API publishes only facts without dimensions, so the app's filed observation is 116,017 (total revenues and other income), while the statement feed's 114,529 is sales and other operating revenue. That is why no exact-period alternative in company facts matched.

Suggested change (left to the next session, as Codex has uncommitted work in the revenue diagnostics): read the dimensional `xom:SalesAndOtherOperatingRevenueMember` fact from the filing's inline XBRL, or label Exxon's filed `Revenues` as "total revenues and other income (includes equity-affiliate and other income)", and compute margins on one stated basis.

## 4. Tesla's annual net income (corroborated)

SEC company facts, 10-K facts (each value is the same in the 10-Ks filed in 2023, 2024 and 2025, or 2025 and 2026):

| Concept | 2022 | 2024 |
| --- | --- | --- |
| `NetIncomeLoss` (net income attributable to common stockholders) | 12,556 | 7,091 |
| `ProfitLoss` (including noncontrolling interests) | 12,587 | 7,153 |
| `NetIncomeLossAvailableToCommonStockholdersBasic` (EPS numerator) | 12,583 | 7,130 |
| `NetIncomeLossAvailableToCommonStockholdersDiluted` | 12,584 | 7,130 |
| `NetIncomeLossAttributableToNoncontrollingInterest` | 31 | 62 |

The audit's references (12,556 and 7,091) are the parent's net income. The screen's earlier 12,583 and 7,130 were the EPS numerator. Codex's change that selects the filed parent income first matches the filings.

## Not done in this pass

The SPLC review of Eli Lilly, Pfizer, Merck, Exxon, Chevron, Ford, GM and Northrop; the HOLDERS, HOLDINGS (13F), INSIDERS and CONGRESS spot checks; EVENTS against the companies' announcements; the Fed HTTP 403 (not tried here); Walmart's 30 October session against Nasdaq's row once published.
