// Audit capture (development only): npm run build, then
//   xvfb-run -a node scripts/live/capture.cjs <commands.json> <outdir> [minWait] [maxWait]
// <commands.json> is a JSON array of command lines ("NVDA US Equity FUNDCHART"). API keys, if wanted, come from the
// environment (load them from a file outside the repository; never print them).
// For each command: run it in a one-panel desktop app on live data, wait until the screen stops loading, then save
// the panel's text, a screenshot, its header (code, security, title, tabs, numbered actions) and console errors.
// ARMIN_LIVE_CSV=1 also saves the screen's whole table as its 98) Copy action gives it (<name>.csv), for a screen
// that shows one page of a longer list (SPLC).
const path = require('node:path');
const os = require('node:os');
const { _electron } = require(path.resolve(__dirname, '../../node_modules/@playwright/test'));
const fs = require('node:fs');
const { sanitize, redact } = require('./audit/assurance.cjs');
const [file, outDir, minArg, maxArg] = process.argv.slice(2);
const cmds = JSON.parse(fs.readFileSync(file, 'utf8'));
const MIN = Number(minArg || 6000);
const MAX = Number(maxArg || 30000);
fs.mkdirSync(outDir, { recursive: true });
const slug = (s) => s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'armin-live-'));
  const env = { ...process.env, ARMIN_LIVE_PROFILE: profile, XDG_CONFIG_HOME: profile, SEC_USER_AGENT: process.env.SEC_USER_AGENT || 'Armin Terminal sandbox-check@armin-terminal.invalid' };
  const app = await _electron.launch({ args: [__dirname + '/bootstrap-live.cjs', '--no-sandbox'], env });
  const page = await app.firstWindow();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 300)));
  await page.waitForURL(/^file:/);
  await page.locator('#cmd-0').waitFor({ timeout: 45000 });
  // ARMIN_LIVE_STORAGE: more local storage to start with, as JSON {key: value} (a screen's notice already accepted).
  const extra = process.env.ARMIN_LIVE_STORAGE ? JSON.parse(process.env.ARMIN_LIVE_STORAGE) : {};
  await page.evaluate((more) => {
    localStorage.setItem('armin:terminal', JSON.stringify({ v: 3, s: { layout: '1' } }));
    for (const [k, v] of Object.entries(more)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, extra);
  await page.reload();
  await page.locator('#cmd-0').waitFor();
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  // Let the background sources (quotes, share counts, members) start before the first screen.
  await page.waitForTimeout(20000);
  const index = [];
  for (const cmd of cmds) {
    const before = errors.length;
    const t0 = Date.now();
    try {
      const input = page.locator('#cmd-0');
      await input.click();
      await input.press('Escape');
      await input.press('Escape');
      await input.fill(cmd);
      await input.press('Enter');
      await page.waitForTimeout(MIN);
      // Wait while the screen says it is loading or reading.
      while (Date.now() - t0 < MAX) {
        const busy = await page.locator('.panel-body').first().innerText().then((t) => /Loading|Reading|Asking|Fetching|Waiting for|…$/m.test(t)).catch(() => false);
        if (!busy) break;
        await page.waitForTimeout(2000);
      }
      const head = await page.evaluate(() => {
        const panel = document.querySelector('.panel');
        const q = (s) => panel?.querySelector(s)?.textContent?.trim() ?? '';
        return {
          code: q('.fnh-code'), sec: q('.fnh-sec'), title: q('.fnh-title'),
          actions: [...panel.querySelectorAll('.fnh-actions .act, .fnh-actions button')].map((b) => b.textContent.trim()),
          tabs: [...panel.querySelectorAll('nav.tabs .tab')].map((b) => b.textContent.trim()),
          cmdError: document.querySelector('.cmd-error, .cmd-msg')?.textContent?.trim() ?? '',
        };
      });
      const name = slug(cmd);
      let text = await page.locator('.panel').first().innerText().catch(() => '');
      if (process.env.ARMIN_LIVE_AUDIT === '1') {
        const snapshot = await page.locator('.panel').first().evaluate((panel) => ({
          schema: 1,
          capturedAt: Date.now(),
          text: panel.innerText,
          domains: [...panel.querySelectorAll('[data-audit-state]')].flatMap((node) => {
            try { return [JSON.parse(node.tagName === 'SCRIPT' ? node.textContent ?? '' : node.getAttribute('data-audit-state') ?? '')]; } catch { return []; }
          }),
          conflicts: [...panel.querySelectorAll('[data-source-conflict], [title]')]
            .filter((node) => (node.hasAttribute('data-source-conflict') || /Sources disagree/.test(node.textContent ?? '')) && !!node.getAttribute('title'))
            .map((node) => ({ text: node.textContent?.trim(), detail: node.getAttribute('title'), label: node.closest('dd')?.previousElementSibling?.textContent ?? node.closest('tr')?.textContent?.slice(0, 500), candidates: (() => { try { return JSON.parse(node.getAttribute('data-source-candidates') ?? '[]'); } catch { return []; } })() })),
        }));
        const quote = snapshot.domains.find((domain) => domain.domain === 'quote');
        const symbol = String(quote?.ticker ?? quote?.security ?? head.sec ?? cmd).split(/\s+/)[0];
        text = snapshot.text;
        delete snapshot.text;
        snapshot.quoteOrigins = await app.evaluate((_electron, input) => globalThis.__arminLiveQuoteOrigins?.snapshot(input.symbol, input.capturedAt) ?? {}, { symbol, capturedAt: snapshot.capturedAt });
        fs.writeFileSync(`${outDir}/${name}.audit.json`, JSON.stringify(sanitize(snapshot), null, 1));
      }
      fs.writeFileSync(`${outDir}/${name}.txt`, redact(text));
      await page.locator('.panel').first().screenshot({ path: `${outDir}/${name}.png` }).catch(() => {});
      if (process.env.ARMIN_LIVE_CSV) {
        await app.evaluate(({ clipboard }) => clipboard.writeText(''));
        const copy = page.locator('.panel').first().locator('.fnh-actions .act, .fnh-actions button').filter({ hasText: /Copy/ }).first();
        if (await copy.count()) {
          await copy.click();
          await page.waitForTimeout(800);
          const csv = await app.evaluate(({ clipboard }) => clipboard.readText());
          if (csv) fs.writeFileSync(`${outDir}/${name}.csv`, redact(csv));
        }
      }
      const dashes = (text.match(/(^|[\s\t(])--(?=$|[\s\t)%])/gm) || []).length;
      const rec = sanitize({ cmd, name, ...head, ms: Date.now() - t0, dashes, errors: errors.slice(before) });
      index.push(rec);
      console.log(`${cmd} -> ${head.code} ${head.sec} dashes=${dashes} errors=${rec.errors.length} ${rec.ms}ms`);
    } catch (e) {
      index.push({ cmd, failed: redact(String(e)).slice(0, 300) });
      console.log(`${cmd} FAILED ${redact(String(e)).slice(0, 120)}`);
    }
    fs.writeFileSync(`${outDir}/index.json`, JSON.stringify(index, null, 1));
  }
  await app.close();
})().catch((e) => { console.error(redact(e?.stack ?? e)); process.exit(1); });
