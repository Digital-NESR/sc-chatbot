'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import type { MarkdownTable } from '@/lib/markdownTable';
import { columnShapes, isTotalsRow, parseNumericCell } from '@/lib/chartData';
import { markdownComponents } from './markdownComponents';

/**
 * An answer's table, as a table worth reading.
 *
 * It replaces handing the Markdown to ReactMarkdown, which drew the cells
 * honestly and did nothing else: numbers ragged on the left, no way to sort,
 * and the header gone the moment a long result scrolled. People were exporting
 * to Excel to do things the table should have done itself.
 *
 * Everything here is reading, never editing. The figures, the row count and
 * the rows themselves are exactly what the agent returned - the only thing a
 * click changes is the order, and the footer says so when it has.
 */

/* ReactMarkdown wraps its output in a paragraph; inside a cell that is a block
   where an inline run belongs. Module scope, because a fresh object would give
   every cell a new component identity on every render. */
const cellComponents: Components = {
    ...markdownComponents,
    p: ({ children }) => <>{children}</>,
};

/** Past this many rows the header sticks and the body scrolls in place. */
const TALL_ROWS = 14;

/** Below this there is nothing worth sorting. */
const SORTABLE_ROWS = 3;

type Sort = { col: number; dir: 'asc' | 'desc' };

/** A cell carrying inline Markdown goes through the renderer; plain text does not. */
function Cell({ clean, raw }: { clean: string; raw: string }) {
    if (raw === clean || !raw.trim()) return <>{clean}</>;
    return (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={cellComponents}>
            {raw}
        </ReactMarkdown>
    );
}

export default function DataGrid({ table }: { table: MarkdownTable }) {
    const shapes = useMemo(() => columnShapes(table), [table]);

    // Cleaned and raw cells travel together: the first decides how a column
    // sorts and lines up, the second is what gets drawn.
    const rows = useMemo(
        () => table.rows.map((cells, i) => ({ cells, raw: table.rawRows[i] ?? cells })),
        [table],
    );

    const body = useMemo(() => rows.filter(r => !isTotalsRow(r.cells)), [rows]);
    const totals = useMemo(() => rows.filter(r => isTotalsRow(r.cells)), [rows]);

    const [sort, setSort] = useState<Sort | null>(null);

    const sortable = body.length >= SORTABLE_ROWS;
    const tall = body.length > TALL_ROWS;

    // A number sorts biggest first and a name sorts A to Z, because that is
    // what someone clicking either one is almost always after.
    const firstDir = (col: number): 'asc' | 'desc' => (shapes[col]?.numeric ? 'desc' : 'asc');

    const toggle = (col: number) => {
        setSort(s => {
            if (!s || s.col !== col) return { col, dir: firstDir(col) };
            if (s.dir === firstDir(col)) return { col, dir: s.dir === 'asc' ? 'desc' : 'asc' };
            // Third click puts the agent's own order back. That order is not
            // arbitrary - the answer is usually sorted by whatever was asked
            // about - so there has to be a way back to it.
            return null;
        });
    };

    const ordered = useMemo(() => {
        if (!sort) return body;
        const { col, dir } = sort;
        const sign = dir === 'asc' ? 1 : -1;
        const numeric = shapes[col]?.numeric ?? false;

        return [...body].sort((a, b) => {
            const av = (a.cells[col] ?? '').trim();
            const bv = (b.cells[col] ?? '').trim();

            // A blank cell is missing data rather than a small number, so it
            // goes to the bottom whichever way the column is pointing.
            if (!av && !bv) return 0;
            if (!av) return 1;
            if (!bv) return -1;

            if (numeric) {
                const an = parseNumericCell(av)?.value;
                const bn = parseNumericCell(bv)?.value;
                if (an != null && bn != null) return (an - bn) * sign;
                // One of them is the odd text cell in a numeric column: 'n/a',
                // 'see note'. Same rule as a blank - out of the ranking.
                if (an == null && bn == null) return 0;
                return an == null ? 1 : -1;
            }

            return av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' }) * sign;
        });
    }, [body, sort, shapes]);

    const sortedHeader = sort ? table.headers[sort.col] : null;
    const direction = sort
        ? shapes[sort.col]?.numeric
            ? sort.dir === 'desc' ? 'high to low' : 'low to high'
            : sort.dir === 'asc' ? 'A to Z' : 'Z to A'
        : null;

    const cellClass = (c: number) =>
        shapes[c]?.alignRight ? 'text-right tabular-nums whitespace-nowrap' : '';

    return (
        <div className="my-3">
            <div
                className={`w-full overflow-x-auto rounded-lg border border-slate-300 bg-white ${
                    tall ? 'max-h-[min(60vh,520px)] overflow-y-auto' : ''
                }`}
            >
                {/* border-separate rather than border-collapse: a collapsed
                    border belongs to the table, so it scrolls out from under a
                    sticky header and leaves it floating above the rows. */}
                <table className="w-full text-[13px] text-left border-separate border-spacing-0">
                    <thead className={`text-xs uppercase text-slate-500 ${tall ? 'sticky top-0 z-10' : ''}`}>
                        <tr>
                            {table.headers.map((header, c) => {
                                const on = sort?.col === c;
                                const right = shapes[c]?.alignRight;
                                return (
                                    <th
                                        key={c}
                                        scope="col"
                                        aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                                        className={`bg-slate-100 border-b border-slate-300 font-semibold whitespace-nowrap ${
                                            right ? 'text-right' : 'text-left'
                                        } ${sortable ? 'p-0' : 'px-3 py-1.5'}`}
                                    >
                                        {sortable ? (
                                            <button
                                                type="button"
                                                onClick={() => toggle(c)}
                                                title={`Sort by ${header}`}
                                                className={`group w-full flex items-center gap-1 px-3 py-1.5 transition-colors hover:text-slate-800 ${
                                                    right ? 'justify-end' : 'justify-start'
                                                } ${on ? 'text-nesr-green' : ''}`}
                                            >
                                                <span>{header}</span>
                                                {on ? (
                                                    sort.dir === 'asc' ? (
                                                        <ArrowUp size={11} className="shrink-0" />
                                                    ) : (
                                                        <ArrowDown size={11} className="shrink-0" />
                                                    )
                                                ) : (
                                                    <ChevronsUpDown
                                                        size={11}
                                                        className="shrink-0 opacity-0 group-hover:opacity-50 transition-opacity"
                                                    />
                                                )}
                                            </button>
                                        ) : (
                                            header
                                        )}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>

                    <tbody>
                        {ordered.map((row, r) => (
                            <tr key={r} className="hover:bg-slate-50 transition-colors">
                                {table.headers.map((_, c) => (
                                    <td
                                        key={c}
                                        className={`px-3 py-2 border-b border-slate-200 align-top break-words ${cellClass(c)}`}
                                    >
                                        <Cell clean={row.cells[c] ?? ''} raw={row.raw[c] ?? row.cells[c] ?? ''} />
                                    </td>
                                ))}
                            </tr>
                        ))}

                        {/* Pinned under the sort, and emphasised here rather
                            than relying on the agent having bolded it. */}
                        {totals.map((row, r) => (
                            <tr key={`t${r}`} className="bg-slate-50 font-semibold">
                                {table.headers.map((_, c) => (
                                    <td
                                        key={c}
                                        className={`px-3 py-2 border-t-2 border-slate-300 align-top break-words ${cellClass(c)}`}
                                    >
                                        <Cell clean={row.cells[c] ?? ''} raw={row.raw[c] ?? row.cells[c] ?? ''} />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Only speaks when it has something to say: that the table is long
                enough to have scrolled, or that what is on screen is no longer
                the order the agent returned. It is also a live region: a
                re-sort is a change a sighted reader watches happen and nobody
                else does, and this line already says exactly what changed. */}
            {(tall || sort) && (
                <p role="status" aria-live="polite" className="text-[10.5px] text-slate-400 px-1 pt-1">
                    {body.length} rows
                    {sort && (
                        <>
                            {' · sorted by '}
                            <span className="text-slate-500">{sortedHeader}</span>, {direction}
                            {' · '}
                            <button
                                type="button"
                                onClick={() => setSort(null)}
                                className="underline underline-offset-2 hover:text-slate-600"
                            >
                                original order
                            </button>
                        </>
                    )}
                </p>
            )}
        </div>
    );
}
