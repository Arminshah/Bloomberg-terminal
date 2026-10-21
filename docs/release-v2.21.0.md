# Armin Terminal 2.21.0

This release rebuilds the supply chain analysis (SPLC) on far more of the SEC's filings and a stricter reading of them, finds a stock by its company's name, and makes the mouse's back and forward buttons work as in a browser. SPLC works the same way for every US-listed company; nothing in it is specific to one stock.

## SPLC: more filings, read more strictly

### What it reads

- **Other companies' filings that name the company:** annual and quarterly reports (10-K, 20-F, 40-F, 10-Q) of the last 18 months, IPO prospectuses of the last three years, and 8-K press releases of the last year. Searches also cover what a supply chain says about it ("accounted for", "largest customer", "supplier", "sole source", "purchase", "distributor", "competitors", "lease", "contract", "agreement").
- **A name few filings use** is searched alone and every filing read. Applied Digital: 79 documents, against 20 before. **A name many use** is searched beside those terms, legal name first ("Apple Inc" with "accounted for" finds Apple's suppliers).
- **The company's own filings:** its latest 10-K and 10-Q, and its press releases and material-agreement 8-Ks of the last year. From these it reads leases to tenants, supply, purchase and offtake agreements, orders, partnerships, investments and loans, with the other party as the filing names it. A party the filing leaves unnamed is described as the filing describes it ("Unnamed U.S. investment-grade hyperscaler").
- **Text read whole:** paragraphs split over several lines in the source are joined, so press releases are no longer cut mid-sentence.

### How it reads them

Every relation found for 27 companies was checked against the statements behind it, in four rounds:
- the companies: APLD, NVIDIA, Apple, CoreWeave, Tesla, AMD, Supermicro, Coca-Cola, Micron, Walmart, Ford, Boeing, Microsoft, Broadcom, Intel, IREN, Vertiv, Nike, Lilly, Exxon, Caterpillar, Oracle, Costco, Qualcomm, Palantir, GE and Pfizer;
- the scale: about 900 relations and 2,400 statements per round;
- each round's errors became rules and tests.

The classifier now leaves out anything that is not clearly a current relation.

- **Shares**
  - A share counts only when a filing gives it to that company. In "Lockheed Martin, Pilatus, and Boeing accounted for 36%, 8% and 5%", Boeing's share is 5%.
  - A share for a group of companies, a range, or one product's sales gives no share. Examples: "Walmart, Costco and Amazon accounted for 74%"; "top 10 customers ... 61%"; "30% to 40% of the sales of Elunate".
  - Shares given per year use the latest year, and each share shows its period (FY2026, Q2 FY2027).
  - A company's own top customer is read too: CoreWeave's "67% of our revenue from our top customer, Microsoft".
- **Direction:** who sells to whom.
  - Leasing a data centre to a company makes it a customer.
  - Building a power plant for it makes the builder a supplier.
  - Paying a platform's fees makes the filer the platform's customer.
  - "Manufactures on our behalf" makes the manufacturer a supplier.
  - "Deployed by cloud providers including Oracle" means the filer sells to Oracle.
- **New kinds of relation:** partners (licences, research collaborations, joint ventures, ecosystems), investors in the company, and its lenders.
- **Left out:**
  - forward-looking boilerplate, peer groups, negations and hedges ("may compete");
  - plans ("plan to rely on"), ended deals, takeovers, biographies, exhibit lists, contract definitions;
  - another company's own customers or suppliers;
  - technical fits ("compatible with", "powered by").
- **Names:**
  - Common words are not taken for companies: wet AMD (macular degeneration), Nikola Tesla, Eagle Ford, Polaris Forge, "US" read as "us".
  - Subsidiaries count as their parent.
  - "Coca Cola" matches "Coca-Cola"; accented names (Nestlé) and initials (U.S. Bancorp) match.
  - 76 more well-known companies are recognised by name, and 56 more companies are searched under the names they go by ("Coca-Cola", "Nebius").

### What the screen shows

- Boxes without a share say who last named the company and when ("Its 10-K · Jul 2026", "Both name it · Jul 2026").
- The tables show each relation's latest statement and how many statements back it. A "Stated in the Last 12 Months" filter shows only recent ones.
- The summary counts partners, investors and lenders, and gives the number of filings read and the newest one's date.
- A **Filings Read** tab lists every document read and what it is: the company's own filing, a report, or a current report.

## Find a stock by its name

You no longer need the ticker.
- Typing a company's name in the command line ("applied digital", "coca cola", "nestle") suggests the stocks the online search finds, best match first.
- Pressing GO opens the best match. A function typed before or after the name still runs: "coca cola SPLC", "PROFILE nvidia".
- Tickers and securities the app already knows open as before, without searching.

## Mouse back and forward buttons

The mouse's side buttons move through the screens of the panel under the pointer, as in a browser tab: back returns to the previous screen, forward to the one you left. A keyboard's Browser Back and Forward keys do the same. Alt+← / Alt+→, Backspace on an empty command line and the BACK key still work.

## Validation

- **Tests:** 1,013 unit tests, 36 browser tests and 34 Electron tests, plus ESLint, TypeScript and the production build.
- **New tests:**
  - finding a stock by name;
  - the mouse buttons, pressed as a real mouse does in both the browser and the desktop app;
  - 47 new SPLC tests, on sentences taken word for word from filings.
- **Live:** SPLC was run in the desktop app on live SEC data for Applied Digital.
  - Suppliers: MDU Resources and Babcock & Wilcox.
  - Customers: an unnamed customer at 59% of FY2026 revenue, another at 25%, CoreWeave, and the unnamed investment-grade hyperscaler.
  - Also: 16 competitors; Macquarie and others as partners, investors and lenders; 79 filings read, newest October 2026.
