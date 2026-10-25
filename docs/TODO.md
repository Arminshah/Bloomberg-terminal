# To-do list

Updated 25 October 2026. This is the one list of what comes next for Armin Terminal. When an item is finished it moves to "Done" with the commit that did it. Work happens on the branch `claude/market-events-v2.16.0-id814n`.

## Next, in this order

Accuracy first, then the screens you use every day, then new screens, then the data-source review.

### 1. Check one possible wrong number from Codex's review

Codex said it fixed seven problems on its own copy and pushed nothing. Six of them are already fixed on the branch: CoinGecko calls per window, TipRanks per key, BLS figures, Eurostat labels, lost "stale" marks and missing days in IEX price history. The seventh, "currency mismatches in estimates", is not. I could not find it in the repository, and Codex's report (`api-review-v2.24.0.md`) is not in the repository either.

Plan: find out whether estimates can show in a different currency from the price they are compared with (for example a European stock's EPS in euros beside a price in dollars). Fix it with a test if so.

### 2. Corporate events (EVTS), from your feedback item 6

You asked:
- Opening the earlier earnings releases should not jump to the oldest one. The view should stay on the latest trading day (Friday 23/10/26), with older days above it.
- The default minimum company size should be $50B, not $5B.
- "Most anticipated earnings releases" should be the view EVTS opens on: one week, Monday to Friday, split into before the open and after the close, as on Earnings Whispers.

Today:
- Past days are folded into one line at the top of the list. "Show" opens them with the oldest day first.
- At the weekend, Friday counts as "past", so it is folded away too.
- The default is $5B (the choices are $5B, $10B, $50B, $200B and $500B).

Plan:
- On opening, show the latest trading day.
- Showing earlier days adds them above it without moving the view.
- Default to $50B.
- Add the weekly view and make it the default.

Limit: Earnings Whispers' "most anticipated" list is their own ranking, and I won't copy it. The weekly view will rank by something we can source and name, by default company size. Its heading will say how it is ranked.

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

## Waiting on you

- The browser practice mode (demo): keep it for testing, or delete it?
- Release 2.25.0: only when you say so.
- API keys: they have been pasted into chats and into the feedback document, so change them at each provider. Please don't paste keys into chats or documents again. Add them in the cloud environment's settings instead: the environment menu in the session's title bar, then Edit, then Network secrets (called API credentials in older versions of the app), or as environment variables. `.env.example` lists the names the app reads, such as `FINNHUB_API_KEY`. A new session picks them up.
- Alpaca: the feedback document has two different key IDs, one in the text and one inside the link. Which one is current?
- A pull request into `main` (it would contain the whole app): yes or no?

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

- `c679c7e` WHATSNEW: the version and release notes inside the app.
- `fd74386`, `947432e`, `7fc9d96`, `6a12a50`, `2b0fe97` Data fixes: CoinGecko, TipRanks, BLS and Eurostat, stale marks, IEX price history.
- `845e5f8` Browser practice mode: markets closed at the weekend show Friday's finished session.
- `79741bc` PORTFOLIO: several portfolios as tabs.

## Released

- 2.24.0 on 23 October 2026 (`docs/release-v2.24.0.md`).
