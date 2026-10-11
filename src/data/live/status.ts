import { createStore } from '../../core/store';

export type FeedState = 'off' | 'connecting' | 'live' | 'error' | 'blocked';

export interface FeedStatus {
  crypto: FeedState;
  fx: FeedState;
  equities: FeedState;
  news: FeedState;
  detail: Record<string, string>;
}

export const feedStatus = createStore<FeedStatus>({ crypto: 'off', fx: 'off', equities: 'off', news: 'off', detail: {} });

export function setFeed(name: keyof Omit<FeedStatus, 'detail'>, state: FeedState, detail?: string) {
  feedStatus.set((s) => ({ ...s, [name]: state, detail: detail ? { ...s.detail, [name]: detail } : s.detail }));
}
