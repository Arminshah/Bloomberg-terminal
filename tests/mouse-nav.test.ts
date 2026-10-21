import { beforeEach, describe, expect, it } from 'vitest';
import { historyStep } from '../src/terminal/mouse-nav';
import { currentRoute, navigate, terminal } from '../src/terminal/state';

describe('mouse back and forward buttons', () => {
  beforeEach(() => {
    navigate(0, { fn: 'MARKETNEWS' });
    navigate(0, { fn: 'WEI' });
    navigate(0, { fn: 'TOPMOVERS' });
  });

  it('step back and forward through the panel\'s screens as a browser tab does', () => {
    const at = (t: number) => t * 1000;
    expect(historyStep('back', 'mouse', 0, at(1))).toBe(true);
    expect(currentRoute(terminal.get(), 0).fn).toBe('WEI');
    historyStep('back', 'mouse', 0, at(2));
    expect(currentRoute(terminal.get(), 0).fn).toBe('MARKETNEWS');
    historyStep('forward', 'mouse', 0, at(3));
    expect(currentRoute(terminal.get(), 0).fn).toBe('WEI');
    // A new screen after going back drops the screens ahead, as in a browser.
    navigate(0, { fn: 'ECO' });
    historyStep('forward', 'mouse', 0, at(4));
    expect(currentRoute(terminal.get(), 0).fn).toBe('ECO');
  });

  it('counts one press reported both as a button and as the window command once', () => {
    expect(historyStep('back', 'mouse', 0, 10_000)).toBe(true);
    expect(historyStep('back', 'app', 0, 10_050)).toBe(false);
    expect(currentRoute(terminal.get(), 0).fn).toBe('WEI');
    // Two presses of the same button are two steps.
    expect(historyStep('back', 'mouse', 0, 10_200)).toBe(true);
    expect(currentRoute(terminal.get(), 0).fn).toBe('MARKETNEWS');
  });
});
