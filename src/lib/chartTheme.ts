/**
 * Shared chart appearance, so the chat panel and /admin draw the same way.
 *
 * The hexes live in `siteConfig.colors` with the rest of the palette. This
 * module turns them into the props recharts wants, and holds the mark sizes
 * in one place rather than repeating magic numbers at every call site.
 */

import { siteConfig } from '@/config/site';

const { colors } = siteConfig;

export const SERIES = colors.chartSeries;

/** Series colour by position. Fixed order, so filtering never repaints. */
export function seriesColor(index: number): string {
    return SERIES[index % SERIES.length];
}

/** Beyond this the hues stop being safely distinguishable - see site.ts. */
export const MAX_SERIES = SERIES.length;

export const axisProps = {
    stroke: colors.chartAxis,
    tick: { fill: colors.chartLabel, fontSize: 11 },
    tickLine: false,
} as const;

export const gridProps = {
    stroke: colors.chartGrid,
    strokeDasharray: '3 3',
    // Only the cross-measure lines. Gridlines along the category axis divide
    // bars that are already separated by a gap.
    vertical: false,
} as const;

export const tooltipProps = {
    contentStyle: {
        borderRadius: 10,
        border: `1px solid ${colors.chartGrid}`,
        fontSize: 12,
        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    },
    labelStyle: { color: colors.chartLabel, fontWeight: 600, marginBottom: 2 },
    cursor: { fill: 'rgba(0,0,0,0.04)' },
} as const;

export const legendProps = {
    wrapperStyle: { fontSize: 12, color: colors.chartLabel, paddingTop: 8 },
    iconType: 'circle' as const,
    iconSize: 8,
};

/**
 * The number printed on each mark.
 *
 * On by default rather than on hover. Two of the four series are light enough
 * that their fill alone is weak against white, and a printed value means the
 * reader never has to rely on the colour or the axis to know what a bar says.
 */
export const dataLabelProps = {
    fill: colors.chartLabel,
    fontSize: 10,
    offset: 6,
} as const;

/** Thin marks: a 2px line and a dot big enough to hit with a mouse. */
export const lineProps = {
    strokeWidth: 2,
    dot: { r: 3 },
    activeDot: { r: 5 },
    type: 'monotone' as const,
};

/** Rounded at the data end only, so the bar stays anchored to its baseline. */
export const barRadius = {
    vertical: [4, 4, 0, 0] as [number, number, number, number],
    horizontal: [0, 4, 4, 0] as [number, number, number, number],
};

/** Keeps a 2px surface gap between adjacent bars at any category count. */
export const barGap = { barCategoryGap: '22%', barGap: 2 };

/**
 * Axis numbers, short enough not to collide.
 *
 * Abbreviates at thousands and above, because a supplier spend axis otherwise
 * reads 1,250,000,000 and eats a third of the chart. Tooltips show the exact
 * figure, so nothing is lost - only the axis is rounded.
 */
export function formatAxisNumber(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** Full precision for tooltips and labels, grouped the way the table showed it. */
export function formatExactNumber(value: number, unit?: string | null): string {
    if (!unit) return plain(value);
    if (unit === '%') return `${plain(value)}%`;

    /* A rate carries its unit on both sides of the number: '$/GAL' has to come
       out as '$0.53 / GAL', not '$/GAL 0.53'. Splitting on the slash puts the
       currency back in front where it belongs and leaves the denominator
       where a reader expects it. */
    const slash = unit.indexOf('/');
    if (slash !== -1) {
        const per = unit.slice(slash + 1);
        const of = unit.slice(0, slash);
        // Money is the common case for a rate, and a price reads wrong without
        // its minor units: 0.6 is a number, $0.60 is a price.
        const n = of ? money(value) : plain(value);
        return of ? `${join(of, n)} / ${per}` : `${n} / ${per}`;
    }

    return join(unit, plain(value));
}

/** A currency symbol sits against its number; a three-letter code takes a space. */
const SYMBOL = /^[$€£﷼]$/;
function join(unit: string, n: string): string {
    return SYMBOL.test(unit) ? `${unit}${n}` : `${unit} ${n}`;
}

function plain(value: number): string {
    return Number.isInteger(value)
        ? value.toLocaleString('en-US')
        : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function money(value: number): string {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Long supplier and material names need truncating before they overlap. */
export function truncateLabel(label: string, max = 28): string {
    return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}
