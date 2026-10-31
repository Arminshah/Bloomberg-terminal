# Armin Terminal (web): plan

Status: **shelved on 20 October 2026.** The owner chose to keep the desktop app's terminal look (closer to the real thing) instead of a separate app with its own identity; this plan and its research stay for reference.

Earlier status: **step 1 done** (research, [FEATURES.md](FEATURES.md), [COMMANDS.md](COMMANDS.md), design tokens in
[../src/styles/tokens.css](../src/styles/tokens.css), logo in [../public/logo.svg](../public/logo.svg)).
Waiting for review before step 2. Choices and their reasons are in [DECISIONS.md](DECISIONS.md).

## What gets built

A browser app started with `npm install && npm run dev`. It works with **no keys** on a deterministic mock
provider, labelled *Sample data* everywhere, and switches to live data per capability as keys are added to
`.env`. Everything is reachable from the command bar and the keyboard.

## Architecture

```
browser (Next.js app, React, Zustand)
  command bar ─ parser ─ resolver ──► pane store (split tree; per pane: instrument, view, options, history)
  views (OVERVIEW, CHART, ...) ──► data hooks ──► HTTP /api/v1/*  (request/response)
                                             └──► SSE /api/v1/stream (subscriptions: quotes, headlines)
server (Next.js route handlers = the data gateway, TypeScript)
  /api/v1/{search,quote,history,intraday,profile,financials,news,calendar,macro,fields,sources}
  router: picks a provider per capability (configured, within allowance) ──► adapters
  adapters: mock · Finnhub · Twelve Data or FMP · SEC EDGAR · FRED · CoinGecko   (chosen in step 3)
  per-endpoint cache (TTL by data kind) · per-provider pacing and daily allowance · stream hub
```

- **One internal interface.** Each adapter implements any of `search`, `quote`, `history`, `intraday`,
  `profile`, `financials`, `news`, `calendar`, `macro`, returning Armin's own types keyed by field ids from the
  field dictionary. The UI never sees a provider's format.
- **Subscriptions.** One SSE connection per tab; the client posts subscribe/unsubscribe for symbols and topics;
  the hub fans out provider pushes (or polls on a timer where a provider has no stream) and sends a snapshot on
  subscribe. Updates to the UI are batched per animation frame.
- **Cache lifetimes** (starting points): quotes 5 s, intraday 60 s, daily history 6 h, profile 24 h,
  financials 24 h, news 2 min, calendar 30 min, macro 6 h, search 24 h.
- **Rate limits.** A token bucket per provider at its free-tier pace, a daily counter persisted on disk, and a
  stale-while-error policy: the last good answer is served with its age when a provider refuses or is over budget.
- **Keys** only in server-side `.env` (never sent to the browser); `.env.example` lists every variable.
- **State in the browser**: layouts, watchlists, alerts, portfolio and settings in local storage, with JSON
  export/import. (A server-side store can come later if you want the same workspace on several machines.)

## Providers (to verify in step 3)

Official APIs only, no scraping, personal use within each provider's terms. Free-tier details below were last
checked for the existing desktop app between 12 and 19 October 2026 and will be re-read before use:

| Capability | First choice | Notes to verify |
| --- | --- | --- |
| Macro series, US releases | FRED (free key) | Series search and observations |
| Filings, fundamentals (US) | SEC EDGAR (no key; needs a contact User-Agent) | 10 requests/second; XBRL company facts for statements |
| Crypto | CoinGecko (free demo key) | Monthly call allowance |
| Quotes, profile, news, calendars, live trades | Finnhub (free key) | 60 calls/minute; daily candles are not on the free plan |
| Daily and intraday history | Twelve Data (free key) or FMP (free key) | Twelve Data: 800 calls/day, display terms to confirm; FMP: 250 calls/day |

## Milestones (a commit after each)

1. **Research and design** — done: features, command language, symbols, keys, tokens, logo, this plan.
2. **Scaffold and workspace**: Next.js + TypeScript + ESLint + Vitest; tokens and fonts (Inter, JetBrains Mono,
   both OFL); app shell with logo; command bar (parser, resolver, fuzzy suggestions, history, hints); pane
   workspace (split/resize/close/maximise, focus keys, per-pane history); field dictionary; mock provider with
   seeded, repeatable data; `/api/v1` skeleton; SSE hub on mock ticks.
3. **Live data, first views**: adapters for the chosen providers after re-reading their terms; `SOURCES`;
   `OVERVIEW`, `QUOTE`, `CHART` (candle/line/area, ranges, volume, SMA/EMA/RSI/MACD/Bollinger, events, table),
   `COMPARE`, `PROFILE`, `NEWS`.
4. **Fundamentals and markets**: `FINANCIALS`, `EARNINGS`, `DIVIDENDS`, `PEERS`, `FILINGS`; monitors `MARKETS`,
   `MOVERS`, `FX`, `RATES`, `COMMODITIES`, `CRYPTO` (auto-refreshing); `SCREEN` (criteria, save, CSV);
   `CALENDAR`; `MACRO` (dashboard, series, transforms).
5. **Monitoring and workspace**: `WATCH`, `ALERTS` (in-app notifications), `PORTFOLIO` (P&L, allocation),
   named layouts, `HELP` (every command and key), `FIELDS`, `EXPORT`, `SETTINGS`, light theme switch.
6. **Polish**: virtualised tables, throttled updates, accessibility pass (focus order, screen-reader labels,
   contrast), tests (command parser, symbol resolver, adapters on recorded fixtures, indicator maths, cache and
   rate limiter, a keyboard-only end-to-end run), README.

## Done when

- `npm install && npm run dev` works on mock data with no keys; live data appears once keys are in `.env`.
- Every view is reachable from the command bar and the keyboard alone.
- Typecheck, lint and tests pass.
- Nothing in the UI, assets or code copies another product's branding, design, commands or text.

## Open questions

1. **Where the web app lives.** It is in `web/` of this repository for now, separate from the desktop app.
   Alternatives: its own repository, or replacing the desktop app.
2. **The existing desktop app.** It was built to follow Bloomberg's screen conventions (function codes such as
   DES and EE, `<GO>`, `US Equity` identifiers, the amber/red look). The originality rules apply to the new web
   app. Should the desktop app be brought under the same rules too? That would be a separate, larger job.
3. **Order of work.** The desktop app's 2.17.0 (filling the "--" fields and the remaining dates) is half started.
   Finish it first, or start step 2 here?
