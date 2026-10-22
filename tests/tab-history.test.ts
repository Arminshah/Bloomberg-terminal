import { describe, expect, it } from 'vitest';
import { browserStep } from '../src/terminal/mouse-nav';
import { noteTab } from '../src/terminal/tab-history';
import { currentRoute, navigate, terminal } from '../src/terminal/state';

describe('tabs in the back and forward history', () => {
  it("steps back through a screen's tabs before leaving it, and reopens a screen on the tab it was left on", () => {
    navigate(1, { fn: 'MARKETNEWS' });
    navigate(1, { fn: 'SUPPLYCHAIN', sec: 'AAPL US Equity' });
    const splc = currentRoute(terminal.get(), 1);
    let tab = 1;
    const set = (n: number) => {
      tab = n;
      noteTab(1, splc, n, set, false);
    };
    noteTab(1, splc, 1, set, true);
    set(2); // Suppliers
    set(3); // Customers
    browserStep(1, 'back');
    expect(tab).toBe(2);
    browserStep(1, 'back');
    expect(tab).toBe(1);
    browserStep(1, 'forward');
    expect(tab).toBe(2);
    // No tab before the first: the screen before.
    browserStep(1, 'back');
    browserStep(1, 'back');
    expect(currentRoute(terminal.get(), 1).fn).toBe('MARKETNEWS');
    // Forward returns to the screen, which opens on the tab it was left on (1, after stepping back).
    browserStep(1, 'forward');
    expect(currentRoute(terminal.get(), 1)).toBe(splc);
    let reopened = 1;
    noteTab(1, splc, 1, (n) => (reopened = n), true);
    expect(reopened).toBe(1);
    // A new tab after stepping back drops the steps ahead, as a browser does.
    set(4);
    browserStep(1, 'forward');
    expect(tab).toBe(4);
  });
});
