import { emptyPortfolio, MAX_PORTFOLIOS, portfolios, type Portfolio } from './userdata';

/**
 * PORTFOLIO's tabs: one per portfolio, each with its own holdings, cash, currency and benchmark. Click a tab to show
 * it, + opens a new one, a double click renames it, × closes it and dragging reorders.
 */

export const cleanPortfolioName = (name: string): string => name.replace(/\s+/g, ' ').trim().slice(0, 40);

/** "Portfolio 2", or the next number no portfolio is called yet. */
function freeName(list: Portfolio[]): string {
  const taken = new Set(list.map((p) => p.name.toUpperCase()));
  let n = list.length + 1;
  while (taken.has(`PORTFOLIO ${n}`)) n++;
  return `Portfolio ${n}`;
}

/** Opens a new, empty portfolio after the others and shows it; false when there are already as many as allowed. */
export function newPortfolio(name?: string): boolean {
  const s = portfolios.get();
  if (s.list.length >= MAX_PORTFOLIOS) return false;
  const beside = s.list[s.active];
  portfolios.set({ list: [...s.list, emptyPortfolio(cleanPortfolioName(name ?? '') || freeName(s.list), beside)], active: s.list.length });
  return true;
}

export function switchPortfolio(index: number): void {
  portfolios.set((s) => (index >= 0 && index < s.list.length && index !== s.active ? { ...s, active: index } : s));
}

/** Names a portfolio; an empty name keeps the one it has. */
export function renamePortfolio(index: number, name: string): void {
  const clean = cleanPortfolioName(name);
  portfolios.set((s) => (clean && s.list[index] && s.list[index].name !== clean ? { ...s, list: s.list.map((p, i) => (i === index ? { ...p, name: clean } : p)) } : s));
}

/** Whether closing a portfolio would delete anything you entered: holdings or cash. */
export const holdsAnything = (p: Portfolio): boolean => p.positions.length > 0 || p.cash !== 0;

/**
 * Closes a portfolio and deletes its holdings and cash. The last one stays: there is always a portfolio. Closing
 * the one on screen shows the one to its right, else the one to its left.
 */
export function closePortfolio(index: number): boolean {
  const s = portfolios.get();
  if (s.list.length <= 1 || !s.list[index]) return false;
  const list = s.list.filter((_, i) => i !== index);
  const active = index < s.active ? s.active - 1 : index === s.active ? Math.min(index, list.length - 1) : s.active;
  portfolios.set({ list, active });
  return true;
}

/** Moves a portfolio to another place among the tabs (dragging it); the one on screen stays on screen. */
export function movePortfolio(from: number, to: number): void {
  portfolios.set((s) => {
    if (!s.list[from]) return s;
    const target = Math.max(0, Math.min(to, s.list.length - 1));
    if (target === from) return s;
    const list = [...s.list];
    const [p] = list.splice(from, 1);
    list.splice(target, 0, p);
    return { list, active: list.indexOf(s.list[s.active]) };
  });
}
