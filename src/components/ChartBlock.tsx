'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Table2, BarChart3, BarChart2, LineChart as LineIcon, PieChart as PieIcon, Map as MapIcon, Columns3, Loader2 } from 'lucide-react';
import type { MarkdownTable } from '@/lib/markdownTable';
import { analyzeTable, type ChartKind } from '@/lib/chartData';
import { MAX_SERIES, seriesColor } from '@/lib/chartTheme';

/**
 * One table in an answer, with the views it can be read as.
 *
 * The table stays the default; the chart is another way of looking at the same
 * rows, in the place the table was, rather than something that opens over the
 * conversation. Switching back is one click, which matters because the table
 * is the thing with the exact figures in it.
 *
 * When the data is not shaped for a chart there is no switcher at all, only
 * the table. That silence is deliberate: offering a chart that would mislead
 * is worse than not offering one.
 */

function spinner(h: number) {
    const Loading = () => (
        <div className="flex items-center justify-center text-slate-300" style={{ height: h }}>
            <Loader2 size={20} className="animate-spin" />
        </div>
    );
    Loading.displayName = 'ChartLoading';
    return Loading;
}

const ChartCanvas = dynamic(() => import('./ChartCanvas'), { ssr: false, loading: spinner(300) });

// Its own chunk, separate from recharts: the world atlas is ~108 KB and only
// answers that actually name countries ever need it.
const MapView = dynamic(() => import('./MapView'), { ssr: false, loading: spinner(340) });

// Plain React and CSS, but lazy anyway so it rides in the same split as the
// rest of the views rather than the chat bundle.
const CompareView = dynamic(() => import('./CompareView'), { ssr: false, loading: spinner(200) });

type View = 'table' | ChartKind;

const VIEWS: { id: View; label: string; icon: typeof Table2 }[] = [
    { id: 'table', label: 'Table', icon: Table2 },
    { id: 'compare', label: 'Compare', icon: Columns3 },
    { id: 'map', label: 'Map', icon: MapIcon },
    { id: 'bar', label: 'Columns', icon: BarChart3 },
    { id: 'horizontalBar', label: 'Bars', icon: BarChart2 },
    { id: 'line', label: 'Line', icon: LineIcon },
    { id: 'pie', label: 'Share', icon: PieIcon },
];

export default function ChartBlock({
    table,
    children,
}: {
    table: MarkdownTable;
    /** The table as the Markdown renderer draws it. */
    children: React.ReactNode;
}) {
    const analysis = useMemo(() => analyzeTable(table), [table]);
    const [view, setView] = useState<View>('table');
    const [active, setActive] = useState<string[] | null>(null);

    if (!analysis.chartable) return <>{children}</>;
    const a = analysis;

    // Opens on the measures that can share an axis honestly, capped at the
    // point where the series shades stop being separable. The rest are one
    // click away in the picker.
    const effectiveActive = active ?? a.coplot.slice(0, MAX_SERIES);

    const toggleMeasure = (header: string) => {
        // A map shades by one measure, so the pills behave like a radio group
        // there. Toggling a second one on would have looked like nothing
        // happened, because only the first was ever drawn.
        if (view === 'map') {
            setActive([header]);
            return;
        }
        const next = effectiveActive.includes(header)
            ? effectiveActive.filter(h => h !== header)
            : [...effectiveActive, header];
        // Never leave the chart with nothing to draw.
        if (next.length === 0 || next.length > MAX_SERIES) return;
        setActive(a.measures.filter(m => next.includes(m.header)).map(m => m.header));
    };

    // Each view is offered only when the data is the shape it needs. A share
    // chart divides one total between a few named parts; a map needs
    // countries; a comparison needs few enough rows to sit side by side.
    const available = (v: View) => {
        if (v === 'pie') return effectiveActive.length === 1 && a.data.length <= 8;
        if (v === 'map') return a.mappable;
        if (v === 'compare') return a.comparable;
        return true;
    };

    const drawKind: ChartKind = view === 'table' ? a.suggested : available(view) ? view : 'bar';

    const notes = [
        `Grouped by ${a.labelHeader}`,
        a.truncatedFrom
            // A time series keeps its most recent rows, a ranking its biggest.
            ? `${a.suggested === 'line' ? 'latest' : 'top'} ${a.data.length} of ${a.truncatedFrom}`
            : `${a.data.length} rows`,
        a.droppedTotals > 0 ? 'totals row left out' : null,
    ].filter(Boolean) as string[];

    const hidden = a.measures.length - a.coplot.length;

    return (
        <div className="my-4">
            {/* View switcher, sitting on the table it belongs to */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-2">
                <div className="flex items-center gap-0.5 rounded-lg bg-slate-200/60 p-0.5">
                    {VIEWS.filter(v => available(v.id)).map(v => {
                        const Icon = v.icon;
                        const on = view === v.id;
                        return (
                            <button
                                key={v.id}
                                onClick={() => setView(v.id)}
                                title={v.label}
                                aria-pressed={on}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                                    on ? 'bg-white shadow-sm text-nesr-green' : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <Icon size={12} />
                                <span className="hidden sm:inline">{v.label}</span>
                            </button>
                        );
                    })}
                </div>

                {view !== 'table' && view !== 'compare' && a.measures.length > 1 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                        {a.measures.map((m, i) => {
                            const on = effectiveActive.includes(m.header);
                            return (
                                <button
                                    key={m.header}
                                    onClick={() => toggleMeasure(m.header)}
                                    aria-pressed={on}
                                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] transition-colors ${
                                        on
                                            ? 'border-slate-300 bg-white text-slate-700'
                                            : 'border-transparent bg-slate-200/60 text-slate-400 hover:text-slate-600'
                                    }`}
                                >
                                    <span
                                        className="w-2 h-2 rounded-full shrink-0"
                                        style={{ backgroundColor: on ? seriesColor(i) : '#D1D3D4' }}
                                    />
                                    {m.header}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {view === 'table' ? (
                children
            ) : (
                <div className="rounded-xl border border-slate-200 bg-white px-1 sm:px-2 pt-3 pb-2">
                    {drawKind === 'map' ? (
                        // Deliberately the untruncated set: see mapData.
                        <MapView analysis={a} rows={a.mapData} measure={effectiveActive[0]} />
                    ) : drawKind === 'compare' ? (
                        <CompareView table={table} analysis={a} />
                    ) : (
                        <ChartCanvas analysis={a} kind={drawKind} active={effectiveActive} />
                    )}
                    <p className="text-[10.5px] text-slate-400 px-3 pt-1">
                        {notes.join(' · ')}.
                        {hidden > 0 && (
                            <> {hidden} column{hidden > 1 ? 's are' : ' is'} on a very different scale
                                and left off by default; add {hidden > 1 ? 'them' : 'it'} above if you
                                want {hidden > 1 ? 'them' : 'it'} anyway.</>
                        )}
                    </p>
                </div>
            )}
        </div>
    );
}
