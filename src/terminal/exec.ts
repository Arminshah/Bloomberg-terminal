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
      const cur = currentRoute(terminal.get(), panel);
      const fnCode = parsed.fn ?? defaultFunction(parsed.sec?.cls);
      const def = lookupFn(fnCode)!;
      let secId = parsed.sec?.id;
      if (def.needsSec && !secId) secId = cur.sec;
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

function defaultFunction(cls: string | undefined): string {
  if (cls === 'bond') return 'YAS';
  return 'DES';
}
