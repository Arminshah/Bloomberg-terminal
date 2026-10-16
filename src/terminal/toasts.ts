import { createStore } from '../core/store';

export interface Toast {
  id: number;
  title: string;
  body: string;
  kind: 'info' | 'alert' | 'news' | 'ok';
  at: number;
  /** Command to run in the active panel when clicked. */
  command?: string;
}

export const toasts = createStore<Toast[]>([]);
let seq = 0;

export function toast(t: Omit<Toast, 'id' | 'at'>, ttl = 7000) {
  const id = ++seq;
  toasts.set((list) => [{ ...t, id, at: Date.now() }, ...list].slice(0, 5));
  setTimeout(() => dismiss(id), ttl);
}

export function dismiss(id: number) {
  toasts.set((list) => list.filter((t) => t.id !== id));
}
