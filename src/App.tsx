import { useEffect, useSyncExternalStore } from 'react';
import { KeyBar } from './components/KeyBar';
import { Panel } from './components/Panel';
import { TickerTape } from './components/TickerTape';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { YahooSessionBanner } from './components/YahooSessionBanner';
import { clearPanelInput, focusPanelInput, pagePanel, typeInto, FKEY_TEXT } from './components/CommandLine';
import { engine } from './data/market';
import { setTimeZone } from './core/format';
import { lookupFn } from './terminal/registry';
import { settings } from './terminal/settings';
import { back, currentRoute, forward, LAYOUT_PANELS, setActive, splitFor, terminal } from './terminal/state';
import { Splitters } from './components/Splitters';
import { startBackground } from './terminal/background';
import { DemoBanner } from './components/NoDataSource';
import { demoMode } from './data/demo';
import { startIexPrices } from './data/live/iex-engine';
import { showPanelHelp, showPanelMenu } from './terminal/actions';

function MobileTabs() {
  const s = terminal.use((x) => x);
  const n = LAYOUT_PANELS[s.layout] < 2 ? 4 : Math.max(LAYOUT_PANELS[s.layout], 4);
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
  const size = settings.use((s) => s.size);
  const tz = settings.use((s) => s.tz);
  const tickMs = settings.use((s) => s.tickMs);
  const tape = settings.use((s) => s.tape);
  const mobile = useMediaQuery('(max-width: 760px)');
  const split = terminal.use((s) => splitFor(s));
  const count = mobile ? Math.max(LAYOUT_PANELS[layout], 4) : LAYOUT_PANELS[layout];

  useEffect(() => {
    document.documentElement.dataset.size = size;
  }, [size]);

  useEffect(() => {
    setTimeZone(tz);
  }, [tz]);

  useEffect(() => {
    engine.start(tickMs);
    return () => engine.stop();
  }, [tickMs]);

  useEffect(() => startIexPrices(), []);
  useEffect(() => startBackground(), []);

  const activeRoute = terminal.use((s) => currentRoute(s, s.active));
  useEffect(() => {
    const r = activeRoute;
    document.title = `${r.sec ? `${r.sec.split(' ')[0]} ` : ''}${r.fn} · Armin Terminal`;
  }, [activeRoute]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const active = terminal.get().active;
      if (e.key === 'F1') {
        e.preventDefault();
        showPanelHelp(active);
        return;
      }
      if (e.altKey && e.key === 'End') {
        e.preventDefault();
        showPanelMenu(active);
        return;
      }
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const n = window.innerWidth <= 760 ? Math.max(LAYOUT_PANELS[terminal.get().layout], 4) : LAYOUT_PANELS[terminal.get().layout];
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
        if (p < LAYOUT_PANELS[terminal.get().layout] || window.innerWidth <= 760) {
          setActive(p);
          focusPanelInput(p);
        }
        return;
      }
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        back(active);
        return;
      }
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        forward(active);
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
      {demoMode() ? <DemoBanner /> : null}
      {demoMode() ? null : <YahooSessionBanner />}
      <TopBar />
      <MobileTabs />
      <main className="workspace" data-layout={layout} style={mobile ? undefined : { gridTemplateColumns: split.cols.map((c) => `minmax(0, ${c}fr)`).join(' '), gridTemplateRows: split.rows.map((r) => `minmax(0, ${r}fr)`).join(' ') }}>
        {Array.from({ length: count }, (_, i) => (
          <Panel key={i} index={i} />
        ))}
        {!mobile && <Splitters />}
      </main>
      {tape ? <TickerTape /> : <div />}
      <KeyBar />
      <Toasts />
    </div>
  );
}
