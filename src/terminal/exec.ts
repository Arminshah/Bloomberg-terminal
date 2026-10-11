import { engine } from '../data/market';
import { lookupSecurity, lookupSource } from '../data/live/lookup';
import { CLASS_LABEL } from '../data/registry';
import { parseCommand } from './commands';
import { flash, clearFlash, menuItem } from './panel';
import { lookupFn } from './registry';
import { currentRoute, navigate, terminal } from './state';

/** Bumped per panel on every command, so a slow online lookup never overrides a newer command. */
const runSeq = new Map<number, number>();

/** Loads a ticker that is not built in, then runs the original command. */
function lookupThenRun(panel: number, text: string, ticker: string, message: string): boolean {
  const source = lookupSource();
  if (!source) {
    flash(panel, `${message.replace(/\.? Type HELP for functions\.$/, '')}. ${ticker} is not built in; add a free Finnhub key in PDFU, or use the desktop app, to load any US stock.`, 'error');
    return false;
  }
  const seq = runSeq.get(panel);
  flash(panel, `Loading ${ticker} from ${source === 'yahoo' ? 'Yahoo Finance' : 'Finnhub'}…`, 'info');
  void lookupSecurity(ticker).then((r) => {
    if (runSeq.get(panel) !== seq) return;
    if (!r.ok) {
      flash(panel, r.reason, 'error');
      return;
    }
    const again = parseCommand(text, lookupFn);
    if (again.kind === 'route') execute(panel, text);
    else execute(panel, r.def.id);
  });
  return true;
}

/** Runs a command line in a panel. Returns false when it failed. */
export function execute(panel: number, text: string): boolean {
  runSeq.set(panel, (runSeq.get(panel) ?? 0) + 1);
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
      if (parsed.lookup) return lookupThenRun(panel, text, parsed.lookup, parsed.message);
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
