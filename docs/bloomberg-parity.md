# Bloomberg workflow audit — Armin Terminal 2.9.0

Reviewed 19 October 2026 against the registered commands, screen implementations, source adapters and calculation models. **Armin Terminal is not a 1:1 Bloomberg Terminal replacement.** This inventory covers all 72 commands in version 2.9.0; it is not an inventory of every function in Bloomberg's proprietary product. Matching a mnemonic or opening a screen does not establish functional, visual or dataset parity.

Bloomberg's [current product overview](https://professional.bloomberg.com/products/bloomberg-terminal/), [getting-started guide](https://data.bloomberglp.com/professional/sites/10/Getting-Started-Guide-for-Students-English.pdf) and public product documentation were accessible during the 19 October review. The [terminal fidelity audit](terminal-fidelity-audit.md) records primary references, presentation conventions, wider capability gaps and implementation priorities. No licensed Bloomberg session, reference outputs, complete function specification or pixel-by-pixel comparison was available. The comparisons below concern the named workflows and their known data/convention requirements, not a certified comparison to a particular Bloomberg software version. Browser demo figures are excluded from real-data coverage.

## Parity build (from 31 October 2026)

The owner's plan (`docs/parity-build-plan.md`) works from the private reference pack, cloned into the git-ignored `reference/visual/bloomberg-pack-2026-10-31/`. Frames are cited as in the plan: "TE01 03:11" is `08_video_frames/TE01_Getting_Started/frames/TE01_Getting_Started_03m11s.jpg`. Colours were sampled with Pillow as the median of a flat box; video colours hold to about ±10 per channel. Evidence levels: E3 for a frame looked at, E1 for written pages. Two things stay as the owner fixed them whatever a frame shows: the typeface (`CLAUDE.md`) and the watchlist (`tests/watchlist-guard.test.ts`, `e2e/watchlist-guard.spec.ts`, added before any change).

Text sizes are not changed. Where the frames show a larger size than the app's (the red bar's labels and the two quote lines are about a third larger than table text; the numbers before items are smaller), the app keeps its sizes and the case is listed here for the owner.

### M1.1 Red function bar (E3)

Evidence: TE01 03:11, TE01 01:41, TE04 04:55 (and the pack's 337-frame median). Sampled again for this change: TE01 03:11 bar `#880E1D`, amber security box `#FFA029`.

- Now: the bar is `#870E1F` (was `#A21826`, from 2017 screens). The numbered items sit on the bar's own red in white, with a 2px dark divider `#3F0209` between them (they had their own darker red boxes). The security box keeps the amber fill, its text near-black `#2D0000`. Page count, launch mark and title stay at the right.
- Not changed: the frames draw the bar's labels larger than body text and the "98)" numbers smaller and condensed; the app keeps its text sizes (owner's rule). The app has no red-bar dropdown yet, so the dropdown red `#840C1E` (TE02 04:43) has nothing to apply to; a dropdown built later takes it.
- Checked: `e2e/look.spec.ts` (bar colour, item background and divider).

### M1.2 Command line (E3)

Evidence: TE01 05:09 (typed "OF"), TE04 01:13 (typed "WEI"), TE01 01:53 (empty field), TE05 03:59. Sampled: cursor `#348EFF` on TE01 05:09 (the pack measures `#2E8AF6` over three videos).

- Now: a black field with a thin muted blue outline (`#6D96D4`) over about three quarters of the row, a small blue triangle at its left and a blue block cursor (`#2E8AF6`); typed text stays white IBM Plex Mono capitals. Empty, the line shows only the triangle and cursor: the "<HELP> for explanation." hint and the grey route text are gone (no 2024 frame shows either). What the panel runs stays available to screen readers as the line's description. Messages (errors, "Saved…") moved to a row under the command line, in white; errors keep a dark red ground so they stand out.
- Kept, with no counterpart in the frames: the GO and ? buttons at the right of the row (mouse users), until M1.4 decides where they sit.
- Not shown in any frame: what the hint row says outside a function's own mode, so it stays empty unless there is a message.
- Checked: `e2e/look.spec.ts` (outline, triangle, cursor colour and shape, no placeholder, width share, message row), `desktop-e2e/provider-ipc.spec.ts` (block cursor in Electron), `e2e/terminal.spec.ts` (the route is still named).

### M1.3 Two-line quote strip (E3)

Evidence: TE01 03:11 (AAPL DES), TE01 01:41 (GOOGL, whole window), TE04 04:55 (VOW FA), TE04 04:11 (RV loaded after typing).

- Now: every screen with a security shows the strip in the panel's chrome, above the red bar, as each window does in the frames. Line 1 shares the command line's row: ticker in white, the currency's symbol in grey, an arrow for the last tick (green up, red down), the last price and the day's net change coloured by the change's sign, today's line (the same day chart the watchlist draws, used as it is), then bid/ask. Clicking the row or typing turns it into the command field; running a command brings the quote back. Line 2 takes the hint row: signal bars, a yellow clock, then amber At, Vol, O, H, L, Val and Prev with white values, "d" after the time when the source says it is delayed. The 27 screens that drew their own one-line strip under the red bar no longer do.
- Kept from the app (no counterpart in the frames): the source's name, the pre- and after-market price, the source and receipt times (on hover over At) and the freshness and session badges, at the right of line 2. The signal bars and clock carry the freshness and session on hover.
- Labelled blank: Val (the session's traded value). None of the app's sources supplies it, so it shows "--" with the reason on hover rather than last price times volume.
- Not done, no data: the grey exchange letters after prices and the bid and ask sizes ("4x1"); the quotes carry neither. Not shown: the percentage change, which the frames' line 1 does not carry (the screens still show it, DES's Px/Chg 1D for one).
- Not changed: the frames draw both lines about a third larger than table text; the app keeps the price at its 16px and the rest at 12px.
- Unverified: what the signal bars mean; the small blue block some frames show at the row's left edge.
- Checked: `e2e/look.spec.ts` (labels, order, colours, position above the red bar, typing and back), the whole browser suite.

### M1.4 Toolbar row (E3)

Evidence: TE01 03:11, TE06 04:15 (zoomed), TE01 01:41 (whole window, right end). Sampled: toolbar `#1A1A1A` on TE01 03:11.

- Now: one row on `#1A1A1A` with plain light grey text and thin vertical rules, no boxes: back "<" and forward ">", the loaded security by name with its yellow key and "▾" ("APPLE INC Equity ▾"), the function's mnemonic "▾" ("DES ▾", "GPC ▾" for a candlestick chart), "Related Functions Menu" with a double chevron; at the right an envelope with "Message" (opens the app's MESSAGES), a window button and a yellow "?" with "▾" (function help, F1; M2.2 turns it into the help menu). The security and function are still the native lists, laid invisibly over their labels.
- Moved: back and forward from the command row; the panel's link group (a coloured list, shown by name) and command recall "↶" sit before Message. They have no counterpart in the frames and stay as features.
- Removed: the frame title above the toolbar ("1-ARMIN" with a green mnemonic badge), which the 2024 frames do not have (the tab strip is the title bar). Its maximise button is now the window button (same names for screen readers), and a double-click on the toolbar's empty part maximises and restores as the title did. The command row's "?" went; the toolbar's yellow "?▾" does the same.
- Kept: the panel's number at the left of the command row (blue when the panel is active) and GO at its right end. Neither is in the frames; both are the app's own.
- Unverified: what the window button's "▾" opens in the frames (not shown); here it maximises the panel.
- Checked: `e2e/look.spec.ts` (order of the items, colours, no boxes, maximise by button and by double-click, Message), the whole browser and desktop suites.

### M1.5 Autocomplete (E3)

Evidence: TE01 05:09 (typed "OF"), TE04 01:13 (typed "WEI"), TE02 05:47 and 06:01 (typed "G"). Sampled on TE01 05:09: panel `#1E1E1E`, lit row `#133C68` (the pack measures `#153B67`).

- Now: the list opens under the command row across the whole panel on `#1E1E1E`, with a thin grey line on top. Headings are white capitals (FUNCTIONS, SECURITIES). Function rows: the command in white and the title in amber, the typed letters bold in both; a circular history mark before functions used recently. Security rows: ticker and yellow key in white with the typed letters bold, the name in amber. "More Functions…" and a new "More Securities…" (opens the security finder with the text typed) in grey italics under the titles. The row the arrows light is dark blue `#153B67` and keeps its colours. No category column.
- The first row is lit only when it is what Enter runs anyway (WEI typed, WEI listed first). The frames light the first row whatever was typed; doing that here would make Enter run a suggestion instead of the command typed (with its security and arguments), so Enter keeps running what was typed unless a row was chosen with the arrows.
- Kept from the app: the favourites and recent securities listed before anything is typed, with their prices, and the hint line at the foot ("↑↓ select · Enter run…").
- Not done, no source: natural-language rows ("SEARCH WHO OWNS …") and "(Did You Mean?)" rows; the app's suggestions have neither. The amber italic descriptors after some security names (TE04 01:13) are the provider's own data.
- The watchlist's add-a-security list uses the same building blocks; the new look is limited to the command line, so the watchlist's list is unchanged.
- Checked: `e2e/look.spec.ts` (colours, bold letters, no category column, lit row, More Functions and More Securities), the whole browser suite.

### M1.6 Section strips and the Suggested Functions footer (E3)

Evidence: TE04 01:21 (WEI region strips), TE01 03:11 (DES box headers), TE01 01:53 (NSN footer), TE08 06:12 (FRD footer), the EEG short (`FFM_EEG` 0:15.4), and the OCR of every tutorial and short (`*_OCR_TEXT.txt`, "Suggested Functions"). Sampled: WEI strips `#222222` and `#212121`, header row `#232323`, DES box headers `#1E1E1E`, footer `#1A1A1A`.

- Now: region strips ("1) Americas") and section headers are flat `#222222` (were `#343434` strips and a light grey gradient on headers). The panel gets a footer on the screens a frame shows one on, FRD (FXFORWARD), ALLQ (DEALERQUOTES) and EEG (ESTIMATEGRAPH): "Suggested Functions" in amber in its own cell, then two related functions, each a bold white mnemonic and the app's own name for it in grey `#ACACAE`, the second at the right edge. A click runs it with the panel's security. The suggestions are kept in the function registry (`suggested`).
- Chosen: the footer's suggestions in the frames read like the provider's recommendations and change with the screen; here each is two related functions of the app (FRD: BTMM and OVML; ALLQ: YAS and SRCH; EEG: EEO and GP, as the EEG short shows), described by the app's own names, not the provider's wording.
- Not done: footers on screens the app lacks (NSN, MODL, FXIP, FXFC, FXFM, SDRV, WSL; M5) and on screens where the OCR shows a footer whose suggestions the app cannot run (ANR's BAS). The app had no blue banner to replace.
- Checked: `e2e/look.spec.ts` (strip and header colours, footer label, colours, order, position and click), `tests/suggested-functions.test.ts` (each suggestion exists), the whole browser suite.

### M1.7 Tab strip as the title bar (E3)

Evidence: TE01 03:11 (three tabs, light strip), TE01 01:53 (four tabs), TE01 01:41 (one tab, whole window), TE04 03:01 and 04:55 (dark strip). Sampled: strip `#D1CCD0` and active tab `#1A1A1A` on TE01 03:11, dark strip `#424242` on TE04 04:55.

- Now: the workspace tab bar, already the desktop window's title bar, is the light strip `#CFCDD0` with square tabs of equal width (they share the strip as they shrink). Each label is the screen's mnemonic in bold, then the security by name with its yellow key or the function's name ("DES APPLE INC Equity", "TOP Top News", "DS Document Search"), cut at the tab's edge without an ellipsis. The active tab is `#1A1A1A` with light text and its "×"; the others have dark grey text `#525054` and show their "×" only under the pointer, so a mouse can still close them. "+" follows the tabs. In the desktop app the window's own buttons are drawn in dark grey on the light strip.
- Kept from the app: renaming a tab (its name follows the mnemonic), dragging to reorder, middle-click to close, Ctrl+T, Ctrl+W, Ctrl+Shift+T, Ctrl+PageUp/PageDown and Ctrl+1 to 9.
- For the owner: the frames show the strip both light (`#CFCDD0`) and dark (`#424242`) with no visible cause; the light one is built. Say if you prefer the dark one.
- Not changed: the mnemonic is set in small bold capitals in the frames; here it is bold at the tab's 12px (text sizes stay). Unverified and not built: the inward-arrows icon at the right of the strip (its action is not shown). "≡ Options" follows in M1.8.
- Checked: `e2e/look.spec.ts` (colours, label, bold mnemonic, square corners, clip, equal widths, × on the active tab and on hover), `e2e/terminal.spec.ts` (tabs follow the active screen, rename, close, reopen), the whole browser suite.

### M1.8 Options menu and window keys (E3 for the menu, E1 for the keys)

Evidence: TE01 02:27 (the WELC tips page: the Options menu with New Tab, New Window, Zoom "− 130% +", Best Fit Window Size, Reset Window Size & Zoom; Ctrl − and Ctrl = to zoom, Ctrl [ and Ctrl ] to cycle windows, Ctrl N for a new window, up to 16 windows), TE01 02:31 (two windows, each with the full chrome).

- Now: "≡ Options" sits at the right of the tab strip and opens a dark menu with amber items: New Tab; New Window (up to 16); Zoom with grey − and + boxes around the percentage in amber; Best Fit Window Size (the window takes the working area of its screen); Reset Window Size & Zoom (1600 by 1000, centred, 100%). In the desktop app Ctrl N opens a new window (Ctrl Shift N still does), Ctrl [ and Ctrl ] go to the previous and next window, Ctrl − and Ctrl = zoom by half a step (unchanged), and a 17th window is refused.
- In the browser demo the window items are greyed out: a web page cannot open or size a window of its own; the browser's zoom keys apply.
- Not done: dragging a tab out of the strip into a window of its own (the frames' transcript mentions it); the inward-arrows icon beside Options (its action is not shown).
- Checked: `e2e/look.spec.ts` (menu items, colours, greyed items in a browser, New Tab, Escape), `desktop-e2e/provider-ipc.spec.ts` (zoom in to 110% and reset to 100% on the real window, New Window opens a second window), the title-bar test.

### M1.9 Dialogs (E3)

Evidence: TE01 05:11 (the Log Off dialog: light grey title bar with a dark title and "×", dark body, the question in white and a second line in amber, buttons at the bottom right with the default one outlined in blue, the screen behind dimmed to near black).

- Now: a shared dialog (`src/components/Dialog.tsx`) in that form: title bar `#CECDCE`, body `#1B1A18`, grey buttons with white text, the default one outlined in blue and focused, Escape and "×" closing it, the whole window dimmed behind. The app had one place that asks before acting, the pre-trade compliance question on PORTFOLIO and its Transactions tab; it was a box inside the screen and is now this dialog ("Compliance Check", the exceptions in amber, "Add anyway" or "Record anyway" and Cancel, Cancel the default).
- The app has no other dialog; the unused `.modal` style went. The Yahoo cookie window is Yahoo's own page in a window of its own and stays as it is.
- Checked: `e2e/compliance.spec.ts` (role, title bar and body colours, dimming, Cancel focused, Escape cancels, Add anyway records), the whole browser suite.

### M1.10 Field dropdowns (E3)

Evidence: TE02 00:59 (GP's field list: grey codes, amber names), TE04 02:29 (IMAP's index box: "Suggested Indices/Funds", tickers white with the typed letters bold, names amber, "Browse..." and "Create Custom List..." in blue), TE02 01:55, TE07 01:45.

- Now: the choices of every amber field list (`sel-inp`, about a hundred across the screens) are amber on dark grey `#1E1E1E`, group headings white, the chosen one dark blue. The security pickers on screens (GP's compare box, COMP, ALRT, FAV and the worksheets) list tickers in white and names in amber on `#1E1E1E`, the lit row dark blue.
- The watchlist's add-a-security list is the owner's and keeps its look (yellow tickers); a browser test checks it.
- Not done: "Browse..." and "Create Custom List..." rows (no index browser or custom lists in these pickers yet); the field codes shown before names in GP's list (the provider's own codes). How the list draws depends on the system: Windows draws the native lists in these colours; some Linux desktops draw their own.
- Checked: `e2e/look.spec.ts` (option colours, picker colours, the watchlist's list unchanged), the whole browser suite.

### M1.11 Fixed-width pages for DES, EE, ANR and EQS (E3)

Evidence: TE01 01:41 (DES in a whole window: the red bar runs the full width, the page under it is centred with black margins of about 15 percent each side), and the left margins of EE, ANR and EQS in TE04 (06:27, 07:13, 03:01).

- Now: on DES, EE, ANR and EQS everything under the red bar keeps to a page 80em wide (960 pixels at the default 12px text, so it follows the text-size setting), centred, with the panel black on both sides. The red bar stays full width. A narrower panel shows the page at the panel's width, as before.
- Unverified: the page's exact width. The frames are zoomed differently and show no pixel scale; 80em gives DES's three columns the room its labels need and margins close to TE01 01:41's at 1600 pixels.
- Checked: `e2e/look.spec.ts` (each of the four: page at most 960px, equal margins over 10 percent, black, red bar full width; WEI unchanged), the whole browser suite.

### M2.1 Related Functions Menu overlay (E3)

Evidence: TE01 02:53 (AAPL, the full overlay), TE01 03:35 (opening over DES, a lit row), TE03 02:51 (a commodity future's groups).

- Now: "Related Functions Menu ⌄⌄" on the toolbar opens a panel over the left two thirds of the screen (`#1E1E1E`), from under the quote strip to the panel's foot, the screen still showing at the right. "<Cancel> X" sits at its top right; a home mark and a blue italic path ("Main Menu > Equities >") end in "Analyze APPLE INC Equity" in white italics. Two columns hold numbered headings in white with ">" and up to four functions each (grey number, white mnemonic, amber title); the numbers run through headings and functions and on from the first column into the second. A heading opens its whole group, with the path extended. A click, or a number and GO, runs the function and closes the overlay; Cancel, Escape or another screen close it. With no security loaded it lists the market sectors. The lit row is dark blue (TE01 03:35).
- The groups are the app's own security menus under the frames' group names (Company Overview, Company Analysis, Research & Estimates, Comparative Analytics, Charting & Reporting, Security Surveillance, Trade Analytics, Derivatives, then the app's Credit and Tools), titled with the app's names. Functions the app lacks (MFID, MODL, BICO, ALTD, TLTS, CMAP, IOIA, MDM, RANK, VENU, ESG) are not listed; the menu never offers a function that does nothing.
- Kept: MENU <GO> opens the full menu page; the MENU key (Alt+End, the key bar's MENU) still climbs from the security's menu to the sector's and the main menu.
- Unverified: what the small diagonal arrow beside some items means (not shown), so it is not drawn.
- Checked: `e2e/look.spec.ts` (path, numbering, colours, two columns, width, group drill-down, Cancel, 2 <GO>, Escape), `e2e/shell.spec.ts` (the MENU key climbs), the whole browser suite.

### M2.1 Right-click Related Functions window (E3)

Evidence: TE03 05:59 (a right-click on a commodity index: a small window titled "Related Functions", the security in white, its description in cyan, five numbered functions, "6) More Related Functions...", a Close button).

- Now: a right-click on a security link anywhere in the app (monitors, movers, tables) opens that window as a dialog: the security in white, its name in cyan, five functions in the frame's order (DES, HP, GIP, GP, then one for its asset class: FA for a stock, MEMB for an index, FRD for a currency, YAS for a bond, the commodity monitor, the futures monitor, the crypto monitor or the curve), "6) More Related Functions..." (the security's menu) and Close, with no "×" as in the frame. A click or a number key runs the line in the panel the right-click came from; Escape or Close shut it.
- Not in the watchlist: its tickers keep no right-click menu, as the owner fixed the watchlist.
- Unverified: which five functions the provider offers for a stock (the frame shows a commodity index); the app's choice follows the frame's order.
- Checked: `e2e/look.spec.ts` (title, no ×, six lines, cyan name, 1 runs DES on that security, Close, none in the watchlist), the whole browser suite.

### M2.2 Help menu and Live Help (E3)

Evidence: TE01 04:45 (the "?▾" menu over a dimmed DES), TE03 09:07 and TE07 05:11 (the Live Help window).

- Now: the toolbar's yellow "?▾" opens a dark menu under it while the screen behind dims. Its first row is on yellow `#FCE103` with dark text, "See What's New in DES", and lists the release-note lines about the panel's function (WHATSNEW now takes a function as well as a version). Then amber items: Help Page (the function's help, as F1), Live Help, and Recent Enhancements (the release notes). Escape or a click outside closes it.
- Live Help opens a window laid out as TE03 09:07: a badge and the desk's name, a greeting, a large amber box for the question, Start Chat, and questions to start from. Start Chat hands the question to the app's help desk (MESSAGES), which answers in the panel as it does from its own box. The badge, the desk's name and every sentence are the app's own; nothing of the provider's wording or artwork.
- Not built: "Take a Tour of ..." (the second yellow row; the app has no tours), Training Request and Training Videos and Events (the provider's own services).
- Kept: F1 opens the help page and F1 twice the help desk, as before (M2.3 reviews the keys).
- Checked: `e2e/look.spec.ts` (items, yellow row, amber items, dimming, What's New in DES, Help Page, Live Help's amber box, a question from the list, Start Chat and the desk's answer), `tests/whatsnew-function.test.ts`, the whole browser suite.

### M2.3 Keyboard (E1 and E3)

Evidence: `03_bloomberg_getting_started_and_keyboard/Getting_Started_Guide_for_Students_2017.pdf` p.2 (the whole keyboard drawn, keys labelled, with notes on Cancel, Help, Search, the sector keys, Menu and GO), `Bloomberg_Keyboard_5_Reference_Guide_2023.pdf` p.2 (the 2023 keyboard's right half: Quote Function, Message, IB, Menu, Print and Enter in green, F8 to F12 in yellow, the fraction keys in blue), `Bloomberg_Terminal_Quick_Start_2024.pdf` (HELP twice opens the help desk's chat). A PC keyboard has none of the special keys, so the app maps them to ordinary keys and to its key bar.

| Key on the terminal's keyboard | Colour | What it does there | On a PC keyboard in the app | Status |
| --- | --- | --- | --- | --- |
| Esc / Cancel | red | Leaves the current activity | Esc clears the command line, closes a list, menu or dialog; CANCEL on the key bar | Done |
| F1 Help | green | Once: the function's help page; twice: the help desk | F1 once: HELP for the function; twice: the Live Help window (since this change; before, the help desk screen) | Done |
| Search | green | Keyword search of everything | Plain words typed on the command line search (M2.4) | M2.4 |
| Cmnd History | green | Earlier commands | Ctrl+↑ / Ctrl+↓; HISTORY on the key bar; ↶ on the toolbar | Done |
| Codes & Favorites | white | Favourite codes | ★ FAV on the top bar, the favourites listed when the command line is clicked | Partial: no key of its own |
| News | green | News | NEWS on the key bar opens TOP | Done |
| Quote Line, Quote Function | green | A security's quote | The quote strip on every security screen; QUOTE (BQ) as a function | Partial: no key of its own |
| Message, IB | green | Mail and chat | Message on the toolbar opens MESSAGES (the app's help desk); no mail or chat network | Partial |
| Menu | green | The related functions menu | Alt+End and MENU on the key bar climb the menus; the toolbar's Related Functions Menu opens the overlay | Done |
| F2 to F12 | yellow | Govt, Corp, Mtge, M-Mkt, Muni, Pfd, Equity, Comdty, Index, Curncy, Port | The same function keys type the sector word; the key bar has them | Done |
| 1/2 to 1/64 | blue | Type a fraction in a bond price | None | Not built: no field takes fractions yet |
| Print | green | Print the screen | None | Not built |
| Pause / Log Off | red | Log off | None: the app has no log-in | Not applicable |
| End / Back | green | Back to the screen before | End on an empty command line or outside a field (since this change); Alt+←, Backspace on an empty line, BACK on the key bar | Done |
| Pg Up, Pg Dn | grey | Page back and forward | PgUp, PgDn; a number typed first moves that many pages; PG BK and PG FWD on the key bar | Done |
| Enter / GO | green | Run the command line | Enter; GO at the right of the command row and on the key bar; number and GO for a numbered item | Done |
| Alt / Badges | green | Not described in the sources | None | Unverified |
| Panel | blue | Next panel | Ctrl+Tab, Alt+1 to 6, PANEL on the key bar | Done |

- Checked: `e2e/shell.spec.ts` (F1 once the help page, twice Live Help, Esc closes it, End goes back), the whole browser suite.

### M2.4 Command grammar and plain-word search (E3)

Evidence: TE01 02:05 (a question typed on the command line), TE01 02:11 (the SEAR results page), TE04 02:53 (the "SEARCH <words>" suggestion), TE01 05:09 ("SEARCH OF" first in the list).

- Grammar, already in the app and unchanged: `<ticker> <yellow key> <function> <GO>`, the function first or last, the loaded security carried to the next function.
- Now: plain words or a question of two words or more typed on the command line run SEAR (Search Results, a new function, 140 in all). Words count as plain when they neither start nor end with a function and hold no market sector; a single word stays a command ("DES?" still opens DES's help, "apple" still lists Apple Inc first), and so does anything shaped like a command ("GP QZZX 1D", "ZZZZ CHART" with its error). The suggestions put "SEARCH <words>" first, the words bold, lit, so Enter runs it.
- SEAR: the toolbar reads "SEAR ▾"; the hint row says "<Pg Dn> for More Results, <Back> to Return" (functions can now carry a hint for that row); the question sits in an amber field on the red bar and can be edited there; tabs Top Results, Functions, Securities and News with their counts; sections of the app's own matches: functions (mnemonic, name, kind, description; one that needs a security opens for the security the words name), securities (ticker, name in amber, last and change) and headlines from the app's news (title, source and time, first line in amber). Rows are numbered; a number and GO opens one.
- Different from the frame: the provider's tabs Reference, FAQs and More, its fixed-income table and its documents are its own content; the app searches what it holds. The thumbs up and down are not built.
- Checked: `tests/plain-word-search.test.ts` (words or command, the meaningful words, function search, the suggestion row), `e2e/look.spec.ts` (suggestion, lit row, SEAR's toolbar, hint row, amber field, tabs, matches, a number runs a result, a question), the whole unit and browser suites.

### M2.5 New-tab page (E3)

Evidence: TE01 01:57 (a new tab: "New Tab" on the tab, the command line ready), TE01 02:27 (WELC on the toolbar; a dark page of tips, each a white title, an amber line, the keys in grey caps and a small picture).

- Now: "+" (and Ctrl+T) opens a tab whose first panel shows WELC, a new function (141 in all): "New Tab" on the tab, "WELC ▾" on the toolbar, and a page of the app's own tips in that layout (running a function, tabs, zoom, windows, panels, going back, related functions, help), each with its keys in grey caps and, where it applies, "In the desktop app". The tab keeps the default layout, the watchlist in panel 5; the first start of the app opens as before.
- Not built: the small pictures beside each tip (they would be screenshots of the provider's screens).
- Checked: `tests/workspace-tabs.test.ts` (a new tab opens on WELC in the default layout with the watchlist in panel 5 and is named "New Tab"), `e2e/look.spec.ts` (tab label, toolbar, tips, keys and colours), the whole unit and browser suites.

### M2.6 Codes and aliases

Evidence: the plan's Appendix A (every provider code the pack shows that the app covers, with the screen it opens) and Appendix B.

- Checked: every Appendix A code opens its screen (`tests/appendix-codes.test.ts`, 69 codes with SEAR and WELC). The one gap was BLP, the Launchpad's code, now the mnemonic of LAYOUTS (shown on the toolbar and tabs; LPAD and LLP still work). The header and toolbar show each screen's mnemonic.
- Not aliased on purpose: MSG (the provider's mail network: MESSAGES is the app's help desk, not mail) and FXFC (contributors' FX forecasts, licensed content). The rest of Appendix B are functions to build (M5) or the provider's own services.

### M3 DES, Profile page (E3)

Evidence: `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.13 (GOOG DES, January 2025, rendered at 400 dpi), TE01 01:41 and 03:11 (GOOGL and AAPL, 2023), TE01 01:45.

Inventory of the 2025 page, top to bottom: red bar with the security box, 98) Report, 99) Contact IR, "Page 1/5" and the title; tabs Profile, Issue Info, Ratios, Revenue & EPS, ESG (unnumbered, the active one light grey with black text); the name in cyan with the FIGI at the right; 6) BI Research Primer | BICO and the Classification; the description in amber ending "... More"; three columns: 8) Price Chart | GP with a right-hand axis, then Px/Chg 1D, 52 Wk H and L with dates, YTD Change/%, Mkt Cap, Shrs Out/Float, SI/% of Float, Days to Cover; 9) Estimates | EE (Date (E), P/E, Est P/E with its fiscal period, T12M EPS, Est EPS, Est PEG) and 12) Dividend | DVD (Ind Gross Yield, the last cash payment with its date, Multi-shares (EV)); 13) Corporate Info (14) the web address, the city, employees with their date), 15) Management | MGMT with 16) to 18) officers and their titles in grey, 12M Tot Ret and Beta vs the index without numbers, 21) Depositary Receipts (Active Receipts).

- Now: the tabs are drawn as above (unnumbered, active `#A19FA2` with black text, others `#464646`), with ESG added (its scores are licensed, so the page says so) and the app's Industry Info kept after it. The red bar counts the tabs ("Page 1/6": five as on the terminal plus Industry Info) and PgDn / PgUp turn them. 12M Tot Ret and Beta lost their numbers (18) runs on to 21)). 21) is Depositary Receipts, Active Receipts a labelled blank (no source lists them). The market value is written in billions from a billion up ("5,450.3B"). The app's own boxes moved off the page, not removed: Analyst Ratings and the demo's revenue by region to Revenue & EPS, the ownership breakdown to Issue Info (which lists the holders), Fiscal Year End to Issue Info (Exchange was already there).
- Kept from the app: the line under the red bar with the source of the figures (the owner's rule); "Next ex" in the dividend box; a typed number still opens a tab.
- Not done: 6) BI Research Primer (the provider's research), Multi-shares (EV) and the employees' date (no source gives them), the price chart's right-hand axis, 98) Report and 99) Contact IR.
- Checked: `e2e/terminal.spec.ts` (tab labels and colours, Page 1/6, PgDn and PgUp, no numbers on 12M Tot Ret and Beta, 21) Depositary Receipts, no Ownership or Analyst Ratings box), `tests/des-profile-format.test.ts`, the whole browser suite.

### M3 DES, Revenue & EPS page (E3)

Evidence: TE01 02:31 (GOOGL, page 4/5, recorded October 2023).

Inventory of the frame: 6) Comparable Revenue | EM and 7) Comparable Earnings Per Share | EM side by side, each a line of yearly figures over the quarters' bars (reported orange, estimates grey) and, under it, a table headed by the currency with six fiscal years as columns and FY, Q1 to Q4 as rows (revenue in billions with one decimal, EPS with three decimals and no leading zero below one); the line "(Fiscal Period: Reported, Estimated)"; then 8) Geo Seg | FA GEO and 9) Prod Seg | FA PROD, each listing the latest year's revenue by line in green bar cells and its 3-year growth.

- Now: the page opens with that layout. The figures are the app's own: reported revenue and diluted EPS from the statements, placed in their fiscal year and quarter by the company's fiscal year-end month (52- and 53-week years included); a year with nothing reported takes the analysts' consensus (Yahoo Finance, FMP or Finnhub), in white where reported figures are amber. Revenue reads "131.8B", EPS ".541" or "2.33". Geo Seg and Prod Seg come from the latest 10-K's XBRL (the desktop app, as FA SEG), the latest fiscal year's revenue by line with a green bar sized to the largest. 6) and 7) open EM, 8) and 9) open FA's segments.
- Different: the growth column is compound annual growth over the years the 10-K reports, two in most filings, labelled "2Yr Gr" rather than "3Yr Gr"; three years would need the 10-K before it. Quarters have no estimates in the app's sources except the next one, so quarterly bars are reported only. The browser demo has no 10-K, so the segment boxes say so.
- Kept below the terminal's layout, the app's own: next report and its estimate, the annual and quarterly statement lines with growth and net income, the reported earnings, the analysts' ratings and the demo's regions.
- Checked: `tests/fiscal-grid.test.ts` (fiscal year and quarter for September and December year ends and a 53-week year, reported and estimated cells, the number formats), `e2e/terminal.spec.ts` (headings, rows, columns, format, legend, segment boxes), the whole browser suite.

### M3 DES, Ratios page (E3, 2016)

Evidence: `04_university_guides/Scranton_Bloomberg_Training_Manual.pdf` p.28 (AAPL, page 3/5, 2016), the newest picture of this page in the pack. Its p.28 also shows page 4/5 as built above, with "3Yr Gr" and the legend in the same places.

Inventory: a top block (Fiscal Year End as month/year, Last Quarter End as month/year and quarter, Current/T12M with the currency) with links 7) Income Statements, 8) Balance Sheet, 9) Cash Flow to FA's pages; six boxes in two rows of three, each heading with a chart mark at its right: Issue Data, Per Share Data, Cash Flow Analysis, Growth Potential, Profitability and Structure, eight rows each (seven in Per Share Data), short labels in amber, values in white.

- Now: the page has that block, those boxes, rows and labels in that order. Links 7) to 9) open FA on I/S, B/S and C/F, also as 7, 8 or 9 and GO. CPS is cash from operations per share (the picture's 9.81 against EPS of 8.66 fits that, not cash per share).
- The app's own measures, marked so on hover because the provider publishes no definition: Cash Gen/Cash Reqd (cash from operations over capital spending plus dividends paid), Csh Dvd Cov (that less capital spending, over dividends), Eff IR (interest expense over debt), Cap 1Y Gr (growth of debt plus equity), ROC (operating income after the effective tax rate, over debt plus equity). Empl 1Y Gr is a labelled blank (no source gives last year's headcount).
- Kept: net margin, capital spending to sales and cash per share, named in the note under the boxes.
- Unverified: the page's 2024 look (no newer picture); the chart marks open nothing.
- Checked: `tests/ratios-des-rows.test.ts` (each new measure by hand, blanks), `e2e/terminal.spec.ts` (top block, links, box order, Structure's rows), the whole browser suite.

### M3 FA (E3)

Evidence: TE04 04:55 and 04:59 (VOW GR Key Stats, 2023), TE04 05:19 (graph mode), `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.13 (GOOG I/S, January 2025), TE02 04:43 (a red bar dropdown, on GP).

Inventory: red bar with the security box, 96) Actions ▾, 97) Export ▾, 98) Settings and "Financial Analysis"; one line under it with the name in cyan, the accounting standard, a "?" box, BQL, Periods (2025) or Periodicity, Annuals ▾ and Cur ▾ in amber fields; numbered grey tabs 1) Key Stats to 10) Shared, the active one light grey with black text; a light grey band of views from 11) (Key Stats: Adj Highlights, GAAP Highlights, Company Model, Earnings, Enterprise Value, EV Ex Operating Leases, Multiples, Per Share; I/S in 2025: Adjusted, GAAP, As Reported, Reconciliation, SBC & Amort, Adj %, GAAP %), the chosen one blue; a grid with "In Millions of … except Per Share" and "12 Months Ending" over the year columns, Current/LTM on grey (`#282828`), estimate years after it; a blue bar-chart icon on every line; lines and their figures amber, breakdowns ("- Cash & Equivalents") white, growth and margins grey and indented, estimates white; empty rows between Key Stats' groups; I/S lines carry their sign in the label and keep their figure's own ("- Cost of Revenue 45,583.0"); a footer with << < > >>, "Earnings: date | EVTS »" and "Download Models | MODL »". Graph mode: the lines with tick boxes at the left, grouped bars in orange, green, yellow and violet in the order ticked, estimate years dimmed (`#664E2A`, `#325831`), "FY 2019" to "Curr" and "FY 2023 Est" under them.

- Now: the red bar has 96) Actions ▾ (Graph Fundamentals, Earnings & Estimates, Corporate Events) and 97) Export ▾ (Copy to Clipboard, Download as CSV) as dark red dropdowns, and 98) Settings. The controls share the cyan company line. The tabs are numbered and grey; each page has its band of views: Key Stats 11) GAAP Highlights, 12) Enterprise Value, 13) Multiples, 14) Per Share; I/S 11) GAAP, 12) GAAP %; B/S and C/F 11) GAAP; Ratios 11) Key Ratios. The grid's colours, the grey Current/LTM column, the empty rows, the icons (outside the indent) and the column lines follow the frame; I/S and C/F lines are written positive with the sign in the label. A line's icon opens graph mode with that line ticked; Table goes back. The footer's links are white with Earnings & Estimates | EE » in MODL's place.
- Segments (PT_FA_business_drivers 0:17.0: "Segments Business | Location", "Group By Measure | Segment", a measure row such as "▾ Revenue" with its total, each line amber with a grey "% of Total" row under it to two decimals, lines within a line indented and folded by ▸/▾, years oldest first over "12 Months Ending"): built as that. The share is of the company's own total, so segment profit can pass 100% as the frame's 122.61% does. Group By Segment puts each segment's revenue and operating income together. Kept from the app: the chart of the segments' revenue (now starting at zero with one label per fiscal year), the YoY column, the "Lines above, added" check row and the notes naming the 10-K. Not done: View (the frame's Sankey chart), Inactive Segments, measures the 10-K does not tag by segment (constant-currency growth, same-store sales, depreciation).
- The app's own, marked as such: the views' figures are the filed statements, so the views are called GAAP, the terminal's word for that basis. Enterprise Value adds EV / Revenue, EV / EBITDA and EV / EBIT; Multiples are the market value at each period's end over that period's net income to common, equity, revenue and EBITDA, and dividends paid and free cash flow over it; Per Share divides by the period's diluted shares. GAAP % is each I/S money line over revenue. 98) Settings switches the app's estimate, YoY and Trend columns, all on by default.
- Not done: tabs 7) Addl to 10) Shared, the accounting standard and its "?" box, BQL, the adjusted views (Adj Highlights, Adjusted, Reconciliation, SBC & Amort, Adj %), Company Model, Earnings, EV Ex Operating Leases, MODL (to be built in M5), the drill-down from a figure to its filings (TE04 05:31), the graph's Track and Annotate.
- Different: the graph's legend is a row above the chart, not a box inside it. The red bar's "Page 1/2" when the grid is taller than the panel is the app's paging, shown on every screen.
- Checked: `e2e/terminal.spec.ts` (tab and view labels, the active tab's colours, line colours, empty rows, Multiples, GAAP %, both dropdowns and Escape, graph mode ticking a second line and Table, Settings turning Trend off and on), `tests/fa-graph-colours.test.ts`, `desktop-e2e/provider-ipc.spec.ts` (Segments: the measure row's total, Americas' 42.86% share, Products' lines within it, Group By Segment, Location), the whole browser and desktop suites.

### M3 EE (E3)

Evidence: TE04 06:27, 06:33 and 06:45 (VOW GR, 2023).

Inventory: red bar with the security box, Alert and 98) Contact IR; one line with the name in cyan, Periodicity and an amber Annuals ▾, Source and the consensus's name, Cur and the currency; three boxes, each heading white with "| mnemonic »": 1) Earnings History | ERN (Next Announcement with (C), Prior Announcement, Avg/Implied 1 Day Move as two percentages), 2) Consensus Overview | EEO (Trailing 12M P/E, Forward 12M P/E, Est. LTG (EPS)), 3) Analyst Coverage | ANR (Buy/Hold/Sell, Current Price, Target Price), labels amber and values white; 4) Company Financials | MODL with tabs 21) Current Period Overview (Yr/23) in blue and 22) Prior Period Analysis (Yr/22) in grey over a table Measure, Yr/23 Est, 4Wk Chg (green or red), YoY Gr, Growth vs Peers, Past Surprise ("Beat 6 of 8" in amber), rows 11) EPS, Adj+ to 16) EBITDA with grey numbers and amber labels, the first row selected in dark blue; then 5) Earnings Trends | EM (blue estimate bars beside orange actual ones, by year), 6) the provider's research | BI (a headline in white over text in amber), 7) Earnings Estimates Graph | EEG (the price in white, the year's estimate in red).

- Now: that layout. The page opens on annual figures; Periodicity Quarterlies gives the app's quarterly view in the same table (21) the quarter to come, 22) the last report against its estimate). Annual 21) is the fiscal year under way: EPS from Yahoo Finance's consensus on its stated basis with its 4Wk Chg (today's consensus against the one 30 days before) and its growth, revenue, net income, operating profit and EBITDA from the annual feeds as EEO reads them, revenue's growth on the last filed year, Past Surprise as "Beat n of m" over the last eight reports. Annual 22) is the last fiscal year from the statements with its growth. Rows are numbered 11) to 16) and select with a click or their number; 21) to 23) switch the tabs. Est. LTG (EPS) is Yahoo's next-five-years growth. 5) draws estimate and actual EPS as blue and orange bars, by year or by quarter. 7) draws the price over the last 90 days with the period's consensus at Yahoo's five readings.
- The app's own: 23) Next Period (the next fiscal year, keeping the next year's EPS growth that box 2 showed before), the Analysts column, the line under the red bar naming the figures' source, the evidence line and the note. Box 6 shows the company's newest story (headline white, summary amber, from the app's news feeds) and opens CN; the provider's research has no counterpart.
- Labelled blanks: the implied 1-day move (the app does not work it out from options), Growth vs Peers (no source gives the peers' estimates), the GAAP EPS consensus, 4Wk Chg for anything but EPS (no source keeps the money lines' history).
- Not done: Alert and 98) Contact IR on the red bar, MODL (box 4 opens FA until MODL is built in M5), the estimate graph's years of history (Yahoo keeps 90 days) and its revision markers.
- Checked: `tests/ee-company-financials.test.ts` (4Wk Chg, the long-term growth read and its blank), `e2e/reference-codes.spec.ts` (box titles and order, the tabs, the table's columns, the selected row, the demo's blanks, 22) from the statements), `desktop-e2e/provider-ipc.spec.ts` (the fixture's dates, moves, P/E, ratings, 23)'s NM, Quarterlies 22) and 21) with the same figures as before), the whole browser and desktop suites.

### M3 ANR (E3)

Evidence: TE04 07:13 (VOW GR, 2023).

Inventory: red bar with the security box and "Actions ▾", "Alert" and "Export" without numbers, "Analyst Recommendations" at the right; at the left the company in cyan, Consensus Rating, Buys, Holds and Sells with their shares (buys green, sells red) and counts, a blank line, 12M Tgt Px with its date, Last Price, Pricing Currency, Return Potential and LTM Return, labels amber; at the right "As of" with an amber date field, 6M 1Y 2Y 5Y Max with 2Y in blue, the ratings as stacked bars of 100% (buys `#01831E`, holds `#B9AE65`, sells `#9E142E`) behind the price in white and the 12M target in yellow, and under it a Price Spread (Tgt - Px) chart; then "Showing 17 of 20 sources" with "Recent News on Analyst Activity | NSE »" over a table numbered 1) on: Firm in amber, Analyst, Recommendation in its tone, Tgt Px, Date↓ (amber, the sort), 1 Yr Rtn, BARR, Rank and a chart icon.

- Now: the red bar has Actions ▾ (Retry analyst research and Open the provider screen, which stood as buttons above the page, then Earnings & Estimates and News on Analyst Activity) and Export (the firms table as CSV), both without numbers. The summary and chart sit side by side under the company in cyan, shares coloured with counts at the right. The chart has "As of" today's date, the ranges with the chosen one blue, the providers' monthly ratings as stacked bars of 100% in the frame's colours on the left scale, the price in white and the consensus target in yellow. The firms table follows the summary as in the frame, with the three ranking columns as labelled blanks. A chosen chip button is now white on `#0451B7` on every screen (it had lost its background and showed as a blank).
- Kept, below the terminal's part: price target detail, the ratings tally, the monthly snapshots, how targets moved, the rating actions, annual estimates, more research, TipRanks, and the research source availability (moved from the top to the foot).
- Not done: Alert, the target's date, the Price Spread chart (no source keeps the consensus target's history), the row tick boxes and chart icons, 1 Yr Rtn, BARR and Rank (the provider's own ranking of analysts; labelled blanks). The link to the analysts' news opens CN (the app has no NSE search on analyst actions).
- Checked: `desktop-e2e/provider-ipc.spec.ts` (the summary's lines and order, the currency, the ranges with 2Y chosen, Retry from Actions, the research tests), the whole browser and desktop suites.

### M3 RV (E3)

Evidence: TE04 04:11 (VOW GR, 2023).

Inventory: red bar with the security box, "Export ▾" and "Settings ▾" without numbers; Comp Source with an amber field and a pencil, Region "Global ▾", "Mkt Cap >" with an amber 0 and Curr; at the left a Segment and Revenue % table, "Whole Firm" 100% selected in blue, each segment with a grey bar; at the right a multiples chart "Premium to Whole Firm Comps | EQRV »" with a Metric field and 3M to 5Y; tabs Overview, Comp Sheets, ESG, Markets, EPS Preview, Ownership, Credit and Custom, unnumbered and grey; the peers table with Name, Mkt Cap, Last Px, Chg Pct 1D and 1M, Rev and EPS 1 Yr Gr, P/E, ROE and Dvd 12M Yld, an Average line first, the stock in cyan, peers numbered from 101); a note on accounting adjustments.

- Now: Export ▾ (Copy to Clipboard, Download as CSV) without a number; Comp Source (the app's peer source in an amber field), Region (Global or the stock's own country), Mkt Cap > (billions of dollars, the loaded stock always kept) and Curr on the company line, Region and Mkt Cap > filtering the peers; the tabs unnumbered and grey; the segment panel with Whole Firm and each business segment's share of the latest year's revenue from the 10-K (the desktop app; the browser says so) beside the app's comp range; the summary lines above the peers, as the frame's Average line.
- The app's own, kept: the comp range in the chart's place, Median, Peer average and the percentile line, Comp Sheets' three sheets, Markets.
- Not done: Settings ▾, the pencil to edit the peers, the multiples chart (no source gives the peers' forward P/E history), tabs ESG, EPS Preview, Ownership, Credit and Custom, other currencies.
- Checked: `e2e/reference-codes.spec.ts` (columns and order, pinning as 100) and 101), the segment panel's Whole Firm, the unnumbered tab, the Export dropdown, Mkt Cap > leaving one row and restoring them, the Median and percentile tests), the whole browser and desktop suites.

### M3 EQS (E3)

Evidence: TE04 03:01 (2023).

Inventory: the hint row "1 <GO> for Results, <Back> to Return"; red bar "Formula", "Actions ▾" and "Backtest" without numbers; at the left "My Recent Screens" (10) Last Unsaved Screen, the saved screens from 11), 20) All Saved Screens) and "Popular Screens" (21) on), each under a grey strip, entries amber and the fixed ones white; at the right "As Of" with an amber date, "Screening Criteria" with categories 31) to 36) in three columns, "Add Criteria" with a full-width amber field and "3) Fields", "Selected Screening Criteria" with a Matches column: Security Universe and its count, then 51) to 55) each with a drag handle, its count in amber and a red remove mark, "56) Add screening criteria"; at the bottom right "1) See Results | WATC »". The results open on a page of their own.

- Now: that layout, with the app's own presets as the popular screens, its six field categories as 31) to 36) (each adds a criterion on its first field), Add Criteria taking a typed field name (Enter adds it) and 3) Fields listing every field by category, the universe chooser on the Security Universe line, the criteria numbered from 51) across the groups with their matches and a red ⊗, the next number adding one. 1) See Results shows the match count and opens the results on their own page; Back (End, the BACK key, the toolbar's arrow, Backspace on an empty line) returns to the criteria. 10) Last Unsaved Screen brings back the screen being built before a saved one was opened. Actions ▾ holds See Results, Reset and the results' Copy and Download.
- Kept from the app: OR groups, ranks (top or bottom N), periods, the missing-value rule, excluded industries, saving and deleting by name, the FTSE 100 paper view with its Results and Overview, the logic line and the sources note.
- Not done: Formula, Backtest, the drag handles (▲▼ move a criterion instead), "More Screens", WATC (results open on EQS's own page until WATC is built in M5), the As Of date as a choice (the screen runs on today's figures).
- Checked: `e2e/reference-codes.spec.ts` (hint, strips, categories, counts against Matches, the results page with as many rows as matches, Back, a typed field added as 2.2, ranks and periods on the results page), `desktop-e2e/provider-ipc.spec.ts` (Nasdaq's list, the FTSE 100 paper screen and its refusal case, through the results page), the whole browser and desktop suites.

### M3 WEI (E3)

Evidence: TE04 01:21 (2023), TE06 04:15 (zoomed chrome).

Inventory: hint row "LLP <GO> to Open in Launchpad"; red bar "News ▾" and "Settings ▾" without numbers; an amber "Standard ▾", tick boxes Movers, Volatility, Ratios, Futures and Δ AVAT (blue when ticked), "10D ▾", an amber "%Chg 3M ▾" and "USD ▾"; columns Index, 2Day, Value, Net Chg, a change bar, %Chg, Time, Adv/Dcl, 10D Vol, 30D Vol and more; region strips 1) Americas, 2) EMEA, 3) Asia/Pacific; rows numbered 11), 21), 31) with the name amber, the bar green or red, the volatility figures amber.

- Now: News ▾ (Top News, World Equity Index Futures) and Settings ▾ (copy and download the table) without numbers; Movers (the change bar, now before %Chg as in the frame), Volatility (10D Vol and 30D Vol in amber), Futures, and the period of the extra change column (1M, 3M as the frame, 6M, YTD, 1Y) with its currency. 10D and 30D Vol are the sample standard deviation of the daily log returns over the last 10 or 30 completed sessions, annualised with 261 trading days (the provider's daily convention in PORT; its WEI fields' own convention is not in the pack and no public page states it, so this is unverified).
- Kept from the app: the intraday line (the frame's 2Day needs the day before's intraday prices, which no source gives), the currency the extra change is converted into, the freshness legend.
- Not done: Ratios and Δ AVAT (no source gives index ratios or average volume at this time of day), Adv/Dcl (needs each index's members), the LLP hint (the app has no Launchpad yet).
- Checked: `tests/wei-volatility.test.ts` (the volatility worked by hand, today's bar left out, too few closes), the measured-colours look test on WEI, the whole browser and desktop suites.

### M3 Tab names (E3)

Evidence: TE04 01:21 ("WEI World Equity Indices"), TE01 02:27 ("New Tab" on the new-tab page).

- Now: a tab is named after its screen even in the untouched default workspace; "New Tab" is only the new-tab page's name, as in the frames. Before, the first tab read "New Tab" over WEI until another screen was opened.
- Checked: `tests/workspace-tabs.test.ts`, the browser tests of tabs.

### M3 IMAP (E3)

Evidence: TE04 01:55 (DAX, 2023), TE04 02:29 (the security dropdown).

Inventory: red bar "Export" and "Settings ▾" without numbers; the index in an amber field, "Group by" Region or Sector as radio buttons, "Market Cap (USD)" with an amber "All ▾", a grey "Historical Performance" button; a blue breadcrumb "DAX > GICS"; grey tabs Pie Chart & Table (chosen), Table, Pie Chart; "DAX: Intraday Return by GICS Sector"; a sunburst with the index at the centre, the sectors around it and the members outside, green or red by the day's return, each sector labelled with its change; at the right "Name" over 1) All Securities and the sectors from 2) with ">".

- Already built before this pass (the desktop app, with the S&P 500, Nasdaq-100 and Dow members): the controls, the breadcrumb, the tabs, the sunburst and the numbered group list, plus the app's Heatmap tab and the group table's change and share-up columns.
- Now: Export is a dropdown without a number; the tabs are the grey ones of the frames; the title reads "Intraday Return by" as the frame's.
- Checked on live data in the desktop app (31 October 2026, closes of 30 October, `docs/parity-m3-imap-live.png`): INDU's All Securities line gives -1.09%, the index's own change on the quote line. The browser demo has no index memberships and shows the app's heat map with a note saying so.
- Not done: Settings ▾, the member labels on the outer ring.

### M3 GP (E3)

Evidence: TE02 00:59, 01:33, 01:55, 02:19, 03:15, 04:23, 04:27, 04:43, 04:45 (2024).

Inventory: red bar with the security box, "94) Suggested Charts ▾", "96) Actions ▾", "97) Edit ▾" and "Line Chart"; first row: two amber date boxes, an amber field box ("Last Px"), a period box ("1BF ▾"), "Local CCY ▾", "Mov Avgs" with a pencil, "Key Events"; second row: 1D, 3D, 1M, 6M, YTD, 1Y (blue when chosen), 5Y, Max, "Daily ▼", a blue chart-type button and "Table", at the right "+ Related Data ▾" (Index & Sector, Peers), an amber "Add Data" field, "«" and "Edit Chart" with a pencil; a navy mountain chart with the axis at the right.

- Now: 94) Suggested Charts ▾ (Price and Volume, Moving Averages, Bollinger Bands, RSI, MACD, against the market's main index), 96) Actions ▾ (Table, the intraday or daily chart, copy and export of the chart's data) and 97) Edit ▾ (Securities & Studies, Compare Returns, the chart styles) as dropdowns; the first row with the range boxes, Last Px and Local CCY in amber, Mov Avgs (the 50- and 200-day averages) and Key Events; the second row with the periods as plain buttons (the chosen one blue, their numbers still working with GO), Daily ▼, the chart type, Table, + Related Data ▾ (the market's main index and the stock's peers, added as lines), Add Data (the comparison field) and Edit Chart, which opens the studies.
- The owner's answer (31 October): whatever is closest to the terminal. So the studies sit in Edit Chart's side panel at the right of the chart, as TE02 04:43 draws it: an amber "Browse Data, Studies, Events, etc" field that narrows the studies offered, Normalize (ticked while lines are compared), a tree of the charted securities with a tick box, colour swatch and name for each line (Last Price, each study, Volume, RSI, MACD), and a red ⊗ that takes a compared security off the chart; the studies not drawn are listed under it to tick. A chart opened by a study (RSI, MACD, BOLL) opens the panel with it ticked (`docs/parity-m3-gp-edit.png`).
- Kept from the app: the 3M and 2Y periods, Line, Mountain, Candle and Bar as visible buttons, the readout line.
- Not done: 3D (the app keeps one day of intraday prices), the field box as a choice (other fields such as P/E history need sources the app lacks), the period box (1BF), G's saved graphs, Track, Annotate, News and Zoom on the chart.
- Checked: `e2e/terminal.spec.ts` (periods by number and button, typed dates leaving none chosen, the three dropdowns, Edit Chart and its studies, the RSI chart), the look tests, live data in the desktop app (`docs/parity-m3-gp-live.png`), the whole browser and desktop suites.

### M3 YAS (E3) and M4 YAS measures

Evidence: TE07 03:47 (IBM 5.3 02/05/54, 2024); `METHODOLOGY.md` section 14 with its worked checks (CTX, GKN, Ford).

Inventory: red bar with the bond in an amber box and "Settings ▾", a green "95) Buy"; bid/ask price and yield, "BMRK @ 15:02", Notes; tabs 1) Yield & Spread, 2) Graphs, 3) Pricing, 4) Description, 5) Custom, 6) Calls; Spread (bp) vs a benchmark, Price, Yield with Wst and S/A, Wkout @ price, Consensus Yld, Settle; Risk (M.Dur or Dur, Risk, Convexity, DV 01 on 1MM, Benchmark Risk, Risk Hedge, Proceeds Hedge); Spreads 11) G-Sprd, 12) I-Sprd, 13) Basis, 14) Z-Sprd, 15) ASW, 16) OAS; Yield Calculations (Street Convention, Equiv 1/Yr, Mmkt (Act/360), True Yield, Current Yield); Invoice (Face, Principal, Accrued (97 Days), Total (USD)); After Tax (Inc 40.800 % CG 23.800 %); Issue Price.

- Now: the page has that layout, with the calculator's terms in a row above it (the app has no bond reference data, so the terms are typed). Settings ▾ holds the example and the export; the tabs are numbered and grey; the call schedule is on 6) Calls, the price/yield chart and scenarios on 2) Graphs, the cash flows on 3) Pricing, the full figures on 4) Description.
- Checked against the frame's own bond (`tests/yas-measures.test.ts`, and on screen with its figures typed in): Spread 105.07 against a benchmark yield of 4.489521 (the frame's 105.07), yield 5.540202, 97 accrued days, Equiv 1/Yr 5.616937, current yield 5.490, M.Dur 14.31, Risk 14.0 and convexity 3.11 to the digits the frame shows, after-tax yield 3.306142 against 3.306384 (0.02 bp; the provider's treatment of the accrued interest differs slightly). Also the pack's CTX (yield 10.305, 89 days, Risk 4.566) and GKN (5.860 on the semi-annual basis, Risk 5.795) screens.
- Measures added (M4 item 1, `src/finance/yas.ts`): yields restated on a quoting basis (S/A by default), modified duration and Risk = modified × full / 100 on that basis, convexity / 100, Equiv at 1, 2, 4 or 12 a year, current yield, the invoice, the money-market yield on Act/360 in the last coupon period (empty otherwise, as the frame's box), the after-tax yield.
- Labelled blanks: G-Sprd (needs the government curve interpolated at maturity), I-Sprd and ASW (no swap curve source), Basis, True Yield (no holiday calendar), the benchmark's risk and hedges (needs the benchmark bond's terms), OAS for a callable bond (needs a rate tree; for a bullet it is the Z-spread).
- Not done: 95) Buy, Notes, Consensus Yld, 5) Custom, Issue Price, bid/ask lines (no bond quotes).

### M3 DS: Ask a Question (E3)

Evidence: FFM_DS_TA 0:30.7 and 0:35.5 (an earnings call transcript open on DS, 2025).

Inventory: a document with "Document Actions ▾", Comment, Highlight ▾ and zoom; at its left "Ask a Question" with an amber field, a grey line explaining what to ask, "Suggestions" in amber over grey buttons; once asked, a one-line answer over bullet points in grey boxes, each linked to the passage it comes from.

- Now: an opened filing on DS (a result's matching sentences) has that panel: the amber field, the explanation, "Suggestions" with five questions in the app's own words, then the answer and each point over the filing's own words in quotes. The answer is Google Gemini's (the owner's key, `GEMINI_API_KEY`, with the switch `GEMINI_DOCS_ENABLED` on PROVIDERS; gemini-3-flash-preview, then gemini-3.1-flash-lite), from the filing's text read on sec.gov by the desktop app.
- Kept to the filing (`electron/gemini.cjs`): each point must quote the filing word for word (case, curly quotes, dashes and spacing aside; a quote shortened with "…" counts only when each piece is in the filing in order), and every figure in a point must be in its quote; the answer sentence is dropped if it carries a figure the filing does not contain. What is dropped is counted under the answer, and the panel names Gemini and its model. The question and the filing go to Google; on the free tier Google may use them (PROVIDERS says so). The app stops at 200 requests a day.
- Checked: `tests/gemini-grounding.test.ts` (quotes found or not, figures, the answer's figures, shortened quotes in and out of order, the question limits, the key kept out of errors); live in the desktop app on Apple's 10-K with "What risks does it name?" (`docs/parity-m3-ds-live.png`): five points kept over their quotes, one left out.
- Not done: the document viewer itself (the filing opens on sec.gov), Document Actions, Comment, Highlight, and the links from a point to its place in the document.

## Changes after 2.12.0

Paging with `Page n/m` and typed page counts, numbered monitor rows and headlines that open with GO, HELP on a typed mnemonic, mnemonics in autocomplete, the aliases ERN, CF (typed only), NSE, EQRV, OWN, QR, HVG, PDF, GPO and GPC, and the new `EXCHANGES` (`EXCH`) screen. Details and remaining differences: [terminal-fidelity-v2.13.md](terminal-fidelity-v2.13.md).

| Command | Comparable workflow | Working scope | Remaining gap |
| --- | --- | --- | --- |
| `EXCHANGES` | EXCH exchange information | Partial: five exchanges' regular sessions, status, early closes and next open/close from published rules and tables | No other exchanges, auctions, extended hours or unscheduled closures |

## Findings addressed in this release

- Colored security groups now connect compatible visible panels while retaining their functions and arguments. A linked watchlist publishes selections without disappearing; hidden/incompatible screens are preserved, back/forward propagates security changes, and saved layouts restore group choices through both entry points. The linked research preset supplies five connected panels. This is a local workflow, not Bloomberg Launchpad/BLP integration.
- Headers and command breadcrumbs can show familiar mnemonics (`DES`, `GP`, `FA`, `FLDS`) and `<GO>` cues while retaining canonical names. The preference is saved; either form still executes the same implementation.
- `FIELDS` / `FLDS` searches 29 defined local identity/quote/calculation/source fields, with values, units, definitions, source/freshness, explicit timestamp limits and filtered raw CSV. It is not Bloomberg's complete field catalogue, field contract or data API.
- Portfolio mark metadata is captured with the exact prices/FX used by risk and exports, avoiding newer-source/older-mark mismatches. CNY/CNH proxy conversion is explicit. Invalid/future source timestamps cannot establish real-time freshness.

## Earlier improvements retained

- `OPTIONS` / `OMON` previously showed only an unavailable screen. It now requests actual listed US equity contract snapshots using Alpaca's **indicative** feed, with calls/puts, expiry filters, provider IV/Greeks, separate quote/trade timestamps, partial pagination status and CSV. It does not supply real-time OPRA quotes, open interest, daily option volume, index options or adjusted deliverables.
- `OPTIONCALC` / `OVME` now supports European BSM and American Tian-lattice value/IV, early-exercise premium, manual tenor, grid diagnostics, bump Greeks and CSV. Ten independent QuantLib PDE references validate defined cases; continuous yields do not reproduce discrete cash-dividend conventions.
- `PORTFOLIO` now joins exact prior-date histories for every holding and FX currency, excludes intervals bridging missing sessions, reprices historical current-exposure shocks, computes empirical VaR/ES and additive signed risk contributions, and provides matched benchmark tracking error and per-position price/FX stress. This does not create a transaction ledger or realised track record.
- `CORRELATION` no longer displays a guaranteed diagonal 1 without sufficient variable data; removing the final security is safe and observation counts are corrected.
- `OPTIONSTRATEGY` / `OSA` adds up to twelve signed common-expiry option legs plus stock, premiums, aggregate European-model Greeks, exact piecewise-linear expiry breakevens and risk including unlimited tails, time/spot/volatility scenarios, five labelled examples and CSV.
- `BONDCALC` / `YAS` previously had “Spread” in its title without spread analytics. It now computes a manual matching-compounding benchmark G-spread and solves continuous ACT/365F Z-spread against an entered zero curve, with spread duration, Z01 and spread scenarios. It does not claim option-adjusted spread or obtain issue terms/market curves.

The Alpaca request and field schema was checked against its official SDK: [chain request](https://github.com/alpacahq/alpaca-py/blob/master/alpaca/data/requests.py#L442), [client endpoint](https://github.com/alpacahq/alpaca-py/blob/master/alpaca/data/historical/option.py#L203), [feed enum](https://github.com/alpacahq/alpaca-py/blob/master/alpaca/data/enums.py#L103), [snapshot fields](https://github.com/alpacahq/alpaca-py/blob/master/alpaca/data/models/snapshots.py#L89). Retrieved Git blob IDs: `87157fadad47f609a278cdb850832b8b2816442f`, `f2c4f0b4c149713bd569d7a1c469d6c6d3391c4e`, `952e287923a5ef728a122323a8877df16f4a5640`, `3f1ef66468aa5f88880956448ba272954cdb9eb1`. Keyed live access was not verified in this environment; the provider may refuse an account or dataset. No keys are bundled.

## Every registered command

“Partial” means a useful subset of a comparable professional workflow, not parity. “Model” means explicit calculations with the conventions in [calculators.md](calculators.md). “Local tool” does not imply equivalence to Bloomberg's service, integration or collaboration features. Data sources and delays are detailed in [feature-matrix.md](feature-matrix.md).

| Command | Comparable workflow | Working scope | Remaining gap |
| --- | --- | --- | --- |
| `PROFILE` | DES security description | Partial: asset-specific profile and fundamentals, float and short interest, source-labelled analyst consensus for US stocks | Global instrument master, identifiers, issue terms and vendor fields are incomplete; no BEst consensus |
| `FINANCIALS` | FA financial analysis | Partial: reported annual/quarterly statements and ratios | No Bloomberg-standardised global history, restatement database or complete line-item mapping |
| `ANALYSTS` | ANR analyst research | Partial: independent FMP sections, Finnhub/Yahoo/Nasdaq research fallbacks, links to the insider, short interest, holder, event and news screens (Equibles retired 28 October 2026), optional on-demand TipRanks consensus/actions | Account/issuer coverage and quota limits; no verified broker-target replacement, broker research documents or complete consensus universe |
| `EARNINGS` | ERN earnings history (EE until 27 October 2026) | Partial: reported EPS/revenue, close-to-close price reaction per report, Finnhub quarterly EPS comparisons and annual estimates | No full quarterly consensus history, estimate contributors or revisions surface |
| `EARNINGSSUMMARY` | EE earnings and estimates (seen on a July 2024 screenshot) | Partial: the page's boxes 1 to 5 and 7 from the other screens' figures | No research box, options-implied move or peer scorecard |
| `DIVIDENDS` | DVD dividend analysis | Partial: ex-date cash history with splits, derived yield and 5-year growth | Missing declaration/record/payment dates and comprehensive forecasts/actions |
| `HOLDERS` | HDS ownership | Partial: institution/fund filing snapshots | No complete ownership intelligence, beneficial ownership history or all asset classes |
| `MANAGEMENT` | MGMT management | Partial: officers, titles, ages and total pay as Yahoo's company profile lists them | No board, tenure, biographies, compensation breakdown or history |
| `PEERS` | RV relative valuation | Partial: multiples and profitability comparison | Local peer selection; no global comparison/template/data-field universe |
| `EVENTS` | EVTS corporate calendar | Partial: earnings/ex-dividend events for one company, the active watchlist, the portfolio's stocks or every stock in the app | No comprehensive corporate actions, conferences or transcript workflow |
| `FILINGS` | Company filing/document search | Partial: SEC submissions and XBRL reported figures | SEC only; no global document library, translations or transcripts |
| `CROSSCHECK` | Multiple-source data validation | Project tool: completed-session EOD price comparisons | Not an exchange reconciliation or Bloomberg data-quality service; keys/entitlements required |
| `FIELDS` | FLDS field search | Local tool: 29 current identity/quote/calculated/provenance fields, definitions, units, source times, status and CSV | No exhaustive Bloomberg field catalogue, identifiers, compatible field contracts, historical field requests or BDP/BDH/BDS/BQL API |
| `WACC` | Cost-of-capital analysis | Model: CAPM/debt weights from named inputs | No proprietary assumptions, capital structure database or full valuation suite |
| `FUNDCHART` | GF historical fundamentals | Partial: reported fundamentals and ratios over time | No arbitrary vendor-field charting, contributor estimates or full fiscal normalisation |
| `CHART` | GP historical chart | Partial: OHLC, studies, comparisons, pan/zoom | Smaller history/universe/study set; no Bloomberg chart templates or tick archive |
| `INTRADAY` | GIP intraday chart | Partial: supplied bars or observed IEX samples | No consolidated tick history; IEX mode has only observations since startup |
| `HISTORY` | HP historical prices | Partial: available daily history/table/export | No full vendor field/date/calendar/corporate-action selection |
| `RETURNS` | COMP comparison | Partial: rebased price returns | No comprehensive total-return/currency/hedging framework |
| `TOTALRETURN` | TRA total return | Partial: paid-dividend reinvestment and benchmarks | Some indices are price-only; no complete corporate-action treatment |
| `SPREAD` | HS relative history | Model: spreads/ratios and distribution statistics | Not a credit spread database or universal relative-value engine |
| `BETA` | BETA regression | Model: 2Y weekly (Friday-ending weeks) raw/adjusted beta, alpha, R² and standard error against the country's index, including BEL 20; daily/monthly and 6M-5Y selectable | Limited data history, benchmark and adjustment coverage; no licensed reference-output comparison |
| `VOLATILITY` | HVT volatility | Model: realised rolling volatility and percentiles | No market implied surface, skew/term structure or volatility cube |
| `HEADLINES` | Official/government announcements (`TOP` opens `MARKETNEWS`) | Partial: official central-bank/statistics/regulator announcements, also 4) Official on `MARKETNEWS` | No Bloomberg News wire or full-text newsroom/archive |
| `NEWS` | N news search | Partial: keyword/topic search of fetched announcements | No global licensed archive, advanced news classification or full-text search |
| `MYNEWS` | MYN personal news pages | Partial: pages of saved searches over the app's feeds and Google News | No licensed wire archive, provider topic codes or alert routing from a page |
| `MARKETNEWS` | TOP top news headlines | Partial: Finnhub/Marketaux/SEC/Euronext headlines and links, merged; `TOP` opens it | Provider coverage/quota limits; no Bloomberg editors' ranking of top stories or real-time news service |
| `COMPANYNEWS` | CN company news | Partial: ticker-tagged external headlines and sentiment; Yahoo headlines; a Euronext-listed company's press releases matched by issuer name | Limited lookback/tagging; Euronext's feed holds only its 10 latest releases; no transcripts or proprietary Bloomberg reporting |
| `MARKET` | WEI global index monitor | Partial: major index prices and currency-adjusted YTD | Coverage/freshness depend on public feeds; no exchange-wide terminal universe |
| `INDEXRANKING` | WEIS index rankings (name only in the 2020 Quick Start) | Partial: `MARKET`'s indices ranked by price return over 1D to 1Y, local or in one currency | Layout not documented; no total-return or index-family universe |
| `WORLDMAP` | WM world markets map (name only) | Partial: one main index per market on the app's own grid, coloured by return | Layout not documented; no geographic map artwork; 24 markets |
| `INDEXFUTURES` | WEIF index futures | Partial: US index futures and model fair value | No global futures/depth/settlement/roll coverage |
| `CONTRIB` | MOV index contribution | Partial: Dow point contribution; local-universe proxies elsewhere | No full licensed constituent/weight/history dataset for other indices |
| `HEATMAP` | IMAP market map | Partial: local-universe sector map | Not complete exchange/index membership; no global drill-down field catalogue |
| `MOVERS` | MOST market movers | Partial: local-universe rankings | Not exhaustive exchange-wide scanning; some volume/value measures are estimates |
| `SCREEN` | EQS equity screening | Partial: the app's stocks, or in the desktop app every US-listed stock in Nasdaq's list; AND and OR groups, a stated choice for missing values, saved screens | No universe beyond US listings; over the US list, ratios only for the app's own stocks; no expression language or point-in-time screening |
| `QUOTE` | BQ quote monitor | Partial: underlying quote, chart, stats, separate IEX box | No guaranteed consolidated real-time price, NBBO, full trade tape or market-wide volume |
| `TRADES` | TAS time and sales | Partial: aggregated source price/volume updates | These are not individual exchange prints; no conditions, venue audit or full tape |
| `DEPTH` | Depth of market | Partial: Kraken crypto book; BBO elsewhere | No stock/futures Level 2/order-by-order feed or execution |
| `VWAP` | VWAP analysis | Model: bar-based VWAP/TWAP and buckets | Not transaction-level exchange VWAP or an execution algorithm |
| `FXMATRIX` | FXC cross-currency monitor | Partial: derived cross rates | Not simultaneous dealer bid/ask crosses or an executable FX marketplace |
| `FXRANK` | WCRS currency ranking | Partial: supplied USD pair returns | No exhaustive currency universe or forward/hedged ranking |
| `CURRENCYRATES` | WCR world currency rates | Partial: every carried currency against a chosen base, by region and in a basket | Mid rates through the dollar; no dealer quotes, forwards or full currency universe |
| `CRYPTO` | Digital asset monitor | Partial: ten Kraken USD pairs and CoinGecko reference fields | One exchange, small universe; no consolidated liquidity, derivatives or custody |
| `FXFORWARD` | FRD forwards | Model: simple-rate CIP outrights/points and spot-settlement PV | No dealer quotes, cross-currency basis, calendars or full valuation-to-spot discounting |
| `FXOPTION` | OVML FX option analysis | Model: European Garman-Kohlhagen and manual scenarios | No observed smile/surface, premium-adjusted delta conventions, exotics or dealer liquidity |
| `BONDS` | WB bond-market monitor | Partial: selected official government par yields | No complete country/credit markets or tradable individual bond prices |
| `CURVE` | GC yield curves | Partial: selected official par-curve history | No full curve builder/bootstrap/instrument/contributor framework |
| `MONEYMARKET` | BTMM money markets | Partial: Fed/NYFed/bills/SOFR futures | No global cash/deposit/CD/CP instrument/dealer universe |
| `BONDCALC` | YAS yield/spread analysis | Model: regular bullet price/yield/risk, five day counts, manual or lagged settlement, G/Z-spread and scenarios | Settlement skips weekends only; no OAS, calls/puts, stubs, defaults, inflation/floating conventions or observed issue/dealer data |
| `RATEPROBS` | WIRP policy expectations | Model: Fed path inferred from futures | Fed only; not all central banks or a probability guarantee |
| `SWAPCALC` | SWPM swap valuation | Model: dual-curve forward-start common-frequency fixed/float | No past fixings, OIS compounding, calendars, leg-specific schedules, collateral/XVA or live dealer curves |
| `CENTRALBANKS` | CENB central-bank monitor | Partial: selected official rates/calendars | Limited countries; some calendar dates maintained manually |
| `RATEANALYSIS` | CBRT central bank rate analysis (name only) | Partial: each bank's moves over about four years, each with its meeting | Implied paths only for the Fed (`RATEPROBS`); eight banks |
| `ECBPORTAL`, `BOEPORTAL`, `BOJPORTAL` | ECB, BOE, BOJ bank portals (listed with FED) | Partial: policy rate and last move from each bank's data, next decision, overnight benchmark, announcements, pages | The BoJ guideline is in its statements, not the API; no balance sheets or speeches search |
| `BONDSEARCH` | SRCH fixed-income search | Unavailable for real bond datasets | Needs a connected issue master, ratings, outstanding amounts and permitted prices; browser model excluded |
| `DEBTPROFILE` | DDIS issuer debt | Unavailable for real issue-level debt | Needs issue/maturity/outstanding datasets; browser model excluded |
| `DEALERQUOTES` | ALLQ bond quote montage | Unavailable for dealer data | Needs licensed/contributed dealer quotes; browser dealers are fictional |
| `COMMODITIES` | GLCO commodity monitor | Partial: selected front futures | No global physical pricing, curves, inventories, shipping or exchange depth |
| `OILMARKET`, `NATURALGAS`, `METALS`, `AGRICULTURE` | OIL, GAS, MINE, AGS sector pages | Partial: the sector's front-month futures and relative measures with their year's range | No inventories (EIA key not set up), physical prices, shipping or seasonality |
| `MACRO` | Macro data dashboard | Partial: FRED levels and selected first-release vintages | Not a full economics database or point-in-time research platform |
| `RELEASES` | ECO economic calendar | Partial: FRED dates/actual/prior and bank decisions | No consensus survey, release-time coverage or global surprise monitoring |
| `ECONSTATS` | ECST world economics | Partial: selected countries/official statistics | Coverage/frequencies/revisions incomplete; Japan CPI not connected |
| `HOLIDAYS` | CDR market calendars | Partial: selected exchanges and early closes | No global settlement/calendar engine; some tables stop at 2027 and unscheduled closures are unknown |
| `OPTIONS` | OMON option monitor | Partial: Alpaca indicative US equity snapshots | No real-time OPRA, index options, open interest/daily volume, exercise/deliverable reference data or surface history |
| `OPTIONCALC` | OVME option valuation | Model: European/American value/IV, exercise premium, Greeks, grid diagnostics, scenarios and CSV | No exotics, discrete cash dividends, fitted market surface, margin/assignment or complete exchange conventions |
| `OPTIONSTRATEGY` | OSA option strategy | Model: common-expiry multi-leg + stock risk/scenarios | No different-expiry calendars, American exercise/assignment, margin, funding or live strategy execution |
| `WATCHLIST` | Launchpad monitors (WATCH) | Local tool: editable lists and source prices | No shared enterprise monitors or arbitrary Bloomberg data columns |
| `WORKSHEET` | W worksheets | Local tool: sheets of securities by chosen market and fundamental fields, each cell's source on hover and in the export | Fundamentals for stocks only, worked out as `PEERS` does; no provider-only fields |
| `PORTFOLIO` | PORT portfolio analytics | Partial: manual holdings/cash, five base currencies, entry-FX metadata, historical-FX replay, exact-date VaR/ES, signed hedge contributions, tracking error, per-line stress and CSV | No institutional position/corporate-action reconciliation, full transaction ledger, factor attribution, multi-asset derivatives or enterprise risk |
| `ALERTS` | ALRT alerts | Local tool: prices, changes and announcement keywords while open | No server-side alerts when closed, mobile push or enterprise notification service |
| `CORRELATION` | CORR correlation | Model: daily-return correlation matrix | No factor model, covariance service, optimisation or full data universe |
| `SEARCH` | SECF security lookup | Partial: local universe and online equity search | No universal instrument/identifier/issue master |
| `RECENT` | LAST history | Local tool: navigation history | Local profile only; no Bloomberg account synchronisation |
| `NOTES` | NOTE annotations | Local tool: saved notes | No team sharing, document linkage or enterprise archive |
| `LAYOUTS` | Launchpad workspace | Local tool: colored security groups, linked monitor selections, compatible panel following, saved groups/routes/splits and windows | No complete Bloomberg component library, account sync, cross-window linking or BLP integration |
| `MESSAGES` | IB messaging | Local rule-based help bot | No human Bloomberg network, authenticated peers, chat delivery, compliance archive or trading-desk connectivity |
| `HELP` | Function help | Local tool: command directory/help | Covers this app only; no Bloomberg help desk or complete Bloomberg function catalogue |
| `MENU` | Security/sector menus | Local tool: numbered related-function menus | Only implemented workflows; unsupported asset classes remain absent |
| `PROVIDERS` | Data/source administration | Project tool: credentials, switches, budgets and diagnostics | Configured does not mean entitled; no Bloomberg entitlement/data-management platform |
| `SETTINGS` | Preferences | Local tool: display, timezone and source preferences | No full terminal keyboard, account/firm policies or remote settings service |

## Continuing the research without a screenshot prerequisite

The implementation session owns source collection. Use accessible official
written instructions, public illustrated guides, PDF pages and publisher images
to check each documented workflow. Keep reference media outside Git. In this
document, record the source, edition, page or image URL, what was actually read
or seen, and the code or test it supports. A source mentioned in the atlas is a
candidate until inspected.

Written evidence can support documented functionality and calculation references;
an inspected PDF or page image can support the visible details it shows. Neither
proves an unobserved interaction, a newer screen layout or complete parity.
Keep those details unverified while continuing TODO items 10 to 13 in their
approved order. Missing video frames are not a general development blocker.

Request one precise owner capture only when a specific visual question blocks
the current task and accessible alternatives have been exhausted. A failed cloud
request does not make a source nonexistent or require the owner to collect every
video. Earlier on 27 October, Codex's environment refused publisher connections
with proxy CONNECT HTTP 403. Later that day the publisher's and universities'
sites answered from the new account's environment (the recheck under the gap
analysis), and the owner's archives of public guides gave the first screenshots
inspected here ("Screenshots from three public guides"). Earlier dated
inspections below are preserved as historical evidence.

## Evidence audit from the reference atlas, 25 October 2026 (to-do item 9)

The owner sent an audited atlas of 69 public references (ChatGPT's second audit, 25 October 2026). It replaces the earlier request for reference PDFs 1 to 33. The sources below were downloaded into a scratch folder outside the repository and read in the 25 October research session; no text or screenshot from them is copied here, only short notes. No video was watched in that session: YouTube refused playback, and the official pages supplied chapter lists only. Evidence levels as in the atlas: E1 a written description, E2 an official chapter list, E3 frames or screenshots inspected, E4 checked in running software or against an independent specification.

| ID | Source | Edition, as checked | What was read | Reachable |
| --- | --- | --- | --- | --- |
| N01 | ECB, framework for the euro foreign exchange reference rates | 23 June 2026, 7 pages, SHA-256 `0fafe6c7f319…` | All 7 pages (text) | Yes |
| D01 | SEC, Form 13F FAQ | page last reviewed 28 September 2026 | Questions 1, 3, 6 to 8, 39 and 41 to 43 | Yes |
| V01 | Babson College, Equity Valuation using Bloomberg | 22 pages, file of 20 March 2023 (screenshots of that time), `d6bf76d090c3…` | All 22 pages (text) | Yes |
| P02 | Bloomberg Global Equity Indices Methodology | October 2026: the rendered cover, the text and the file date (21 October 2026) agree for this copy, `862d098f3846…` | Cover and contents only; an index methodology, not a description of a screen | Yes |
| H07, H08 | Bloomberg's official pages for two tutorials | published 10 and 13 October 2024 | Chapter lists (E2) | Yes |
| H12, H13, H18 to H26, H36 to H39 | University library guides (NYU, Harvard, Penn, Duke, Johns Hopkins, Michigan, Brooklyn, San Diego) | pages updated between January 2025 and October 2026; their screenshots can be older | All text (E1) | Yes |
| H10, H11 | CME's guides to FX futures and options on the terminal | — | Not read | No: HTTP 403 to automated requests |
| V02 | Babson College, WACC Components in Bloomberg | data of 25 March 2022, 10 pages, `e6fd0e870b31…` | Pages 1 to 6 (text) | Yes |
| V03 to V06, N02 to N07 | Older manuals and cheat sheets (2012 to 2023) | downloaded, text extracted | Not yet reviewed | Yes |

Findings, and what was done:

| Area | What the source says | In the app | Status and action |
| --- | --- | --- | --- |
| 13F scope (D01, questions 3 and 6) | A 13F lists what the manager has investment discretion over; a bank's or adviser's includes its clients' accounts | `HOLDINGS` said "what the company itself owns" | Was wrong; fixed (`5ef039b`) |
| ECB reference rates (N01, section 2) | Set about 14:10 CET, published about 16:00 CET, for information only, amendable until the next business day | Code and docs said 14:15 | Was wrong; fixed (`6a8ac50`), and `PORTFOLIO` says the rate a bank or broker applied can differ |
| Split adjustment (H25) | Users should check whether a price history is split-adjusted | `HISTORY` did not say; checked on NVIDIA's 2024 split: Yahoo's prices and volumes are split-adjusted, not dividend-adjusted (E4, against Tiingo's as-traded figures) | Was missing; now said on screen and in the data dictionary (`921cf87`) |
| Beta (V01, page 5) | The profile's beta: two years of weekly returns against the S&P 500; adjusted = 0.67 × raw + 0.33 | `BETA` defaults to exactly that; `WACC` and `RISKPREMIUM` used two years of daily returns | Was inconsistent; fixed (`812edcd`) |
| WACC (V01, page 17) | We/(We+Wd) × Ke + Wd/(We+Wd) × Kd × (1 − t), Ke = Rf + β × ERP | The same formula in `src/functions/WACC.tsx` | Verified in code (E1 and code) |
| Equity risk premium (V01, page 18) | Writes the premium as "βa (Rm − Rf)" | That is one stock's premium; the market's is Rm − Rf. `RISKPREMIUM` takes the market premium and multiplies it by beta | Not copied; the app's formula is the conventional one |
| Cost of equity (V02, Babson's WACC guide of March 2022, pages 2 and 4 to 5) | Prints "Cost of Equity = Risk − Free Rate + (Beta × Market Risk Premium)"; its own section "Risk-Free Rate" then takes the 10-year Treasury yield | The minus is the hyphen of "risk-free" set as a math sign, not a subtraction: the formula is CAPM, Rf + β × premium, as in `WACC` | Verified (text read; the atlas's warning holds) |
| Relative valuation (H39) | Peers with valuation multiples and percentile rankings | `PEERS` shows each multiple with the peers' average and median, no percentile | Partial; percentile rank is buildable from the figures on screen ("Later") |
| Financial statements (V01, page 7) | Segments tab (revenue by product), ratios, export | `FINANCIALS` has statements, ratios, CSV and a Segments page from the latest 10-K's XBRL (business segment, product, geography, customer; segment operating income) | Close for US filers on Form 10-K; none for 20-F filers (IFRS) or for quarters |
| Earnings (V01, pages 12 to 15) | EE leads to ERN, EEG, EM, EEO, ANR | `EARNINGS`, `ESTIMATES` (EEO), `ANALYSTS`; since 26 October also `ESTIMATEGRAPH` (EEG, `cfdd713`) and `EARNINGSTREND` (EM, `313c3e9`) | Present |
| Ownership (V01, page 11) | HDS summary and insider transactions | `HOLDERS`, and insider trades (Form 4) on `MANAGEMENT` | Partial |
| Screening (H18) | Criteria by category, results, output to Excel or PDF | `SCREEN`: criteria picked by category (market, valuation, profitability, risk and return, classification) in AND groups joined by OR, exclusions, CSV (`8caa5d7`) | Partial; no PDF output |
| Options (H19) | Calls left, puts right, grouped by expiry; a contract leads to scenario analysis | `OPTIONS` pairs calls and puts by strike for an expiry | Matches the layout; the link from a contract to `OPTIONSTRATEGY` was not checked |
| Charts and history (H21, H25) | GP's longest range; HP by year | `CHART` has MAX; `HISTORY` takes Y | Present |
| Navigation (H12) | Sector keys, GO, MENU, back, HELP | Present (the function key bar, MENU, back, HELP) | Present |
| Credit ratings (H20, H23, CRPR, CSDR) | Agency ratings | None | Not available: ratings are licensed |

Limitations: the university guides are second-hand descriptions, often of older screens; V01's screenshots are from 2023 and only its text was read; nothing here establishes how the provider's 2026 screens look or behave in detail.

## Evidence pack v3: gap analysis, 26 October 2026 (to-do item 9)

The owner sent Codex's audited evidence pack v3 (14 files). It replaces the earlier video pack. It is kept outside the repository, and nothing from it is copied here except function codes, chapter names and its own evidence levels: E0 a link only, E1 an official description, E2 an official chapter list, E3 a video frame inspected, E4 behaviour seen in running software. Tests of Armin Terminal are evidence about Armin, never about the provider's product.

What the pack holds, checked: 45 sources (6 at E2, 21 at E1, 18 at E0), 39 chapter markers, 38 feature areas, and no video frames or captions. No video was played for this analysis either.

Checked against the publisher's own pages on 26 October:
- The equities tutorial's chapters (WEI 01:05, IMAP 01:50, EQS and WATC 02:32, RV 03:48, FA and DSCO 04:20, EE 06:03, ANR 07:05, BI 07:46) match the pack.
- The Instant Bloomberg, Launchpad and Worksheets tutorial names Launchpad as LLP (03:43) and Worksheets as W (05:07), as the pack says.
- The 2026 pages on AID, CHRT, the AI summary in CN and Earnings Transcript Takeaways exist.
- Not confirmed: that DSCO means document search. The equities page lists "FA and DSCO" under fundamentals and estimates and does not say what DSCO is; Document Search appears on the news tutorial's page without a code. DSCO's meaning stays unknown. BTM did not appear on the insights index as fetched, so it stays E0 here.

Rechecked on 27 October, from the new account, with the publisher's and the universities' sites reachable from this environment again (the earlier 27 October note records a proxy refusal):
- DSCO: the University of San Diego's Bloomberg guide (https://libguides.sandiego.edu/bloomberg/home) lists DSCO as "Document Search" in its table of codes and links slides on finding SEC filings with it. This is a university's summary, not the publisher's (the same table calls EQS "Industry Averages"), so DSCO is taken as document search at E1, and what its screen holds stays unverified. The app's nearest screens are `DOCSEARCH` and `FILINGS`; DSCO now opens `DOCSEARCH`.
- BTM: the publisher's own Pro Tips post of 16 October 2026 exists (found through the site's post search: https://professional.content.cirrus.bloomberg.com/professional2023/insights/markets/bloomberg-pro-tips-monitor-the-options-trades-you-care-about-with-btm/). Its text says BTM shows how a large options trade can affect the market and sets alerts on the size and effect of such trades, without working out the Greeks yourself. E1 now. The video was not played. It still needs trade-by-trade options data (OPRA), so it stays blocked.
- Also found by the same search, for later research: Pro Tips posts on IMAP (11 September 2026: what drives a rally or a fall, in one click), ASKB (12 June and 31 August 2026) and WSL (8 May 2026). Titles and short descriptions only; no video was played.

Status of each area in Armin Terminal. Statuses as the pack defines them; "implemented" means Armin's own behaviour exists and is tested, not that it matches the provider's.

| Area | Pack evidence | Armin today | Status | Gap or next step |
| --- | --- | --- | --- | --- |
| NAV | E2 | Command line (`src/terminal/commands.ts`), linked panels, `HELP`; `tests/commands.test.ts`, `e2e/terminal.spec.ts` | Implemented | W and LLP now open worksheets and layouts (below) |
| WEI | E2 | `MARKET` (`WEI.tsx`), Yahoo index levels | Partial | Price indices only, no total-return variants |
| IMAP | E2, E1 | `INDEXMAP` (`IMAP.tsx`), members from `index-members.ts` | Partial | Weights are estimates (market values, not float-adjusted), as the screen says |
| EQS | E2 | `SCREEN` (`EQS.tsx`, `src/data/screen.ts`) | Partial | Since `8caa5d7`: the app's stocks or Nasdaq's 6,568 US-listed stocks, AND and OR groups, saved screens, and a stated choice for stocks missing a value, counted by field. Over the US list, P/E, yield, ROE, beta and returns exist only for the app's own stocks; Nasdaq's sectors are not GICS; no non-US universe |
| WATC | E2 | `WATCHLIST` (`W.tsx`), typed WATCH | Partial | No analytics across a list. W opens Worksheets since `f26fa11` |
| RV | E2 | `PEERS` (`RV.tsx`); EV in `src/data/fundamentals.ts` | Partial | Since `89ef249` EV adds preferred stock and minority interest from the latest balance sheet, and the build-up shows on hover. Banks are left out and negative EBITDA shows "not meaningful", both correct. No percentile rank |
| FA | E2 | `FINANCIALS` (`FA.tsx`), SEC XBRL | Partial | Segment tables from the latest 10-K only (no quarters, no 20-F filers) |
| DSCO | E2 (code), E1 (a university guide), E3 (the related functions menu, July 2024: company document search) | `DOCSEARCH` (DS, `DS.tsx`), `FILINGS` | Partial | Document search confirmed by the menu screenshot ("Screenshots from three public guides"); DSCO opens `DOCSEARCH`. No picture of its screen, so what it holds is not established |
| EE | E2, E3 (July 2024 screenshots) | `EARNINGSSUMMARY` (EE since `e8b56ff`), `EARNINGS` (ERN), `ESTIMATES`, `ESTIMATEGRAPH`, `EARNINGSTREND` | Implemented | Estimates come only from named providers. No research box, options-implied move or peer scorecard |
| ANR | E2 | `ANALYSTS` (`ANR.tsx`): FMP, Finnhub, Yahoo Finance, Nasdaq, TipRanks | Implemented | Named providers only |
| BI | E2 | None | Blocked | The provider's own research |
| LLP | E2 | `LAYOUTS` (LPAD, and LLP since `3951765`); more windows with Ctrl+Shift+N, each keeping its own layout | Partial | Launchpad's own components are not established from the evidence |
| W | E2 | `WORKSHEET` (`WS.tsx`, `f26fa11`) | Partial | Sheets of securities by the market fields the watchlist offers and 13 fundamentals; other provider fields are not available |
| TOP | E2 | `MARKETNEWS` (TOP) | Implemented | MREP (the morning report) is missing |
| FX | E2 | `FXMATRIX`, `FXRANK`, `FXFORWARD`, `FXOPTION`; ECB rates kept apart | Partial | Mid rates; dealer bid and ask are not available free |
| CHART | E1 | `CHART` (GP) with studies | Implemented | `HISTORY` says its prices are split-adjusted and not dividend-adjusted; `CHART` neither says so nor offers dividend-adjusted prices |
| BOND | E1 | `BONDCALC` (YAS), `BONDS`, `CURVE` | Partial | Yield to each call and to worst from a typed call schedule since item 11 (27 October); issue terms and calls are typed in, and calls carry no option value (no OAS) |
| COMMOD | E2 | `COMMODITIES`, `FUTURESCURVE`, `CONTRACTS` | Partial | No seasonality (chapter 02:30) and no supply, demand or trade-flow data |
| PORT | E1 | `PORTFOLIO` (`PORT.tsx`), its risk tab, its Transactions tab (`PortTransactions.tsx`) | Partial | Transactions with fees and rates of the day, first-in first-out lots, splits, realised P&L, time- and money-weighted returns since item 10 (27 October). No attribution, no factor model, other corporate actions not applied |
| BTST | E1 (the publisher's Pro Tips page: "rank popular trading strategies based on historical return and risk stats for any asset class") | `STRATEGIES` (BTST) since 28 October; `BACKTEST` (EQBT) for stock picking | Partial | Eight common rules with fixed settings on daily closes, price returns only; no optimisation of a rule's settings, no rules of the user's own, no intraday data |
| BTM | E1 (publisher post, 16 October 2026) | None | Blocked | Needs the options trade tape (OPRA) |
| YAS | E1 | `BONDCALC` | Partial | As BOND; the mobile page says nothing of the desktop screen |
| BQUANT | E1 | None | Blocked | A platform |
| CHRT | E1 | None | Missing | Buildable: saved chart templates of the user's own |
| AID | E1 | `PROFILE` comes closest | Missing | Buildable: a snapshot of the company from the app's real figures, each with its source and date |
| CN-AI | E1 | `COMPANYNEWS` | Missing | Buildable with the owner's Anthropic key: a summary of the headlines shown, each sentence tied to its story |
| ETT | E1 | None | Blocked | No transcript source among the app's providers |
| DSX | E1 | `DOCSEARCH`, help desk | Missing | Search with page citations over filings |
| CRAN | E1 | None | Blocked | Credit ratings are licensed |
| CMGR | E1 (the publisher's Pro Tips page: "build and run real-time compliance checks in every step of the buy-side process"; an award write-up: a rules engine and an exception blotter) | `COMPLIANCE` (CMGR) | Partial | The user's own rules on the app's portfolios, checked with every price and before a trade is recorded, with an exception blotter. No order management system to check orders in, no regulatory rule library beyond UCITS 5/10/40, issuers counted as holdings |
| WSL | E1 | None | Missing | Needs worksheets first |
| ASKB | E1 | `MESSAGES` (IB): the built-in assistant, or Claude with the app's data as tools | Partial | Instructions planted in news, filings or profiles are left out of both modes' answers and marked as data for Claude, with tests (item 12, 27 October) |
| ALTD | E1 | None | Blocked | Paid datasets |
| ECON | E0 | `RELEASES`, `ECONCHART`, `ECOFORECASTS`, first releases from FRED's vintages | Partial | No survey consensus (licensed) |
| OPTIONS | E0 | `OPTIONS` (Alpaca, indicative), `OPTIONCALC`, `OPTIONSTRATEGY`; put-call parity tested (`tests/finance.test.ts`, `tests/contracts.test.ts`) | Implemented (models), partial (data) | No OPRA quotes or open interest |
| SPAC | E0 | `CORPACTIONS`, `ACTIONCALENDAR` | Missing | Ticker changes and de-SPAC history |
| HOLDINGS13F | Outside the pack | `HOLDINGS`, `FILINGS13F` | Implemented | |
| CONGRESS | Outside the pack | `CONGRESS` | Partial | Senators' trades are FMP's latest 25, kept since the app first asked, as the screen says |

Five additions with the most use for the least data (approved 26 October):
1. `SCREEN` over Nasdaq's full US stock list, which the app already loads: an explicit choice for missing values, AND and OR groups, saved screens. Done, `8caa5d7`.
2. Worksheets under W: rows of securities, columns of market and fundamental fields, saved; `WATCHLIST` keeps WATCH. Done, `f26fa11`.
3. `PEERS`: preferred stock and minority interest in EV from the filings, with the EV build-up shown. Done, `89ef249`.
4. `PORTFOLIO` transactions: lots with dates, fees and FX, realised P&L, time- and money-weighted returns. Done, item 10 (27 October).
5. `BONDCALC` call schedules: yield to call and to worst. Done, item 11 (27 October).

Five defects to test first:
1. W opens `WATCHLIST`, though W is Worksheets in the official chapter list. Fixed with a test, `f26fa11`.
2. LLP does not open `LAYOUTS`. Fixed with a test, `3951765`.
3. `SCREEN` drops a stock missing any value a criterion needs, without saying so, and does not say it screens 84 stocks. Fixed with tests, `8caa5d7`.
4. `PEERS` leaves preferred stock and minority interest out of EV. Fixed with a test, `89ef249`.
5. The help desk has no test against instructions planted in the news or filings it reads. Fixed with tests, item 12 (27 October).

The pack's release gates (financial correctness, provenance, security) agree with this project's rules and are folded into the tests above as each item is built.

## Screenshots from three public guides, 27 October 2026 (to-do item 9)

The owner sent three archives of public guides on 27 October. They are kept outside the repository; no picture is copied here, only notes on what each one shows. These are the first screenshots this project has inspected (E3). A screenshot shows how one screen looked on the day it was taken, in the language and with the entitlements of that terminal. It does not show the calculations behind a figure, how the screen behaves now, or everything the function does. Labels from the Chinese interface are translated here.

| ID | Source | Taken (how this is known) | Pictures inspected | Left aside |
| --- | --- | --- | --- | --- |
| S1 | "Bloomberg Terminal Guide", a student guide for the UW Investment Group (https://github.com/lukealexluke/bloomberg-guide, archive at commit `af4eb6f`; the site says it was last updated in February 2026) | About 24 to 25 February 2026: the quote line reads "On 24-Feb" and the confirmed report of 02/25/26 is still ahead. English interface | Both: DES, Profile tab, of PSKY US Equity, whole page and the profile part with numbered callouts | None |
| S2 | A Taiwanese university's student manual in Traditional Chinese, written from its 2024 course slides (GitHub archive "Bloomberg-User-Guide" at commit `1bd6fd7`, files dated 22 October 2025) | About 22 July 2024: ANR is "as of 07/22/24", EEG's range is 07/22/2021 to 01/22/2025, EE gives the next report as (E) 10/21/24 and the last as 07/18/24. Chinese interface | 12 files of 2330 TT Equity (TSMC), 8 distinct screens: a new tab with the security autocomplete; the related functions menu (two copies); EE (four crops); EEO; ANR; EEG; the document viewer refusing a broker report. Also the photograph of the keyboard | 5 pictures of the account sign-up form (not opened), and the contact details on the welcome page behind the menu |
| S3 | A BQuant tutorial in two parts, equity and fixed income (GitHub archive "Bloomberg-tutorial" at commit `758a0d9`, files dated 12 October 2024; owner not identified) | Search and runs: 3 April 2023 ("As of 04/03/2023"; the runs were "Last Sent Fri Mar 31 2023"). CAST: after November 2020 (it lists Lakshmi Vilas Bank under DBS). The rest undated | 7 pictures: the fixed income search's criteria (SRCB), its Save As box, a dealer's runs manager, the capital structure tree (CAST), 2 pictures of an app built in a notebook, a toolbar icon. The notebooks' 36 plots, on a contact sheet | The 36 plots are charts the notebooks' code drew, not the interface; the notebook app is not a terminal function |

What the pictures show, against the app. "Seen" is what the picture shows, nothing more.

| Screen | Seen | In the app | Status and action |
| --- | --- | --- | --- |
| DSCO (S2, menu) | The related functions menu lists "8) DSCO, company document search" in the Company Analysis group; "4) DS BRC Document Search: Research" is a separate entry under Company Overview | DSCO opens `DOCSEARCH` (since `01e7211`) | Confirmed for July 2024: DSCO is company document search (E3). No picture of its screen, so what it holds stays unverified |
| Related functions menu (S2) | Opens over the page from "Related Functions Menu" in the second toolbar row. A path at the top (main menu, equity, analysis, the security), "<Cancel>" and a close box. Numbered groups with ">": 1 Company Overview (DES, CN, DS BRC, FA, BICO), 7 Company Analysis (DSCO, ANR, HDS, ESG, SPLC, CACS), 14 Graphs (GP, GF, EEG), 18 Earnings Analysis (MODL, EVT, DS TA, ALTD), 23 Comparison tools (EQRV, KPIC), 26 Equity derivatives (OMON, OPX, BDVD), 30 Trade analytics (TCA, AVAT, VWAP). An "AI" mark on CN, DS BRC, FA, MODL and DS TA, explained at the foot ("Indicates function uses Bloomberg AI technology"), and "MenuId: 6452" | `MENU` for a stock: numbered groups Company Overview, Company Analysis, Research & Estimates, Comparative Analytics, Charting & Reporting, Security Surveillance, Trade Analytics, Derivatives, Credit, Tools | Partial: the app's groups differ from the 2024 menu. Not in the app: BICO, ESG, MODL, DS TA, ALTD, KPIC, OPX, BDVD, TCA, AVAT (the provider's research, licensed data, or not built) |
| EE (S2) | Titled "Earnings & Estimates". A header with the company, consolidated (C), periodicity (quarterly), the consensus source and the currency. Seven boxes, each a link: 1) Earnings History, ERN (next report (E) 10/21/24, last 07/18/24, average and implied one-day move 3.65% and 1.70%); 2) Consensus Overview, EEO (trailing 12-month P/E 26.37, blended forward 12-month P/E 19.96, estimated long-term EPS growth 26.45%); 3) Analyst Coverage, ANR (buy, hold, sell 36/1/0, price 939.00, target 1214.79); 4) Company Financials, MODL, with tabs for the current quarter (Q3/24) and the last (Q2/24): actual, estimate and surprise for adjusted EPS, GAAP EPS, revenue, adjusted net income, operating income and EBITDA, a peer scorecard (above, met, below) and past surprises ("above 8/8"); 5) Earnings Trend, EM (estimate and actual adjusted EPS by quarter, Q2 2023 to Q1 2025, bars); 6) Bloomberg Intelligence, BI (a research note's title and opening); 7) Earnings Estimate Graph, EEG (the price with the quarter's EPS estimate and numbered revision marks) | EE and ERN both opened `EARNINGS`, which is laid out as ERN (the earnings history) | Was wrong; fixed: EE opens `EARNINGSSUMMARY` (`e8b56ff`) |
| EEO (S2) | Toolbar Actions, Output, Settings. Filters: consolidated, periodicity (quarterly), source (standard), currency, broker, a guidance box. "More estimates are available, MODL". Tabs Headline, Headline Growth, Company-Specific. Columns: the last quarter's actual, then that quarter's estimate and the next three quarters', each with its number of estimates and an arrow for the direction of revisions. 21 lines, from adjusted EPS to net asset value. Below, the ratios for the last four quarters' actuals, the next four quarters' estimates and fiscal 2024 to 2026: price to adjusted EPS, P/B, P/CF, EV to sales, to EBITDA, to EBIT and to operating income, and dividend yield. "More periods" arrows; reported figures in orange, estimates in white | `ESTIMATES`: the last fiscal year against the next ones, 8 lines with the number of estimates, and the multiples at today's price | Partial: the 2024 default is quarterly columns. The free sources give quarterly estimates of EPS and revenue only, for two quarters (Yahoo), so the quarterly layout cannot be filled. No revision arrows |
| ANR (S2) | Rating score 4.92 with an arrow; buys 97.3% (36), holds 2.7% (1), sells 0% (0); 12-month target 1214.79 from 33 of 39 firms; last price; currency; return potential 29.4%; return over the last 12 months 70.9%. A chart with 6M, 1Y, 2Y, 5Y and maximum: stacked bars of the shares of buys, holds and sells, the target and the price as lines, and below it the target less the price. A table "38 of 42 sources": firm, analyst, recommendation, target, date, one-year return, BARR, rank and a chart icon | `ANALYSTS`: rating score (5 buy to 1 sell), buys, holds and sells with their shares, average target, last price, return potential, LTM return, a year's chart with the target, and the firms' ratings | Close. Missing: the chart's periods, the target-less-price chart, and the per-analyst return, BARR and rank (the provider's own measures) |
| EEG (S2) | Field "adjusted EPS", consolidated, 1, 3, 5 or 10 years, a date range, source "FRC (TWD)". Grey bars for the actual and navy for the estimate, by quarter, Q3 2021 to Q4 2024. A side panel: type (estimate for a fixed period, rolling estimate, or actual against estimate), consensus source, format (bars), periodicity (quarterly), the series with show, edit and remove, and "add or edit sources" | `ESTIMATEGRAPH`: the consensus for this and next quarter and year now and 7, 30, 60 and 90 days ago (Yahoo) | Partial: "actual against estimate" by quarter is on `EARNINGS` and `EARNINGSTREND`. A fixed-period estimate over years needs each day's past consensus, which no free source gives |
| DES (S1) | The app's layout matches. Details: the name in cyan with "FIGI BBG01VS5NK99" on the right of the same line; below it "6) BI Research Primer, BICO" and "Classification Film & TV"; the description in orange; "Date Aft-mkt (C) 02/25/26"; "Est P/E 12/25"; "Cash 03/16/26 0.05"; "Multi-shares (EV) Y"; "12M Tot Ret" and "Beta vs SPX Index" with no number beside them (both N.A.); "21) Depositary Receipts, Active Receipts 1". Tabs Profile, Issue Info, Ratios, Revenue & EPS, ESG. The title bar: the security in amber, "98) Report" (a PDF of the page, as S1 says) and "Page 1/5 Security Description: Equity" | `PROFILE` with the same boxes and labels; 19) 12M Tot Ret and 20) Beta numbered; 21) Ownership; tab 5 Industry Info; no FIGI; the date written "(C) 02/25/26 Aft-mkt" | Close. Done (`1b0cefc`): the FIGI on the name line for US stocks, from OpenFIGI, and the date in the picture's order. Not available: BICO (the provider's research), ESG scores (licensed), depositary receipts. Unsettled: whether 19) and 20) lose their numbers only when the value is N.A. |
| Security autocomplete (S2) | On a new tab, typing "2330 TT Equity" lists "Securities": the ticker in bold with its yellow key, the name in amber, a clock on a recent one, futures and spreads on the stock, and "More securities…" | Suggestions headed RECENT SECURITIES, SECURITIES and FUNCTIONS; "More Functions…" | Close. No "More securities…" |
| Keyboard (S2) | Red: Cancel, Log Off. Green: Help, Search, Cmnd History, News, Quote Line, Quote Function, Message, IB, Menu, Print, End/Back, Enter/GO, Alt Badges. Yellow: F2 Govt to F12 Port. Blue: the fraction keys and Panel. White: Codes & Favorites | The key bar and the F2 to F12 sector keys | Matches for the sector keys |
| Fixed income search, SRCB (S3) | "Fixed Income Search", with a notice that SRCB is for internal use (SRCH is the published code). Tabs Build/Edit Search, My Searches, Example Searches; "build with criterion" or "by merging saved searches". An as-of date. The universe (asset classes, sources) and its count (3,177,963). Criteria, each joined by "And": field, include or exclude, the criterion, and the matches left after it (436,972, then 5,561, 1,368 and 325), with edit and remove. "325 securities", Results, "Copy BQL Formula". Below, follow-on analysis: results, maturity distribution, FIW, LEAG, debt holders, DDIS, IMGR. Save As asks for a name, an optional description and an optional shortcut | `SCREEN` (stocks) gave the final count only; `BONDSEARCH` lists Treasuries and the app's bonds | Partial. Done for `SCREEN` (`6e1e5bd`): the stocks left after each criterion; the equity screener shows the same column (S4, below) |
| CAST (S3) | The issuer's entities as a tree (DBS Group Holdings, DBS Bank Ltd, its branches and subsidiaries), each with a bar | None | Missing: the entities and their debt are not in the free sources. What the bars measure is not labelled in the crop |
| Runs manager (S3) | A dealer's runs sent to clients: recipients, subject, the last sending, bid and ask sizes, spreads, benchmark and prices | None | Out of scope: a dealer's tool |
| Document viewer (S2) | "You are not authorized to access this document", with the source, analyst, company and "Request Access" | None: the app has no broker research | Nothing to change |

Built from these pictures (27 October):
- `e8b56ff`: EE opens a new `EARNINGSSUMMARY` page laid out as the 2024 picture: report dates and the price's average move (1), the trailing and blended forward P/E and next year's growth (2), the analysts (3), the last quarter against its estimates with past surprises and the next quarter's estimates (4), the EPS trend (5) and the consensus's moves (7). Its figures are the other screens' own; no counterpart for box 6 (the provider's research), the implied move or the peer scorecard. ERN keeps `EARNINGS`, whose Prior Announcement now takes the newest dated report.
- `1b0cefc`: `PROFILE` shows the US listing's FIGI on the name line (OpenFIGI, US stocks), the classification on the line below, and writes the report date as "Aft-mkt (C) 02/25/26".
- `6e1e5bd`: `SCREEN` shows the stocks left after each criterion in its group ("325 left").

Found afterwards, the same evening, to settle the first open question (EQS's match counts):

| ID | Source | Taken (how this is known) | Pictures inspected | Left aside |
| --- | --- | --- | --- | --- |
| S4 | University of Ljubljana, School of Economics and Business, Bloomberg guide, "Equity screening" (https://vodici.cek.ef.uni-lj.si/bbg-eng/comparing-securities/equity-screening, page last updated 14 October 2026) | "As Of 08/03/2023": 3 August or 8 March 2023, depending on that terminal's date setting | 5 of its 18 pictures: the criteria with the S&P 500 added, the index dialog, the EBITDA criterion with its period list, the whole screen with Actions open | The other 13 (results, ranking, saving, export) not yet inspected |
| S5 | The publisher's "Functions for the Market" sheet on EQS, kept by Oxford's Bodleian Libraries (https://www.bodleian.ox.ac.uk/sites/default/files/bodreader/documents/media/bloomberg-equity-screening.pdf) | 25 March 2013 (printed on each page and in the file) | Both pages: the start page (create, example screens, showcase, news) and a results page | Old screens: kept for history only |

Not reached: Hang Seng University of Hong Kong's EQS guide (https://ftl.hsu.edu.hk/wp-content/uploads/2019/10/eqs.pdf), the proxy answered HTTP 502 on 27 October.

| Screen | Seen | In the app | Status and action |
| --- | --- | --- | --- |
| EQS (S4) | Left: "My Recent Screens" and numbered "Popular Screens" (21 to 30). Right: an as-of date; "Screening Criteria" as numbered categories (31 Exchanges, 32 Sectors, 33 Country/Territory of Domicile, 34 Indices, 35 Portfolios/Worksheets, 36 Equity Screens; expanded: 37 to 45, security types and attributes, trading status, multi-listed, state of domicile, debt distribution, company description, product and geographic segments); "Add Criteria": a field, its period (trailing 12 months, latest quarter, half year, year, calendar year, latest filing, a period of your own), a comparison, a value with its unit (M), buttons for growth, info, benchmark and fields, and the criteria's currency. "Selected Screening Criteria" with **Matches**: Security Universe 1,645,973; 51) Trading Status: Active 531,711; 52) Indices: S&P 500 INDEX 503; 53) LF EBITDA [USD] > 1000M 173; 54) Top 20 Sequential Rank, lower is better (current market cap) 20; 55) Add screening criteria; each line with a handle to move it and a remove mark. "1) See Results, WATC". Toolbar: Formula, Actions (change currency, index override, result limit, display, parent or consolidated, scoring models, default universe, criteria options, intraday alert, screening alerts, save, save as, send, share, delete, news screens), Backtest. The index dialog lists each index with Included or Excluded | `SCREEN`: the universe and its count in the subtitle, criteria by category in AND groups joined by OR, the stocks left after each criterion, saved screens, an exclusion list, `BACKTEST` | Close for the count after each criterion (E3 now), the sequential rank ("top N, higher or lower is better", applied to what the criteria above left), a period per criterion (trailing 12 months, latest quarter, latest fiscal year; no half year, calendar year or own period) and moving a criterion (up and down buttons, not a drag handle). Missing: alerts on a screen's members entering or leaving, criteria by index membership (the app has no constituent lists beyond its own), segments |
| EQS (S5, 2013) | Start page: Create Screen, Example Screens with a search, Showcase, News Wire, tabs 91 Build/Edit Screen, 92 My Screens, 93 Example Screens. Results: 95 Output, 96 Actions, the count ("21 securities"), 97 Backtest, an as-of date, Add Column, 98 Fields, ranked columns, Analyze, 94 Stats, grouping | `SCREEN`, `BACKTEST` | History only: the 2023 screen (S4) differs |

Open questions that need a picture or a written source (each names what would settle it):
- EE's "implied one-day move": how it is worked out (the options market's straddle is the usual measure). A help page or a picture of the box's tooltip.
- DES pages 2 to 5 (Issue Info, Ratios, Revenue & EPS, ESG) as they are now: a 2025 or 2026 picture of each.
- Whether DES numbers 19) and 20) only when they have a value: a picture of a stock with a beta and a 12-month return.
- MODL, the model page EE and EEO link to: any picture.
- ANR's BARR and rank columns: what they measure.
- None of these archives shows WEI, IMAP, FA, RV, PORT, YAS or OMON: those comparisons still rest on written sources.

## Workflows with no equivalent implementation

Beyond the commands above, important missing product areas include Bloomberg Excel/Office add-ins, BDP/BDH/BDS/BQL, Bloomberg Anywhere and mobile account services, Bloomberg Intelligence/NEF/broker research and transcripts, Bloomberg's messaging network, execution/order routing and EMSX/TOMS/AIM, trade booking/reconciliation and compliance, enterprise risk/factor/attribution/optimisation, credit/CDS and structured credit, securitisation/MBS/municipal/preferred-specific analytics, comprehensive security identifiers/corporate actions, pricing contributors and evaluated prices, global options/futures curves, and professional data licensing/redistribution services. Adding a command name would not implement these systems.

## What “real time” can mean here

The optional Alpaca stock feed is **IEX only**, one US exchange. It is not consolidated US tape, NBBO, official market-wide last price or volume. The option feed explicitly selects **indicative**. Public Yahoo values retain Yahoo's source labels and can be delayed or unavailable; official rates are published references. No free provider key can be assumed to grant every dataset or exchange entitlement.

## Verification boundary

Unit tests check model mathematics against independent cash flows/payoffs, pagination, refusals, linking history/compatibility and field/snapshot provenance. Browser checks cover each registered command, calculator interactions, linked layout persistence and field CSV. Electron tests exercise the actual preload, IPC validators, broker and UI with deterministic provider responses, including linking and stale/missing field data; they are not live-feed validation. See [release-v2.9.0.md](release-v2.9.0.md) and [release-v2.8.1.md](release-v2.8.1.md) for those releases' build/test records. This documentation review does not independently repeat or upgrade those verification claims.
