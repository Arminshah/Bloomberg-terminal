import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { KeyBar } from './components/KeyBar';
import { Panel } from './components/Panel';
import { TickerTape } from './components/TickerTape';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { WorkspaceTabs } from './components/WorkspaceTabs';
import { closeTab, cycleTab, newTab, reopenClosedTab, tabByNumber, workspaceTabs } from './terminal/tabs';
import { announceUpdate } from './terminal/whatsnew';
import { YahooSessionBanner } from './components/YahooSessionBanner';
import { clearPanelInput, focusPanelInput, pagePanel, typeInto, FKEY_TEXT } from './components/CommandLine';
import { engine } from './data/market';
import { setTimeZone } from './core/format';
import { lookupFn } from './terminal/registry';
import { fontChoice, settings } from './terminal/settings';
import { setChartFont } from './components/chart/PriceChart';
import { back, currentRoute, panelCount, rowsOrDefault, setActive, splitFor, terminal } from './terminal/state';
import { rowsGrid } from './terminal/rows-layout';
import { Splitters } from './components/Splitters';
import { startBackground } from './terminal/background';
import { DemoBanner } from './components/NoDataSource';
import { demoMode } from './data/demo';
import { startIexPrices } from './data/live/iex-engine';
import { showPanelHelp, showPanelMenu } from './terminal/actions';
import { browserStep, startHistoryButtons } from './terminal/mouse-nav';
import { canRefresh, refreshAll } from './terminal/refresh';

function MobileTabs() {
  const s = terminal.use((x) => x);
  const n = panelCount(s) < 2 ? 4 : Math.max(panelCount(s), 4);
  return (
    <nav className="mobile-tabs" aria-label="Panels">
      {Array.from({ length: n }, (_, i) => {
        const r = currentRoute(s, i);
        const name = r.sec ? `${r.sec.split(' ')[0]} ${r.fn}` : (lookupFn(r.fn)?.code ?? r.fn);
        return (
          <button key={i} type="button" className={s.active === i ? 'on' : ''} onClick={() => setActive(i)}>
            {i + 1} {name}
          </button>
        );
      })}
    </nav>
  );
}

function useMediaQuery(q: string): boolean {
  return useSyncExternalStore(
    (fn) => {
      const m = window.matchMedia(q);
      m.addEventListener('change', fn);
      return () => m.removeEventListener('change', fn);
    },
    () => window.matchMedia(q).matches,
  );
}

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

export function App() {
  const layout = terminal.use((s) => s.layout);
  const tabId = workspaceTabs.use((t) => t.active);
  const size = settings.use((s) => s.size);
  const font = settings.use((s) => s.font);
  const tz = settings.use((s) => s.tz);
  // Changing the date order redraws every screen; settings applies the order itself.
  settings.use((s) => s.dateOrder);
  const tickMs = settings.use((s) => s.tickMs);
  const tape = settings.use((s) => s.tape);
  const mobile = useMediaQuery('(max-width: 760px)');
  const split = terminal.use((s) => splitFor(s));
  const storedRows = terminal.use((s) => s.rows);
  const rows = useMemo(() => (layout === 'rows' ? rowsOrDefault(storedRows) : undefined), [layout, storedRows]);
  // A layout of your own is one grid: each tile edge of any row is a column line (rows-layout.ts).
  const grid = useMemo(() => (rows ? rowsGrid(rows) : undefined), [rows]);
  const count = mobile ? Math.max(panelCount({ layout, rows }), 4) : panelCount({ layout, rows });

  useEffect(() => {
    document.documentElement.dataset.size = size;
  }, [size]);

  useEffect(() => {
    document.documentElement.dataset.font = fontChoice(font);
    setChartFont(fontChoice(font));
  }, [font]);

  useEffect(() => {
    setTimeZone(tz);
  }, [tz]);

  useEffect(() => {
    engine.start(tickMs);
    return () => engine.stop();
  }, [tickMs]);

  useEffect(() => startIexPrices(), []);
  useEffect(() => startBackground(), []);
  useEffect(() => startHistoryButtons(), []);
  useEffect(() => announceUpdate(), []);

  const activeRoute = terminal.use((s) => currentRoute(s, s.active));
  useEffect(() => {
    const r = activeRoute;
    document.title = `${r.sec ? `${r.sec.split(' ')[0]} ` : ''}${r.fn} · Armin Terminal`;
  }, [activeRoute]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const active = terminal.get().active;
      // Workspace tabs, with a browser's keys.
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 't') {
          e.preventDefault();
          if (e.shiftKey) reopenClosedTab();
          else newTab();
          return;
        }
        if (k === 'w' && !e.shiftKey) {
          e.preventDefault();
          closeTab(workspaceTabs.get().active);
          return;
        }
        if (e.key === 'PageDown' || e.key === 'PageUp') {
          e.preventDefault();
          cycleTab(e.key === 'PageDown' ? 1 : -1);
          return;
        }
        if (/^[1-9]$/.test(e.key) && !e.shiftKey) {
          e.preventDefault();
          tabByNumber(Number(e.key));
          return;
        }
      }
      if (e.key === 'F1') {
        e.preventDefault();
        showPanelHelp(active);
        return;
      }
      // Alt+R: the top bar's REFRESH. F5 is a market sector key and Ctrl+Shift+R reloads the desktop window.
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyR' || e.key.toLowerCase() === 'r') && canRefresh()) {
        e.preventDefault();
        void refreshAll();
        return;
      }
      if (e.altKey && e.key === 'End') {
        e.preventDefault();
        showPanelMenu(active);
        return;
      }
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const n = window.innerWidth <= 760 ? Math.max(panelCount(terminal.get()), 4) : panelCount(terminal.get());
        const next = (active + (e.shiftKey ? n - 1 : 1)) % n;
        setActive(next);
        focusPanelInput(next);
        return;
      }
      if (e.key === 'Home' && !isTyping(e.target)) {
        e.preventDefault();
        focusPanelInput(active);
        return;
      }
      if (e.key === 'PageUp' || e.key === 'PageDown') {
        if (isTyping(e.target) && !(e.target as HTMLElement).classList.contains('cmd-input')) return;
        e.preventDefault();
        pagePanel(active, e.key === 'PageDown' ? 1 : -1);
        return;
      }
      if (e.key in FKEY_TEXT && !isTyping(e.target)) {
        e.preventDefault();
        typeInto(active, FKEY_TEXT[e.key]);
        return;
      }
      if (e.altKey && /^[1-6]$/.test(e.key)) {
        e.preventDefault();
        const p = Number(e.key) - 1;
        if (p < panelCount(terminal.get()) || window.innerWidth <= 760) {
          setActive(p);
          focusPanelInput(p);
        }
        return;
      }
      // Alt+← / Alt+→ work as a browser's: through the screen's tabs first, then between screens.
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        browserStep(active, 'back');
        return;
      }
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        browserStep(active, 'forward');
        return;
      }
      if (isTyping(e.target)) return;
      if (e.key === 'Escape') {
        clearPanelInput(active);
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        back(active);
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Typing anywhere goes to the active panel's command line.
        focusPanelInput(active);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`app${demoMode() ? ' demo' : ''}`}>
      {/* The tab bar is the window's title bar in the desktop app: always at the top. */}
      <WorkspaceTabs />
      {demoMode() ? <DemoBanner /> : null}
      {demoMode() ? null : <YahooSessionBanner />}
      <TopBar />
      <MobileTabs />
      {/* A new key per tab: no screen keeps another tab's local state. */}
      <main key={tabId} className="workspace" data-layout={layout} style={mobile ? undefined : grid ? { gridTemplateColumns: grid.columns.map((c) => `minmax(0, ${c}fr)`).join(' '), gridTemplateRows: grid.heights.map((r) => `minmax(0, ${r}fr)`).join(' ') } : { gridTemplateColumns: split.cols.map((c) => `minmax(0, ${c}fr)`).join(' '), gridTemplateRows: split.rows.map((r) => `minmax(0, ${r}fr)`).join(' ') }}>
        {Array.from({ length: count }, (_, i) => {
          const at = !mobile && grid ? grid.places[i] : undefined;
          return <Panel key={i} index={i} place={at ? { gridRow: String(at.row), gridColumn: `${at.from} / ${at.to}` } : undefined} />;
        })}
        {!mobile && <Splitters />}
      </main>
      {tape ? <TickerTape /> : <div />}
      <KeyBar />
      <Toasts />
    </div>
  );
}
