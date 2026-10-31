// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useState } from 'react';
import { yahooSession } from '../data/live/yahoo';

/**
 * Shown while Yahoo refuses this computer's session: live quotes and company data cannot load, while charts
 * and history still do. In the EU Yahoo first asks visitors to accept its cookies; the button opens Yahoo's
 * own page in an app window so the owner can do that once, then reloads the data.
 */
export function YahooSessionBanner() {
  const refused = yahooSession.use((s) => s.refused);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  if (!refused || hidden || !window.arminDesktop?.yahooConsent) return null;
  const open = async () => {
    setBusy(true);
    setMsg('Accept or reject on Yahoo\'s page, then close that window.');
    try {
      const r = await window.arminDesktop!.yahooConsent!();
      setMsg(r.detail);
      if (r.ok) window.setTimeout(() => window.location.reload(), 1200);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="demo-banner" role="status">
      <span>
        Yahoo Finance refuses this computer&apos;s session, so live quotes and company data cannot load (charts and history still do). In the EU this usually means accepting Yahoo&apos;s cookies once.
        {msg ? <span className="white"> {msg}</span> : null}
      </span>
      <button type="button" className="btn" disabled={busy} onClick={() => void open()}>
        {busy ? 'Waiting for the Yahoo window…' : 'Open Yahoo to accept'}
      </button>
      <button type="button" className="btn" onClick={() => setHidden(true)}>
        Hide
      </button>
    </div>
  );
}
