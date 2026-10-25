// Types for pdf-text.cjs, for the tests that import it.
export type PdfLine = { y: number; cells: { x: number; text: string }[] };
export function pdfLines(bytes: Uint8Array, maxPages?: number): Promise<{ pages: { page: number; lines: PdfLine[] }[]; numPages: number }>;
export function linesOf(items: { x: number; y: number; text: string }[], tolerance?: number): PdfLine[];
