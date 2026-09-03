import type { MarkdownTable } from './markdownTable';

/**
 * Turns parsed Markdown tables into an .xlsx download.
 *
 * write-excel-file is pulled in with a dynamic import so the writer only
 * reaches the browser when someone actually clicks Export, rather than riding
 * along in the main chat bundle.
 */

type SheetCell =
    | { value: string; type: StringConstructor; fontWeight?: 'bold'; backgroundColor?: string }
    | { value: number; type: NumberConstructor }
    | null;

const EXCEL_MAX_SHEET_NAME = 31;
const MIN_COL_WIDTH = 10;
const MAX_COL_WIDTH = 60;

/**
 * Decide whether a cell is a real number or an identifier that must stay text.
 *
 * Material and vendor codes like "0001101763" are the reason this exists: as a
 * number Excel would render them as 1101763 and the leading zeros would be lost
 * for good. Anything with a leading zero, or long enough to exceed double
 * precision, is kept as a string.
 */
function toCell(raw: string): SheetCell {
    const value = (raw ?? '').trim();
    if (value === '') return null;

    const isInteger = /^-?\d+$/.test(value);
    const isDecimal = /^-?\d*\.\d+$/.test(value);

    if (isInteger || isDecimal) {
        const hasLeadingZero = /^-?0\d/.test(value);
        const significantDigits = value.replace(/[-.]/g, '').length;
        if (!hasLeadingZero && significantDigits <= 15) {
            return { value: Number(value), type: Number };
        }
    }

    return { value, type: String };
}

/** Excel truncates sheet names past 31 characters. */
function safeSheetName(index: number, total: number): string {
    const base = total === 1 ? 'Table' : `Table ${index + 1}`;
    return base.slice(0, EXCEL_MAX_SHEET_NAME);
}

function columnWidth(header: string, rows: string[][], index: number): number {
    let longest = header.length;
    for (const row of rows) {
        const cell = row[index];
        if (cell && cell.length > longest) longest = cell.length;
    }
    return Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, longest + 2));
}

/** Strip characters Windows and macOS refuse in filenames. */
export function safeFileName(name: string): string {
    return name
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120);
}

export async function exportTablesToXlsx(
    tables: MarkdownTable[],
    fileName: string
): Promise<void> {
    if (tables.length === 0) return;

    const { default: writeXlsxFile } = await import('write-excel-file/browser');

    const sheets = tables.map((table, index) => {
        const width = table.headers.length;

        const headerRow: SheetCell[] = table.headers.map(header => ({
            value: header || '',
            type: String as StringConstructor,
            fontWeight: 'bold' as const,
            backgroundColor: '#EFEFEF',
        }));

        // Pad short rows so every row matches the header width; Excel is
        // unforgiving about ragged sheet data.
        const bodyRows: SheetCell[][] = table.rows.map(row => {
            const cells: SheetCell[] = [];
            for (let c = 0; c < width; c++) cells.push(toCell(row[c] ?? ''));
            return cells;
        });

        return {
            sheet: safeSheetName(index, tables.length),
            data: [headerRow, ...bodyRows],
            columns: table.headers.map((header, c) => ({
                width: columnWidth(header, table.rows, c),
            })),
        };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await writeXlsxFile(sheets as any).toFile(fileName);
}
