import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { XYChart } from '../components/chart/XYChart';
import { fmtDay, fmtNum } from '../core/format';
import { DAY_MS } from '../data/calendar';
import { defaultBeta } from '../data/analytics';
import { engine, useTick } from '../data/market';
import { reportCcy } from '../data/fundamentals';
import { TEN_YEAR } from './WACC';
import type { FnProps } from '../terminal/types';

/**
 * EQRP, the equity risk premium: the market's expected return less the risk-free rate (the country premium) and the
 * stock's share of it through its beta. The risk-free rate is the currency's 10-year government yield; the beta is
 * the one BETA shows by default, two years of weekly returns against the local index, adjusted toward 1; the expected
 * market return is the risk-free rate plus a long-run premium the owner can change (no free source publishes an
 * implied one). The amber fields take other figures.
 */
export function EQRP({ sec }: FnProps) {
  const s = sec!;
  useTick(10);
  const ccy = reportCcy(s);
  const rfLine = TEN_YEAR[ccy] ?? TEN_YEAR.USD;
  const rfNow = engine.quote(rfLine.id)?.last ?? NaN;
  const { raw, adjusted, bench } = defaultBeta(s.id);
  const [premium, setPremium] = useState(5.5);
  const [rfIn, setRfIn] = useState<string>('');
  const [betaIn, setBetaIn] = useState<string>('');
  const rf = rfIn !== '' && Number.isFinite(Number(rfIn)) ? Number(rfIn) : rfNow;
  const beta = betaIn !== '' && Number.isFinite(Number(betaIn)) ? Number(betaIn) : adjusted;
  const erm = rf + premium;
  const crp = erm - rf;
  const eqrp = beta * crp;
  // History: the risk-free rate's daily path with the premium held, and the stock's premium through its beta.
  const daily = engine.daily(rfLine.id);
  const from = engine.today * DAY_MS - 3 * 365 * DAY_MS;
  const rfr: { x: number; y: number; label: string }[] = [];
  for (let i = 0; i < daily.length; i += 5) if (daily.t[i] >= from) rfr.push({ x: daily.t[i], y: daily.c[i], label: fmtDay(daily.t[i]) });
  const field = (value: string, set: (v: string) => void, placeholder: string, label: string) => (
    <input className="inp eqrp-in" aria-label={label} inputMode="decimal" placeholder={placeholder} value={value} onChange={(e) => set(e.target.value.replace(/[^\d.-]/g, ''))} />
  );
  return (
    <div>
      <FnHeader
        code="RISKPREMIUM"
        title="Equity Risk Premium"
        sec={s}
        controls={
          <div className="chart-tools">
            <label className="fld">
              Period
              <select className="sel-inp" aria-label="Period" value="MR" disabled>
                <option value="MR">MR (most recent)</option>
              </select>
            </label>
            <span className="white">{fmtDay(engine.today * DAY_MS)}</span>
            <span className="amber">Currency</span> <span className="white">{ccy}</span>
            <span className="cyan eqrp-name">{s.name}</span>
          </div>
        }
      />
      <QuoteStrip sec={s} />
      <div className="eqrp-grid">
        <div>
          <div className="mov-title">Country/Region Data</div>
          <div className="eqrp-rows">
            <span className="amber">1) Expected Market Return</span>
            <span className="white num">{fmtNum(erm, 3)}%</span>
            <span className="amber">2) Risk Free Rate</span>
            <span>{field(rfIn, setRfIn, fmtNum(rfNow, 3), 'Risk free rate')} %</span>
            <span className="amber">3) Country/Region Risk Premium</span>
            <span>
              <input className="inp eqrp-in" aria-label="Country risk premium" inputMode="decimal" value={premium} onChange={(e) => setPremium(Number(e.target.value.replace(/[^\d.-]/g, '')) || 0)} /> %
            </span>
          </div>
        </div>
        <div>
          <div className="mov-title">Equity Data</div>
          <div className="eqrp-rows">
            <span className="amber" title={`Two years of weekly returns against ${bench}, adjusted: 0.67 × raw + 0.33 (raw ${fmtNum(raw, 3)}), as on BETA`}>Beta</span>
            <span>{field(betaIn, setBetaIn, fmtNum(adjusted, 3), 'Beta')}</span>
            <span className="amber">Equity Risk Premium</span>
            <span className="white num">{fmtNum(eqrp, 3)}%</span>
            <span className="amber">Cost of Equity (Rf + EQRP)</span>
            <span className="white num">{fmtNum(rf + eqrp, 3)}%</span>
          </div>
        </div>
      </div>
      <div className="mov-title">Historical Graph</div>
      <XYChart
        height={220}
        series={[
          { label: 'RFR', color: '#5aa7ff', points: rfr },
          { label: 'Expected Market Return', color: '#ff9e1b', points: rfr.map((p) => ({ ...p, y: p.y + premium })) },
          { label: 'EQRP', color: '#ffd23f', points: rfr.map((p) => ({ ...p, y: beta * premium })) },
        ]}
        xFormat={(v) => fmtDay(v)}
        yFormat={(v) => `${fmtNum(v, 1)}%`}
      />
      <p className="pad-s muted">
        Risk free rate: the {rfLine.name} yield. Country/Region risk premium: the long-run premium of equities over government bonds, 5.5% by default (the figure WACC uses); no free source
        publishes a market-implied premium, so change it in the amber field. Expected market return = risk free rate + premium. Equity risk premium = beta × country premium.
      </p>
    </div>
  );
}
