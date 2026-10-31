# Armin Terminal (web): decisions

Each entry: the choice, the alternatives, and why. Newest last.

## D1. Its own folder, separate from the desktop app (20 Oct 2026)

The web app lives in `web/` with its own `package.json`, apart from the Electron desktop app at the repository
root. The desktop app follows another product's screen conventions; the web app must not, and keeping them apart
keeps each one's rules, dependencies and tests clear. To be confirmed (see PLAN.md, open questions).

## D2. Next.js (App Router) + React + TypeScript

One project serves the UI and the data gateway (route handlers), so `npm run dev` starts everything. Considered:
Vite + a separate Fastify gateway (two processes, more setup). Next.js route handlers stream Server-Sent Events,
which covers the subscriptions without a separate socket server.

## D3. Server-Sent Events for streaming

The spec allows WebSocket or SSE. Updates flow server to client only; subscribe/unsubscribe are small POSTs.
SSE runs inside Next.js route handlers, reconnects by itself and passes through proxies. A WebSocket server
would need a custom server next to Next.js.

## D4. Lightweight Charts for time series

TradingView's Lightweight Charts (Apache-2.0) is small and fast for candles, lines, areas and volume, and
studies are drawn as extra series from Armin's own indicator code. Its licence asks for attribution, given in
HELP and the README (and kept in its default chart link unless the licence notice is shown elsewhere). Apache
ECharts (Apache-2.0) was considered; it is larger and less suited to streaming candles. Small bar and donut charts
are plain SVG.

## D5. Own split-tree workspace on react-resizable-panels

Panes are a binary split tree in Zustand; react-resizable-panels (MIT) draws the splitters and supports keyboard
resizing. Considered: dockview and react-mosaic. They bring drag-docking and tabs the spec does not ask for, and
their keyboard models would have to be bent to Armin's keys.

## D6. Zustand for state

Small stores (workspace, panes, watchlists, alerts, portfolio, settings) with persistence to local storage.

## D7. TanStack Table + TanStack Virtual

Headless (MIT), so tables use Armin's tokens and key handling; virtualisation keeps long screens fast.

## D8. Fonts: Inter and JetBrains Mono

Both under the SIL Open Font License, bundled with the app (no font CDN). Numbers use tabular figures.

## D9. Colour roles

Graphite surfaces, teal for focus/selection/primary actions, violet for editable fields and secondary
highlights, green and red only for price moves. Errors are pink and warnings yellow, so a red number always
means a fall. All values are tokens in `src/styles/tokens.css`, dark by default with a light theme; text and
accents meet WCAG AA contrast (checked when the tokens were chosen).

## D10. Mock provider

Deterministic: every value derives from a seeded generator keyed by symbol and date, so screens, tests and
screenshots are repeatable. Everything it serves is labelled *Sample data*.
