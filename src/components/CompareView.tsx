'use client';

import { useMemo } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import type { MarkdownTable } from '@/lib/markdownTable';
import { parseNumericCell, type ChartableTable } from '@/lib/chartData';
import { formatExactNumber, seriesColor } from '@/lib/chartTheme';

/**
 * A few rows of a table, side by side instead of stacked.
 *
 * Built for the vendor question - three suppliers, six attributes each, and
 * the actual job is "which one". Read down a table you compare by scanning
 * across rows and holding numbers in your head; read across cards you compare
 * by looking.
 *
 * Every column comes through, not only the numeric ones, because half of what
 * decides a vendor is text: the country, the contract, whether it is sole
 * sourced. Numbers get a bar scaled against the best value in that row so the
 * gap is visible rather than arithmetic.
 */

/** Lower is better for these; everything else reads higher-is-better. */
const LOWER_IS_BETTER = /\b(price|cost|lead\s*time|days?|age|delay|overdue|rate)\b/i;

/** Columns that are an identifier, not a thing to compare. */
const SKIP_HEADER = /^(rank|#|s\/?n|no\.?)$/i;

/** "highest" or "lowest" for one attribute - a fact, not a verdict. */
function Extreme({ header }: { header: string }) {
    const low = LOWER_IS_BETTER.test(header);
    const Icon = low ? ArrowDown : ArrowUp;
    return (
        <span
            className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wide text-nesr-green shrink-0"
            title={low ? 'Lowest of these' : 'Highest of these'}
        >
            <Icon size={10} />
            {low ? 'lowest' : 'highest'}
        </span>
    );
}

export default function CompareView({
    table,
    analysis,
}: {
    table: MarkdownTable;
    analysis: ChartableTable;
}) {
    const labelIndex = table.headers.indexOf(analysis.labelHeader);
    const measureHeaders = useMemo(
        () => new Set(analysis.measures.map(m => m.header)),
        [analysis.measures],
    );

    const attributes = useMemo(
        () =>
            table.headers
                .map((header, index) => ({ header, index }))
                .filter(a => a.index !== labelIndex && !SKIP_HEADER.test(a.header.trim())),
        [table.headers, labelIndex],
    );

    const cards = useMemo(
        () =>
            analysis.data.map(row => {
                // analysis.data is already sorted, deduplicated and truncated,
                // so find the original row rather than re-deriving it.
                const source = table.rows.find(
                    r => (r[labelIndex] ?? '').trim() === row.label,
                );
                return { label: row.label, cells: source ?? [] };
            }),
        [analysis.data, table.rows, labelIndex],
    );

    /**
     * The extreme value in each row, so it can be seen rather than worked out.
     *
     * Marked as "highest" or "lowest", never as "best". Whether a high Qty is
     * good depends on what you are doing, and a trophy on a column the data
     * cannot rank is a recommendation nobody made.
     */
    const { best, maxima } = useMemo(() => {
        const best = new Map<string, number>();
        const maxima = new Map<string, number>();

        for (const attr of attributes) {
            if (!measureHeaders.has(attr.header)) continue;

            const values: number[] = [];
            for (const card of cards) {
                const parsed = parseNumericCell(card.cells[attr.index]);
                if (parsed && Number.isFinite(parsed.value)) values.push(parsed.value);
            }
            if (!values.length) continue;

            let max = 0;
            for (const v of values) max = Math.max(max, Math.abs(v));
            if (max > 0) maxima.set(attr.header, max);

            // One value is not an extreme of anything, so nothing is marked.
            if (values.length < 2) continue;
            let extreme = values[0];
            const lower = LOWER_IS_BETTER.test(attr.header);
            for (const v of values) extreme = lower ? Math.min(extreme, v) : Math.max(extreme, v);
            best.set(attr.header, extreme);
        }
        return { best, maxima };
    }, [attributes, cards, measureHeaders]);

    if (!cards.length) return null;

    return (
        <div className="px-1 sm:px-2 pb-1">
            <div
                className="grid gap-3"
                style={{ gridTemplateColumns: `repeat(${Math.min(cards.length, 4)}, minmax(0, 1fr))` }}
            >
                {cards.map(card => (
                    <div
                        key={card.label}
                        className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col"
                    >
                        {/* One accent colour for every card. Cycling the series
                            palette looked smarter until the seventh card reused
                            the third one's colour and implied a pairing that is
                            not in the data. */}
                        <div
                            className="px-3 py-2.5 border-b border-slate-100"
                            style={{ borderTop: `3px solid ${seriesColor(0)}` }}
                        >
                            <p className="text-[13px] font-semibold text-slate-800 leading-snug break-words">
                                {card.label}
                            </p>
                        </div>

                        <dl className="divide-y divide-slate-50">
                            {attributes.map(attr => {
                                const raw = (card.cells[attr.index] ?? '').trim();
                                const parsed = measureHeaders.has(attr.header)
                                    ? parseNumericCell(raw)
                                    : null;
                                const isBest =
                                    parsed !== null && best.get(attr.header) === parsed.value;
                                const max = maxima.get(attr.header);
                                const width =
                                    parsed && max ? Math.max(2, (Math.abs(parsed.value) / max) * 100) : 0;

                                return (
                                    <div key={attr.header} className="px-3 py-2">
                                        <dt className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">
                                            {attr.header}
                                        </dt>
                                        <dd>
                                            <div className="flex items-baseline gap-1.5">
                                                <span
                                                    className={`text-[13px] break-words ${
                                                        isBest ? 'font-semibold text-nesr-green' : 'text-slate-700'
                                                    }`}
                                                >
                                                    {parsed
                                                        ? formatExactNumber(parsed.value, parsed.unit)
                                                        : raw || '—'}
                                                </span>
                                                {isBest && <Extreme header={attr.header} />}
                                            </div>
                                            {parsed && max ? (
                                                <div className="mt-1 h-1 rounded-full bg-slate-100 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full"
                                                        style={{
                                                            width: `${width}%`,
                                                            backgroundColor: isBest ? seriesColor(0) : '#C5E0D2',
                                                        }}
                                                    />
                                                </div>
                                            ) : null}
                                        </dd>
                                    </div>
                                );
                            })}
                        </dl>
                    </div>
                ))}
            </div>

            <p className="text-[10.5px] text-slate-400 px-3 pt-2">
                Bars are scaled against the largest value in each row. Marks show which card holds the
                highest value, or the lowest on a price, cost, lead time or age. That is a fact about
                these rows, not a recommendation.
            </p>
        </div>
    );
}
