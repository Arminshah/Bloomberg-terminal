// Audit capture (development only): npm run build, then
//   xvfb-run -a node scripts/live/capture.cjs <commands.json> <outdir> [minWait] [maxWait]
// <commands.json> is a JSON array of command lines ("NVDA US Equity FUNDCHART"). API keys, if wanted, come from the
// environment (load them from a file outside the repository; never print them).
// For each command: run it in a one-panel desktop app on live data, wait until the screen stops loading, then save
// the panel's text, a screenshot, its header (code, security, title, tabs, numbered actions) and console errors.
const path = require('node:path');
const os = require('node:os');
const { _electron } = require(path.resolve(__dirname, '../../node_modules/@playwright/test'));
const fs = require('node:fs');
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
  await page.evaluate(() => { localStorage.setItem('armin:terminal', JSON.stringify({ v: 3, s: { layout: '1' } })); });
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
      const text = await page.locator('.panel').first().innerText().catch(() => '');
      fs.writeFileSync(`${outDir}/${name}.txt`, text);
      await page.locator('.panel').first().screenshot({ path: `${outDir}/${name}.png` }).catch(() => {});
      const dashes = (text.match(/(^|[\s\t(])--(?=$|[\s\t)%])/gm) || []).length;
      const rec = { cmd, name, ...head, ms: Date.now() - t0, dashes, errors: errors.slice(before) };
      index.push(rec);
      console.log(`${cmd} -> ${head.code} ${head.sec} dashes=${dashes} errors=${rec.errors.length} ${rec.ms}ms`);
    } catch (e) {
      index.push({ cmd, failed: String(e).slice(0, 300) });
      console.log(`${cmd} FAILED ${String(e).slice(0, 120)}`);
    }
    fs.writeFileSync(`${outDir}/index.json`, JSON.stringify(index, null, 1));
  }
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
