# Calculator conventions

These screens perform calculations from your inputs. They do not obtain executable bond, derivative or dealer quotes. Desktop and browser use the same mathematics. Blank required inputs produce an explanation; the numbered Example action on bond, forward and swap screens loads labelled illustrative inputs.

## Bonds: BONDCALC / YAS

Regular fixed-rate bullet, face value 100 for quoted prices, nonnegative annual coupon, 1/2/4/12 coupons per year, unadjusted payment dates and Actual/Actual ICMA accrual between regular coupon dates. Enter the contractual settlement date; no business-day or settlement lag is inferred. Maturity anchors the schedule and preserves end-of-month dates. Maturities up to 200 years are supported.

Nominal annual yield is compounded at coupon frequency. Clean price is discounted cash flows less accrued interest; dirty price includes accrued. Solving from a positive clean price searches the admissible yield domain above minus 100 times the frequency in percent, without the previous -5%/60% clamp. Extreme inputs outside numerical range are rejected.

Macaulay and modified duration are in years; convexity is the second dirty-price derivative divided by dirty price. DV01 is positive modified duration times dirty price times 0.0001, per 100 face; the face-amount figure scales it. Scenarios reprice the bond rather than applying only duration. The 32nds display rounds to 1/64; decimal values retain greater precision. Invoice and risk scale by your face amount.

This model does not price irregular coupons, ex-dividend periods, calls/puts, floating coupons, defaults, taxes, inflation linkage or credit/benchmark spreads. Enter the actual terms from the issue documents; a selected ticker does not supply assumed terms. CSV exports include inputs, convention and discounted cash flows.

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

## European options: OPTIONCALC / OVME and FXOPTION / OVML

Black-Scholes-Merton uses continuous dividend yield; Garman-Kohlhagen uses the base-currency continuous rate in its place and the quote-currency rate for discounting. Spot, strike, volatility and both rates must be valid. Zero volatility uses discounted deterministic payoff rather than spot intrinsic value. At expiry value is intrinsic; undefined boundary Greeks display blank. Vega is per one volatility percentage point, rho per one rate percentage point, theta per calendar day.

Manual inputs work without connected data. Equity options also accept a dividend-yield override and contract multiplier (default 100, which must be confirmed). Source volatility is realised, not implied. Missing source dividend yield is explicitly treated as zero. Reference policy/Treasury rates are flat model approximations; enter appropriate continuous term zero rates for the contract. FX point size is selectable and not inferred from spot magnitude.

Equity expiry choices are Friday calendar dates, not a verified list of exchange contracts; FX tenors are calendar days without settlement adjustments. These are European models and do not value American early exercise. Expiry P&L subtracts upfront premium without financing. No implied surface, licensed option chain or executable quote is supplied.
