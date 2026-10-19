import { useEffect, useState, type MouseEvent } from 'react';
import { fmtDate, fmtTime } from '../core/format';
import { execute } from '../terminal/exec';
import { terminal } from '../terminal/state';
import { dismiss, toasts } from '../terminal/toasts';
import { dismissAllFavAlerts, dismissFavAlert, favAlerts, VISIBLE, type FavAlert } from '../terminal/favalerts';
import { settings } from '../terminal/settings';
import { ageText } from '../functions/MNEWS';

/** Opens a story at its publisher: the desktop app hands the link to the default browser. */
function openStory(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * A story about a favourite: it stays until closed (×) or clicked. Clicking the headline or the card opens the
 * story at its publisher; clicking the ticker opens the company's news (COMPANYNEWS) in the active panel.
 */
function FavAlertCard({ a, now }: { a: FavAlert; now: number }) {
  const onCard = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('a, button')) return;
    openStory(a.url);
    dismissFavAlert(a.id);
  };
  return (
    <div className="toast toast-fav" role="status" onClick={onCard} title="Click to read it at the publisher; × closes it">
      <div className="tt">
        <span className="fav-mark" aria-label="Favourite">★</span>
        {a.sec ? (
          <button
            type="button"
            className="fav-tickers"
            title={`${a.sec}: company news (COMPANYNEWS)`}
            onClick={() => {
              execute(terminal.get().active, `${a.sec} COMPANYNEWS`);
              dismissFavAlert(a.id);
            }}
          >
            {a.tickers.join(' · ')}
          </button>
        ) : (
          <span className="fav-tickers">{a.tickers.join(' · ')}</span>
        )}
        <span className="time" title={`Published ${fmtDate(a.time)} ${fmtTime(a.time)}`}>
          {ageText(now - a.time)}
        </span>
        <button type="button" className="toast-x" aria-label={`Dismiss: ${a.title}`} title="Dismiss" onClick={() => dismissFavAlert(a.id)}>
          ×
        </button>
      </div>
      <a className="tb" href={a.url} target="_blank" rel="noreferrer noopener" onClick={() => dismissFavAlert(a.id)}>
        {a.title}
      </a>
      <div className="fav-pub">{a.publisher}</div>
    </div>
  );
}

export function Toasts() {
  const list = toasts.use((t) => t);
  const open = favAlerts.use((s) => s.open);
  const flashes = settings.use((s) => s.newsFlashes);
  // The ages move on while the pop-ups wait.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const shown = flashes ? open.slice(0, VISIBLE) : [];
  const more = flashes ? open.length - shown.length : 0;
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.kind}`}
          role="status"
          onClick={() => {
            if (t.command) execute(terminal.get().active, t.command);
            dismiss(t.id);
          }}
        >
          <div className="tt">
            <span>{t.title}</span>
            <span className="time">{fmtTime(t.at)}</span>
          </div>
          <div className="tb">{t.body}</div>
        </div>
      ))}
      {shown.map((a) => (
        <FavAlertCard key={a.id} a={a} now={Math.max(now, a.at)} />
      ))}
      {shown.length > 1 || more > 0 ? (
        <div className="toast toast-fav-more">
          {more > 0 ? (
            <button type="button" title="Every pop-up not dismissed, on BREAKING's ★ Favourites tab (BREAKING FAV)" onClick={() => execute(terminal.get().active, 'BREAKING FAV')}>
              +{more} more
            </button>
          ) : null}
          {more > 0 ? <span className="muted"> · </span> : null}
          <button type="button" onClick={dismissAllFavAlerts}>
            Dismiss all
          </button>
        </div>
      ) : null}
    </div>
  );
}
