import { engine } from '../data/market';
import { showPanelHelp, showPanelMenu } from '../terminal/actions';
import { execute } from '../terminal/exec';
import { primaryMnemonic, styledMnemonic } from '../terminal/legacy';
import { FUNCTIONS, lookupFn } from '../terminal/registry';
import { settings } from '../terminal/settings';
import { back, currentRoute, forward, LINK_GROUPS, linkGroupOf, loadedSecurity, setLinkGroup, soloPanel, terminal, toggleSolo, type LinkGroup } from '../terminal/state';
import { recallPanelCommand } from './CommandLine';

/** A security as the toolbar and tabs name it: the issuer's name in capitals and its yellow key ("APPLE INC Equity"). */
export function securityLabel(id: string): string {
  const sec = engine.get(id);
  return sec ? `${sec.name.toUpperCase()} ${sec.yk}` : id;
}

/**
 * The toolbar row of a panel, as the 2024 frames draw each window's (TE01 03:11, TE06 04:15, TE01 01:41): on #1A1A1A,
 * plain light grey text between thin rules: back and forward, the loaded security ▾, the function ▾ and "Related
 * Functions Menu ⌄⌄"; at the right Message, the window button and a yellow ?▾. The app adds its own link group and
 * command recall before Message. The security and function are native selects under their labels.
 */
export function PanelToolbar({ panel, panels = 1 }: { panel: number; panels?: number }) {
  const route = terminal.use((s) => currentRoute(s, panel));
  const loaded = terminal.use((s) => loadedSecurity(s, panel));
  const recent = terminal.use((s) => s.recentSecs);
  const recentFns = terminal.use((s) => s.recentFns);
  const canBack = terminal.use((s) => s.panels[panel].idx > 0);
  const canFwd = terminal.use((s) => s.panels[panel].idx < s.panels[panel].history.length - 1);
  const group = terminal.use((s) => linkGroupOf(s.panels[panel]));
  const solo = soloPanel.use((s) => s.panel === panel);
  const mnemonics = settings.use((s) => s.mnemonics);
  const def = lookupFn(route.fn);
  const security = loaded ? engine.get(loaded) : undefined;
  const recentFunctions = [...new Set([route.fn, ...recentFns])].map((code) => lookupFn(code)).filter((fn) => !!fn).slice(0, 8);
  const canRun = (fn: (typeof FUNCTIONS)[number]) => !fn.needsSec || !!security && (!fn.classes || fn.classes.includes(security.cls));
  const option = (fn: (typeof FUNCTIONS)[number]) => <option key={fn.code} value={fn.code} disabled={!canRun(fn)}>{mnemonics ? primaryMnemonic(fn.code) : fn.code} · {fn.name}{!canRun(fn) ? ' (load a compatible security)' : ''}</option>;
  const securities = [...new Set([loaded, ...recent].filter((id): id is string => !!id))];
  const selectSecurity = (id: string) => {
    const sec = engine.get(id);
    const compatible = sec && (!def?.classes || def.classes.includes(sec.cls));
    // Preserve the analysis when changing securities; global functions open the security menu.
    const fn = def?.needsSec && compatible ? def.code : 'MENU';
    execute(panel, `${id} ${fn}`);
  };
  // The function as the command line would type it: GPC for a candlestick chart.
  const fnLabel = mnemonics ? styledMnemonic(route.fn, route.args).mnemonic : route.fn;
  return (
    <div className="panel-toolbar" role="toolbar" aria-label={`Panel ${panel + 1} tools`} onDoubleClick={(e) => { if (panels > 1 && (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('ptb-gap'))) toggleSolo(panel); }}>
      <button type="button" className="ptb-nav" aria-label="Back" title="Back (Backspace on an empty line)" disabled={!canBack} onClick={() => back(panel)}>
        <svg viewBox="0 0 8 12" width="8" height="12" aria-hidden="true"><path d="M6.5 1 1.5 6l5 5" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
      </button>
      <button type="button" className="ptb-nav" aria-label="Forward" title="Forward" disabled={!canFwd} onClick={() => forward(panel)}>
        <svg viewBox="0 0 8 12" width="8" height="12" aria-hidden="true"><path d="M1.5 1l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
      </button>
      <span className="ptb-rule" aria-hidden="true" />
      <span className="ptb-pick ptb-security" title="Loaded security: choose a recent security">
        <span className="ptb-label">{loaded ? securityLabel(loaded) : 'Load a security'} ▾</span>
        <select className="loaded-security" aria-label={`Panel ${panel + 1} loaded security`} value={loaded ?? ''} onChange={(e) => selectSecurity(e.target.value)}>
          {!loaded && <option value="">Load a security…</option>}
          {securities.map((id) => <option key={id} value={id}>{securityLabel(id)}</option>)}
        </select>
      </span>
      <span className="ptb-rule" aria-hidden="true" />
      <span className="ptb-pick ptb-function" title={`${def?.name ?? route.fn}: choose a function for this panel`}>
        <span className="ptb-label">{fnLabel} ▾</span>
        <select className="panel-function" aria-label={`Panel ${panel + 1} function`} value={route.fn} onChange={(e) => execute(panel, e.target.value)}>
          <optgroup label="Recent functions">{recentFunctions.map(option)}</optgroup>
          <optgroup label="All functions">{FUNCTIONS.filter((fn) => !recentFunctions.some((r) => r.code === fn.code)).map(option)}</optgroup>
        </select>
      </span>
      <span className="ptb-rule" aria-hidden="true" />
      <button type="button" className="panel-menu" onClick={() => showPanelMenu(panel)} title="Related functions; press again to move up the menu hierarchy">
        Related Functions Menu <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true"><path d="M1.5 1.5 5 4.5l3.5-3M1.5 5.5 5 8.5l3.5-3" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
      </button>
      <span className="ptb-gap" />
      <select
        className="cmd-link"
        aria-label={`Panel ${panel + 1} security link group`}
        title="Security link group: matching colors share selections across visible compatible panels. A linked monitor keeps its list open."
        value={group}
        style={{ color: LINK_GROUPS[group].color }}
        onChange={(e) => setLinkGroup(panel, Number(e.target.value) as LinkGroup)}
      >
        {LINK_GROUPS.map((g) => <option key={g.id} value={g.id}>{g.id ? `${g.id} ${g.name}` : 'Unlinked'}</option>)}
      </select>
      <button type="button" className="panel-tool" onClick={() => recallPanelCommand(panel)} title="Recall a previous command (Ctrl+↑)" aria-label={`Panel ${panel + 1} command history`}>↶</button>
      <span className="ptb-rule" aria-hidden="true" />
      <button type="button" className="ptb-message" onClick={() => execute(panel, 'MESSAGES')} title="Messages: the app's help desk (MESSAGES)">
        <svg viewBox="0 0 14 10" width="13" height="9" aria-hidden="true"><rect x="0.6" y="0.6" width="12.8" height="8.8" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M0.8 1 7 5.6 13.2 1" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
        Message
      </button>
      <button
        type="button"
        className="ptb-window"
        disabled={panels < 2}
        aria-label={solo ? 'Show every panel again' : `Show panel ${panel + 1} alone`}
        title={panels < 2 ? 'One panel in this layout' : solo ? 'Restore: every panel of the layout (double-click the toolbar)' : 'Maximise: this panel alone (double-click the toolbar)'}
        onClick={() => toggleSolo(panel)}
      >
        <svg viewBox="0 0 14 12" width="13" height="11" aria-hidden="true"><rect x="0.6" y="0.6" width="12.8" height="10.8" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M0.6 3.2h12.8" stroke="currentColor" strokeWidth="1.2" />{solo ? <path d="M9.5 9.5 5 5m0 0v3m0-3h3" fill="none" stroke="#3cbf4f" strokeWidth="1.4" /> : <path d="M5 9.5 9.5 5m0 0v3m0-3h-3" fill="none" stroke="#3cbf4f" strokeWidth="1.4" />}</svg>
      </button>
      <button type="button" className="ptb-help" onClick={() => showPanelHelp(panel)} title="Help for this function (F1); press twice for the help desk" aria-label={`Panel ${panel + 1} function help`}>
        <span className="ptb-help-q">?</span>▾
      </button>
    </div>
  );
}
