# To-do list

Updated 25 October 2026. This is the one list of what comes next for Armin Terminal. When an item is finished it moves to "Done" with the commit that did it. Work happens on the branch `claude/market-events-v2.16.0-id814n`.

## Next, in this order

Accuracy first, then the screens you use every day, then new screens, then the data-source review and the comparison with Codex's video list.

### 3. Watchlist: what is live right now, from your feedback item 7

You asked: make it obvious whether you are looking at the regular market, pre-market or after-hours.

Today:
- The watchlist has Pre-mkt and After hrs columns.
- A Session column exists but is off by default.
- On a weekend, prices are labelled STALE (APLD's quote line in your screenshot).
- Your Saturday screenshot shows After hrs equal to the closing price with 0.00%.

Plan:
- A clear line above the list, for example "US market closed (weekend) · pre-market opens Monday".
- Highlight the column that is live now.
- Show each non-US listing's own market state.
- Check against the source whether a 0.00% after-hours figure is a real after-hours price or a fill-in. This needs Yahoo, which refuses this cloud computer, so it gets checked on your Windows machine.

### 4. Window buttons in the tab bar, from your feedback item 5

You asked: put minimise, maximise and close in the tab bar, behind a vertical line the tabs can never cover, and remove the white Windows title bar. The icon and "HELP · Armin Terminal" at its left can go.

Today: the app uses the standard Windows title bar.

Plan:
- Windows' own buttons drawn inside the app's dark tab bar (Electron's title bar overlay).
- The tab bar drags the window, like a title bar.
- A divider keeps the tabs clear of the buttons.

### 5. Your own layouts, from your feedback item 4

You asked: build a clean layout yourself and name it. First choose how the rows look, then the screen in each tile (heat map, headlines, a stock...). After resizing the tiles, save it, so the layout comes back with the same tile sizes and screens every time. It should be easy to use, with saving always offered.

Today: LAYOUTS already saves the panels on screen under a name: the arrangement, each panel's screen, linked groups and divider positions. Saved layouts appear at the top of the LAYOUTS menu. There are 7 fixed arrangements, as in the layout picker.

Plan:
- A "New layout" helper: pick the rows and tiles (more arrangements than the 7), pick a screen per tile, drag the dividers, name it, save.
- Save changes to a layout you already have, from the LAYOUTS menu.
- Test that tile sizes come back exactly as saved.

### 6. 13F portfolios of companies, from your feedback item 1

You asked: a company's own 13F portfolio, for example NVIDIA's holdings as on HedgeFollow, in the terminal's style, placed in the Equity menu.

Today:
- HOLDERS and ANALYSTS show who owns a stock.
- Nothing shows what a company itself owns.

Plan:
- A new screen, listed under Company Analysis beside HOLDERS. For each holding it shows shares, value, % of the portfolio and the change since the previous filing (new, added, reduced, sold).
- A holdings map, built from the SEC's own 13F filings (free, official). Today's prices come from the app's usual sources.
- Each figure says whether it comes from the filing or from today's price.

Limits:
- A 13F shows holdings at the end of a quarter and is filed up to 45 days later.
- HedgeFollow's "average buy price" and "performance" are their own estimates; the filing does not contain them.

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
  - OpenFIGI (you now have a key), for matching the same company across exchanges and ADRs.
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
- Alpaca: the feedback document has two different key IDs, one in the text and one inside the link. Which one is current?
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
  - PSRT/PD/HLDR (13F; item 6 covers part of this)
- Supply chain (SPLC): more coverage, how recent each relation is, classifier accuracy.
- Blank "--" fields: fill each from a real source or say why it is blank.
- The watchlist and favourites in the TOPMOVERS layout (low priority).

## Done, on the branch, not released yet

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
