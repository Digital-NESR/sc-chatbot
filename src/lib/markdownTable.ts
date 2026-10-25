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
    /**
     * The same cells with their inline Markdown left in.
     *
     * `headers` and `rows` are cleaned down to the plain text a reader sees,
     * which is what the classifier and the Excel export want. The grid renders
     * the cells instead of handing the table to ReactMarkdown, so it needs the
     * original back to keep a bold total or a linked document number.
     */
    rawHeaders: string[];
    rawRows: string[][];
    /** First line of the table in the source, 0-based and inclusive. */
    startLine: number;
    /** Last line of the table in the source, 0-based and inclusive. */
    endLine: number;
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

        const rawHeaders = splitRow(lines[i]);
        const headers = rawHeaders.map(cleanCell);
        if (headers.length === 0) continue;

        const rows: string[][] = [];
        const rawRows: string[][] = [];
        let j = i + 2;
        while (
            j < lines.length &&
            lines[j].includes('|') &&
            lines[j].trim() !== '' &&
            !/^\s*(```|~~~)/.test(lines[j])
        ) {
            const cells = splitRow(lines[j]);
            rawRows.push(cells);
            rows.push(cells.map(cleanCell));
            j++;
        }

        tables.push({ headers, rows, rawHeaders, rawRows, startLine: i, endLine: j - 1 });
        i = j - 1;
    }

    return tables;
}

export function hasMarkdownTable(markdown: string): boolean {
    return parseMarkdownTables(markdown).length > 0;
}

/**
 * One assistant answer, cut into the prose around its tables and the tables
 * themselves.
 *
 * This exists so a table can be swapped for a chart where it stands, without
 * the Markdown renderer having to work out which of several tables it is
 * currently drawing. That counter would have to survive re-renders it cannot
 * see, which is exactly the kind of thing React is allowed to run twice.
 * Splitting the source first keeps the decision in one place and pure.
 */
export type MessageSegment =
    | { kind: 'text'; markdown: string }
    | { kind: 'table'; markdown: string; table: MarkdownTable; index: number };

export function splitByTables(markdown: string): MessageSegment[] {
    const tables = parseMarkdownTables(markdown);
    if (!tables.length) return [{ kind: 'text', markdown }];

    const lines = markdown.split(/\r?\n/);
    const segments: MessageSegment[] = [];
    let cursor = 0;

    tables.forEach((table, index) => {
        if (table.startLine > cursor) {
            const before = lines.slice(cursor, table.startLine).join('\n');
            if (before.trim()) segments.push({ kind: 'text', markdown: before });
        }
        segments.push({
            kind: 'table',
            markdown: lines.slice(table.startLine, table.endLine + 1).join('\n'),
            table,
            index,
        });
        cursor = table.endLine + 1;
    });

    const after = lines.slice(cursor).join('\n');
    if (after.trim()) segments.push({ kind: 'text', markdown: after });

    return segments;
}

/**
 * Takes inline HTML out of an answer before anything parses or renders it.
 *
 * Agents occasionally emit `<br>` inside a table cell to stack two values. It
 * fails twice over: ReactMarkdown escapes raw HTML, so the reader sees the tag
 * as literal text, and the cell then holds two numbers, so it stops parsing as
 * a measure and the whole table is judged unchartable.
 *
 * In a table row the break becomes a semicolon, which is what the cell meant.
 * Elsewhere it becomes a space. Neither can reintroduce a line break, because
 * a newline inside a row would split one table row into two broken ones.
 *
 * This is defensive: the agents are also told not to do it. Doing both means
 * one badly formatted answer degrades into a readable one instead of a broken
 * one.
 */
function stripInlineHtml(markdown: string): string {
    if (!markdown.includes('<')) return markdown;
    return markdown
        .split('\n')
        .map(line => {
            const isRow = line.trimStart().startsWith('|');
            return line.replace(/<br\s*\/?>/gi, isRow ? '; ' : ' ');
        })
        .join('\n');
}

/**
 * Repairs a delimiter row whose cell count does not match its header.
 *
 * GitHub-flavoured Markdown requires the two to match exactly; when they do
 * not, the block is not a table at all and renders as a wall of pipes. An
 * agent that writes six headers and five dashes has still told us everything
 * we need - the header row says how many columns there are - so the row is
 * rebuilt rather than the whole table thrown away.
 *
 * Only ever touches a row that is already nothing but dashes, colons and
 * pipes, so it cannot damage a row carrying data.
 */
function repairTableDelimiters(markdown: string): string {
    const lines = markdown.split('\n');
    const cells = (line: string) =>
        line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').length;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.includes('-') || !/^\s*\|?[\s:|-]*\|[\s:|-]*$/.test(line)) continue;

        const header = lines[i - 1];
        if (!header.trim().startsWith('|')) continue;

        const want = cells(header);
        if (cells(line) === want) continue;

        const indent = line.match(/^\s*/)?.[0] ?? '';
        lines[i] = indent + '|' + Array(want).fill('---').join('|') + '|';
    }
    return lines.join('\n');
}

/**
 * Everything an answer's Markdown needs before it is parsed or rendered.
 *
 * Both repairs exist for the same reason: one formatting slip in an answer
 * should cost that detail, not the whole table. The agents are told not to
 * make either mistake; this is what happens when one gets through anyway.
 */
export function normalizeAnswerMarkdown(markdown: string): string {
    return repairTableDelimiters(stripInlineHtml(markdown));
}
