# Calculator conventions

These screens perform calculations from your inputs. They do not obtain executable bond, derivative or dealer quotes. Desktop and browser use the same mathematics. Blank required inputs produce an explanation; the numbered Example action on bond, forward and swap screens loads labelled illustrative inputs.

## Bonds: BONDCALC / YAS

Regular fixed-rate bullet, face value 100 for quoted prices, nonnegative annual coupon, 1/2/4/12 coupons per year and unadjusted payment dates. Maturity anchors the schedule and preserves end-of-month dates; a maturity on a month end makes it an end-of-month bond. Maturities up to 200 years are supported.

**Day count.** Choose Actual/Actual ICMA (the default), 30/360 US, 30E/360, Actual/360 or Actual/365 Fixed. A is the days from the previous coupon to settlement, E the days in the coupon period and DSC the days from settlement to the next coupon, counted as the SIA Standard Securities Calculation Methods and Excel's PRICE, YIELD and COUPDAYS functions count them:

| Basis | A | E | DSC |
|---|---|---|---|
| Actual/Actual ICMA | actual days | actual days in the regular period | actual days |
| 30/360 US | 30/360 with the SIA end-of-month rules | 360 / frequency | E − A |
| 30E/360 (Eurobond basis) | 30E/360 | 360 / frequency | E − A |
| Actual/360 | actual days | 360 / frequency | actual days |
| Actual/365 Fixed | actual days | 365 / frequency | actual days |

Accrued interest is `coupon / frequency × A / E`. The dirty price discounts the first cash flow DSC/E periods and each later one a whole period more; clean price is dirty less accrued. Price, yield, accrued interest, duration, scenarios, the cash-flow PVs and the Z-spread target (clean + accrued) all use the chosen basis, so the accrued fraction and the fractional exponent always agree.

30/360 US applies, in order: (1) an end-of-month bond with both dates on the last day of February: D2 = 30; (2) an end-of-month bond with D1 on the last day of February: D1 = 30; (3) D2 = 31 and D1 = 30 or 31: D2 = 30; (4) D1 = 31: D1 = 30. Days = 360 × (Y2 − Y1) + 30 × (M2 − M1) + (D2 − D1). Rules 3 and 4 alone are ISDA 2006 section 4.16(f), "Bond Basis". 30E/360 (ISDA 2006 section 4.16(g)) turns a 31st on either date into the 30th and has no February rule. Actual/360 and Actual/365 Fixed accrue the coupon rate × actual days / 360 or 365, so a full period can accrue slightly more or less than coupon / frequency and a coupon-date price at yield = coupon is not exactly par. Actual/Actual ICMA (ICMA Rule 251) on a regular period accrues coupon / frequency × actual days accrued / actual days in the period; unlike Actual/Actual ISDA it does not split the period at a year end.

Tests reproduce Microsoft's published Excel examples (30/360: PRICE 94.63, YIELD 6.5%, ACCRINT 16.666667; actual/actual: COUPDAYBS 71, COUPDAYS 181, COUPDAYSNC 110), the 30/360 Bond Basis and 30E/360 tables of ISDA's "30/360 Day Count Conventions" (2008), the matching 30/360 US table with the SIA rules, and ISDA's 1998 Actual/Actual ICMA-versus-ISDA example.

**Settlement.** Settlement is the trade date plus a lag of business days: T+1 (US Treasuries, and US corporates since the SEC's T+1 rule of 28 May 2024) by default, T+2 for European government bonds, corporates and Eurobonds, or T+0/T+3. A selected bond from a non-US country defaults to T+2. UK gilts and JGBs settle T+1: choose it. The lag skips weekends only; no exchange or national holiday calendar is applied, so check a holiday in the window yourself. Typing a settlement date switches to a manual date; changing the trade date returns to the lag.

Nominal annual yield is compounded at coupon frequency. Clean price is discounted cash flows less accrued interest; dirty price includes accrued. Solving from a positive clean price searches the admissible yield domain above minus 100 times the frequency in percent, without the previous -5%/60% clamp. Extreme inputs outside numerical range are rejected. In the final coupon period the price still compounds over the fractional period; the SIA simple-interest convention for that last period is not applied.

Macaulay and modified duration are in years; convexity is the second dirty-price derivative divided by dirty price. DV01 is positive modified duration times dirty price times 0.0001, per 100 face; the face-amount figure scales it. Scenarios reprice the bond rather than applying only duration. The 32nds display rounds to 1/64; decimal values retain greater precision. Invoice and risk scale by your face amount.

Optional G-spread is `(bond nominal yield % - benchmark nominal yield %) × 100` bp. Supply a suitable maturity benchmark with matching nominal compounding; the app does not interpolate or fetch the benchmark.

For Z-spread enter continuously compounded zero rates at ACT/365F years **from settlement**. Log-linear discount factors use DF(0)=1, require coverage through every payment and do not extrapolate. The solver finds constant decimal `z` such that `sum(CF × baseDF × exp(-z × actualDays/365)) = clean + accrued`. Quoted Z-spread is `z × 10000` bp. Z01 is half the dirty PV difference under z−1bp and z+1bp, per 100 face; spread duration is Z01 / dirty / 0.0001. Spread scenarios hold the base curve fixed. A third projection-rate column, if present, is ignored. Published Treasury **par** yields are not zero rates and must be bootstrapped before use.

Irregular coupons, ex-dividend periods, calls/puts, floating coupons, defaults, taxes and inflation linkage are excluded. Z-spread is option-free, not OAS. Enter actual terms from issue documents; selecting a ticker supplies no assumed terms. CSV includes contract, benchmark/curve inputs, spread results and yield-discounted cash flows. The cash-flow PV table remains discounted by nominal yield, independently of the spread curve.

## FX forwards: FXFORWARD / FRD

Spot and outright are quote currency per unit of base currency. Rates are annual **simple deposit rates**, in percent, with separate ACT/360 or ACT/365F bases. Days run from spot settlement to value date; calculate the contractual dates and holiday rolls separately.

`F = S × (1 + rq × days / basisq) / (1 + rb × days / basisb)`

Points equal `(F - S) / pointSize`; confirm the point size for the pair. A long-base contract receiving base notional N and paying strike K has quote-currency PV **at spot settlement** `N × (F - K) / (1 + rq × days / basisq)`. This model does not apply the further valuation-to-spot discount factor needed for today's PV. PV is blank until a contractual rate is entered. Source spot retains its freshness label; manual spot is an explicit override. Rates held flat across the tenor scenario table are an assumption, not a market curve.

Deposit accumulation factors must remain positive, including under negative rates. Dealer bid/ask spreads, cross-currency basis, collateral, credit and funding adjustments are not modelled. Very long tenors with simple deposits may be inappropriate even when numerically valid.

## Swaps: SWAPCALC / SWPM

Forward-start fixed/float model: start on/after valuation, maturity after start, positive notional, common 1/2/4/12 payment frequency for both legs and unadjusted dates. A short first accrual period is allowed; this is not an overnight-index compounding model. Both legs support ACT/360 or ACT/365F. Currency labels amounts; they do not select calendars or conventions.

Enter nodes as `years, discount-zero %, projection-zero %`, with the third column optional. Rates are continuously compounded zero rates, tenor is ACT/365F from valuation, and two columns use the discount curve for projection too. Tenors must be unique, positive and increasing after sorting. Discount factors are log-linear between nodes and DF(0)=1. Every payment date must be covered; extrapolation is disabled.

Floating coupon: `N × (Pproj(start) / Pproj(end) - 1)`. Each leg cash flow is discounted with the discount curve at payment. Par coupon is floating-leg PV divided by notional times the fixed-leg annuity. A blank fixed coupon solves at par; an entered coupon values that contract. Pay-fixed NPV is floating PV minus fixed PV; receive-fixed reverses the sign.

Curve +1bp P&L revalues both continuous zero curves up 0.01 percentage point with the **original contract coupon held fixed**, even for a base par trade. Fixed coupon +1bp P&L changes the contract coupon only. These are different risks, not interchangeable DV01 figures. Cash-flow table signs follow pay/receive. CSV exports include inputs, nodes, results and projected flows.

Past-start trades need actual fixings and are rejected. Separate leg frequencies, holiday calendars, payment lags, OIS lookback/lockout, compounding conventions and collateral adjustments are outside this model. It is not a full market-standard IRS/OIS engine.

## Single options: OPTIONCALC / OVME and FXOPTION / OVML

Black-Scholes-Merton uses continuous dividend yield; Garman-Kohlhagen uses the base-currency continuous rate in its place and the quote-currency rate for discounting. Spot, strike, volatility and both rates must be valid. Zero volatility uses discounted deterministic payoff rather than spot intrinsic value. At expiry value is intrinsic; undefined boundary Greeks display blank. Vega is per one volatility percentage point, rho per one rate percentage point, theta per calendar day.

Manual inputs work without connected data. Equity options also accept a dividend-yield override and contract multiplier (default 100, which must be confirmed). Source volatility is realised, not implied. Missing source dividend yield is explicitly treated as zero. Reference policy/Treasury rates are flat model approximations; enter appropriate continuous term zero rates for the contract. FX point size is selectable and not inferred from spot magnitude.

Equity expiry choices are Friday calendar dates at 16:00 New York with the correct winter/summer UTC offset, not a verified list of exchange contracts or a holiday-adjusted settlement schedule. A manual days override uses days/365; zero is expiry. FX tenors are calendar days without settlement adjustments. Expiry P&L subtracts upfront premium without financing. No implied surface or executable quote is supplied by these calculators; `OPTIONS` separately displays provider indicative snapshots.

In European mode, `OPTIONCALC` solves implied volatility from a manual premium per share within European no-arbitrage bounds. The lower bound gives zero volatility; the upper bound has no finite solution. `FXOPTION` remains European Garman-Kohlhagen. Neither mode converts realised volatility to a sourced market IV.

### American exercise

`OPTIONCALC` offers American exercise using Tian's three-moment recombining binomial lattice (1993), averaging N and N+1 steps (200/400/800/1600 selectable), with Black-Scholes continuation smoothing over the final time interval and exercise retained at the penultimate layer. Nodes match the first three lognormal moments under continuous rate/dividend yield. Probabilities use stable exponential differences, including at small positive volatility; overflowing grids are rejected. Price is bounded below by spot intrinsic and analytical European BSM. Calls with q≤0/r≥0 and puts with r≤0/q≥0 have no early-exercise benefit and use exact European BSM.

At zero volatility the price maximises the discounted deterministic exercise payoff over t∈[0,T], including the interior stationary point where it exists. It is not simply spot intrinsic or the discounted terminal payoff. American IV uses this model's zero-volatility floor and the appropriate upper bound under negative rates/yields. Premiums on the exercise floor may support a range of volatilities: the app refuses to report a unique IV there. Above the floor it brackets then bisects the same model price. A finite grid has approximation error; a solved IV inherits that error.

American delta/gamma use a spot bump adapted to grid spacing: `min(5%, max(0.5%, vol × sqrt(T/N)))`. Terminal smoothing and a bump spanning the lattice spacing reduce strike-alignment gamma spikes; the actual bump is displayed/exported. Vega uses volatility ±0.1 percentage point (reduced near zero), rho uses rate ±1bp and theta rolls one calendar day (reduced near expiry). Vega/rho remain per percentage point; theta per day. Exercise boundaries and strike alignment can still make finite-grid Greeks unstable. Undefined zero-volatility boundary Greeks stay blank. The displayed grid difference compares the selected resolution with half as many steps; it is a convergence diagnostic, **not an error bound**. Compare multiple grid sizes before relying on small prices or sensitivities. CSV records inputs, model, source references, bump conventions and scenarios.

Ten independent QuantLib 1.40 finite-difference reference cases cover calls/puts, continuous dividends, negative rates and immediate exercise. The optional `scripts/option-reference.py` regenerates the fixture with a 2000×2000 Crank-Nicolson grid and two damping steps; QuantLib is not an application or regular test dependency. Default 400-step prices are required within 0.025 per share, and 800-step prices within 0.008, of those particular reference cases. These checks do not establish uniform accuracy for all possible inputs. Discrete cash dividends, Bermudan dates, adjusted deliverables, assignment, margin and transaction costs remain outside this model.

## Multi-leg options: OPTIONSTRATEGY / OSA

Enter 1–12 legs as `C/P, strike, signed integer contracts, nonnegative entry premium per share, volatility %`, one per line. Positive quantity buys; negative quantity sells. Every leg uses the same expiry (days/365) and entered multiplier. Add positive/negative stock shares and their entry price if needed. Rates and dividend yield are continuous decimals internally; all are explicit inputs. The optional source spot is used only when its input is blank. Examples are labelled calculations, never market quotes.

Entry debit = shares × stock entry price + sum(contracts × multiplier × premium); a negative debit is credit received. Model value = shares × spot + sum(signed units × European BSM value). P&L subtracts entry debit. Aggregate delta includes stock shares; gamma, theta, vega and rho sum signed model Greeks times units. Vega/rho are per percentage point and theta per calendar day. Undefined boundary Greeks stay blank.

Expiry P&L is piecewise linear for terminal spot ≥ 0. The algorithm evaluates zero and every strike, solves roots on every segment and checks the infinite right-tail slope. Thus risk extrema are not limited to the displayed chart. A negative tail slope gives unlimited loss; a positive slope gives unlimited profit. Completely flat zero-P&L segments are reported as intervals. Maximum profit/loss magnitudes are floored at zero when no profit/loss is possible.

Scenarios advance time by 0 through the remaining days, shift spot by `spot × exp(logMovePercent/100)` and add the entered volatility-point shift to every leg. They report P&L vs entry and change from today's model. The table uses the same chosen time/volatility shift. CSV includes inputs, positions, results and scenarios.

Different expiries, American exercise/assignment, discrete cash dividends, premium financing, fees, margin and adjusted option deliverables are excluded. These are theoretical valuations, not order routing or a broker margin calculation.

## Portfolio performance and risk: PORTFOLIO / PORT

Positions and cash are manual snapshots, not a transaction ledger. Increases on the same side average cost, reductions preserve the remaining average cost, reversing across zero uses the new side's entered cost, and closing removes the position. Cash changes separately; no fill, realised P&L or cash movement is booked. Futures count toward NAV at unrealised value `quantity × multiplier × (price − cost) × FX`, and toward exposure at full notional. Other positions contribute market value. Yield-only reference series are not priced portfolio instruments. Current holdings day/cost P&L translates local price changes at current FX; entry-date FX is not recorded.

Performance replays today's fixed quantities and USD cash through observed daily price and historical FX levels. Every holding and foreign currency must be covered on a date; there are no zero substitutions, partial totals or forward fills. All bars dated today or later in UTC are conservatively excluded, even after a market has closed. No claim is made that each market's closes occur at the same instant. Benchmark comparison uses the exact same dates and rebases both lines on the same first shared date. Replay excludes trading, deposits/withdrawals, interest and dividend cash flows; it is not realised or total-return performance. Source price adjustments, splits and generic futures rolls can affect the replay.

Risk applies historical local-price and FX ratios to **current** marked quantities, repricing each line and retaining USD cash. Selected price/FX levels must be positive for relative shocks; nonpositive futures prices outside the selected shared-date window are retained in the source archive and do not invalidate that recent window. A selected window containing them is explicitly refused. For a future, FX changes revalue its unrealised amount rather than treating its entire notional as an owned asset. Current source times/states and each history's bar count are shown. If one input contains a session absent from another, returns spanning that missing session are also excluded. The selectable 1/5/10/20 horizon counts shared observation intervals, not guaranteed exchange business days. Multi-interval windows overlap; they reprice actual endpoint ratios, without square-root scaling. At least 20 valid scenarios are required. Annual volatility uses an explicit 252-interval or 365-day assumption; calendar mixtures, serial dependence and sparse tails limit interpretation.

Loss is minus scenario P&L. VaR is the inverse empirical CDF at the chosen confidence (nearest rank). ES integrates the empirical loss quantile over the worst `1−confidence` fraction, weighting a partial boundary observation when necessary; exact boundary ties share their weight. Negative VaR/ES means gains at that quantile/tail, not an input error. The small-tail warning identifies estimates based on fewer than five observations.

Annual dollar volatility uses sample covariance. Position contribution is `Cov(position P&L, portfolio P&L) / SD(portfolio P&L) × sqrt(annual intervals)`; the components sum to portfolio dollar volatility. Hedging contributions may be negative. Component ES uses the same portfolio-tail weights for every line and sums to portfolio ES. Percentage volatility/leverage/benchmark-return ratios require positive current NAV; drawdown requires all replay NAVs positive. Constant-return regression ratios remain undefined.

Benchmark beta/correlation, tracking error and information ratio pair identical start **and** end dates. Portfolio returns here are historical current-exposure shock P&L divided by current NAV; benchmark returns use historical USD price ratios. These are risk comparisons, not realised active-manager performance. At least 20 matched observations are required. Sharpe is not inferred from a mismatched Treasury series or unknown financing rate.

Stress tests fully reprice linear positions under independent local-price and USD-per-currency shocks, including the price×FX cross term; cash stays fixed. FX moves must exceed −100%, price moves must be at least −100%. Options and yield-curve repricing, corporate actions, financing, margin calls and transaction costs are not modelled. Exposure allocation uses **absolute gross notional**, so long/short hedges do not cause allocation weights to divide by zero. Risk/history CSVs record methods, dates, inputs, current sources and scenarios.

## Historical beta: BETA

The default is Bloomberg's: two years of **weekly** returns against the security's local index, with 6M, 1Y, 2Y and 5Y ranges and daily, weekly or monthly returns selectable (actions 11, 12 and 13), and any relative index typed in. The default index follows the security's country: US SPX, Belgium BEL20 (the STOXX Europe 600 while the app has no BEL20 line), Germany DAX, France CAC, Netherlands AEX, UK UKX, Switzerland SMI, Spain IBEX, Italy FTSEMIB, Japan NKY and Hong Kong HSI. Other countries keep the regional rule (Americas SPX, EMEA STOXX Europe 600, Asia-Pacific NKY); an index is never regressed on itself (SPX uses the Dow).

The range runs back the chosen number of calendar months from the earlier of the two lines' last bars. Weeks run Saturday to Friday: each week's return is from the last available close of one week to the last of the next, so a week whose Friday is a holiday ends on its last session, and weekend bars belong to the following week. Months end on their last session; daily returns use the sessions both lines share. A period counts only when both lines have a close in it, and each return spans the same interval for both. Returns are simple price returns (yield changes for rates); the current period counts with its latest close. Raw beta, alpha (per period), R², correlation and the standard error of beta come from OLS of security on index returns; adjusted beta is `0.67 × raw + 0.33`.

## Rate probabilities: RATEPROBS / WIRP

`#Hikes/Cuts` is cumulative: the implied rate after a meeting minus today's rate, divided by 25 bp. `Cum. %Hike/Cut` is the same cumulative change ÷ 25 bp in percent, uncapped and signed (+140% is 35 bp of hikes priced by that meeting, −100% one full cut). `% Prob of move (this mtg)` is the move priced at that meeting alone, from the rate going into it, ÷ 25 bp and capped at 100%. `Cum. Δ bp` is the cumulative implied change in basis points.
