// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
// Starts the real desktop app on live data with a throwaway profile, for capture.cjs (development only).
// ARMIN_LIVE_PROFILE: the profile folder. HTTPS_PROXY, when set (cloud sandboxes), is passed to Chromium.
const { app, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const profile = process.env.ARMIN_LIVE_PROFILE;
fs.mkdirSync(path.join(profile, 'session'), { recursive: true });
app.setPath('userData', profile);
app.setPath('sessionData', path.join(profile, 'session'));
app.getAppPath = () => profile;
if (process.env.HTTPS_PROXY) app.commandLine.appendSwitch('proxy-server', process.env.HTTPS_PROXY.replace(/^https?:\/\//, ''));
if (process.env.ARMIN_LIVE_AUDIT === '1') {
  const origins = require('./audit/quote-origins.cjs').createQuoteOrigins();
  globalThis.__arminLiveQuoteOrigins = origins;
  const fetchOriginal = net.fetch.bind(net);
  net.fetch = async (input, init) => {
    const requestedAt = Date.now();
    const response = await fetchOriginal(input, init);
    try { origins.observe(input, response, requestedAt, Date.now()); } catch { /* diagnostics never change a fetch result */ }
    return response;
  };
}
require(path.resolve(__dirname, '../../electron/main.cjs'));
