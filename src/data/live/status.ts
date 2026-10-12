import { createStore } from '../../core/store';

export type FeedState = 'off' | 'connecting' | 'live' | 'error' | 'blocked';

export interface FeedStatus {
  crypto: FeedState;
  fx: FeedState;
  equities: FeedState;
  news: FeedState;
  /** Real quotes, history and company data (desktop app, Yahoo Finance). */
  market: FeedState;
  /** US Treasury par yields (desktop app). */
  rates: FeedState;
  /** Central bank policy rates from the banks' own data services (desktop app). */
  policy: FeedState;
  /** Official government bond yields outside the US (desktop app). */
  yields: FeedState;
  /** US economic releases and statistics from FRED (desktop app). */
  eco: FeedState;
  detail: Record<string, string>;
}

export const feedStatus = createStore<FeedStatus>({ crypto: 'off', fx: 'off', equities: 'off', news: 'off', market: 'off', rates: 'off', policy: 'off', yields: 'off', eco: 'off', detail: {} });

export function setFeed(name: keyof Omit<FeedStatus, 'detail'>, state: FeedState, detail?: string) {
  feedStatus.set((s) => ({ ...s, [name]: state, detail: detail ? { ...s.detail, [name]: detail } : s.detail }));
}
