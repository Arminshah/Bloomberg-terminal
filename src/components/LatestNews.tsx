// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useMemo } from 'react';
import { fmtStamp } from '../core/format';
import { engine } from '../data/market';
import { sourceCode } from '../data/sourcecode';
import { securityNews, useSecuritiesNews, type NewsReach } from '../data/live/secnews';
import type { SecurityDef } from '../data/types';
import { isBreaking } from '../data/live/breaking';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import { Section } from './cells';

/** A screen's news box spares Massive's 5 calls a minute and Marketaux's daily allowance; COMPANYNEWS asks them. */
const BOX_REACH: NewsReach = { massive: false, marketaux: false };

/**
 * The latest headlines of any security (the six newest), with links to the articles and to all its news
 * (COMPANYNEWS); a story that is breaking news (fresh, about the company, a stock-moving event: src/data/live/breaking.ts)
 * is tagged BREAKING.
 */
export function LatestNews({ sec, max = 6 }: { sec: SecurityDef; max?: number }) {
  const panel = usePanelId();
  const v = useSecuritiesNews([engine.realOnly ? sec : null], BOX_REACH);
  const { stories, states } = useMemo(() => (engine.realOnly ? securityNews(sec, BOX_REACH) : { stories: [], states: [] }), [sec, v]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!states.length) return null;
  const waiting = states.some(([, f]) => !f || f.state === 'loading');
  return (
    <Section
      title="Latest news"
      right={
        <button type="button" className="act" onClick={() => execute(panel, `${sec.id} COMPANYNEWS`)}>
          All news ›
        </button>
      }
    >
      {stories.length ? (
        stories.slice(0, max).map((st) => (
          <a key={st.id} className="news-item real" href={st.url} target="_blank" rel="noreferrer noopener" title={st.title}>
            <span className="time">{fmtStamp(st.time, engine.now())}</span>
            <span className="hl">
              {isBreaking(st, sec, engine.now()) ? <span className="badge brk" title="Breaking: published in the last two hours, about the company, reporting an event that moves its shares">BREAKING</span> : null}
              {st.title}
            </span>
            <span className="src" title={st.publisher}>{sourceCode(st.publisher)}</span>
          </a>
        ))
      ) : (
        <div className="note">{waiting ? 'Loading news…' : states.map(([n, f]) => `${n}: ${f?.state === 'ok' ? 'no recent stories' : (f?.message ?? 'no answer')}`).join(' · ')}</div>
      )}
    </Section>
  );
}
