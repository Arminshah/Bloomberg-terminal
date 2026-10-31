// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { setDemo } from '../data/demo';

/** What the browser build shows until the user opens the demo: it has no data source of its own. */
export function NoDataSource() {
  return (
    <div className="nodata">
      <div className="nodata-box">
        <div className="nodata-title">Armin Terminal</div>
        <p>This browser version has no market data source. Real quotes, history, rates and statistics come through the desktop app, which makes every request from its own process and keeps any API keys there.</p>
        <p>You can open a demo to try the interface. Every price, figure and headline in it is simulated and marked DEMO DATA; none of it is market data.</p>
        <div className="row">
          <button type="button" className="btn primary" onClick={() => setDemo(true)}>
            Open the demo (simulated data)
          </button>
        </div>
      </div>
    </div>
  );
}

/** The bar across the top of the demo. */
export function DemoBanner() {
  return (
    <div className="demo-banner" role="status">
      <b>DEMO DATA</b> · every price, figure and headline here is simulated, not market data. Real data runs in the desktop app.
      <button type="button" className="btn" onClick={() => setDemo(false)}>
        Leave demo
      </button>
    </div>
  );
}
