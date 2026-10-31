import { useCallback, useEffect, useState } from 'react';
import { engine } from '../data/market';
import { lookupSecurity } from '../data/live/lookup';
import { PanelContext } from '../terminal/panel';
import { lookupFn } from '../terminal/registry';
import { currentRoute, setActive, terminal } from '../terminal/state';
import { CommandLine } from './CommandLine';
import { ErrorBoundary } from './ErrorBoundary';
import { PanelToolbar } from './PanelToolbar';
import { RelatedMenu } from './RelatedMenu';
import { SuggestedFunctions } from './SuggestedFunctions';

/**
 * `place`: the panel's grid lines in a layout of your own (rows-layout.ts); the fixed layouts place panels by CSS.
 * `panels`: how many the layout shows; with more than one, the frame can show this one alone (`solo`) and the others
 * are `hidden`, keeping their screens.
 */
export function Panel({ index, place, panels = 1, solo = false, hidden = false }: { index: number; place?: { gridRow: string; gridColumn: string }; panels?: number; solo?: boolean; hidden?: boolean }) {
  const route = terminal.use((s) => currentRoute(s, index));
  const active = terminal.use((s) => s.active === index);
  const def = lookupFn(route.fn) ?? lookupFn('HELP')!;
  const sec = route.sec ? engine.get(route.sec) : undefined;
  const [, bump] = useState(0);
  const found = useCallback(() => bump((n) => n + 1), []);
  const Fn = def.component;
  const key = `${route.fn}|${route.sec ?? ''}|${route.args ?? ''}`;
  return (
    <section
      className={`panel${active ? ' active' : ''}${solo ? ' solo' : ''}`}
      data-panel={index}
      hidden={hidden}
      style={place}
      onMouseDownCapture={() => setActive(index)}
      onFocusCapture={() => setActive(index)}
      aria-label={`Panel ${index + 1}: ${def.name}`}
    >
      <PanelContext.Provider value={index}>
        {/* No frame title above the toolbar: in 2024 the tab strip is the window's title bar (TE01 03:11). */}
        <PanelToolbar panel={index} panels={panels} />
        <CommandLine panel={index} route={route} />
        <div className="panel-main">
        <RelatedMenu />
        <div className="panel-body" id={`panel-body-${index}`}>
          {route.sec && !sec ? (
            <MissingSecurity id={route.sec} onFound={found} />
          ) : (
            <ErrorBoundary key={key} label={def.code}>
              <Fn route={route} sec={sec} />
            </ErrorBoundary>
          )}
        </div>
        </div>
        {def.suggested ? <SuggestedFunctions panel={index} codes={def.suggested} /> : null}
      </PanelContext.Provider>
    </section>
  );
}

/**
 * A saved panel can name a stock that is not registered at startup (a lookup
 * that was not kept). A US stock is looked up again; anything else says so.
 */
function MissingSecurity({ id, onFound }: { id: string; onFound: () => void }) {
  const [msg, setMsg] = useState(`Looking up ${id.split(' ')[0]}…`);
  useEffect(() => {
    const m = /^(\S+) US Equity$/.exec(id);
    if (!m) {
      setMsg(`${id} is not available`);
      return;
    }
    let live = true;
    void lookupSecurity(m[1]).then((r) => {
      if (!live) return;
      if (r.ok) onFound();
      else setMsg(r.reason);
    });
    return () => {
      live = false;
    };
  }, [id, onFound]);
  return <div className="empty">{msg}</div>;
}
