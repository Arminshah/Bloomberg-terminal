import { loadJson, saveJson } from '../core/store';
import { APP_VERSION, compareVersions, releaseNote, releaseSummary } from '../data/releases';
import { toast } from './toasts';

const SEEN = 'armin:seen-version';

/**
 * Once after an update: a notice naming the new version and its summary, which opens WHATSNEW. A first start saves
 * the version without a notice.
 */
export function announceUpdate(): void {
  let seen: string | undefined;
  try {
    seen = loadJson<string>(SEEN);
  } catch {
    return;
  }
  if (seen === APP_VERSION) return;
  saveJson(SEEN, APP_VERSION);
  if (!seen || compareVersions(APP_VERSION, seen) <= 0) return;
  const note = releaseNote();
  toast({ kind: 'info', title: `Updated to ${APP_VERSION}`, body: `${note ? `${releaseSummary(note).slice(0, 180)}${releaseSummary(note).length > 180 ? '…' : ''} ` : ''}Click for what's new (WHATSNEW).`, command: 'WHATSNEW' }, 20000);
}
