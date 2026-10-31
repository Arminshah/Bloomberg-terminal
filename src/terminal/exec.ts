import { engine } from '../data/market';
import { lookupSecurity, lookupSource } from '../data/live/lookup';
import { fedInvestAvailable, fedinvest, loadFedInvest } from '../data/live/fedinvest';
import { CLASS_LABEL } from '../data/registry';
import { parseCommand } from './commands';
import { plainWords } from './plain-words';
import { flash, clearFlash, menuItem } from './panel';
import { lookupFn } from './registry';
import { currentRoute, loadedSecurity, navigate, terminal } from './state';
import { commandForName, nameQuery } from './name-search';

/** Bumped per panel on every command, so a slow online lookup never overrides a newer command. */
const runSeq = new Map<number, number>();

/** Loads a ticker that is not built in, then runs the original command. */
function lookupThenRun(panel: number, text: string, ticker: string, message: string): boolean {
  const source = lookupSource();
  if (!source) {
    flash(panel, `${message.replace(/\.? Type HELP for functions\.$/, '')}. ${ticker} is not built in; the desktop app looks up any US stock and stocks on the main European exchanges.`, 'error');
    return false;
  }
  const seq = runSeq.get(panel);
  const pendingPanel = terminal.get().panels[panel];
  flash(panel, `Loading ${ticker} from ${source === 'yahoo' ? 'Yahoo Finance' : 'Finnhub'}…`, 'info');
  void lookupSecurity(ticker).then((r) => {
    if (runSeq.get(panel) !== seq || terminal.get().panels[panel] !== pendingPanel) return;
    if (!r.ok) {
      // "apple", "walmart": a company's name that is not a ticker.
      if (nameQuery(text)) nameThenRun(panel, text, r.reason);
      else flash(panel, r.reason, 'error');
      return;
    }
    const again = parseCommand(text, lookupFn);
    if (again.kind === 'route') execute(panel, text);
    else execute(panel, r.def.id);
  });
  return true;
}

/**
 * A US Treasury typed by name ("T 4 5/8 08/15/36 Govt", "T 4.625 08/15/36") or by CUSIP ("91282CAA1"), before its
 * function or after it ("ALLQ 91282CAA1 Govt").
 */
export const TREASURY_TYPED = /(?:^|\s)(?:T\s+\d+(?:\.\d+)?(?:\s+\d\/\d{1,2})?\s+\d{2}\/\d{2}\/\d{2}\b|912[0-9A-Z]{6}\b)/i;

/** Loads FedInvest's Treasuries (the desktop app adds them when first needed), then runs the original command. */
function treasuryThenRun(panel: number, text: string): boolean {
  const seq = runSeq.get(panel);
  // The load can take most of a minute: the command still runs unless another was typed or the panel shows another
  // screen by then (its state object changes meanwhile, as screens note their tabs).
  const shown = () => {
    const r = currentRoute(terminal.get(), panel);
    return `${r.fn}|${r.sec ?? ''}|${r.args ?? ''}`;
  };
  const before = shown();
  flash(panel, "Loading the Treasury's prices from FedInvest…", 'info');
  void loadFedInvest().then(() => {
    if (runSeq.get(panel) !== seq || shown() !== before) return;
    const st = fedinvest.get();
    if (st.state !== 'ready') {
      flash(panel, `Treasury prices unavailable: ${st.error ?? 'FedInvest did not answer'}`, 'error');
      return;
    }
    execute(panel, text);
  });
  return true;
}

/** Finds the stock a company name names online ("applied digital SPLC"), then runs the command for it. */
function nameThenRun(panel: number, text: string, message: string): boolean {
  const q = nameQuery(text);
  if (!q || !lookupSource()) {
    flash(panel, message, 'error');
    return false;
  }
  const seq = runSeq.get(panel);
  const pendingPanel = terminal.get().panels[panel];
  flash(panel, `Searching for "${q.name}"…`, 'info');
  void commandForName(text).then((command) => {
    if (runSeq.get(panel) !== seq || terminal.get().panels[panel] !== pendingPanel) return;
    if (!command) {
      flash(panel, `No stock found named "${q.name}". ${message.replace(/^Unknown command: [^.]*\.\s*/, '')}`.trim(), 'error');
      return;
    }
    execute(panel, command);
  });
  return true;
}

/** Runs a command line in a panel. Returns false when it failed. */
export function execute(panel: number, text: string): boolean {
  runSeq.set(panel, (runSeq.get(panel) ?? 0) + 1);
  const parsed = parseCommand(text, lookupFn);
  // Plain words or a question of several words run a search of the app (SEAR), as the terminal's command line does
  // (TE01 02:05); a single code with "?" still asks for its help.
  if ((parsed.kind === 'error' || parsed.kind === 'help') && plainWords(text)) {
    clearFlash(panel);
    navigate(panel, { fn: 'SEARCHRESULTS', args: text.replace(/<\s*GO\s*>/gi, ' ').trim() });
    return true;
  }
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
      navigate(panel, { fn: 'HELP', args: parsed.topic || undefined, sec: loadedSecurity(terminal.get(), panel) });
      return true;
    case 'error':
      if (TREASURY_TYPED.test(text) && fedInvestAvailable() && fedinvest.get().state !== 'ready') return treasuryThenRun(panel, text);
      if (parsed.lookup) return lookupThenRun(panel, text, parsed.lookup, parsed.message);
      if (!parsed.final && lookupSource() && nameQuery(text)) return nameThenRun(panel, text, parsed.message);
      flash(panel, parsed.message, 'error');
      return false;
    case 'route': {
      if (parsed.fn === 'HELP' && parsed.args === 'HELP') {
        // HELP HELP: straight to the help desk.
        clearFlash(panel);
        navigate(panel, { fn: 'MESSAGES', args: 'HELP' });
        return true;
      }
      const loadedSec = loadedSecurity(terminal.get(), panel);
      const fnCode = parsed.fn ?? defaultFunction(parsed.sec?.cls);
      const def = lookupFn(fnCode)!;
      let secId = parsed.sec?.id;
      if ((def.needsSec || def.code === 'HELP') && !secId) secId = loadedSec;
      // MENU <GO> on its own returns to the loaded security's menu.
      if (def.code === 'MENU' && !secId && !parsed.args) secId = loadedSec;
      if (def.needsSec && !secId) {
        flash(panel, `${def.code} needs a security, e.g. ${def.code} AAPL`, 'error');
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
  return cls ? 'MENU' : 'PROFILE';
}
