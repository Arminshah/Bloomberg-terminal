# SPLC review of 30 October 2026: findings and fixes

Four reviews checked the SPLC CSV export of eight companies row by row against the filings and USAspending records each row cites: Eli Lilly and Pfizer; Merck and Exxon Mobil; Chevron, Ford and General Motors; Northrop Grumman. This file lists every finding, the sentence or record and its source, what was wrong, and the commit that fixes it or why it is not fixed.

Branch: `worktree-agent-aa7deeb76b3726e1e`. Regression tests: `tests/supply-chain-review-2026-10-30.test.ts`, which quotes the filings and records as the app reads them.

## How the fixes were checked

- Every rule change ran over the 438 filings the reviews cite, saved locally, through `runChain` with a fixed clock, before and after the change. Each commit changed only the rows it names. The federal records were checked against `api.usaspending.gov` on 30 and 31 October 2026.
- After each commit: `npm run lint`, `npm run typecheck`, `npx vitest run tests/supply-chain*`.
- Northrop's screen was captured live twice on 31 October 2026 (`ARMIN_LIVE_CSV=1`). The first capture showed the DCMA rows gone, the Air Force at $38.7B, Dayton T. Brown at $15.0M, Future Tech at $37.3M, L3 Technologies at $36.5M, Electric Boat inside General Dynamics ($262.5M), Modiv out of the current view and the U.S. Government's 84% unchanged. It also showed two defects of `9d8cebe`, fixed in `4981b54` and `d710692`; the second capture showed Vertex's $4.4M under V2X, Inc. (VVX) and Technovare's record with its reason and no amount. Both captures stopped at the 240-second limit while lookups were still running, so roll-ups that come late (AIR Industries Machining joined AIR Industries Group in the first capture only) may not show in a capture.
- One earlier test changed its expectation: `tests/supply-chain-deals.test.ts` read Scribe's "convertible note that we issued to Eli Lilly" as a lender. It now expects an investment (LLY-1).

## Commits

| Commit | Title | Rows it fixes |
|---|---|---|
| `4fa3a87` | a related company is named by its own CIK, not by a reused ticker | Aris ×3 (X1), Avidity ×22 (LLY-7), Elevation ×2 (LLY-8), New Era ×2 (X5), American Axle/Dauch (GM-9), Citibank ×5 (GM-1), JPMorgan duplicate (GM-13), Hengrui (M8), stale tickers (Sangamo, Pieris, Enzon, Superior, Zuora, Spirit, Triumph, Modiv, AEVEX and others) |
| `71a0c7e` | an agreement the counterparty's filing says ended is shown as ended | Artiva 15, Aligos 11, Foghorn 8, Cocrystal 3, C4 4, LAVA 2, Enzon 4 (M4, M5); Immunocore 3 (LLY-12); Voyager 3, Sangamo 13, Exact 1, Syros 1 (PFE-7, 8, 11 to 13); SES (GM-7); Modiv 5 (NOC 8) |
| `7ff8045` | a company the target took over is no longer its partner | Verve 44 (LLY-11), AtaiBeckley (LLY-10), Biohaven (PFE-6, ended only), Tourmaline (PFE-10), BlueOval SK (F-4) |
| `f4b439c` | "Stated by" is each statement's own filer | 18 Lilly rows, 51 Pfizer rows, L3Harris on Northrop (NOC 11) |
| `9d8cebe` | federal records by funding agency, one report per subaward, real parents | DCMA ×8 (NOC 1), Vertex ×2 (NOC 2), Technovare (NOC 4), repeated subawards (NOC 5), Electric Boat and other units (NOC 9), Meridian ×5 (PFE-1) |
| `9c6097f` | lawsuits, competing products, careers and notices are no relations | Arbutus 3 (PFE-5), BMS (PFE-9), Schrodinger 3 (LLY-9), AtaiBeckley (LLY-10), Atrium (LLY-6), Organon 2 (M1), enGene (M3), Eikon, Crescent, Ligand (M7), Sable 2 (X4), Hess Midstream 2 (CVX-3, CVX-4), Shorepower (GM-4), Phinia 2 (GM-6), ARC 6 (GM-8) |
| `bd91ca3` | shares read for the company, the period and the revenue they are of | Vaxcyte, Endo, Roivant (PFE-2 to 4), Montauk (X2), Matador (X3), Superior (F-1), Dana (F-2), Dauch (F-3), Phinia (GM-5) |
| `a084d67` | who supplies whom when the counterparty files or the company provides | Scribe (LLY-1), BioAge (LLY-2), TRex (LLY-3), Veradermics ×2 (LLY-4, 5), Microsoft (CVX-1), Cerence (GM-2), AYRO ×2 (GM-3), Air Industries (NOC 3) |
| `653cd84` | a filing that names only Merck KGaA means it by "Merck" | Gauzy (M2), Recursion 2, Vera 2 (M6) |
| `daba7a7` | tests: quote the review's filings in full | none (four test cases now quote the filings word for word) |
| `e0629fa` | a holding the company says it owned ends with its sale | Haleon (Pfizer note) |
| `dcfd8bd` | a drug supplied for the filer's own trial is a collaboration | LAVA customer row (M4), BioAge customer row (LLY-2) |
| `4981b54` | a federal party matched on one word is looked up first | Vertex ×2 on the live screen (NOC 2) |
| `d710692` | a doubtful subaward stays on the screen past the ranking cap | Technovare on the live screen (NOC 4) |

## Eli Lilly

**LLY-1. Scribe shown as Lilly's lender.** "Interest expense consists of coupon interest accrued on the convertible note that we issued to Eli Lilly and Company in May 2023." (Scribe 10-Q, 2026-09-02, https://www.sec.gov/Archives/edgar/data/1853921/000119312526380191/sctx-20260630.htm). Scribe issued the note to Lilly, so Lilly lends to Scribe. Fixed in `a084d67`: a note issued to the company makes the filer the company's investment.

**LLY-2. BioAge shown as Lilly's supplier.** "For example, we entered into a material transfer agreement with Lilly, under which Lilly has agreed to manufacture and supply us with a certain quantity (which may be increased by mutual consent) of tirzepatide so we can sponsor a clinical trial in which azelaprag and tirzepatide are co-administered concomitantly or sequentially." (BioAge 424B4, 2024-09-26, https://www.sec.gov/Archives/edgar/data/1709941/000119312524226927/d835745d424b4.htm). Lilly supplies BioAge. `a084d67` made BioAge Lilly's customer; `dcfd8bd` then folded the three statements into BioAge's partner row, since the drug is supplied for BioAge's own trial (the review accepts either).

**LLY-3, LLY-4. TRex and Veradermics shown as suppliers.** "The underwriters will receive the same underwriting discounts and commissions on any of our shares of common stock purchased by Lilly as it will from any other shares of common stock sold to the public in this offering." (TRex 424B4, 2026-10-09, https://www.sec.gov/Archives/edgar/data/2139097/000119312526419203/project_dino_-_424b4.htm; Veradermics 424B4, 2026-02-04, https://www.sec.gov/Archives/edgar/data/1827635/000162828026005505/veradermicsinc424b4.htm, with "Eli Lilly"). IPO text, no trade. Fixed in `a084d67`: "underwriters will receive" is no statement of a relation. TRex keeps its 21 partner statements.

**LLY-5. Veradermics shown as an investment.** "If Eli Lilly or the cornerstone investor is allocated all or a portion of the shares it has indicated an interest in purchasing in this offering or more, and purchases any such shares, ..." (same Veradermics 424B4). An indication of interest is no holding. Fixed in `a084d67`.

**LLY-6. Atrium shown as a supplier.** "In such event, material licenses granted to Lilly expire, and the Company and Lilly negotiate in good faith a product reversion to Avidity." (Atrium 8-K Ex-99.1, 2026-02-26, https://www.sec.gov/Archives/edgar/data/2093101/000119312526077105/d14901dex991.htm). A clause on what follows a termination. Fixed in `9c6097f`: "in such event" and "in the event of termination" state no relation. Atrium keeps its 11 partner statements.

**LLY-7. Avidity's 22 statements shown as "Atrium Therapeutics, RNA".** Example: "We are committed to the advancement and expansion of our pipeline ... and our collaborations with Eli Lilly and Company, or Lilly, and Bristol-Myers Squibb Company, or BMS." (Avidity 10-K, 2026-02-23, https://www.sec.gov/Archives/edgar/data/1599901/000159990126000031/rna-20251231.htm). CIK 1599901 is Avidity; its ticker RNA now belongs to Atrium (CIK 2093101). Fixed in `4fa3a87`: a filer's name and ticker come from its own CIK. The rows now read "Avidity Biosciences, Inc.", no ticker, with the reason from its filing list.

**LLY-8. Elevation Oncology shown as "Elevation Acquisition Group, ELEV".** "Pursuant to clinical supply agreements we entered into with Eli Lilly and Company and GSK, ..." (10-Q, 2024-11-06, https://www.sec.gov/Archives/edgar/data/1783032/000155837024014521/elev-20240930x10q.htm). Fixed in `4fa3a87`.

**LLY-9. Schrodinger's partner evidence included Lilly's takeovers of Morphic and Ajax.** "... in connection with Morphic's acquisition by Eli Lilly and Company, or Lilly, for approximately $3.2 billion." and "In June 2026, in connection with the completion of Eli Lilly and Company's acquisition of Ajax, the Company received a cash payment ..." (https://www.sec.gov/Archives/edgar/data/1490978/000149097826000010/sdgr-20251231.htm, https://www.sec.gov/Archives/edgar/data/1490978/000149097826000068/sdgr-20260630.htm). Fixed in `9c6097f`: "acquisition ... by X" and "X's acquisition of" state a takeover. Schrodinger stays a partner from its own collaboration sentences.

**LLY-10. AtaiBeckley shown as a partner from merger boilerplate, cut mid-word.** "These risks and uncertainties include, but are not limited to: the possibility that AtaiBeckley's shareholders may not approve the adoption of the Merger agreement; ..." (8-K Ex-99.1, 2026-07-16, https://www.sec.gov/Archives/edgar/data/2081043/000114036126028604/ef20078103_ex99-1.htm). Fixed in `9c6097f` (statements about "the Merger" are no relation; a long statement is cut between words) and `7ff8045` (Lilly's own "Lilly completes acquisition of AtaiBeckley" ends any relation with it).

**LLY-11. Verve shown as a current partner and investment (44 rows).** Lilly's 10-K: "In July 2025, we acquired all shares of Verve Therapeutics, Inc. (Verve) for a purchase price of $10.50 per share in cash ..." (https://www.sec.gov/Archives/edgar/data/59478/000005947826000013/lly-20251231.htm). Fixed in `7ff8045`: the company's own statement of a takeover ends every relation with that company as of July 2025; the rows move to the history.

**LLY-12. Immunocore shown as current.** "Historically, collaboration revenue arose under our collaboration agreements with Genentech and Lilly ..." followed by "Our collaboration agreement with Lilly was terminated in 2022 ..." (https://www.sec.gov/Archives/edgar/data/1671927/000167192725000006/imcr-20241231.htm). Fixed in `71a0c7e`: ended in 2022.

**Lower-severity Lilly notes.**
- Sangamo shown with ticker SGMO. Fixed in `4fa3a87` (SGMOQ, from its CIK).
- 18 rows from Incyte's and AbCellera's own 10-Ks labelled "Stated by: own". Fixed in `f4b439c`.
- "our three largest wholesalers each accounted for between 16 percent and 24 percent of consolidated revenue" gives McKesson, Cencora and Cardinal no share. Not fixed: the sentence gives a range for three companies together, and a share is one figure per company. Showing no share is right until the filing gives each one.

## Pfizer

**PFE-1. Meridian Medical Technologies' five federal contracts ($155.6M, 2024 to 2026) shown as Pfizer's.** Example: "... contract 75A50324C00015 with MERIDIAN MEDICAL TECHNOLOGIES, LLC: $82.2M obligated, from Sep 2024 to Sep 2026. ATROPINE & PRALIDOXIME CHLORIDE INJECTOR ..." (https://www.usaspending.gov/award/CONT_AWD_75A50324C00015_7505_-NONE-_-NONE-). Pfizer sold Meridian on 31 December 2021. Fixed in `9d8cebe`: a unit named unlike the company counts only when USAspending files dollars of it under the company's parent record in the latest year, and it files none of Meridian under Pfizer.

**PFE-2. Vaxcyte shown as a supplier with 12%.** "The Prevnar franchise from Pfizer Inc. ("Pfizer") ... accounting for approximately 12% of global non-COVID vaccine sales." (https://www.sec.gov/Archives/edgar/data/1649094/000164909425000028/pcvx-20241231.htm). Fixed in `bd91ca3`: a share of a global or market total is no company's share, and the supplier row is gone. Not added: the competitor row the review proposes. The rules do not read Vaxcyte's competition sentences as naming Pfizer, which is a coverage gap.

**PFE-3. Endo shown as a supplier with 15%.** "For the three months ended March 31, 2023, Varenicline tablets (Endo's generic version of Pfizer Inc.'s Chantix®), which launched in September 2021, made up 15% of consolidated total revenues." (https://www.sec.gov/Archives/edgar/data/2008861/000119312524185328/d15705ds1a.htm). Fixed in `bd91ca3`: the filer's own generic of the company's drug makes it a competitor, with no share.

**PFE-4. Roivant shown as a supplier with 10%, from a slide.** "... US SpikeVax Sales make up ~10% of global COVID-mRNA vaccine sales to date Genevant/ABUS continue to pursue recovery against Pfizer and BioNTech ..." (https://www.sec.gov/Archives/edgar/data/1635088/000114036125045204/ef20061071_ex99-2.htm). Fixed in `bd91ca3` (no share of global sales) and `9c6097f` ("pursue recovery against" is litigation). Roivant keeps its correct partner row (Priovant).

**PFE-5. Arbutus shown as a partner.** "... on-going lawsuits against Moderna and Pfizer/BioNTech for use of Arbutus' patented LNP technology in their COVID-19 vaccines." (https://www.sec.gov/Archives/edgar/data/1447028/000117184326001838/exh_991.htm). Fixed in `9c6097f`.

**PFE-6. The wrong Biohaven.** "Collaboration with Biohaven––In November 2021, we entered into a collaboration and license agreement ... with Biohaven ..." (Pfizer 10-K, https://www.sec.gov/Archives/edgar/data/78003/000007800325000054/pfe-20241231.htm). Pfizer acquired that Biohaven (CIK 1689813) on 3 October 2022. Partly fixed in `7ff8045`: the same 10-K's "On October 3, 2022, we acquired Biohaven" ends the relation, so it leaves the current view. Not fixed: the history row still names Biohaven Ltd. (BHVN, CIK 1935979). Reading Pfizer's glossary ("Biohaven: Biohaven Pharmaceutical Holding Company Limited") would need a reader for definition tables, and the old company is not in the SEC's current list.

**PFE-7, PFE-8. Voyager's and Sangamo's agreements assigned to Alexion in 2023.** "Effective upon the closing of a transaction on September 20, 2023, Alexion ... acquired all of Pfizer's rights under the Alexion Agreement and became the successor-in-interest to Pfizer thereunder." (https://www.sec.gov/Archives/edgar/data/1640266/000164026626000006/vygr-20260630.htm) and "... with Pfizer, subsequently assigned to Alexion, AstraZeneca Rare Disease ("Alexion") in September 2023 ..." (https://www.sec.gov/Archives/edgar/data/1001233/000162828026035067/sgmo-20260331.htm). Fixed in `71a0c7e`: assigned away, ended September 2023.

**PFE-9. BMS shown as a supplier from the alliance sentence.** "BMS and Pfizer manufacture the product in the alliance and BMS is the principal in the end customer product sales in the U.S., ..." (https://www.sec.gov/Archives/edgar/data/14272/000001427226000004/bmy-20251231.htm). Fixed in `9c6097f`: read as a partnership. The next sentence ("BMS supplies the product to Pfizer at cost plus a percentage") keeps BMS's supplier row.

**PFE-10. Tourmaline shown as a current investment.** "In addition, in May 2023, we issued 8,823,529 additional shares of our Series A convertible preferred stock to Pfizer ..." (https://www.sec.gov/Archives/edgar/data/1827506/000182750625000027/trml-20241231.htm). Novartis bought Tourmaline for cash in October 2025. Fixed in `7ff8045`: a stake in a company whose own 8-K reports a change in control (item 5.01) is ended. The app reads that from Tourmaline's filing list when it checks companies no longer listed. The licence stays a partner relation.

**PFE-11, PFE-12, PFE-13. Sangamo (hemophilia A), Exact Sciences and Syros shown as current.** "In December 2024, Pfizer notified the Company of its termination for convenience, effective April 21, 2025 ..." (Sangamo, URL above); "... after November 30, 2021, Pfizer will no longer promote the Cologuard test ..." (https://www.sec.gov/Archives/edgar/data/1124140/000112414025000020/exas-20241231.htm); "As the agreement was terminated in October 2023, no revenue was recognized ..." (https://www.sec.gov/Archives/edgar/data/1556263/000095017024119236/syrs-20240930.htm). Fixed in `71a0c7e`: ended April 2025, November 2021 and October 2023. The Syros ending is read from the sentence after the one naming Pfizer.

**Lower-severity Pfizer notes.**
- 51 rows from Valneva, Sangamo, Arvinas, OPKO and BioNTech labelled "own". Fixed in `f4b439c`.
- Pieris shown as PIRS. Fixed in `4fa3a87` (Palvella, PVLA, by CIK).
- Haleon: "We owned 32% of Haleon as of December 31, 2023." (Pfizer 10-K, 2026-02-26, https://www.sec.gov/Archives/edgar/data/78003/000007800326000026/pfe-20251231.htm) kept Haleon current, though the same 10-K reports "the remaining sale of our investment in Haleon in 2025". Fixed in `e0629fa`.
- Statements cut mid-word ("ward-looking statements Arvinas makes"). Partly fixed in `9c6097f`: a long statement is now cut between words. Not fixed: statements broken at page breaks or PDF line wraps (BioNTech 20-F/A, Genmab 20-F, Telix). That needs page footers removed before sentences are split, which changes every saved sentence and was left for its own change.
- Ligand: "Lasofoxifene ... discovered through the research collaboration between Pfizer and Ligand." The review calls it a correct statement of a past collaboration whose filing does not say it goes on. Not changed: the filing gives no ending to read.

## Merck

**M1. Organon shown as a competitor.** "... including competition investigations resulting from enforcement activity concerning Merck's conduct involving Organon's products." (https://www.sec.gov/Archives/edgar/data/1821825/000162828026011125/ogn-20251231.htm). Fixed in `9c6097f`: "competition investigations", enforcement and legal matters are no rivalry. Organon keeps its supplier and partner rows.

**M2. Gauzy's "Merck" is Merck KGaA.** "... a select group of chemicals suppliers who range from large traditional companies such as Merck and Gentex to a few small suppliers primarily located in Asia." (https://www.sec.gov/Archives/edgar/data/1781446/000121390025022437/ea0233167-20f_gauzy.htm). Fixed in `653cd84`: a chemicals supplier named Merck is not Merck & Co.

**M3. enGene warrants held by a Lumira fund shown as Merck's investment.** "... warrants held by Merck-Lumira that may be exercised to acquire 145,603 Common Shares, ..." (https://www.sec.gov/Archives/edgar/data/1980845/000095017025024221/engn-20241031.htm). Fixed in `9c6097f`: a company's name inside a fund's name is no holding of that company.

**M4. LAVA shown as a customer; the agreement ended in December 2024.** "Under the terms of this agreement, Merck agreed to provide us with pembrolizumab for the dose escalation and expansion phases of our Phase 1 study of LAVA-1207 (NCT05369000) (KEYNOTE-F73)." and "... we terminated this agreement in December 2024 ..." (https://www.sec.gov/Archives/edgar/data/1840748/000155837025003988/lvtx-20241231x10k.htm). Fixed in `71a0c7e` (ended December 2024) and `dcfd8bd` (a drug supplied for the filer's own study is a partnership; the customer row is gone).

**M5. 46 partner rows and 1 supplier row whose own filing says the agreement ended.**
- Artiva: "In October 2023, the Merck Collaboration Agreement and development thereunder was terminated by Merck." (https://www.sec.gov/Archives/edgar/data/1817241/000095017025043837/artv-20241231.htm)
- Aligos: "In February 2023 and May 2024, Merck provided us written notice of termination for both of the targets in the collaboration." (https://www.sec.gov/Archives/edgar/data/1799448/000095017025035929/algs-20241231.htm)
- Foghorn: "On August 9, 2023 we received notice from Merck that it was terminating the Merck Collaboration Agreement effective November 7, 2023." (https://www.sec.gov/Archives/edgar/data/1822462/000162828025010933/fhtx-20241231.htm)
- Cocrystal: "On December 15, 2023, we received written notice from Merck of Merck's election to terminate the Collaboration Agreement ..." (https://www.sec.gov/Archives/edgar/data/1412486/000164117225001496/form10-k.htm)
- C4: "The Merck Agreement was terminated by Merck, effective late November 2025." (https://www.sec.gov/Archives/edgar/data/1662579/000162828026055494/cccc-20260630.htm)
- Enzon: "We will receive no additional royalties from Merck." (https://www.sec.gov/Archives/edgar/data/727510/000110465926022313/enzn-20251231x10k.htm)

Fixed in `71a0c7e`. Each relation moves to the history with the date the filing gives (Artiva October 2023, Aligos May 2024, Foghorn 7 November 2023, Cocrystal 15 December 2023, C4 November 2025, LAVA December 2024). Enzon's sentences about Merck give no date, so its ending is dated by the filing (2 March 2026); the 31 December 2024 expiry is in a sentence that does not name Merck. Enzon's CIK now shows its current name, Viskase Holdings (`4fa3a87`). The Artiva supplier sentence, cut at a page break, also ends with the agreement.

**M6. Merck KGaA shown as Merck & Co. (Recursion ×2, Vera ×2).** "In September 2023, the Company and Merck entered into a collaboration agreement to discover novel small molecule drug candidates across oncology, neuroinflammation and immunology." (https://www.sec.gov/Archives/edgar/data/1601830/000160183026000039/rxrx-20251231.htm); "On October 29, 2020, we entered into the Ares Agreement with Ares, an affiliate of Merck, ..." (https://www.sec.gov/Archives/edgar/data/1831828/000119312526077442/vera-20251231.htm). Fixed in `653cd84`: a filing whose sentences name Merck KGaA, Darmstadt, EMD Serono, Merck Serono, Ares Trading or MilliporeSigma in two or more sentences, and never Merck & Co., MSD, Merck Sharp & Dohme, Rahway, Kenilworth or a Merck & Co. product (KEYTRUDA, an MK- code, GARDASIL, JANUVIA, ERVEBO), gives Merck & Co. no relation. The other twelve filings that name Merck KGaA keep their rows: each also names Merck & Co. or its products, or (Lumos) names Merck Serono only once.

**M7. Not a business relation.**
- Eikon: "Drs. Perlmutter and Baynes previously collaborated with our current Chief Business Officer, Benjamin Thorner, during their time at both Amgen and Merck ..." (https://www.sec.gov/Archives/edgar/data/1861123/000119312526130395/eikn_form_10-k_2025.htm)
- Crescent: "... LM-299 (LaNova Medicines Ltd.; in-licensed by Merck), ..." (https://www.sec.gov/Archives/edgar/data/1253689/000162828026011983/cbio-20251231.htm)
- Ligand: "... MK-4830 (Merck), and UGN-301 (UroGen Pharma) (collectively referred as "Agenus Partnered Programs") ..." (https://www.sec.gov/Archives/edgar/data/886163/000088616326000006/lgnd-20251231.htm)

Fixed in `9c6097f`. Crescent stays a competitor; Ligand keeps its two direct royalty rows.

**M8. Hengrui under two IDs.** "... a license agreement with Jiangsu Hengrui Pharmaceutical Co., Ltd. (Hengrui Pharma)." (https://www.sec.gov/Archives/edgar/data/310158/000110465926090045/tm2621496d1_ex99-1.htm). Fixed in `4fa3a87`: a name's last word may be singular or plural, so it finds CIK 2071868.

**Merck patterns.**
- Counterparties since acquired, renamed or delisted (Lumos, Kineta, iTeos, IO Biotech, RAPT, Dynavax, BioXcel, LAVA, Enzon, New Era). Fixed in `4fa3a87`: a CIK the SEC's current list no longer has shows no ticker and the reason from its own filing list ("Acquired", "Deregistered", "Delisted"). Personalis's pending merger with Tempus is not shown: it has not closed.
- Statements cut at page breaks, and page numbers inside sentences (Personalis, Artiva, Crescent, Aligos "research, 123 optimize", Atea "ranging from 17 high single digits"). Not fixed, as for Pfizer above.
- Personalis: "We also derive a significant portion of our revenue from Merck, which accounted for 30% and 7% of our revenue for the six months ended June 30, 2026 and each of the years ended December 31, 2025 and 2024, respectively." (https://www.sec.gov/Archives/edgar/data/1527753/000119312526332817/psnl-20260630.htm). Not fixed: two figures for three periods ("each of the years") need a period reader that pairs them; the row shows no share, which is a labelled blank.
- Mangoceuticals names "Merck & Co., which offers the branded hair loss product Propecia", now Organon's. The row matches its sentence; not changed.

## Exxon Mobil

**X1. Aris Water shown as Aris Mining (ARIS), 3 rows.** "In July 2024, Coterra joined our beneficial reuse strategic agreement (the "Joint Industry Project" or "JIP") with Chevron U.S.A. Inc., ConocoPhillips and Exxon Mobil Corporation ..." (https://www.sec.gov/Archives/edgar/data/1865187/000155837025001818/aris-20241231x10k.htm). Fixed in `4fa3a87`: "Aris Water Solutions, Inc.", no ticker, "Acquired Oct 2025 (was ARIS)" from its 8-K of 15 October 2025 (item 5.01), 25-NSE and 15-12G.

**X2. Montauk's 2024 share for ExxonMobil read as 11.8%.** "In 2024, RIN sales to Valero, GE Warren, ExxonMobil and Mercuria represented approximately 17.6%, 15.7%, 13.8 and 11.8%, respectively, of our operating revenue." (https://www.sec.gov/Archives/edgar/data/1826600/000119312526102364/mntk-20251231.htm). Fixed in `bd91ca3`: a figure without its sign inside a list of percentages keeps its place (13.8%).

**X3. Matador's 13% is of oil, natural gas and NGL revenues.** "... Exxon Mobil Corporation (13%, 15% and 24%, respectively) ..." of "the Company's total oil, natural gas and NGL revenues" (https://www.sec.gov/Archives/edgar/data/1520006/000152000626000002/mtdr-20251231.htm). Fixed in `bd91ca3`: the share keeps the revenue line it is of; the export's Denominator reads "line-revenue (oil, natural gas and NGL)" and the screen "Line rev". Talos's line equals its total revenue and is unchanged.

**X4. Sable shown as a customer, 2 rows.** "Additionally, in connection with the Third Amendment, the Company obtained a limited waiver (the "Limited Waiver") from Exxon and Mobil Pacific Pipeline Company under the Sable-EM Purchase Agreement, ..." (https://www.sec.gov/Archives/edgar/data/1831481/000183148126000104/socc-20260630.htm). Fixed in `9c6097f`: a waiver under an asset purchase agreement is no trade. Exxon as Sable's former lender is not added: Sable's own screen is outside this review.

**X5. New Era Helium shown under its old name and ticker.** "We are also in competition with major producers such as ExxonMobil and the Helium Majors themselves." (https://www.sec.gov/Archives/edgar/data/2028336/000141057825000590/nehc-20241231x10k.htm). Fixed in `4fa3a87`: "New ERA Energy & Digital, Inc.", NUAI.

## Chevron

**CVX-1. Microsoft shown as a supplier.** "During the quarter, Chevron signed a 20-year power purchase agreement with Microsoft to provide 2.67 gigawatts of behind-the-meter power for its data center in West Texas." (https://www.sec.gov/Archives/edgar/data/93410/000009341026000162/a06302026ex9918-k.htm). Fixed in `a084d67`: a power purchase agreement to provide power for the other party's site makes it a customer.

**CVX-2. Hess Midstream is a Chevron-controlled, consolidated affiliate shown as an outside supplier (97% of its revenue).** Chevron's 10-K: "Chevron holds an approximately 38 percent consolidated ownership interest in Hess Midstream LP (HESM) following the acquisition of Hess." (https://www.sec.gov/Archives/edgar/data/93410/000009341026000078/cvx-20251231.htm). Not fixed. The supplier direction is right. Marking it intra-group needs a reader for control language ("consolidated ownership interest in", "general partner of") in the company's own filings and a new mark on the relation; no rule changed here explains it.

**CVX-3. Hess Midstream shown as a customer.** "If Chevron's production volumes decrease or if Chevron's customers reduce their purchases of crude oil, natural gas or NGLs from Chevron ..." (https://www.sec.gov/Archives/edgar/data/1789832/000119312526071592/hesm-20251231.htm). Fixed in `9c6097f`: "Chevron's customers" are third parties.

**CVX-4. Hess Midstream shown as a partner from a risk factor.** "Cyberattacks and events affecting our operational technology networks ... by us, Chevron or our business partners may materially impact our business and operations." (same URL). Fixed in `9c6097f`.

**Minor.** The same Texas Pacific Land sentence is stored twice, differing by a comma. Not fixed: two texts that differ are kept as two statements, and the relation is right.

## Ford

**F-1. Superior's 92% shown as Ford's.** "Our OEM aluminum wheels accounted for approximately 92% of our sales in 2024 and were primarily sold for factory installation on vehicle models manufactured by BMW (including Mini), Ford, GM, ..." (https://www.sec.gov/Archives/edgar/data/95552/000095017025034599/sup-20241231.htm). Fixed in `bd91ca3` (a product line's share is no customer's) and `4fa3a87` (SUP dropped: Superior filed a 15-12G in December 2025).

**F-2. Dana's 32% from Ford missed.** "As a percentage of total sales from operations, our sales to Ford were approximately 32% in 2025, 31% in 2024 and 28% in 2023." (https://www.sec.gov/Archives/edgar/data/26780/000143774926006076/dan20251231_10k.htm). Fixed in `bd91ca3`.

**F-3. Dauch's 11% of the first six months of 2026 labelled "2026".** "Sales to Ford were approximately 11% of our consolidated net sales for the first six months of 2026, and 15% for both the first six months of 2025 and the full year 2025." (https://www.sec.gov/Archives/edgar/data/1062231/000106223126000139/dch-20260630.htm). Fixed in `bd91ca3`: the period reads "6M of 2026", and the screen shows the year's 15% for 2025 before a newer part year.

**F-4. BlueOval SK shown as a supplier; Ford's interest was redeemed in May 2026.** "... including contributing up to a maximum of $6.6 billion in capital to BlueOval SK, LLC ("BOSK") over a five-year period ending in 2026." (https://www.sec.gov/Archives/edgar/data/37996/000003799625000186/f-20250930.htm) and "Upon closing, Ford's membership interest in BOSK was redeemed in full, ..." (Ford 10-Q, 2026-07-29, https://www.sec.gov/Archives/edgar/data/37996/000003799626000156/f-20260630.htm). Fixed in `7ff8045`: investments in battery suppliers are stakes, and the redemption ends the stake. The test quotes both sentences as filed (`daba7a7`).

**Minor.** Blue Bird's EX-99.2 slide text is stored as a statement. Not fixed: the relation stands on the Master Collaboration Agreement sentences, and skipping slide decks altogether would drop correct rows elsewhere.

## General Motors

**GM-1. Citibank shown as the ADR depositary filer (JTGEY), 5 rows.** "... JPMorgan Chase Bank, N.A., as administrative agent, and Citibank, N.A., as syndication agent" (https://www.sec.gov/Archives/edgar/data/1467858/000119312526119684/d114837d8k.htm). Fixed in `4fa3a87`: "/ADR" depositary filers are never matched; Citibank, N.A. reads as Citigroup (C).

**GM-2. Cerence shown as a customer.** "Our automobile manufacturer customers, commonly referred to as OEMs, include BMW, Mercedes-Benz, ... Ford, General Motors, ..." (https://www.sec.gov/Archives/edgar/data/1768267/000162828025053372/crnc-20250930.htm). Fixed in `a084d67`: supplier.

**GM-3. AYRO shown as a partner.** "In December 2024, the Company was named a tier one supplier for General Motors (GM) through its partnership with GLV ..." (https://www.sec.gov/Archives/edgar/data/1086745/000164117225001705/form10-k.htm). Fixed in `a084d67`: supplier. The CIK now shows its current name, Fabric.AI (FABC).

**GM-4. Shorepower's competitor row names a venture of seven automakers.** "... the recently announced joint venture among BMW, General Motors, Honda, Hyundai, Kia, Mercedes-Benz and Stellantis and others." (https://www.sec.gov/Archives/edgar/data/764630/000149315224013159/forms-1a.htm). Fixed in `9c6097f`.

**GM-5. Phinia's 18% missed.** "For the year ended December 31, 2025, our top five customers accounted for approximately 37% of our net sales, with General Motors Company representing 18%." (https://www.sec.gov/Archives/edgar/data/1968915/000196891526000023/phin-20251231.htm). Fixed in `bd91ca3`.

**GM-6. Phinia partner from a trademark notice, 2 rows.** "(DELCO REMY is a registered trademark of General Motors LLC, licensed to PHINIA Technologies Inc.)" (https://www.sec.gov/Archives/edgar/data/1968915/000196891526000152/q320268kex991pressrelease.htm). Fixed in `9c6097f`.

**GM-7. SES AI's partnership ended in September 2024.** "In February 2021, the Company established a partnership with GM Global Technology Operations LLC ..." then "The JDA concluded in September 2024." (https://www.sec.gov/Archives/edgar/data/1819142/000181914226000010/ses-20251231x10k.htm). Fixed in `71a0c7e`: the next sentence is read with the one naming GM.

**GM-8. ARC Automotive shown as a supplier from a recall note, 6 rows.** "ARC Matters In May 2023, we initiated a voluntary recall covering nearly one million 2014-2017 model year Buick Enclave, ... equipped with driver front airbag inflators manufactured by ARC Automotive, Inc. (ARC), ..." (https://www.sec.gov/Archives/edgar/data/1467858/000146785826000013/gm-20251231.htm). Fixed in `9c6097f`.

**GM-9. American Axle under its old name (AXL).** "Sales to General Motors Company (GM) were approximately 44% of our consolidated net sales in 2025, ..." (https://www.sec.gov/Archives/edgar/data/1062231/000106223126000020/dch-20251231.htm). Fixed in `4fa3a87`: Dauch Corp, DCH, on every screen.

**GM-10. Cooper-Standard: GM's 19% (in a table) missed.** (https://www.sec.gov/Archives/edgar/data/1320461/000132046126000012/cps-20260213.htm). Not fixed: SPLC reads sentences, and the figure is only in the "10% or more" table. A table reader is a separate change.

**GM-11. PAMT's 14% has no period.** "Our largest customer, General Motors Company, accounted for approximately 14% of our revenue." The year is in the sentence before ("For 2025, our top five customers ..."). (https://www.sec.gov/Archives/edgar/data/798287/000143774926007960/ptsi20251231_10k.htm). Not fixed: the app reads a sentence naming the company and the one after it. Taking the period from the sentence before needs the extraction to carry that sentence too.

**GM-12. Zuora: "About Zuora" boilerplate from a deregistered company.** "More than 1,000 customers around the world, including BMC Software, Box, Caterpillar, General Motors, ... use Zuora's leading combination of technology and expertise ..." (https://www.sec.gov/Archives/edgar/data/1423774/000142377424000280/a20241031q3earningsrelease.htm). Partly fixed in `4fa3a87`: ZUO dropped, the row shows Zuora is no longer listed. Not fixed: weighting "About" paragraphs lower; the direction (GM uses Zuora) is right.

**GM-13. JPMorgan under two IDs.** "... with JPMorgan Chase Bank, N.A., as administrative agent, ..." (8-K above). Fixed in `4fa3a87`: "N.A." is a legal form, so one lender.

**Minor.**
- SAIC-GMF Leasing's evidence states SAIC's 45%; GM's 35% is in a table above it. Not fixed: no share is shown for the row, and the 35% is only in the table.
- Lithium Americas: curly apostrophes dropped ("Orions"). Not reproduced: the app's text reader turns ’ and &#8217; into an apostrophe, and the cited release is not among the saved filings.
- "Investors 2" (Chevron) and "Investors 3" (GM) count the company's own investees. Not changed: the label belongs to the screen's summary line, which the review did not ask to rename; it is listed for the owner.

## Northrop Grumman

The U.S. Government's 84% of 2025 sales (10-K of 27 January 2026) is correct and unchanged. The prime-contract records are all Northrop's, including the two Alliant Techsystems Operations awards (parent Northrop) and the two service contracts still under Northrop's UEI.

**1. The Defense Contract Management Agency shown as a $12.7B customer, 8 rows.** "Defense Contract Management Agency contract F4261098C0001 with NORTHROP GRUMMAN SYSTEMS CORPORATION: $10.0B obligated, from Jul 1998 to Nov 2025. ..." (https://www.usaspending.gov/award/CONT_AWD_F4261098C0001_9700_-NONE-_-NONE-), and seven more. DCMA administers contracts the Air Force, Army and Navy issue and fund. Fixed in `9d8cebe`: when the awarding sub-agency is DCMA, the customer is the funding agency.

**2. Vertex Aerospace read as Vertex, Inc. (VERX), 2 rows.** "VERTEX AEROSPACE LLC subcontract to NORTHROP GRUMMAN SYSTEMS CORPORATION under Department of Defense contract FA702225F0011: $4.2M, Apr 2025. ..." (https://www.usaspending.gov/award/CONT_AWD_FA702225F0011_9700_FA702222D0001_9700). Fixed in `9d8cebe`: a party matched on one word is looked up by its UEI; USAspending names it V2X AEROSPACE LLC today, so the rows go to V2X, Inc. (VVX). A live capture of Northrop's screen on 31 October 2026 still showed Vertex, Inc.: it ranked 25th by amount among the unmatched parties, and lookups stop at 15. `4981b54` looks up one-word matches first; the second live capture shows V2X.

**3. Air Industries shown as a customer.** "Air Industries Group's relationship with Northrop Grumman began decades ago as a supplier to a predecessor, the Grumman Aerospace Corporation ..." (https://www.sec.gov/Archives/edgar/data/1009891/000121390025019757/ea023289801ex99-1_airindust.htm). Fixed in `a084d67`: supplier.

**4. Technovare's $927.0M subaward ranked fifth.** "NORTHROP GRUMMAN SYSTEMS CORPORATION subcontract to TECHNOVARE SYSTEMS, INC. under Department of Defense contract FA881018C0006: $927.0M, Jul 2023. TECHNICAL SERVICES." (https://www.usaspending.gov/award/CONT_AWD_FA881018C0006_9700_-NONE-_-NONE-). It is 27% of a $3.49B prime, and Technovare's other subaward of the period is $151,000. Fixed in `9d8cebe`: a subaward of $100M or more, above a tenth of its prime contract and over 20 times the subcontractor's next one (or with no other), is shown with that reason and not counted or ranked. The first live capture dropped it with the suppliers past the ranking cap; `d710692` keeps it after the ranked ones.

**5. Repeated reports of one subaward added up.** Dayton T. Brown (5000256853, three reports on 2022-03-31: $30.0M shown for about $15.0M), Future Tech (5000346655), L3 Technologies (5000307012, nine reports), HII Mission Technologies (P000075408). Fixed in `9d8cebe`: a subaward number under one prime counts once, its latest report (the largest on the same day). The review's possible cases (Lockheed 5000366136, Aurora, Jabil) differ in amount and description and may be modifications; they also count once now.

**6. Frequency Electronics: a prior-year share shown as current.** "During fiscal year 2025, Northrop Grumman Company ("Northrop Grumman") accounted for more than 10% of the Company's consolidated revenues." (10-K for the year to 30 April 2026, https://www.sec.gov/Archives/edgar/data/39020/000118518526002997/feim10k043026.htm). Not fixed: that Northrop fell below 10% in fiscal 2026 follows from the sentence before, which lists the fiscal 2026 customers without Northrop. The app reads only sentences naming the company and the one after, and a share is not inferred from an absence.

**7. Ducommun's 5.8% missed.** The figure is in the table after "Net revenues from our top ten customers, including ... Northrop Grumman Corporation ("Northrop") ..., represented the following percentages of total net revenues:" (https://www.sec.gov/Archives/edgar/data/30305/000162828026032536/dco-20251231.htm). Not fixed: tables are not read (as GM-10).

**8. Modiv shown as a current landlord, 5 rows.** "On May 21, 2026, the Company completed the sale of its industrial property in Melbourne, Florida leased to Northrop Grumman for $18.7 million." (https://www.sec.gov/Archives/edgar/data/1645873/000164587326000079/none-20260630.htm). Fixed in `71a0c7e`: ended 21 May 2026. MDV dropped (`4fa3a87`).

**9. Units not rolled up to their listed parent.** Fixed in `9d8cebe` for units USAspending files under a listed parent: the 15 largest unmatched subcontract parties of $1M or more are looked up by UEI, and a listed parent USAspending gives takes their dollars. Electric Boat is filed under GENERAL DYNAMICS CORP (checked, and in the tests); AIR Industries Machining under AIR INDUSTRIES GROUP. Not fixed: L3 Technologies (UEI FRJQGQHDX4J3) is filed under L-3 COMMUNICATIONS HOLDINGS, INC., and Aerojet Rocketdyne of DE under AEROJET ROCKETDYNE HOLDINGS, INC. Both parents are no longer listed, and the step from them to L3Harris is in L3Harris's filings, which the lookup does not read. HII Mission Technologies, Rockwell Collins S&TS, Teledyne Brown, DRS and Bell Textron depend on the same lookup and on the cap of 15; they were not checked in a live run.

**10. Stale tickers.** Spirit AeroSystems (SPR), Triumph (TGI) and AEVEX (blank, now AVEX). Fixed in `4fa3a87`.

**11. L3Harris's own competitor list labelled "own".** "We compete domestically and internationally against large defense companies; principally BAE Systems, Boeing, General Dynamics, Lockheed Martin, Northrop Grumman, RTX, ..." (https://www.sec.gov/Archives/edgar/data/202058/000020205826000015/hrs-20260102.htm). Fixed in `f4b439c`: Stated by "theirs" for this statement; the row is "both" because Northrop's 10-K names L3Harris too.

**12. Minor display points.** Not changed: the delivery order shown as "contract 0003" (FA862015D3009/0003), the raw legacy FPDS description of F4261098C0001, "Contracts $" reading as a recent amount while it is the lifetime obligation of contracts active in the last year, "Investors 1" for Northrop's own investee Firefly, and the 2022 credit agreement still cited beside the 2025 one (JPMorgan is agent on both). DLA, DMEA and NASA records funded by other agencies keep their awarding agency: they buy for those agencies, which the review left for a decision.

## Coverage gaps

The reviews found relations the screens miss: Chevron's equity affiliates in its own 10-K (Tengizchevroil, Angola LNG, Caspian Pipeline Consortium), Murphy Oil's 19% from Chevron, Alto Ingredients' Chevron Products USA, Bunge's Chevron joint venture, WaterBridge, Dorian LPG and NewMarket; Ford's own FY2025 10-K ventures (Ford Otosan, Changan Ford, JMC, AutoAlliance Thailand), Lear's 12% from Ford, Cooper-Standard's 27% from Ford, and the Cerence, REV Group and Xos sentences that name Ford beside GM. None follows from a rule changed here, so none is claimed as fixed. The likely causes are the search and reading limits (Chevron's capture ended in 72 seconds), tables, and share sentences for several companies at once. They are left for a coverage change.
