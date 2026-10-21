import { useMemo } from 'react';
import { fmtStamp } from '../core/format';
import { engine } from '../data/market';
import { sourceCode } from '../data/sourcecode';
import { securityNews, useSecuritiesNews, type NewsReach } from '../data/live/secnews';
import type { SecurityDef } from '../data/types';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import { Section } from './cells';

/** A screen's news box spares Massive's 5 calls a minute and Marketaux's daily allowance; COMPANYNEWS asks them. */
const BOX_REACH: NewsReach = { massive: false, marketaux: false };

/** A story published within this long is tagged BREAKING: the window of BREAKING's first tab ("Last hour"). */
export const BREAKING_MS = 3_600_000;

/**
 * The latest headlines of any security (the six newest), with links to the articles and to all its news
 * (COMPANYNEWS); a story of the last hour is tagged BREAKING.
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
              {engine.now() - st.time < BREAKING_MS && st.time <= engine.now() + 5 * 60_000 ? <span className="badge brk" title="Published in the last hour">BREAKING</span> : null}
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
