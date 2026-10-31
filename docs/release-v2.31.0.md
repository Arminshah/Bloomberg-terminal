# Armin Terminal 2.31.0

This release adds a dozen free official data sources, a Treasury auctions screen, and the next round of screens laid out as the terminal's 2024 pictures show them, from the company description to the bond yield calculator. Windows only.

New data

- OPTIONS opens on Nasdaq's composite option chain for US stocks, ETFs and the Nasdaq-100: bid, ask, last, volume and open interest for each strike, with the app's implied volatility, Greeks and implied forward for each expiry. Alpaca's chain stays available as the second source.
- AUCTIONS (alias AUCR), a new screen: the Treasury's bill, note, bond, TIPS and FRN auctions with the high yield, rate or margin, price, share allotted at the high, bid-to-cover and the dealer, direct and indirect shares, with a link to each results release, and the auctions on the schedule. About 16 months come from Fiscal Data and the last 30 days from TreasuryDirect, which posts results minutes after each auction.
- ECOFORECASTS adds the professional forecasters' consensus beside the IMF's outlook: the ECB's Survey of Professional Forecasters for the euro area, each average with its change since the round before, and the Philadelphia Fed's survey for the US, its medians as the Bank prints them beside the previous survey's.
- ECO shows US payrolls, unemployment, CPI, PPI and JOLTS at the Bureau of Labor Statistics' own release times, and Nasdaq's calendar times are right in winter too (they were an hour late from November to March).
- MACRO adds the Atlanta Fed's GDPNow and the Cleveland Fed's nowcasts of this month's CPI and PCE inflation.
- INDEXFUTURES shows the Euro Stoxx 50 and DAX futures from Eurex's daily settlements, and the Nikkei 225 future from Japan Exchange Group's settlement and open interest files, each with volume and open interest.
- CENTRALBANKS and RATEANALYSIS add the People's Bank of China, the Reserve Bank of India, Banco de México and the Bank of Japan's guideline, from the BIS.
- The S&P 500's member weights come from State Street's SPY holdings, and the Dow's members from DIA's when the price source gives none. DES shows an S&P 500 member's ISIN and SEDOL.
- FINANCIALS' segments read foreign filers' annual reports (20-F and 40-F) in IFRS as well as US GAAP.
- SHORTINTEREST covers ASX stocks, from ASIC's daily short position reports. Spain's 10-year yield comes from Banco de España.
- Treasury notes and bonds are priced from TreasuryDirect's FedInvest in SRCH, YAS and ALLQ.

Screens, closer to the 2024 layout

- DES: the profile's pages as plain tabs, a Revenue & EPS page by fiscal year and quarter with segments, and the Ratios page's blocks.
- FA: the red bar's dropdowns, numbered grey tabs and a band of views; the terminal's colours and signs, a graph mode and settings; segments by business or location with Group By and percent of total.
- EE, ANR, RV, EQS, WEI, IMAP and GP in their pictured layouts. ANR puts the summary beside one stacked ratings chart, RV adds its comparison source, region and market cap controls with a segment panel, EQS keeps screens at the left with each criterion's matches, WEI adds 10- and 30-day volatility and the change period, and GP has its Edit Chart side panel with Browse, Normalize and the tree of lines.
- YAS, the yield and spread page with risk, spreads, yield calculations, invoice and after-tax yields. SRCH searches every marketable US Treasury with criteria joined by And. WB shows bonds, spreads and curves with a data range band. ALLQ has the montage's layout.
- PORT opens on an Intraday tab: the portfolio against its benchmark by GICS sector, country or asset class, with the contribution to return, the movers and each sector's holdings; Holdings, Performance, Risk & Allocation and Transactions follow as 2) to 5), and the red bar has Manage, Export and Settings menus.
- DS answers a question about an opened filing with Google Gemini, every point quoting the filing word for word (with your Gemini key and its switch on PROVIDERS). Tabs are named after their screen.

Fixes

- REFRESH no longer waits about 90 seconds for Eurex, whose requests are paced 30 seconds apart.
- PROFILE uses the two-year weekly adjusted beta for every stock. FINANCIALS sets a past period's market value with the shares outstanding at its end. PEERS shows market values and prices in the stock's own currency or in US dollars, and counts the one-month change from a calendar month back.
- The Dow's fallback member list has Alphabet in Verizon's place.
- The quote screen says when a finished US session's open, high, low and volume are still the price source's provisional figures, until Nasdaq's official record of the session arrives.

Where each figure comes from, how it was checked and what stays blank is in `docs/data-providers.md`.
