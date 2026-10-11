import { engine } from '../data/market';
import { PanelContext } from '../terminal/panel';
import { lookupFn } from '../terminal/registry';
import { currentRoute, setActive, terminal } from '../terminal/state';
import { CommandLine } from './CommandLine';
import { ErrorBoundary } from './ErrorBoundary';

export function Panel({ index }: { index: number }) {
  const route = terminal.use((s) => currentRoute(s, index));
  const active = terminal.use((s) => s.active === index);
  const def = lookupFn(route.fn) ?? lookupFn('HELP')!;
  const sec = route.sec ? engine.get(route.sec) : undefined;
  const Fn = def.component;
  const key = `${route.fn}|${route.sec ?? ''}|${route.args ?? ''}`;
  return (
    <section
      className={`panel${active ? ' active' : ''}`}
      onMouseDownCapture={() => setActive(index)}
      aria-label={`Panel ${index + 1}: ${def.name}`}
    >
      <PanelContext.Provider value={index}>
        <CommandLine panel={index} route={route} />
        <div className="panel-body" id={`panel-body-${index}`}>
          <ErrorBoundary key={key} label={def.code}>
            <Fn route={route} sec={sec} />
          </ErrorBoundary>
        </div>
      </PanelContext.Provider>
    </section>
  );
}
