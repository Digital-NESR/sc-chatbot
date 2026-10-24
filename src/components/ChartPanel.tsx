'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { X, BarChart3, BarChart2, LineChart as LineIcon, PieChart as PieIcon, Loader2 } from 'lucide-react';
import type { MarkdownTable } from '@/lib/markdownTable';
import { analyzeTable, type ChartableTable, type ChartKind } from '@/lib/chartData';
import { MAX_SERIES, seriesColor } from '@/lib/chartTheme';

/**
 * Charts the tables in one assistant answer.
 *
 * A panel rather than something drawn under the table itself. Inline would
 * mean the Markdown renderer had to know which parsed table it was looking at,
 * and it also assumes everyone wants the chart; most of the time the table is
 * the answer. A panel is also somewhere for the controls to live, and for the
 * caption that says which column was read as the label - a wrong guess is then
 * visible instead of silent.
 */

const ChartCanvas = dynamic(() => import('./ChartCanvas'), {
    ssr: false,
    loading: () => (
        <div className="h-[320px] flex items-center justify-center text-slate-300">
            <Loader2 size={20} className="animate-spin" />
        </div>
    ),
});

const KINDS: { id: ChartKind; label: string; icon: typeof BarChart3 }[] = [
    { id: 'bar', label: 'Columns', icon: BarChart3 },
    { id: 'horizontalBar', label: 'Bars', icon: BarChart2 },
    { id: 'line', label: 'Line', icon: LineIcon },
    { id: 'pie', label: 'Share', icon: PieIcon },
];

export default function ChartPanel({
    tables,
    title,
    onClose,
}: {
    tables: MarkdownTable[];
    title: string;
    onClose: () => void;
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [onClose]);

    // Only the tables worth charting are offered, so the picker never leads to
    // an empty panel.
    const charts = useMemo(
        () =>
            tables
                .map((t, i) => ({ index: i, analysis: analyzeTable(t) }))
                .filter((c): c is { index: number; analysis: ChartableTable } => c.analysis.chartable),
        [tables],
    );

    const [which, setWhich] = useState(0);
    const current = charts[Math.min(which, charts.length - 1)];

    const [kind, setKind] = useState<ChartKind | null>(null);
    const [active, setActive] = useState<string[] | null>(null);

    // Reset the controls alongside the switch rather than in an effect
    // afterwards: a measure name carried over from the previous table would
    // select nothing here.
    const pickTable = (i: number) => { setWhich(i); setKind(null); setActive(null); };

    if (!current) return null;
    const a = current.analysis;

    const effectiveKind = kind ?? a.suggested;
    // Opens on the measures that can share an axis honestly, capped at the
    // point where the series colours stop being safely distinguishable. The
    // rest are one click away in the picker.
    const effectiveActive = active ?? a.coplot.slice(0, MAX_SERIES);

    const toggleMeasure = (header: string) => {
        const next = effectiveActive.includes(header)
            ? effectiveActive.filter(h => h !== header)
            : [...effectiveActive, header];
        // Never leave the chart with nothing to draw.
        if (next.length === 0 || next.length > MAX_SERIES) return;
        setActive(a.measures.filter(m => next.includes(m.header)).map(m => m.header));
    };

    // A share chart divides one total between a few named parts. More than a
    // handful of slices and it stops being readable, so it is only offered
    // when the data is actually that shape.
    const kindAvailable = (k: ChartKind) =>
        k !== 'pie' || (effectiveActive.length === 1 && a.data.length <= 8);
    const drawKind = kindAvailable(effectiveKind) ? effectiveKind : 'bar';

    const notes = [
        `Grouped by ${a.labelHeader}`,
        a.truncatedFrom
            // A time series keeps its most recent rows, a ranking its biggest.
            ? `${a.suggested === 'line' ? 'latest' : 'top'} ${a.data.length} of ${a.truncatedFrom}`
            : `${a.data.length} rows`,
        a.droppedTotals > 0 ? 'totals row left out' : null,
    ].filter(Boolean) as string[];

    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-label="Chart"
        >
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />

            <div className="relative w-full sm:max-w-4xl max-h-[90vh] sm:max-h-[88vh] bg-white
                            rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col
                            animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">

                <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
                    <div className="min-w-0">
                        <h2 className="font-semibold text-gray-900 truncate">{title}</h2>
                        <p className="text-sm text-gray-500 mt-0.5">{notes.join(' · ')}</p>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="p-1.5 -mr-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 shrink-0"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Controls in one row above the chart */}
                <div className="px-5 sm:px-6 py-3 border-b border-gray-100 shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2">
                    {charts.length > 1 && (
                        <select
                            value={which}
                            onChange={e => pickTable(Number(e.target.value))}
                            aria-label="Which table"
                            className="text-xs rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-700"
                        >
                            {charts.map((c, i) => (
                                <option key={c.index} value={i}>
                                    Table {c.index + 1}: {c.analysis.labelHeader}
                                </option>
                            ))}
                        </select>
                    )}

                    <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
                        {KINDS.filter(k => kindAvailable(k.id)).map(k => {
                            const Icon = k.icon;
                            const on = drawKind === k.id;
                            return (
                                <button
                                    key={k.id}
                                    onClick={() => setKind(k.id)}
                                    title={k.label}
                                    aria-pressed={on}
                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                                        on ? 'bg-white shadow-sm text-nesr-green' : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    <Icon size={13} />
                                    <span className="hidden sm:inline">{k.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    {a.measures.length > 1 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                            {a.measures.map((m, i) => {
                                const on = effectiveActive.includes(m.header);
                                return (
                                    <button
                                        key={m.header}
                                        onClick={() => toggleMeasure(m.header)}
                                        aria-pressed={on}
                                        className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs transition-colors ${
                                            on
                                                ? 'border-slate-300 bg-white text-slate-700'
                                                : 'border-transparent bg-slate-100 text-slate-400 hover:text-slate-600'
                                        }`}
                                    >
                                        <span
                                            className="w-2 h-2 rounded-full shrink-0"
                                            style={{ backgroundColor: on ? seriesColor(i) : '#cbd5e1' }}
                                        />
                                        {m.header}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="overflow-y-auto px-2 sm:px-4 py-4">
                    <ChartCanvas analysis={a} kind={drawKind} active={effectiveActive} />
                    <p className="text-[11px] text-gray-400 px-3 pt-2">
                        Drawn from the table in the answer. Hover a {drawKind === 'line' ? 'point' : 'mark'} for the exact figure.
                        {a.coplot.length < a.measures.length && (
                            <> {a.measures.length - a.coplot.length} column
                                {a.measures.length - a.coplot.length > 1 ? 's are' : ' is'} on a very different
                                scale and left off by default; add {a.measures.length - a.coplot.length > 1 ? 'them' : 'it'} above
                                if you want {a.measures.length - a.coplot.length > 1 ? 'them' : 'it'} anyway.</>
                        )}
                    </p>
                </div>
            </div>
        </div>
    );
}
