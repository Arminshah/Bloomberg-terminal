import { describe, expect, it } from 'vitest';
import { CHART_THEME } from '../src/components/chart/PriceChart';
import { settings } from '../src/terminal/settings';
import css from '../src/styles/global.css?raw';
import main from '../src/main.tsx?raw';
import tools from '../src/functions/TOOLS.tsx?raw';

// The owner fixed the typeface on 27 October 2026: IBM Plex Sans, slightly bold, everywhere but the command line
// (IBM Plex Mono) and the charts' labels (IBM Plex Mono). Bergoom, the default in 2.26.0, drew thin, uneven
// figures on Windows. These tests fail if the face is changed, another is added, or a choice is offered again.
describe('the typeface, fixed to IBM Plex Sans', () => {
  it('is IBM Plex Sans, at weight 500 with 0.01em spacing, and bold at 600', () => {
    expect(css).toMatch(/--sans: 'IBM Plex Sans', system-ui,/);
    expect(css).toMatch(/--mono: var\(--sans\);/);
    expect(css).toMatch(/--fixed: 'IBM Plex Mono',/);
    expect(css).toMatch(/html:root body \{ font-weight: 500; letter-spacing: 0\.01em; \}/);
    expect(css).toMatch(/html:root b, html:root strong, html:root th \{ font-weight: 600; \}/);
    // No other face, size adjustment or per-setting typeface rule.
    expect(css).not.toMatch(/Bergoom|font-size-adjust|data-font/i);
    expect(css.match(/--sans:/g)).toHaveLength(1);
  });

  it('bundles IBM Plex Sans and IBM Plex Mono, and no other face', () => {
    for (const w of [400, 500, 600]) {
      expect(main).toContain(`import '@fontsource/ibm-plex-sans/latin-${w}.css';`);
      expect(main).toContain(`import '@fontsource/ibm-plex-mono/latin-${w}.css';`);
    }
    expect(main.match(/@fontsource\//g)).toHaveLength(6);
    expect(main).not.toMatch(/fonts\.css|Bergoom/i);
  });

  it('labels the charts in IBM Plex Mono', () => {
    expect(CHART_THEME.font).toBe('11px "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace');
    expect(CHART_THEME.fontB).toBe('600 11px "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace');
  });

  it('offers no typeface setting', () => {
    expect(Object.keys(settings.get())).not.toContain('font');
    expect(tools).not.toMatch(/Typeface/);
  });
});
