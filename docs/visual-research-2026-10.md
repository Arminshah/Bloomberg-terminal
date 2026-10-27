# Visual research, October 2026

Researched 25 October 2026 for the next round of look-and-feel work. It builds on [visual-fidelity-v2.12.0.md](visual-fidelity-v2.12.0.md), [terminal-fidelity-v2.14.md](terminal-fidelity-v2.14.md) and [reference/terminal-reference.md](reference/terminal-reference.md), which already cover the 2017 getting-started guide, the 2024 Terminal Essentials posters and the owner's 13 reference PDFs. Those notes left fonts and colours as guesses. This round measured colours from Bloomberg-published images, identified the real typeface and a free stand-in, and found a chart rendering problem on Windows scaling.

No licensed session was available. Every colour below was sampled from compressed marketing images and screenshots, so treat each value as accurate to roughly ±10 per channel. Where two independent Bloomberg images agree, the table says so.

## Sources

| Source | Date | What it is good for | Notes |
| --- | --- | --- | --- |
| [ASKB window render](https://professional.bloomberg.com/globalassets/professional/products/bloomberg-terminal/askb_window_render_0910_02.png) on the [Terminal product page](https://professional.bloomberg.com/products/bloomberg-terminal/) | 2026 (file name suggests 10 Sept) | The newest official picture of the Terminal: a 3840×2160 render of two monitors with Launchpad and the ASKB window | The market data on screen is from 2019, composited. Studio lighting darkens colours, so use it for layout, not exact values. |
| [Designing the Terminal for colour accessibility](https://www.bloomberg.co.jp/company/stories/designing-the-terminal-for-color-accessibility/) (Bloomberg Japan; the English page blocks automated readers) | 6 April 2022 | Colour meanings, the two colour-blind schemes with flat swatches, heat-map tiles, and the setting that switches schemes (`PDFU COLORS <GO>`) | Images: `https://assets.bbhub.io/company/sites/59/2022/04/CVD-1-a.webp` to `CVD-9.gif`. CVD-3 is a full default Launchpad. |
| [Terminal Essentials: Getting started](https://professional.content.cirrus.bloomberg.com/professional2023/insights/technology/bloomberg-terminal-essentials-getting-started/), video [ZAYiEyaUk2M](https://www.youtube.com/watch?v=ZAYiEyaUk2M) | 13 Oct 2024 | Chapter "Terminal Window: Anatomy and Tabs" at 01:36 is the only official walkthrough of today's window frame and tabs | Not watched (a session cannot play video). The thumbnail shows a Launchpad toolbar with "Save View", "Views ▾" and an amber "Add Component ▾". |
| [Terminal Essentials: IB, Worksheets & Launchpad](https://professional.content.cirrus.bloomberg.com/professional2023/insights/technology/bloomberg-terminal-essentials-ib-worksheets-launchpad), video [TFn7Kr-xF8w](https://www.youtube.com/watch?v=TFn7Kr-xF8w) | 12 Oct 2024 | Launchpad at 03:43, Worksheets at 05:07 | Thumbnail shows Launchpad component chrome and tile components (see Layout). |
| [UNF "Getting Started with Bloomberg"](https://www.unf.edu/coggin/_files/ccb/certified.rf.Bloomberg-Tutorial-8-8-2023.pdf) | Aug 2023 (screens look 2015) | Labelled anatomy: panel frame, toolbar, command line, function area, information panel; autocomplete; WEI | 15 pages, about 60 images, the clearest screenshots of the toolbar and command line found. |
| [Bloomberg getting-started guide for students](https://data.bloomberglp.com/professional/sites/10/Getting-Started-Guide-for-Students-English.pdf) | Nov 2017 | Already used by earlier rounds; used again here to cross-check colours | Still the newest official guide. A copy uploaded by Catholic University in July 2026 is the same 2017 file ("©2017 … DIG 1117") with a 2006 cheat sheet appended. |
| [Bloomberg 2018 primer (LUISS)](https://data.bloomberglp.com/professional/sites/10/LUISS_2018Primer.pdf) | Oct 2018 | 37 pages with dated screenshots of WEI, WB, ECO (actuals amber, forecasts white), Launchpad, DES, GP, RV, FA, EQS, news | 17.7 MB. Earlier rounds could only read excerpts; it downloads in full now. |
| [SAFE Frankfurt primer](https://datacenter.safe-frankfurt.de/documents/Bloomberg_Terminal_primer.pdf) | Oct 2014 | Older screens, 25 images | Old, use only to confirm long-standing conventions. |
| [CMU cheat sheets](https://guides.library.cmu.edu/Bloomberg/CheatSheets) | Files from 2009 to 2016 | Function lists per asset class | No screenshots worth using. Mnemonics only. |
| [Bergoom](https://github.com/dchest/bergoom) | May 2025 | Free font modelled on the Terminal's proportional face | SIL OFL 1.1, derived from Source Sans 3. See Typeface. |

Pages that block automated readers but are worth reading in a browser: [How Bloomberg Terminal UX designers conceal complexity](https://www.bloomberg.com/company/stories/how-bloomberg-terminal-ux-designers-conceal-complexity/) and [Innovating a modern icon](https://www.bloomberg.com/company/stories/innovating-a-modern-icon-how-bloomberg-keeps-the-terminal-cutting-edge/). Search excerpts of the first say Bloomberg commissioned Matthew Carter for both a proportional and a monospaced Terminal font, with finance glyphs such as fractions in 64ths.

Nothing found describes a redesign of the Terminal itself in 2025 or 2026. The visible change is ASKB, Bloomberg's AI assistant, which opens as its own window (see Layout). Bloomberg's 18 August 2026 [ASKB release](https://www.prnewswire.com/news-releases/bloomberg-extends-askb-on-mobile-investment-ideas-dont-stop-when-financial-professionals-leave-the-desk-302853450.html) covers mobile design only.

## Colours

Sampled with Pillow; the scripts took the median of the matching pixels. "App now" is `src/styles/global.css` or the file named.

| Element | Measured | Where measured | App now | Suggestion |
| --- | --- | --- | --- | --- |
| Red function bar | `#A21826`, `#A41827` | 2017 guide, two screens | `--function-bar: #870f1e` | `#A21826`. Ours is visibly darker. The 2023 tutorial's WEI gives `#9F1327`, which agrees. |
| Amber (default text, inputs) | `#FEA028` swatch labelled "Bloomberg Default"; `#F2A117`, `#EE9112` (2017); `#F59C2E` (2023 input field) | CVD-7 swatch; guides | `--amber: #ff9e1b` | Keep. All sources fall within a few points of ours. |
| Command line focus border and cursor | `#1FB6F0` | 2023 tutorial command line | `.cmd-input:focus` uses `#4d81cf` inset on `#101824` | A cyan 1px box on black with a cyan block cursor. Typed text is white in a fixed-width face, with `<HELP>` in green. |
| Section strip ("1) Americas") | `#343434` | 2023 tutorial WEI | `--hdr: #292b2e` | `#343434`, neutral grey without the blue tint. |
| Heat cells, strong up | `#50EF6E`, `#1BBD3D`; render `#4EF672` | CVD-6 tiles; ASKB render | `HeatTreemap.tsx:82` tops out at `rgb(32,170,54)` | Two images agree on a bright, slightly blue-green `#50EF6E`. |
| Heat cells, weak up | `#014A0F` | CVD-4 and CVD-3 tiles | low end `rgb(18,62,32)` | Purer, darker green with almost no blue. |
| Heat cells, down | `#A1122C`, `#7B0C24`; strong `#FD2D4A`, `#C31834`; render `#A2122A` | CVD-4, CVD-6, render | `HeatTreemap.tsx:83` from `rgb(84,20,38)` to `rgb(230,32,52)` | Three images agree on `#A1122C` for the common down cell. |
| Focused window outline | about `#1E72C6` to `#2A7ED2` | ASKB render (window border) | `.panel.active { border-color: #3977b3 }` | Close already. |
| Chart mountain fill | dark navy, `#061E36` under the render's lighting | ASKB render | GP uses a blue mountain | The render darkens colours; check by eye against CVD-3, which is unlit. |

The colour-blind schemes, from the CVD-7 swatches, are worth offering under SETTINGS, as Bloomberg does under `PDFU COLORS`:

| Scheme | Up / buy | Down / sell | Default text |
| --- | --- | --- | --- |
| Deuteranopia | `#0089E8` | `#CD4B4C` | `#FEA028` |
| Protanomaly | `#0089E8` | `#FB5B28` | `#FEBA12` |

The article says amber is kept for information with no direction, green and red mean rise and fall, and the colour-blind schemes swap green for blue. CVD-6 lists the problems those schemes fix: thin coloured strokes in sparklines, reds and greens next to each other in heat maps, dark colours on black, and too many hues in one chart.

## Typeface

The Terminal's faces are Bloomberg Prop (proportional) and Bloomberg Fixed (monospaced), both by Matthew Carter. Three independent sources name him: the Bloomberg UX article (search excerpt), the [Berg VS Code theme](https://github.com/jx22/berg), and the Bergoom README. The fonts ship only with the Bloomberg client and cannot be bundled.

Most current screens use the proportional face: quoteline, chart labels, Launchpad tiles and worksheets in the 2018 to 2026 images. The command line and some older text screens use the fixed face.

Superseded on 27 October 2026: Bergoom was the default in 2.26.0, drew thin, uneven figures on Windows, and the owner fixed IBM Plex Sans as the app's only face (`CLAUDE.md`). The notes below are kept as research.

[Bergoom](https://github.com/dchest/bergoom) is the closest free match. It is Source Sans 3 with i, j, J, l, h, k, q, w and W reshaped after Bloomberg Prop, and g and I swapped for Source Sans alternates. Rendered beside the "G 214: Histogram 1D Change" line from the 2024 Equities poster, it matches the footless "1" and the open single-storey "g". Source Sans 3 has a footed "1", and IBM Plex Sans (what the app uses now) has squarer, heavier forms. The real text is spaced a little wider than Bergoom, so add about 0.02em of letter-spacing and compare again.

| Font | Licence | Weights | Figures by default | `frac` |
| --- | --- | --- | --- | --- |
| Bergoom | OFL 1.1 | Regular, Italic, Semibold, Bold, Bold Italic (OTF, WOFF, WOFF2) | tabular | yes |
| Fira Sans (fallback) | OFL 1.1 | full range | proportional, has `tnum` | yes |
| IBM Plex Sans (current) | OFL 1.1 | full range | tabular | yes |

Bergoom's figures are already tabular, so `font-variant-numeric: tabular-nums` changes nothing with it. Keep the declaration for the fallback fonts. Bergoom has no `tnum` or `zero` feature and no monospaced cut. For the command line, try Fira Mono or the bundled IBM Plex Mono against the 2023 tutorial screenshots and pick by eye. That choice has not been checked.

To keep row heights stable if Bergoom fails to load, set `font-size-adjust` from Bergoom's x-height ratio ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/font-size-adjust); Baseline 2024, so Electron 43 supports it).

## Layout details not covered by earlier notes

- **Panel frame**: the title at the left shows a small icon with the running mnemonic, then the panel number ("1-BLOOMBERG"); minimise, maximise and close are at the right (2023 tutorial pp. 7 to 8). Our app must not use the other product's name, so the equivalent is "1-" followed by our own name or the mnemonic.
- **Toolbar**: back and forward arrows; light grey boxes with dark text for the security ("IBM Equity ▾", with a flag icon), the function ("WEI ▾") and "Related Functions Menu »"; at the right a "Message" box and icons for favourites, layout, settings and help, each with a small ▾.
- **Command line**: black field, cyan 1px border, cyan block cursor, white fixed-width text. Before any typing it reads "<HELP> for explanation." with `<HELP>` in green.
- **Autocomplete**: "FUNCTIONS" heading in amber; mnemonics in white at the left; titles in grey at the right with the typed letters in bold white ("**Merg**ers & Acquisitions"); "More Functions…" in italic blue at the end.
- **Information panel**: a one-line blue banner at the bottom of each panel. Treat it as optional; it is advertising space.
- **Launchpad toolbar**: "Save View", "Views ▾", and "Add Component ▾" as an amber button.
- **Launchpad components**: a small grey title at the top left ("Chart Grid", "W 35: S&P Level 2 Movers and Laggers"); at the top right "≡ Options", a pop-out arrow and a maximise box. Tile components have a white label at the top left ("1M Imp Vol"), the period in grey at the top right ("3M"), a large white value, and a sparkline or small chart below.
- **Chart grid**: index names in amber ("INDU Index") with a grey "■ MAvgs" legend, blue mountain over a volume histogram, thin grey grid.
- **Worksheet rows**: names in amber capitals, a sparkline, a range bar with orange and blue dots, last price with a coloured ↑ or ↓, then return columns as heat cells with white text. Some group rows have a solid bright green background.
- **ASKB window**: black, with a 1px blue border when focused. Left rail with outline icons: New Chat, Workflows, History, Favorites, Examples, Settings. In the centre, an amber icon, "ASKB" in amber, a grey description, and an input box with an amber underline. The app's local help bot could take this layout, as long as it stays clearly labelled as a local bot (see [terminal-fidelity-audit.md](terminal-fidelity-audit.md)).

## Crisp rendering on Windows

Most Windows laptops run at 125% or 150% display scaling, so `devicePixelRatio` is 1.25 or 1.5.

1. `src/components/chart/PriceChart.ts:203` and `src/components/chart/XYChart.tsx:61` cap the ratio at 2. On a 4K screen at 250% the canvas is drawn at 2× and stretched, which blurs it. Use the real ratio.
2. Lines are snapped with `Math.round(y) + 0.5` in CSS pixels after the context is scaled. That puts a 1px line on a pixel centre only when the ratio is 1. At 1.25 or 1.5 every grid line, axis and crosshair smears across two device pixels. Snap in device pixels: `(Math.round(y * dpr) + 0.5) / dpr` for odd-width lines, and set `lineWidth` to `1 / dpr` where a hairline is wanted. MDN's [Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas) (updated 25 Aug 2026) recommends whole-number coordinates.
3. `resize()` floors the CSS width before multiplying, so the backing store can differ from the element by a fraction of a pixel and get resampled. Size the canvas from the element's exact rect times the ratio, as MDN's [devicePixelRatio](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio) page shows (updated 21 Aug 2026).
4. Moving the window to a screen with a different scale changes the ratio without always resizing the element. Listen with `matchMedia('(resolution: ' + devicePixelRatio + 'dppx)')` and redraw on change (same MDN page).
5. `getContext('2d', { alpha: false })` on charts with an opaque black background lets Chromium skip blending (Optimizing canvas).
6. `-webkit-font-smoothing` only affects macOS ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/font-smooth)). On Windows, Chromium draws text with DirectWrite, so text sharpness depends on the font's hinting and on positions landing on whole pixels. Avoid `transform: scale()` and fractional `translate()` on text containers.

Check each change at 100%, 125% and 150% Windows scaling, and with the window moved between two screens.

## What the owner can supply

A session cannot watch video. These short clips would settle the remaining questions, as screenshots uploaded to the session:

- ZAYiEyaUk2M, 01:36 to 02:40: the current window frame and tabs.
- TFn7Kr-xF8w, 03:43 to 05:07: Launchpad toolbar, adding a component, component menus.
- TFn7Kr-xF8w, 05:07 to the end: worksheet columns, groups and heat cells.

The owner's 13 reference PDFs (kept out of git) remain the best source for individual screens.

## Rules carried over

From [HANDOVER.md](HANDOVER.md): do not commit Bloomberg PDFs, screenshots, logos or fonts, or text copied from them; describe layouts in our own words and cite the source. The app keeps its own name. Bloomberg Prop and Bloomberg Fixed are proprietary and must not be bundled; Bergoom and the other fonts above are OFL and can be, with their licence files.

## Done in the visual pass, 26 October 2026

Each step is its own commit with tests (`e2e/look.spec.ts`, `tests/chart-pixels.test.ts`, `tests/palette.test.ts`, `tests/chart-look.test.ts`):

1. Charts are sharp at 125% and 150% scaling: the real device-pixel ratio, a backing store the size of the element's device-pixel box, straight lines and filled edges on whole screen pixels, a redraw when the ratio changes, opaque canvases (`src/components/chart/pixels.ts`). In 2.25.1.
2. Bergoom is the default typeface, regular weight, spaced 0.02em wider; `font-size-adjust: 0.563` keeps rows the same height if it fails to load. SETTINGS offers Bergoom, IBM Plex Sans and IBM Plex Mono, and chart labels follow. Fira Mono and IBM Plex Mono were compared with the 2023 tutorial's command line and are near enough identical, so the command line keeps the bundled IBM Plex Mono.
3. Colours: the function bar is `#A21826`, section strips `#343434`, and the command line has white fixed-width text, a cyan `#1FB6F0` box and block cursor, and "<HELP> for explanation." in grey with `<HELP>` in green while it is focused and empty.
4. The heat scale runs through the measured tiles (`#014A0F`, `#1BBD3D`, `#50EF6E`; `#7B0C24`, `#A1122C`, `#FD2D4A`) on HEATMAP, INDEXMAP and the table heat colour, which had three slightly different scales.
5. SETTINGS > Colours has Deuteranopia and Protanomaly. Every colour that means a rise or a fall follows them, in stylesheets and in code (`src/terminal/palette.ts`).
6. Panel chrome: a frame title per panel (the mnemonic in a green badge, then "1-ARMIN", a maximise button with more than one panel), light grey toolbar boxes, and suggestions with an amber heading, white mnemonics, the typed letters in bold white and "More Functions…" in blue italics.
7. The help desk opens on its own page until something is asked, laid out as the assistant window is and labelled with who answers and where a question goes.

## What still differs

Measured or seen in the sources above, not done:

- **Window frame and tabs.** Not compared with the 2024 walkthrough (video ZAYiEyaUk2M, 01:36), which a session cannot watch.
- **Panel frame.** No minimise or close button, and the badge is text, not the terminal's icon. The app's name stands where the terminal's is.
- **Toolbar.**
  - Back and forward sit on the command line row, not at the toolbar's left.
  - The menu box says "Menu ▾", not "Related Functions Menu »".
  - There is no "Message" box, and no favourites, layout, settings and help icons with ▾.
- **Command line.** No small cyan triangle at its left. The hint shows only while the line has focus; unfocused, it names the command behind the screen, which the terminal does not.
- **Suggestions.** No "<UP ARROW> t…" hint beside the heading. The app also shows a category at the right of each row, and securities in their own group.
- **Information panel.** The blue one-line banner at the foot of each panel is advertising space and is left out.
- **Launchpad.** Not built:
  - components with a small grey title, "≡ Options", a pop-out arrow and a maximise box;
  - tile components (label, period, large value, sparkline);
  - the "Save View", "Views ▾" and amber "Add Component ▾" toolbar;
  - the component browser.
- **Worksheets.** WATCHLIST has no range bar with dots, no heat cells for its return columns, and no solid green group rows.
- **Chart grid.** Index names in amber with a grey "■ MAvgs" legend and a volume histogram under the mountain are not done. GP's mountain colours were not checked against CVD-3.
- **Typeface.** Bergoom is a stand-in: a few letters differ from the terminal's proportional face, and there is no fixed-width Bergoom. IBM Plex Mono, on the command line, is a little wider than the terminal's fixed face.
- **Assistant.** The help desk is a page inside a panel, not a separate window. Its left column lists the chat rooms and "New chat", not the assistant's icon rail (Workflows, History, Favorites, Examples, Settings).
- **Accuracy of the colours.** Each was sampled from compressed images (about ±10 per channel). The colour-blind schemes' heat scales are their swatch colours darkened and lightened, not measured.
- **Checked only in Chromium's emulation.** Sharpness at 125% and 150% was checked there, not on a Windows display. The screen-change redraw was checked by sending the media query's change event, which emulation does not send.
