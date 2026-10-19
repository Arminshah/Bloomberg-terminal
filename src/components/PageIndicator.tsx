import { useEffect, useState } from 'react';
import { usePanelId } from '../terminal/panel';
import { geometryOf, pageState, pageTarget, turnPage } from '../terminal/paging';

/**
 * "Page 2/5" on the function bar, for a screen longer than its panel. It follows scrolling, resizing and content
 * that arrives later; PgDn / PgUp (PAGE FWD / PAGE BACK) turn the pages, and clicking it shows the next page.
 */
export function PageIndicator() {
  const panel = usePanelId();
  const [state, setState] = useState({ page: 1, pages: 1 });
  useEffect(() => {
    const body = document.getElementById(`panel-body-${panel}`);
    if (!body) return;
    let target = pageTarget(panel);
    const update = () => {
      if (!target?.isConnected) target = pageTarget(panel);
      if (!target) return;
      const s = pageState(geometryOf(target));
      setState((prev) => (prev.page === s.page && prev.pages === s.pages ? prev : { page: s.page, pages: s.pages }));
    };
    // The scrolling region can change as data loads or the layout changes, so it is looked for again now and then.
    const refresh = () => {
      target = pageTarget(panel);
      update();
    };
    update();
    body.addEventListener('scroll', update, true);
    window.addEventListener('resize', refresh);
    const timer = setInterval(refresh, 1500);
    return () => {
      body.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', refresh);
      clearInterval(timer);
    };
  }, [panel]);
  if (state.pages <= 1) return null;
  const last = state.page >= state.pages;
  return (
    <button
      type="button"
      className="fnh-page"
      data-testid="page-indicator"
      title={`${last ? 'Last page: click for the first' : 'Click or PgDn for the next page'}. PgUp goes back; a number typed before PgDn moves that many pages.`}
      onClick={() => turnPage(panel, last ? -1 : 1, last ? state.pages : 1)}
    >
      Page {state.page}/{state.pages}
    </button>
  );
}
