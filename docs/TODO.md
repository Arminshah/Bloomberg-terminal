# To-do list

Updated 25 October 2026. This is the one list of what comes next for Armin Terminal. When an item is finished it moves to "Done" with the commit that did it. Work happens on the branch `claude/market-events-v2.16.0-id814n`.

## Next, in this order

Accuracy first, then the screens you use every day, then new screens, then the data-source review and the comparison with Codex's video list.

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

Research pack (ChatGPT's improved version of 25 October, read in full):
- Useful: its evidence levels (a link, an official description, a chapter list, frames actually seen, behaviour checked in software) match this project's rule that nothing counts as checked from a title alone. Bloomberg's official chapter timestamps for three tutorials are a good start, and its checklist of financial tests is sound.
- Where it conflicts with how this project works:
  - It asks for six new documents (inventory, manifest, gap audit, feature matrix CSV, entitlements, access report). The project already keeps `docs/feature-matrix.md`, `docs/data-providers.md` (sources, terms, limits) and `docs/audit-v2.23.0-coverage.md`. I'll extend those rather than start parallel copies.
  - It suggests `research/video_evidence/` in the repository. Screenshots and transcripts of Bloomberg's videos are copyrighted and stay in a git-ignored folder (`reference/videos/`, like `reference/pdfs/`). Only my own short notes go into the repository.
- Already handled in the app, so not new work: IEX is labelled as one exchange, not the whole market; estimates come only from named providers; missing data is shown as missing.
- Its counts are right as far as I checked: 45 resource links plus 9 decorative images.

What works from this cloud session (checked 25 October, nothing installed):
- Python 3.13 and FFmpeg 6.1 are here; yt-dlp is not.
- YouTube answers this session with Google's "unusual traffic" page, so neither frames nor captions can be fetched from here. Getting around that would need your account's cookies, which I won't use.
- Bloomberg's official chapter pages load, so their timestamps are usable as documented evidence. bloomberg.com's Pro Tips pages refuse automated requests (403). Vimeo pages load, but its player refuses (401).
- The "Watch" plugin (bradautomates/claude-video) is not needed. Its own README says its installer does not run in Claude Code on the web, and its default "Gemini" engine uploads the video to Google, another AI provider, which you ruled out. Its local engine is the same FFmpeg and yt-dlp steps you can run yourself.

Limits:
- I cannot watch videos from here, so the frames must come from your PC (see "Waiting on you").
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
  - The video frames have to come from your Windows PC. Choose one route:
    1. By hand, within YouTube's terms: play the video in your browser, pause at each chapter time and take a screenshot (Windows key + Shift + S). Then open the video's "…" menu, choose "Show transcript" and copy the text into a .txt file.
    2. With tools, outside YouTube's terms (its terms forbid downloading videos without permission): `winget install --id yt-dlp.yt-dlp --exact`, `winget install --id Gyan.FFmpeg --exact` and `winget install --id DenoLand.Deno --exact`. Then in an empty folder run `yt-dlp --write-auto-subs --sub-langs en --skip-download https://www.youtube.com/watch?v=h0hYYIGryJ4` for the captions, and `yt-dlp -f "bv*[height<=1080]" -o video https://www.youtube.com/watch?v=h0hYYIGryJ4` followed by `ffmpeg -i video.webm -vf fps=1/2 -q:v 3 frame_%04d.jpg` for one frame every 2 seconds (frame n is at (n − 1) × 2 seconds).
  - Either way, zip the files and attach them here. I will keep them in `reference/videos/`, which I'll add to `.gitignore` first (a one-line change, with your OK), and I will say which frames each finding comes from.
- Senators' history: the Senate's site refuses automated reading and FMP's free plan has only the latest 25 trades, so CONGRESS builds senators' history from today on. For 6 or 12 months of senators' trades and their holdings, there are two options:
  - Create a free Eulerpool account and add its key. I'd test its figures against the Senate's own reports, which you can open, before connecting it.
  - An FMP plan that includes its senate-trades lists.

## Later

- Functions the reference documents name that the app lacks but could build from free data (55 codes, class a in `docs/audit-v2.23.0-coverage.md`). The most cited:
  - ECFC (IMF forecasts) and ECTR (IMF trade data)
  - EA (an index's earnings season) and EEG/EM (estimate history and trends)
  - RELS, and CTM/CT (futures contract months)
  - CACT (corporate actions across stocks) and FXCA (currency converter)
  - WCR and WECO
  - INSD (SEC Form 4) and OVDV (option implied volatility surface)
  - PSRT/PD/HLDR (a manager's 13F; HOLDINGS shows a company's own)
- CONGRESS: liabilities (Schedule D) for an assets-less-debts range; each member's committees (in the Clerk's member list) beside their trades.
- Supply chain (SPLC): more coverage, how recent each relation is, classifier accuracy.
- Blank "--" fields: fill each from a real source or say why it is blank.
- The watchlist and favourites in the TOPMOVERS layout (low priority).
- Nasdaq and NYSE Arca plan a night session (21:00 to 04:00 New York, Sunday to Friday) from 6 December 2026, subject to industry readiness. Once it has started, add it to the watchlist's session line (`usSession` in `src/data/exchanges.ts`).

## Done, on the branch, not released yet

- Item 7, congress trade tracker (`4221b3b`):
  - CONGRESS (also CONG) is in the Equity menu and in a stock's menu, with four tabs:
    - Members: representatives ranked by the assets in their latest annual report, shown as a range because the forms give ranges.
    - Trades: every trade disclosed in a period, from the latest week to 12 months, by either chamber.
    - Most Traded: the stocks bought, sold or traded most, by chamber, with your periods: latest week, 6 months, 12 months.
    - Most Owned: the stocks the most representatives own.
    - Opened on a stock, it lists that stock's trades.
  - The House is read from the members' own reports: the app reads the House Clerk's PDFs itself (checked live: 426 annual reports, and all 529 trade reports of the last 12 months). It caught something FMP misses: Cleo Fields bought NVIDIA three times on one day in three accounts, and FMP lists it once.
  - The Senate: its site refuses automated reading. Senators' trades therefore come from FMP's latest 25, which the app now asks for every 6 hours and keeps, so their history grows from today. Senators' holdings cannot be read, and the screen says so. See "Waiting on you" for a fuller source.
  - The screen shows the law's notice once (no commercial use, 5 U.S.C. § 13107(c)) before reading anything.
  - Limits: amounts are ranges by law. House reports filed on paper (about 1 in 10) are scans, linked only. Annual totals are assets, not net worth (debts are not subtracted).
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
