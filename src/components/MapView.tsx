'use client';

import { useMemo, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
import type { Topology } from 'topojson-specification';
import worldAtlas from 'world-atlas/countries-110m.json';
import type { ChartableTable } from '@/lib/chartData';
import { SMALL_STATES, toAtlasName } from '@/lib/geoCountries';
import { formatExactNumber } from '@/lib/chartTheme';

/**
 * A choropleth of whichever countries the answer mentions.
 *
 * Loaded on demand with the rest of the chart code, because the atlas is
 * ~108 KB on its own and most answers have no country in them.
 *
 * The map is cropped to the countries that have data plus a margin, rather
 * than being a world map with fourteen countries coloured in and the Pacific
 * taking up a third of the frame.
 */

/**
 * Five steps of one hue, light to dark, per the NESR manual's rule for
 * infographics. A single-hue ramp encodes magnitude by lightness, which is
 * also the one signal that survives every form of colour blindness.
 */
const RAMP = ['#E8F2EC', '#C5E0D2', '#8FC4A9', '#4E9C71', '#307c4c', '#1B4D31'];

/** Countries with no value at all. Grey, not the palest green. */
const NO_DATA = '#F1F2F3';
const BORDER = '#FFFFFF';

type CountryFeature = { id?: string | number; properties: { name: string } } & { type: string; geometry: Geometry };

export default function MapView({
    analysis,
    measure,
}: {
    analysis: ChartableTable;
    /** Which measure to shade by. */
    measure: string;
}) {
    const [hover, setHover] = useState<{ name: string; value: number; x: number; y: number } | null>(null);

    const { countries, atlasNames } = useMemo(() => {
        const fc = feature(
            worldAtlas as unknown as Topology,
            (worldAtlas as unknown as Topology).objects.countries,
        ) as unknown as FeatureCollection<Geometry, { name: string }>;
        return {
            countries: fc.features as unknown as CountryFeature[],
            atlasNames: new Set(fc.features.map(f => f.properties.name)),
        };
    }, []);

    /** atlas name -> value, plus whatever we could not place. */
    const { values, unplaced, markers } = useMemo(() => {
        const values = new Map<string, number>();
        const markers: { name: string; value: number; coords: [number, number] }[] = [];
        const unplaced: { name: string; value: number }[] = [];

        for (const row of analysis.data) {
            const value = Number(row[measure]);
            if (!Number.isFinite(value)) continue;
            const atlas = toAtlasName(row.label, atlasNames);
            if (atlas) {
                values.set(atlas, (values.get(atlas) ?? 0) + value);
                continue;
            }
            // Too small to have a polygon at this resolution - Bahrain and
            // friends. A dot is better than leaving an operating country off.
            const small = SMALL_STATES[row.label.trim()] ?? SMALL_STATES[toAtlasName(row.label, new Set(Object.keys(SMALL_STATES))) ?? ''];
            if (small) markers.push({ name: row.label, value, coords: small });
            else unplaced.push({ name: row.label, value });
        }
        return { values, unplaced, markers };
    }, [analysis.data, measure, atlasNames]);

    /**
     * Quantile buckets, not a linear scale.
     *
     * Saudi Arabia is 73% of open PO value on its own. Scaled linearly every
     * other country lands in the palest step and the map says "Saudi Arabia,
     * and nowhere else", which is not what the numbers say.
     */
    const colourFor = useMemo(() => {
        const sorted = [...values.values()].filter(v => v > 0).sort((a, b) => a - b);
        if (!sorted.length) return () => NO_DATA;
        const cut = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
        const breaks = [cut(0.2), cut(0.4), cut(0.6), cut(0.8), cut(0.95)];
        return (v: number | undefined) => {
            if (v === undefined) return NO_DATA;
            let i = 0;
            while (i < breaks.length && v > breaks[i]) i++;
            return RAMP[i + 1] ?? RAMP[RAMP.length - 1];
        };
    }, [values]);

    const width = 760;
    const height = 380;

    /** Fit the frame to what has data, with a margin so nothing touches the edge. */
    const path = useMemo(() => {
        const shown = countries.filter(c => values.has(c.properties.name));
        const projection = geoMercator();

        if (shown.length || markers.length) {
            const collection: FeatureCollection<Geometry, { name: string }> = {
                type: 'FeatureCollection',
                features: [
                    ...(shown as unknown as FeatureCollection<Geometry, { name: string }>['features']),
                    ...markers.map(m => ({
                        type: 'Feature' as const,
                        properties: { name: m.name },
                        geometry: { type: 'Point' as const, coordinates: m.coords },
                    })),
                ],
            };
            projection.fitExtent([[24, 24], [width - 24, height - 24]], collection);
        } else {
            projection.fitExtent([[24, 24], [width - 24, height - 24]], { type: 'Sphere' });
        }
        return geoPath(projection);
    }, [countries, values, markers]);

    const unit = analysis.measures.find(m => m.header === measure)?.unit ?? null;

    return (
        <div className="relative">
            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full h-auto"
                role="img"
                aria-label={`${measure} by country`}
            >
                <g>
                    {countries.map((c, i) => {
                        const value = values.get(c.properties.name);
                        const d = path(c as never);
                        if (!d) return null;
                        return (
                            <path
                                key={c.id ?? i}
                                d={d}
                                fill={colourFor(value)}
                                stroke={BORDER}
                                strokeWidth={0.5}
                                onMouseEnter={e =>
                                    value !== undefined &&
                                    setHover({
                                        name: c.properties.name,
                                        value,
                                        x: e.nativeEvent.offsetX,
                                        y: e.nativeEvent.offsetY,
                                    })
                                }
                                onMouseLeave={() => setHover(null)}
                                style={{ cursor: value === undefined ? 'default' : 'pointer' }}
                            />
                        );
                    })}
                </g>

                {/* The ones too small to draw as a shape */}
                {markers.map(m => {
                    const p = path.centroid({
                        type: 'Feature',
                        properties: {},
                        geometry: { type: 'Point', coordinates: m.coords },
                    } as never);
                    if (!Number.isFinite(p[0])) return null;
                    return (
                        <g key={m.name}>
                            <circle
                                cx={p[0]}
                                cy={p[1]}
                                r={5}
                                fill={colourFor(m.value)}
                                stroke="#307c4c"
                                strokeWidth={1.25}
                                onMouseEnter={() => setHover({ name: m.name, value: m.value, x: p[0], y: p[1] })}
                                onMouseLeave={() => setHover(null)}
                                style={{ cursor: 'pointer' }}
                            />
                        </g>
                    );
                })}
            </svg>

            {hover && (
                <div
                    className="pointer-events-none absolute z-10 rounded-lg bg-white border border-slate-200 shadow-lg px-2.5 py-1.5 text-xs"
                    style={{
                        left: `${(hover.x / width) * 100}%`,
                        top: `${(hover.y / height) * 100}%`,
                        transform: 'translate(-50%, -130%)',
                    }}
                >
                    <div className="font-semibold text-slate-800">{hover.name}</div>
                    <div className="text-slate-500">{formatExactNumber(hover.value, unit)}</div>
                </div>
            )}

            {/* Legend: light to dark is low to high, which the ramp has to say out loud */}
            <div className="flex items-center gap-2 px-3 pt-1">
                <span className="text-[10px] text-slate-400">Lower</span>
                <div className="flex rounded overflow-hidden">
                    {RAMP.slice(1).map(c => (
                        <span key={c} className="w-7 h-2.5" style={{ backgroundColor: c }} />
                    ))}
                </div>
                <span className="text-[10px] text-slate-400">Higher</span>
                <span className="text-[10px] text-slate-400 ml-2">{measure}</span>
            </div>

            {unplaced.length > 0 && (
                // Never silently drop a row. A map that omits a country reads
                // as "nothing there", which is the one thing it must not say.
                <p className="text-[10.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-2 mx-3">
                    Not shown on the map:{' '}
                    {unplaced.map(u => `${u.name} (${formatExactNumber(u.value, unit)})`).join(', ')}
                </p>
            )}
        </div>
    );
}
