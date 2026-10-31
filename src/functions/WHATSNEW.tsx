// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Markdown } from '../components/Markdown';
import { APP_VERSION, compareVersions, RELEASES, releaseSummary } from '../data/releases';
import { primaryMnemonic } from '../terminal/legacy';
import { lookupFn } from '../terminal/registry';
import type { FnProps } from '../terminal/types';

/**
 * WHATSNEW: what each release changed, from the release notes packed into the app, newest first. The installed
 * version is marked; a version can follow the command (WHATSNEW 2.23.0).
 */
/** The release notes' lines that name a function by its code or mnemonic, newest release first. */
export function changesFor(code: string): { version: string; lines: string[] }[] {
  const names = [...new Set([code, primaryMnemonic(code)])].map((n) => n.replace(/[^A-Z0-9]/g, '')).filter(Boolean);
  const re = new RegExp(`(^|[^A-Za-z0-9])(${names.join('|')})(?![A-Za-z0-9])`);
  return RELEASES.map((r) => ({ version: r.version, lines: r.text.split('\n').filter((l) => /^\s*[-*]/.test(l) && re.test(l)) })).filter((r) => r.lines.length);
}

/** "See What's New in DES" from the help menu: the release notes' lines about one function. */
function FunctionChanges({ code }: { code: string }) {
  const changes = changesFor(code);
  const mn = primaryMnemonic(code);
  return (
    <div className="fn-fill">
      <FnHeader code="WHATSNEW" title={`What's New in ${mn}`} sub={`Release notes that mention ${mn}${mn !== code ? ` (${code})` : ''}`} />
      <article className="whatsnew-body" data-testid="whatsnew-notes">
        {changes.length ? (
          changes.map((c) => (
            <section key={c.version}>
              <h3 className="amber">{c.version}</h3>
              <Markdown text={c.lines.join('\n')} />
            </section>
          ))
        ) : (
          <div className="empty">No release note in this build mentions {mn}.</div>
        )}
      </article>
    </div>
  );
}

export function WHATSNEW({ route }: FnProps) {
  const fn = route.args && !/^v?\d/i.test(route.args.trim()) ? lookupFn(route.args.trim()) : undefined;
  if (fn) return <FunctionChanges code={fn.code} />;
  return <Releases route={route} />;
}

function Releases({ route }: Pick<FnProps, 'route'>) {
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
