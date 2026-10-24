'use client';

/**
 * The recharts half of the chart feature, kept in its own file so it can be
 * loaded on demand.
 *
 * recharts is well over 100 KB and until now only shipped on /admin. Importing
 * it here and pulling this component in with `next/dynamic` keeps it out of the
 * chat bundle for the majority of sessions that never open a chart, the same
 * way exportTables.ts keeps write-excel-file out of it.
 */

import {
    Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
    Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { ChartableTable, ChartKind } from '@/lib/chartData';
import {
    axisProps, barGap, barRadius, formatAxisNumber, formatExactNumber,
    gridProps, legendProps, lineProps, seriesColor, tooltipProps, truncateLabel,
} from '@/lib/chartTheme';

const MARGIN = { top: 8, right: 16, bottom: 4, left: 4 };

export default function ChartCanvas({
    analysis,
    kind,
    active,
}: {
    analysis: ChartableTable;
    kind: ChartKind;
    /** Measure headers to draw, in the order they appeared in the table. */
    active: string[];
}) {
    const { data, measures } = analysis;
    const unitOf = (header: string) => measures.find(m => m.header === header)?.unit ?? null;

    // Index into the full measure list, not the filtered one, so unchecking a
    // series leaves the others on the colours they already had.
    const colorOf = (header: string) => seriesColor(measures.findIndex(m => m.header === header));

    const tooltipFormatter = (value: unknown, name: unknown): [string, string] => {
        const header = String(name ?? '');
        return [formatExactNumber(Number(value), unitOf(header)), header];
    };

    // A single series is named by the panel heading, so a legend box would
    // just repeat it.
    const showLegend = active.length > 1;

    if (kind === 'pie') {
        const header = active[0] ?? measures[0].header;
        const total = data.reduce((sum, d) => sum + Number(d[header] ?? 0), 0);
        return (
            <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                    <Pie
                        data={data}
                        dataKey={header}
                        nameKey="label"
                        innerRadius={55}
                        outerRadius={105}
                        paddingAngle={2}
                        // A 2px ring in the surface colour so neighbouring
                        // wedges stay separate rather than bleeding together.
                        stroke="#ffffff"
                        strokeWidth={2}
                        label={({ name, value }: { name?: string; value?: number }) =>
                            total > 0
                                ? `${truncateLabel(String(name ?? ''), 16)} ${Math.round((Number(value) / total) * 100)}%`
                                : truncateLabel(String(name ?? ''), 16)
                        }
                        labelLine={{ stroke: '#d4d4d4' }}
                        isAnimationActive={false}
                    >
                        {data.map((d, i) => (
                            <Cell key={d.label} fill={seriesColor(i)} />
                        ))}
                    </Pie>
                    <Tooltip {...tooltipProps} formatter={tooltipFormatter} />
                </PieChart>
            </ResponsiveContainer>
        );
    }

    if (kind === 'line') {
        return (
            <ResponsiveContainer width="100%" height={320}>
                <LineChart data={data} margin={MARGIN}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="label" {...axisProps} />
                    <YAxis {...axisProps} tickFormatter={formatAxisNumber} width={68} />
                    <Tooltip {...tooltipProps} formatter={tooltipFormatter} />
                    {showLegend && <Legend {...legendProps} />}
                    {active.map(header => (
                        <Line
                            key={header}
                            dataKey={header}
                            name={header}
                            stroke={colorOf(header)}
                            {...lineProps}
                            isAnimationActive={false}
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        );
    }

    if (kind === 'horizontalBar') {
        // Grows with the data instead of squeezing 25 categories into a fixed
        // box, which is the whole reason to turn the bars sideways.
        const height = Math.max(240, data.length * (active.length > 1 ? 26 : 22) + 60);
        return (
            <ResponsiveContainer width="100%" height={height}>
                <BarChart data={data} layout="vertical" margin={MARGIN} {...barGap}>
                    <CartesianGrid {...gridProps} vertical horizontal={false} />
                    <XAxis type="number" {...axisProps} tickFormatter={formatAxisNumber} />
                    <YAxis
                        type="category"
                        dataKey="label"
                        {...axisProps}
                        width={150}
                        // The label is already truncated, so give the tick
                        // more room than it needs: left to match the axis
                        // width, recharts wraps a two-word name onto a second
                        // line and the rows stop lining up with their bars.
                        tick={{ ...axisProps.tick, width: 400 }}
                        tickFormatter={(v: string) => truncateLabel(v, 16)}
                    />
                    <Tooltip {...tooltipProps} formatter={tooltipFormatter} />
                    {showLegend && <Legend {...legendProps} />}
                    {active.map(header => (
                        <Bar
                            key={header}
                            dataKey={header}
                            name={header}
                            fill={colorOf(header)}
                            radius={barRadius.horizontal}
                            isAnimationActive={false}
                        />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        );
    }

    return (
        <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data} margin={MARGIN} {...barGap}>
                <CartesianGrid {...gridProps} />
                <XAxis
                    dataKey="label"
                    {...axisProps}
                    tickFormatter={(v: string) => truncateLabel(v, 14)}
                    interval={0}
                />
                <YAxis {...axisProps} tickFormatter={formatAxisNumber} width={68} />
                <Tooltip {...tooltipProps} formatter={tooltipFormatter} />
                {showLegend && <Legend {...legendProps} />}
                {active.map(header => (
                    <Bar
                        key={header}
                        dataKey={header}
                        name={header}
                        fill={colorOf(header)}
                        radius={barRadius.vertical}
                        isAnimationActive={false}
                    />
                ))}
            </BarChart>
        </ResponsiveContainer>
    );
}
