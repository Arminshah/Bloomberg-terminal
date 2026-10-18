# Armin Terminal 2.4.1

This release is about finding out why data fails on your computer and keeping it flowing when Yahoo Finance refuses the session.

## Changed

- `PROVIDERS` has a Test every source button. It sends one small request to each provider with your saved keys, from your own computer and network, and lists what each answered: pass or fail, the HTTP status, how long it took and a short sample (a price, a rate, a date). Copy report puts the result on the clipboard; it contains no keys and no URLs. Two tests spend a request from a small daily allowance (Marketaux 1 of 100, Alpha Vantage 1 of 25) and say so.
- Yahoo's live quotes and company data need a session cookie. In the EU, Yahoo first asks visitors to accept its cookies, so a program gets no usable cookie and those requests are refused. The app now notices this, shows a banner and offers Open Yahoo to accept: Yahoo's own page opens in an app window, you accept (or reject) its cookies once, and the data reloads. Only yahoo.com pages load in that window.
- While Yahoo refuses the session, prices still arrive from Yahoo's chart summaries, which need no cookie: the price, its time and the previous close. Those quotes have no bid, offer or day range and are marked as such. A company's financial statements also load without the session; its profile and statistics wait for it.
- Pasting your key list on `PROVIDERS` now reads an Alpaca secret written on the line after the Alpaca key, and a Finnhub value that is two 20-character keys run together (the API key and the webhook secret copied from Finnhub's page): the first, the API key, is kept and the screen says so. A doubled Finnhub key saved earlier is read the same way. Every key can still be typed, replaced or removed in its own field.

## Downloads

`Armin-Terminal-Setup-2.4.1.exe`, `Armin-Terminal-2.4.1-Portable.exe`, `Armin-Terminal-2.4.1-x86_64.AppImage` and `armin-terminal_2.4.1_amd64.deb`, with their SHA256 files. Installing over an earlier version keeps your settings and saved keys. The Windows files are unsigned; see [installation](install.md).
