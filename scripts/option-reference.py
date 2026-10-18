"""Optional independent fixture generator. Requires QuantLib 1.40; not an application/test dependency.

Use an isolated Python environment, install QuantLib==1.40, then run this file.
The production implementation uses a Tian lattice; this reference solves the
American exercise problem with QuantLib's finite-difference PDE engine instead.
"""
import json
from pathlib import Path

import QuantLib as ql

if ql.__version__ != "1.40":
    raise RuntimeError("Fixture provenance requires QuantLib 1.40")
today = ql.Date(1, 1, 2026)
ql.Settings.instance().evaluationDate = today
cases = [
    ("P", 36, 40, 365, .06, 0, .2),
    ("P", 100, 100, 365, .05, 0, .2),
    ("C", 100, 100, 365, .02, .08, .3),
    ("C", 100, 100, 365, -.01, .05, .2),
    ("P", 80, 100, 365, .05, .02, .25),
    ("P", 120, 100, 182, .03, .01, .35),
    ("P", 100, 100, 730, -.02, .01, .3),
    ("C", 100, 100, 365, .05, 0, .2),
    ("P", 100, 110, 30, .15, 0, .01),
    ("C", 75, 80, 730, .04, .1, .45),
]
results = []
for kind, spot, strike, days, rate, dividend, vol in cases:
    dc = ql.Actual365Fixed()
    process = ql.BlackScholesMertonProcess(
        ql.QuoteHandle(ql.SimpleQuote(spot)),
        ql.YieldTermStructureHandle(ql.FlatForward(today, dividend, dc)),
        ql.YieldTermStructureHandle(ql.FlatForward(today, rate, dc)),
        ql.BlackVolTermStructureHandle(ql.BlackConstantVol(today, ql.NullCalendar(), vol, dc)),
    )
    payoff = ql.PlainVanillaPayoff(ql.Option.Call if kind == "C" else ql.Option.Put, strike)
    option = ql.VanillaOption(payoff, ql.AmericanExercise(today, today + days))
    option.setPricingEngine(ql.FdBlackScholesVanillaEngine(process, 2000, 2000, 2, ql.FdmSchemeDesc.CrankNicolson()))
    results.append(dict(type=kind, spot=spot, strike=strike, days=days, rate=rate, dividend=dividend, vol=vol, price=option.NPV(), delta=option.delta(), gamma=option.gamma(), theta=option.theta() / 365))
    print(f"{kind} S={spot} K={strike} days={days}: {option.NPV():.10f}", flush=True)
target = Path(__file__).resolve().parent.parent / "tests/fixtures/american-options.json"
target.write_text(json.dumps({"reference": "QuantLib 1.40 FdBlackScholesVanillaEngine; Crank-Nicolson; 2000 time / 2000 space grid; 2 damping steps; Actual365Fixed; continuous flat yield curves; AmericanExercise; valuation 2026-01-01", "cases": results}, indent=2) + "\n")
