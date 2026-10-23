import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Markdown } from '../components/Markdown';
import { APP_VERSION, compareVersions, RELEASES, releaseSummary } from '../data/releases';
import type { FnProps } from '../terminal/types';

/**
 * WHATSNEW: what each release changed, from the release notes packed into the app, newest first. The installed
 * version is marked; a version can follow the command (WHATSNEW 2.23.0).
 */
export function WHATSNEW({ route }: FnProps) {
  const asked = (route.args ?? '').trim().replace(/^v/i, '');
  const first = RELEASES.find((r) => r.version === asked)?.version ?? RELEASES.find((r) => r.version === APP_VERSION)?.version ?? RELEASES[0]?.version;
  const [version, setVersion] = useState(first);
  const note = RELEASES.find((r) => r.version === version);
  return (
    <div className="fn-fill">
      <FnHeader code="WHATSNEW" title="What's New" sub={`Armin Terminal ${APP_VERSION} installed · ${RELEASES.length} releases`} />
      <div className="whatsnew">
        <nav className="whatsnew-list" aria-label="Releases">
          {RELEASES.map((r) => (
            <button
              key={r.version}
              type="button"
              className={`whatsnew-item${r.version === version ? ' on' : ''}`}
              aria-current={r.version === version ? 'true' : undefined}
              title={releaseSummary(r)}
              onClick={() => setVersion(r.version)}
            >
              <span className="whatsnew-v">{r.version}</span>
              {r.version === APP_VERSION ? <span className="whatsnew-tag">installed</span> : compareVersions(r.version, APP_VERSION) > 0 ? <span className="whatsnew-tag">newer</span> : null}
            </button>
          ))}
        </nav>
        <article className="whatsnew-body" data-testid="whatsnew-notes">
          {note ? <Markdown text={note.text} /> : <div className="empty">No release notes in this build.</div>}
        </article>
      </div>
    </div>
  );
}
