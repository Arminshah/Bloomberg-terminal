import { engine } from '../data/market';
import { commandApis } from '../components/CommandLine';
import { execute } from './exec';
import { lookupFn } from './registry';
import { currentRoute, loadedSecurity, navigate, terminal } from './state';

const helpTimes = new Map<number, number>();

/**
 * HELP is contextual; a second press opens the explicitly local assistant. A mnemonic or words typed first ask
 * for help on them, as "DES <HELP>" does on the terminal: a function's help page, or a search of the functions
 * and securities.
 */
export function showPanelHelp(panel: number) {
  const now = Date.now();
  const previous = helpTimes.get(panel);
  helpTimes.set(panel, now);
  const typed = commandApis.get(panel)?.input.value.replace(/<\s*GO\s*>/gi, ' ').trim() ?? '';
  if (typed && !/^\d+$/.test(typed)) {
    commandApis.get(panel)?.clear();
    execute(panel, `HELP ${typed}`);
    return;
  }
  if (previous !== undefined && now - previous < 1500) {
    execute(panel, 'HELP HELP');
    return;
  }
  const route = currentRoute(terminal.get(), panel);
  execute(panel, route.fn === 'HELP' ? 'HELP' : `HELP ${route.fn}`);
}

/** MENU climbs the related-function hierarchy; BACK retains separate history. */
export function showPanelMenu(panel: number) {
  const state = terminal.get();
  const route = currentRoute(state, panel);
  const id = loadedSecurity(state, panel);
  const sec = id ? engine.get(id) : undefined;
  if (route.fn === 'MENU') {
    if (route.sec && sec) {
      navigate(panel, { fn: 'MENU', args: sec.yk.toUpperCase() });
    } else {
      navigate(panel, { fn: 'MENU' });
    }
    return;
  }
  if (route.sec) {
    navigate(panel, { fn: 'MENU', sec: route.sec });
    return;
  }
  const category = lookupFn(route.fn)?.category;
  const sector = category === 'News' ? 'NEWS'
    : category === 'Equity' || category === 'Markets' ? 'EQUITY'
      : category === 'Rates & Credit' || category === 'Economics' ? 'GOVT'
        : category === 'FX & Crypto' ? 'CURNCY'
          : category === 'Commodities' ? 'CMDTY'
            : category === 'Portfolio & Tools' ? 'TOOLS' : undefined;
  navigate(panel, { fn: 'MENU', ...(sector ? { args: sector } : {}) });
}
