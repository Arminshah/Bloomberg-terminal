import { engine } from '../data/market';
import { CLASS_LABEL } from '../data/registry';
import { parseCommand } from './commands';
import { flash, clearFlash, menuItem } from './panel';
import { lookupFn } from './registry';
import { currentRoute, navigate, terminal } from './state';

/** Runs a command line in a panel. Returns false when it failed. */
export function execute(panel: number, text: string): boolean {
  const parsed = parseCommand(text, lookupFn);
  switch (parsed.kind) {
    case 'empty':
      return true;
    case 'menu': {
      const item = menuItem(panel, parsed.n);
      if (!item) {
        flash(panel, `No item ${parsed.n}) on this screen`, 'error');
        return false;
      }
      clearFlash(panel);
      item.run();
      return true;
    }
    case 'help':
      clearFlash(panel);
      navigate(panel, { fn: 'HELP', args: parsed.topic || undefined });
      return true;
    case 'error':
      flash(panel, parsed.message, 'error');
      return false;
    case 'route': {
      if (parsed.fn === 'HELP' && parsed.args === 'HELP') {
        // HELP HELP: straight to the help desk.
        clearFlash(panel);
        navigate(panel, { fn: 'IB', args: 'HELP' });
        return true;
      }
      const cur = currentRoute(terminal.get(), panel);
      const fnCode = parsed.fn ?? defaultFunction(parsed.sec?.cls);
      const def = lookupFn(fnCode)!;
      let secId = parsed.sec?.id;
      if (def.needsSec && !secId) secId = cur.sec;
      // MENU <GO> on its own returns to the loaded security's menu.
      if (def.code === 'MENU' && !secId && !parsed.args) secId = cur.sec;
      if (def.needsSec && !secId) {
        flash(panel, `${def.code} needs a security, e.g. AAPL US <EQUITY> ${def.code} <GO>`, 'error');
        return false;
      }
      const sec = secId ? engine.get(secId) : undefined;
      if (sec && def.classes && !def.classes.includes(sec.cls)) {
        if (def.needsSec || parsed.sec) {
          flash(panel, `${def.code} is not available for ${CLASS_LABEL[sec.cls]} securities`, 'error');
          return false;
        }
        secId = undefined;
      }
      clearFlash(panel);
      navigate(panel, { fn: def.code, sec: secId, args: parsed.args });
      return true;
    }
  }
}

/** Loading a security on its own shows its menu of related functions. */
function defaultFunction(cls: string | undefined): string {
  return cls ? 'MENU' : 'DES';
}
