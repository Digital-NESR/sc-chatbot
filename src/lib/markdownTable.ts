/**
 * Minimal GFM table extractor.
 *
 * The agents return Markdown, so the tables the user sees in the chat only
 * exist as text. To export one we re-parse it out of the raw message rather
 * than scraping the rendered DOM, which keeps the export independent of how
 * react-markdown happens to render.
 */

export interface MarkdownTable {
    headers: string[];
    rows: string[][];
}

/** Split one table line into cells, honouring \| escapes and `inline code`. */
function splitRow(line: string): string[] {
    let s = line.trim();
    // GFM rows are conventionally fenced by pipes; strip those before splitting
    // so a genuinely empty first or last column isn't silently dropped.
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);

    const cells: string[] = [];
    let current = '';
    let inCode = false;

    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === '\\' && s[i + 1] === '|') {
            current += '|';
            i++;
        } else if (ch === '`') {
            inCode = !inCode;
            current += ch;
        } else if (ch === '|' && !inCode) {
            cells.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    cells.push(current);

    return cells.map(c => c.trim());
}

/** `| --- | :--: |` style delimiter row that marks the line above as a header. */
function isSeparatorRow(line: string): boolean {
    if (!line.includes('-')) return false;
    const cells = splitRow(line);
    return cells.length > 0 && cells.every(c => /^:?-+:?$/.test(c));
}

/** Reduce a cell to the plain text the user actually sees. */
function cleanCell(raw: string): string {
    return raw
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/`([^`]*)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/~~([^~]+)~~/g, '$1')
        .replace(/\\([\\`*_{}[\]()#+\-.!|])/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

export function parseMarkdownTables(markdown: string): MarkdownTable[] {
    if (!markdown || !markdown.includes('|')) return [];

    const tables: MarkdownTable[] = [];
    const lines = markdown.split(/\r?\n/);
    let inFence = false;

    for (let i = 0; i < lines.length; i++) {
        // Never treat the contents of a code block as a table.
        if (/^\s*(```|~~~)/.test(lines[i])) {
            inFence = !inFence;
            continue;
        }
        if (inFence || !lines[i].includes('|')) continue;

        const separator = lines[i + 1];
        if (!separator || !isSeparatorRow(separator)) continue;

        const headers = splitRow(lines[i]).map(cleanCell);
        if (headers.length === 0) continue;

        const rows: string[][] = [];
        let j = i + 2;
        while (
            j < lines.length &&
            lines[j].includes('|') &&
            lines[j].trim() !== '' &&
            !/^\s*(```|~~~)/.test(lines[j])
        ) {
            rows.push(splitRow(lines[j]).map(cleanCell));
            j++;
        }

        tables.push({ headers, rows });
        i = j - 1;
    }

    return tables;
}

export function hasMarkdownTable(markdown: string): boolean {
    return parseMarkdownTables(markdown).length > 0;
}
