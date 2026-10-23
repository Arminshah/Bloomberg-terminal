// Starts the real desktop app on live data with a throwaway profile, for capture.cjs (development only).
// ARMIN_LIVE_PROFILE: the profile folder. HTTPS_PROXY, when set (cloud sandboxes), is passed to Chromium.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const profile = process.env.ARMIN_LIVE_PROFILE;
fs.mkdirSync(path.join(profile, 'session'), { recursive: true });
app.setPath('userData', profile);
app.setPath('sessionData', path.join(profile, 'session'));
app.getAppPath = () => profile;
if (process.env.HTTPS_PROXY) app.commandLine.appendSwitch('proxy-server', process.env.HTTPS_PROXY.replace(/^https?:\/\//, ''));
require(path.resolve(__dirname, '../../electron/main.cjs'));
