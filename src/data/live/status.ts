import { createStore } from '../../core/store';

export type FeedState = 'off' | 'connecting' | 'live' | 'error' | 'blocked';

export interface FeedStatus {
  crypto: FeedState;
  fx: FeedState;
  equities: FeedState;
  news: FeedState;
  /** Real quotes, history and company data (desktop app, Yahoo Finance). */
  market: FeedState;
  /** The Yahoo price socket, independent of the HTTP quote service. */
  stream: FeedState;
  /** US Treasury par yields (desktop app). */
  rates: FeedState;
  /** Central bank policy rates from the banks' own data services (desktop app). */
  policy: FeedState;
  /** Official government bond yields outside the US (desktop app). */
  yields: FeedState;
  /** US economic releases and statistics from FRED (desktop app). */
  eco: FeedState;
  detail: Record<string, string>;
  /** When each feed last delivered data to the screens (epoch ms). */
  updatedAt: Record<string, number>;
}

export type FeedName = keyof Omit<FeedStatus, 'detail' | 'updatedAt'>;

export const feedStatus = createStore<FeedStatus>({ crypto: 'off', fx: 'off', equities: 'off', news: 'off', market: 'off', stream: 'off', rates: 'off', policy: 'off', yields: 'off', eco: 'off', detail: {}, updatedAt: {} });

export function setFeed(name: FeedName, state: FeedState, detail?: string, options: { delivered?: boolean; deliveredAt?: number } = {}) {
  feedStatus.set((s) => ({
    ...s,
    [name]: state,
    detail: detail ? { ...s.detail, [name]: detail } : s.detail,
    updatedAt: state === 'live' && options.delivered !== false ? { ...s.updatedAt, [name]: options.deliveredAt != null && Number.isFinite(options.deliveredAt) && options.deliveredAt > 0 ? options.deliveredAt : Date.now() } : s.updatedAt,
  }));
}
