import { copyText, downloadText, toCsv } from '../core/csv';
import { flash } from '../terminal/panel';
import type { Action } from './FnHeader';

/** Standard 98) Copy / 99) Export actions for tabular screens. */
export function exportActions(panel: number, filename: string, rows: () => (string | number | null | undefined)[][]): Action[] {
  return [
    {
      n: 98,
      label: 'Copy',
      title: 'Copy the table as CSV to the clipboard',
      onClick: () => {
        void copyText(toCsv(rows())).then((ok) => flash(panel, ok ? 'Table copied to clipboard' : 'Clipboard blocked by the browser', ok ? 'info' : 'error'));
      },
    },
    {
      n: 99,
      label: 'Export',
      title: 'Download the table as a CSV file',
      onClick: () => {
        const ok = downloadText(filename, toCsv(rows()));
        flash(panel, ok ? `Saved ${filename}` : 'Downloads are blocked here; use 98) Copy', ok ? 'info' : 'error');
      },
    },
  ];
}
