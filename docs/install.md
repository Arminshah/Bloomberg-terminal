# Installing and starting

The desktop app runs on Windows and Linux (64-bit). Download it from the [Releases page](https://github.com/arminshah/bloomberg-terminal/releases); the repository is private, so sign in to GitHub first. Every push also builds both in CI: open the [Actions tab](https://github.com/arminshah/bloomberg-terminal/actions), pick the latest successful CI run, and download `armin-terminal-windows` or `armin-terminal-linux` under Artifacts.

## Windows

- `Armin-Terminal-Setup-<version>.exe` installs the app with Start menu and desktop shortcuts. Installing a newer version over an older one keeps your watchlists, settings and saved keys.
- `Armin-Terminal-<version>-Portable.exe` runs without installing.

The executables are not code-signed, so the first launch may show "Windows protected your PC". Choose More info, then Run anyway.

## Linux

Linux does not run .exe files. Its two equivalents:

- `armin-terminal_<version>_amd64.deb` installs the app on Debian, Ubuntu and their derivatives, with a menu entry, the `armin-terminal` command and Chromium's sandbox set up (including an AppArmor profile on Ubuntu 24.04 and later):

  ```bash
  sudo apt install ./armin-terminal_<version>_amd64.deb
  ```

- `Armin-Terminal-<version>-x86_64.AppImage` is one file that runs without installing, on most distributions:

  ```bash
  chmod +x Armin-Terminal-<version>-x86_64.AppImage
  ./Armin-Terminal-<version>-x86_64.AppImage
  ```

  AppImages need FUSE 2: `sudo apt install libfuse2` on Ubuntu 22.04, `libfuse2t64` on 24.04. On Ubuntu 24.04 and later, the system's restriction on user namespaces stops an Electron AppImage from starting Chromium's sandbox, and the app will not start; use the .deb there. Starting the AppImage with `--no-sandbox` also works, but turns that sandbox off.

Saved keys are encrypted with the desktop's secret store (GNOME Keyring or KWallet, through libsecret). Without one, Electron cannot encrypt them, and keys can only come from environment variables.

## First start

The app needs an internet connection. Without one it shows no prices, never simulated ones.

1. Start the app. Prices, charts, government yields, central bank rates, official statistics from the ONS, Eurostat, Statistics Canada and the ABS, official announcements and crypto prices work at once, with no key. The top bar shows the time until the European and US stock markets open or close.
2. Type `PROVIDERS` and press Enter. The screen lists every provider with its state.
3. Add the free keys you want under Credentials (see [configuration.md](configuration.md)):
   - `FRED_API_KEY` for US economic releases, the macro dashboard and FRED's international series.
   - `SEC_USER_AGENT` (an application name and your own email) for SEC filings.
   - `COINGECKO_API_KEY` for the market value and supply of the listed coins.
   - `MASSIVE_API_KEY`, `ALPHA_VANTAGE_API_KEY` or `TWELVE_DATA_API_KEY` to compare closes on `CROSSCHECK`.
4. Reload the window (Ctrl+R) after changing a switch. Keys take effect at the next request.

## Running from source

You need Node.js 22 (CI uses 22; Vite 7 needs at least 20.19) and npm.

```bash
npm install
npm run desktop          # builds the renderer and starts the desktop app
```

For keys while running from source, copy `.env.example` to `.env` and fill in what you need, or set the variables in your shell. `.env` is ignored by git. An environment variable wins over `.env`, and `.env` wins over a value saved in the app. A packaged app never reads `.env`.

To build the packages yourself:

- `npm run desktop:build` writes the Windows installer and portable app to `release/`. This runs on Windows; building the installer on Linux needs Wine.
- `npm run desktop:build:linux` writes the AppImage and the .deb to `release/`, on Linux.
- `npm run desktop:dir` builds an unpacked app folder for the current system.

## Browser build and demo

```bash
npm install
npm run dev
```

Open http://localhost:5173. The browser build has no data source and says so. Choose Open the demo, or open http://localhost:5173/?demo=1, to try the interface with simulated values, each marked DEMO DATA. `DEMO_MODE=true npm run build` makes a build that opens straight into the demo.

`npm run build:single` writes `dist-single/armin-terminal.html`, one self-contained file that runs from disk and behaves like the browser build.

Nothing is deployed publicly. The project is for private use.

## Updating

Install the new version over the old one, or replace the portable .exe or the AppImage. Settings, watchlists, layouts, alerts, notes, the portfolio and saved keys are kept. Layouts and settings saved under the old command names (for example `GP` or `DES`) are carried over to the new names.

## Where your data is kept

- Windows: `%APPDATA%\armin-terminal`
- Linux: `~/.config/armin-terminal`

Uninstalling the app leaves this folder in place; delete it to remove your settings and saved keys too.
