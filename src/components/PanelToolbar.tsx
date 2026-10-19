import { engine } from '../data/market';
import { showPanelHelp, showPanelMenu } from '../terminal/actions';
import { execute } from '../terminal/exec';
import { primaryMnemonic } from '../terminal/legacy';
import { lookupFn } from '../terminal/registry';
import { settings } from '../terminal/settings';
import { currentRoute, loadedSecurity, terminal } from '../terminal/state';
import { recallPanelCommand } from './CommandLine';

/** Each independent workspace retains a visible loaded security and function. */
export function PanelToolbar({ panel }: { panel: number }) {
  const route = terminal.use((s) => currentRoute(s, panel));
  const loaded = terminal.use((s) => loadedSecurity(s, panel));
  const recent = terminal.use((s) => s.recentSecs);
  const mnemonics = settings.use((s) => s.mnemonics);
  const def = lookupFn(route.fn);
  const securities = [...new Set([loaded, ...recent].filter((id): id is string => !!id))];
  const selectSecurity = (id: string) => {
    const sec = engine.get(id);
    const compatible = sec && (!def?.classes || def.classes.includes(sec.cls));
    // Preserve the analysis when changing securities; global functions open the security menu.
    const fn = def?.needsSec && compatible ? def.code : 'MENU';
    execute(panel, `${id} ${fn}`);
  };
  return (
    <div className="panel-toolbar" role="toolbar" aria-label={`Panel ${panel + 1} tools`}>
      <button type="button" className="panel-menu" onClick={() => showPanelMenu(panel)} title="Related functions; press again to move up the menu hierarchy">Menu <span>▾</span></button>
      <select className="loaded-security" aria-label={`Panel ${panel + 1} loaded security`} value={loaded ?? ''} onChange={(e) => selectSecurity(e.target.value)} title="Loaded security — choose a recent security">
        {!loaded && <option value="">Load a security…</option>}
        {securities.map((id) => <option key={id} value={id}>{id}</option>)}
      </select>
      <span className="panel-function" title={`${def?.name ?? route.fn} · ${route.fn}`}>{mnemonics ? primaryMnemonic(route.fn) : route.fn}</span>
      <button type="button" className="panel-tool" onClick={() => recallPanelCommand(panel)} title="Recall a previous command (Ctrl+↑)" aria-label={`Panel ${panel + 1} command history`}>↶</button>
      <button type="button" className="panel-tool" onClick={() => showPanelHelp(panel)} title="Help for this function (F1); press twice for the local assistant" aria-label={`Panel ${panel + 1} function help`}>Help</button>
    </div>
  );
}
