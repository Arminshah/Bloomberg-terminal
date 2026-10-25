# To-do list

Updated 25 October 2026. This is the one list of what comes next for Armin Terminal. When an item is finished it moves to "Done" with the commit that did it. Work happens on the branch `claude/market-events-v2.16.0-id814n`.

## Next, in this order

Accuracy first, then the screens you use every day, then new screens, then the data-source review and the comparison with Codex's video list.

### 7. Congress trade tracker, from your feedback item 2

You asked: a tracker of politicians' trades, ranked by biggest portfolio first, plus whatever else makes sense.

Today: nothing.

Plan:
- First find a free, reliable source.
- The official ones are the House Clerk's and the Senate's disclosure sites.
- FMP and Finnhub also offer congress trading data, but whether your free plans include it has to be tested with your keys.
- Then: politicians ranked by disclosed portfolio size, each one's trades, the latest trades across Congress, and trades in the stock on screen.

Limit: the disclosures give values as ranges (for example $1,001 to $15,000), not exact amounts. Rankings and totals will show the range they come from.

### 8. Review of the data sources (Codex's notes), from your feedback item 3

You asked: review Codex's assessment of the APIs, don't follow it blindly, and make the improvements that make sense.

Plan:
- Go through Codex's table provider by provider against the code.
- Keep what is useful, drop calls that only repeat another source, and fix what is wrong. Each fix gets its own commit and test.
- Codex's two suggestions:
  - OpenFIGI: already connected with your key for item 6 (tickers of 13F holdings). Still to do: use it to match the same company across exchanges and ADRs.
  - Dated ECB exchange rates for portfolio conversions. The ECB is already a source in the app.
- Write up what I agree and disagree with, and why.

### 9. Compare the app with Codex's list of Bloomberg videos

You asked: whether Codex's research list of Bloomberg videos (official tutorials, feature demos, university recordings and webinars) is useful, and if so to add it.

What it adds: the list names 41 function codes.
- 15 already have a screen in the app: WEI, IMAP, EQS, RV, FA, EE, ANR, TOP, CN, PORT, YAS, SRCH, OMON, OVME and IB.
- 6 were already sorted by the 2.23.0 audit. WATC, HRA and OVDV can be built from free data (they are in "Later"). BI, OMST and BLP need the provider's own content or platform.
- The other 20 are new to the gap list: MREP, DSX, CHRT, ALTD, AID, BTM, BTST, CRAN, MM, CMGR, WSL, ASKB, FIW, CFND, SHOK, OVI, OPX, OSCH, BQL and BQNT.

Limits:
- I can read a video page's title and description, but I cannot watch the video. Codex says the same.
- The links in your message did not come through, and Codex's research pack file was not attached.
- Several of the new codes need paid or proprietary data (alternative data, options trade flow, the provider's own research), or are platform features (BQuant, worksheets, compliance rules). They cannot be built without inventing data, which the rules forbid.

Plan:
- Add the 20 new codes to `docs/audit-v2.23.0-coverage.md`. Each gets a class, based on the evidence used: buildable from free data, needs paid or proprietary data, or not applicable. Buildable ones join "Later".
- Compare the screens you use most with the provider's own documentation, using Codex's checklist. Those screens are the screener, world indices, market map, relative valuation, financials, earnings, analysts, portfolio, bond calculator and options. The checklist covers:
  - how the screen opens
  - its inputs and logic
  - its layout and outputs
  - its links to other screens
  - whether the numbers check out
- Each screen is marked fully working, partial, broken or missing.
- A workflow counts as checked only when I actually saw it, on a document page or in your screenshot, never from a title alone.

## Waiting on you

- The browser practice mode (demo): keep it for testing, or delete it?
- Release 2.25.0: only when you say so.
- API keys: they have been pasted into chats and into the feedback document, so change them at each provider. Please don't paste keys into chats or documents again. Add them in the cloud environment's settings instead: the environment menu in the session's title bar, then Edit, then Network secrets (called API credentials in older versions of the app), or as environment variables. `.env.example` lists the names the app reads, such as `FINNHUB_API_KEY`. A new session picks them up.
- A pull request into `main` (it would contain the whole app): yes or no?
- For item 9:
  - Upload the reference PDFs again (documents 1 to 33). They stay out of the repository, so a new session does not have them.
  - If you have Codex's research pack file, attach it and I will check its links.
  - When a video shows something you want, a screenshot with a short note works best, as in your feedback document.

## Later

- Functions the reference documents name that the app lacks but could build from free data (55 codes, class a in `docs/audit-v2.23.0-coverage.md`). The most cited:
  - ECFC (IMF forecasts) and ECTR (IMF trade data)
  - EA (an index's earnings season) and EEG/EM (estimate history and trends)
  - RELS, and CTM/CT (futures contract months)
  - CACT (corporate actions across stocks) and FXCA (currency converter)
  - WCR and WECO
  - INSD (SEC Form 4) and OVDV (option implied volatility surface)
  - PSRT/PD/HLDR (a manager's 13F; HOLDINGS shows a company's own)
- Supply chain (SPLC): more coverage, how recent each relation is, classifier accuracy.
- Blank "--" fields: fill each from a real source or say why it is blank.
- The watchlist and favourites in the TOPMOVERS layout (low priority).
- Nasdaq and NYSE Arca plan a night session (21:00 to 04:00 New York, Sunday to Friday) from 6 December 2026, subject to industry readiness. Once it has started, add it to the watchlist's session line (`usSession` in `src/data/exchanges.ts`).

## Done, on the branch, not released yet

- Item 6, 13F portfolios of companies (`fa93936`, chart fix `5b47a39`):
  - HOLDINGS (also `13F`) sits beside HOLDERS under Company Analysis in a stock's menu. It shows what the company itself owns from its 13F filings on the SEC: each holding's shares, value at the quarter's end, share of the portfolio and the change since the quarter before (new, added, reduced, unchanged, sold out).
  - Beside the filing it shows today's price and value and the change since the quarter's end, with each figure labelled filing or today. Tabs give a map sized by value and the holdings sold out, and there is a chart of the portfolio's value by quarter, any earlier quarter and a CSV export.
  - Tickers come from OpenFIGI with your key.
  - Checked live: NVIDIA, Berkshire, JPMorgan and Apple on screen. The line totals match the filing's own total for nine companies, and NVIDIA's quarter-end prices match the 30 June closes to the cent.
  - Found while checking: JPMorgan filed an amendment marked "new holdings" that repeats its whole report. The app reads it as a restatement and says so, instead of counting every holding twice.
  - Apple files no 13F, and the screen says why.
  - Limits: a 13F is filed up to 45 days after the quarter. It leaves out cash, short positions and shares listed only outside the US. HedgeFollow's "average buy price" is an estimate and is not shown.
- Item 5, your own layouts (`58df78d`):
  - LAYOUTS builds one in three steps: how the rows look (up to 4 rows, 4 tiles in a row, 6 in all), a screen per tile, a name.
  - Each row keeps its own tile widths. Dragging the lines sizes the tiles, and the layout comes back exactly as saved.
  - After changes, a dot on LAYOUTS ▾ and "Save changes to …" offer to save them.
- Item 4, window buttons in the tab bar (`3d2d6a0`):
  - The white title bar is gone. Minimise, maximise and close sit at the right end of the dark tab bar, behind a grey line no tab passes, even with 12 tabs or a narrow window.
  - The bar drags the window, and a double click on its empty part maximises it.
  - Checked on Linux; please look at it on Windows.
- Item 3, the watchlist's live session (`440a174`):
  - A line above the list says which session US stocks are in now: pre-market, regular, after hours or closed (night, weekend or holiday). It gives the time to the next change and names the column to read, which is marked LIVE. It also says whether the list's other markets are open.
  - Hours are from Nasdaq; on early-close days after hours ends at 17:00 (NYSE Group's calendar).
  - Your screenshot's 0.00% after-hours figure was real: Yahoo's chart shows APLD's last after-hours trade on Friday at 18.25, the close.
- Item 2, corporate events (`ca6b4e9`):
  - EVENTS opens on the week's most relevant releases, Monday to Friday, before the open and after the close. It shows the 10 most traded companies of each (dollars traded in the latest session, from Nasdaq's stock list), with share classes counted once. Against an earnings site's list for the week of 26 October, 34 of its 45 companies are among ours, and 2 of the others aren't listed in the US.
  - The list of every report starts from $50B.
  - Every list opens on the latest trading day. Showing earlier days adds them above it without moving the view.
- Item 1, wrong numbers in estimates (Codex's seventh fix, checked live with your keys):
  - `41db98f` FMP never gave a company's earnings history: the app asked for 20 reports and the free plan refuses more than 5.
  - `8b60de7` FMP's revenue estimates, in dollars, could sit beside revenue reported in another currency.
  - `fe6937d` Finnhub answers for a foreign company's home listing were read as the US listing's: TSMC's figures in Taiwan dollars (a market value of 61.8 trillion, an EPS "surprise" of +409%), ASML's in euros. They are now left out, and the screen says why.
- `c679c7e` WHATSNEW: the version and release notes inside the app.
- `fd74386`, `947432e`, `7fc9d96`, `6a12a50`, `2b0fe97` Data fixes: CoinGecko, TipRanks, BLS and Eurostat, stale marks, IEX price history.
- `845e5f8` Browser practice mode: markets closed at the weekend show Friday's finished session.
- `79741bc` PORTFOLIO: several portfolios as tabs.

## Released

- 2.24.0 on 23 October 2026 (`docs/release-v2.24.0.md`).
