# Adding a data provider

A provider joins the app in the same places every time. Kraken (`electron/kraken.cjs`, `src/data/live/kraken.ts`) and the end-of-day sources (`electron/eod.cjs`, `src/data/live/eod.ts`) are short, complete examples to copy.

## 1. Check that it may be used

Before writing code, read the provider's own pages and record what they say in [data-providers.md](data-providers.md), quoting the text and giving the date:

- the free plan's limits, per minute and per day, and how the key is sent (a header keeps it out of URLs);
- whether the plan allows displaying the data on a screen for personal use; some free plans are for internal, non-display use only (Twelve Data's is);
- how fresh the data is (real time, delayed, end of day) and whether the provider labels it;
- attribution it requires, and limits on storing its data.

If the documentation cannot be read, or the terms do not allow the use, stop and list the provider as planned or disabled instead (as Financial Modeling Prep and Binance are). Never work around a refusal, such as an HTTP 403 or 451, by another route.

## 2. Main process: the only place that calls the provider

- Add `electron/<provider>.cjs` with the request builder: a fixed set of request kinds and a check of every argument (tickers, pairs, dates), returning `null` for anything else. Add `<provider>.d.cts` with its types so tests can import it.
- In `electron/main.cjs`, add an `ipcMain.handle` that:
  1. refuses calls that do not come from the app's own page (`fromApp`);
  2. checks the switch (`providers.setting`) and the key (`providers.credential`), returning `{ disabled }`, `{ missing }` or `{ refused }` without sending anything when they are off, absent or malformed;
  3. waits for a slot under the provider's limit (`providers.slot`) and keeps any daily budget;
  4. sends the request through `tracked()`, so `PROVIDERS` counts it and records its latency;
  5. records failures with `providers.recordProblem` and `providers.errorKind`, passing the key to `providers.providerMessage` so it is removed from any error text.
- For a key: add it to `CREDENTIALS` in `electron/providers.cjs` with a label and a format check, and to `providers.d.cts`. For a switch: add it to `SETTINGS` with its default.
- Expose one narrow function in `electron/preload.cjs`, and declare its type in the `arminDesktop` interface in `src/data/live/lookup.ts`.

## 3. Renderer

- Add `src/data/live/<provider>.ts` with pure parsers (text in, typed values or the provider's own error out), the loader that calls the bridge, and caching suited to the provider's limits.
- Prices go into the engine with `engine.setExternalQuote` and `engine.setExternalDaily`, with the provider's name, the market's own timestamp, and what the provider says about timing. The freshness label then follows by itself (`src/data/freshness.ts`). A market data provider that is not an official publisher must be listed in `isOfficialProvider`'s pattern there, or its once-a-day values would be labelled REFERENCE.
- If it feeds price lines, decide which lines it owns in `src/data/live/sources.ts`, so two providers never write into the same line.
- Show attribution the provider requires wherever its data appears.

## 4. Registry, screen and settings

- Add an entry to `PROVIDERS` in `src/data/providers.ts`: what it serves, its data class, policy, key, switch, limit, cadence, terms, official pages and the date they were checked. `PROVIDERS` (the screen) then shows its state.
- Add the key or switch to the lists on the provider screen (`src/functions/PROV.tsx`), to `.env.example`, and to [configuration.md](configuration.md) and [limits.md](limits.md).

## 5. Tests

- Request builder: only the allowed requests are built, keys stay out of URLs where the provider allows, limits and budgets hold.
- Parsers: answers in the layout the provider documents, or saved real answers in `tests/fixtures/`, including its error answers and limit notices.
- Provider state: `tests/providers.test.ts` covers the new entry's state with and without its key and switch.

Then run `npm run lint`, `npm run typecheck`, `npm test` and `npm run e2e`, start the desktop app, and confirm on `PROVIDERS` that the provider answers.
