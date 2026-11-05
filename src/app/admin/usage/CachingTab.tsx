'use client';

import { useMemo, useState } from 'react';
import {
    Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Upload, AlertTriangle, Info } from 'lucide-react';
import {
    bucketByHour, bucketByKey, parseUsage, totals, type HourBucket, type Row,
} from './cache-math';

/* Categorical slots 1-3 of the validated theme, assigned in fixed order and
   never cycled. Aqua sits below 3:1 against a white surface, so the legend and
   the table underneath carry the identity rather than colour alone. */
const C_READ = '#2a78d6';     // blue   - served from cache
const C_WRITE = '#eb6834';    // orange - written to cache
const C_NOCACHE = '#1baf7a';  // aqua   - never cached
const C_FLAG = '#d03b3b';     // status: critical, reserved, used with a label
const INK = '#52514e';
const MUTED = '#898781';
const GRID = '#e1e0d9';
const SURFACE = '#ffffff';

const fmtTok = (n: number) =>
    n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : `${n}`;
const fmtUsd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortHour = (h: string) => {
    const d = new Date(h);
    return Number.isNaN(d.getTime()) ? h : `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${String(d.getUTCHours()).padStart(2, '0')}:00`;
};

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
            <div
                className={`mt-1 text-2xl font-semibold tabular-nums ${
                    tone === 'good' ? 'text-[#006300]' : tone === 'warn' ? 'text-[#d03b3b]' : 'text-slate-800'
                }`}
            >
                {value}
            </div>
            {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
        </div>
    );
}

export default function CachingTab() {
    const [raw, setRaw] = useState('');
    const [err, setErr] = useState<string | null>(null);
    const [rows, setRows] = useState<Row[] | null>(null);

    const load = (text: string) => {
        const res = parseUsage(text);
        if (!res.ok) { setErr(res.error); setRows(null); return; }
        setErr(null);
        setRows(res.rows);
    };

    const t = useMemo(() => (rows ? totals(rows) : null), [rows]);
    const hours = useMemo(() => (rows ? bucketByHour(rows) : []), [rows]);
    const keys = useMemo(() => (rows ? bucketByKey(rows) : []), [rows]);
    const flagged = hours.filter((h) => h.flagged);

    if (!rows || !t) {
        return (
            <div className="flex flex-col gap-4">
                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-800">Load a usage export</h3>
                    <p className="mt-1 text-sm text-slate-500">
                        Claude Console → Usage → export, with the per-model token columns. Paste it or pick the
                        file. It is read in your browser and never uploaded or stored.
                    </p>

                    <label
                        className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-200
                                   bg-white px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-50"
                    >
                        <Upload className="h-3.5 w-3.5" />
                        Choose CSV or TSV
                        <input
                            type="file"
                            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                            className="hidden"
                            onChange={async (e) => {
                                const f = e.target.files?.[0];
                                if (f) { const text = await f.text(); setRaw(text); load(text); }
                            }}
                        />
                    </label>

                    <textarea
                        value={raw}
                        onChange={(e) => setRaw(e.target.value)}
                        onBlur={() => raw.trim() && load(raw)}
                        placeholder="…or paste the rows here, including the header line."
                        className="mt-3 h-32 w-full rounded-md border border-slate-200 p-2 font-mono text-xs
                                   text-slate-700 focus:border-slate-300 focus:outline-none"
                    />
                    {raw.trim() && (
                        <button
                            onClick={() => load(raw)}
                            className="mt-2 rounded-md bg-[#307c4c] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2a6b42]"
                        >
                            Analyse
                        </button>
                    )}
                    {err && (
                        <p className="mt-3 flex items-start gap-1.5 text-sm text-[#d03b3b]">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {err}
                        </p>
                    )}
                </div>
            </div>
        );
    }

    const chartData = hours.map((h) => ({ ...h, label: shortHour(h.hour) }));
    const maxKeyInput = Math.max(...keys.map((k) => k.totalInput), 1);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-500">
                    {rows.length.toLocaleString()} rows · {hours.length} hourly buckets
                </p>
                <button
                    onClick={() => { setRows(null); setRaw(''); }}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                >
                    Load another
                </button>
            </div>

            {t.unpricedModels.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-[#fab219]/40 bg-[#fab219]/10 p-3 text-sm text-slate-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#b07d00]" />
                    <span>
                        No price on file for <strong>{t.unpricedModels.join(', ')}</strong>. Their tokens are counted
                        but every money figure below excludes them, so the real spend is higher than shown
                        ({(t.pricedShare * 100).toFixed(0)}% of input tokens priced). Add the rate in{' '}
                        <code className="rounded bg-white/60 px-1">cache-math.ts</code>.
                    </span>
                </div>
            )}

            {/* ── What caching is saving ─────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat
                    label="Cache hit rate"
                    value={`${(t.hitRate * 100).toFixed(1)}%`}
                    sub={`${fmtTok(t.read)} of ${fmtTok(t.totalInput)} input tokens`}
                    tone={t.hitRate > 0.5 ? 'good' : undefined}
                />
                <Stat label="Billed" value={fmtUsd(t.actual)} sub="as charged, with caching" />
                <Stat label="Without caching" value={fmtUsd(t.uncached)} sub="same prefixes at full input rate" />
                <Stat
                    label="Saved"
                    value={fmtUsd(t.saved)}
                    sub={t.uncached ? `${((t.saved / t.uncached) * 100).toFixed(0)}% off the uncached bill` : undefined}
                    tone="good"
                />
            </div>

            {/* ── Hourly split, with flagging ────────────────────────── */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-1 flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-800">Input tokens per hour</h3>
                    {flagged.length > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#d03b3b]">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {flagged.length} hours look automated
                        </span>
                    )}
                </div>
                <p className="mb-3 text-xs text-slate-500">
                    Split by how each token was billed. Hours outlined in red held a near-constant rate for five
                    hours or more at over twice the median — flat-and-sustained is the signature of something on a
                    timer rather than people asking questions.
                </p>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
                        <YAxis tickFormatter={fmtTok} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} width={48} />
                        <Tooltip
                            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                            formatter={(v, n) => [fmtTok(Number(v ?? 0)), String(n ?? '')]}
                            contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${GRID}`, color: INK }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12, color: INK }} />
                        <Bar dataKey="read" name="Served from cache" stackId="a" fill={C_READ} stroke={SURFACE} strokeWidth={2} />
                        <Bar dataKey="write" name="Written to cache" stackId="a" fill={C_WRITE} stroke={SURFACE} strokeWidth={2} />
                        <Bar dataKey="noCache" name="Never cached" stackId="a" fill={C_NOCACHE} stroke={SURFACE} strokeWidth={2} radius={[4, 4, 0, 0]}>
                            {chartData.map((h, i) => (
                                <Cell key={i} stroke={h.flagged ? C_FLAG : SURFACE} strokeWidth={h.flagged ? 2 : 2} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* ── Per-key attribution ────────────────────────────────── */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800">Where the tokens went</h3>
                <p className="mb-3 flex items-start gap-1.5 text-xs text-slate-500">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    By API key and model — the finest split the export carries. It has no column for which bot or
                    workflow made the call, so keys shared by several agents cannot be separated here.
                </p>
                <div className="flex flex-col gap-2">
                    {keys.map((k) => (
                        <div key={`${k.label}::${k.model}`} className="flex items-center gap-3">
                            <div className="w-56 shrink-0 truncate text-xs text-slate-600" title={`${k.label} · ${k.model}`}>
                                <span className="font-medium text-slate-700">{k.label}</span>
                                <span className="text-slate-400"> · {k.model.replace(/^claude-/, '')}</span>
                            </div>
                            <div className="h-5 flex-1 rounded bg-slate-100">
                                <div
                                    className="h-5 rounded"
                                    style={{ width: `${Math.max((k.totalInput / maxKeyInput) * 100, 1)}%`, background: C_READ }}
                                />
                            </div>
                            <div className="w-36 shrink-0 text-right text-xs tabular-nums text-slate-600">
                                {fmtTok(k.totalInput)}
                                <span className="text-slate-400"> · {k.cost === null ? 'unpriced' : fmtUsd(k.cost)}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── The table the contrast WARN obliges, and the honest fallback ── */}
            <details className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">
                    Hourly figures
                </summary>
                <div className="max-h-80 overflow-auto border-t border-slate-100">
                    <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-50 text-slate-500">
                            <tr>
                                <th className="px-3 py-2 text-left font-medium">Hour (UTC)</th>
                                <th className="px-3 py-2 text-right font-medium">From cache</th>
                                <th className="px-3 py-2 text-right font-medium">Written</th>
                                <th className="px-3 py-2 text-right font-medium">Never cached</th>
                                <th className="px-3 py-2 text-right font-medium">Output</th>
                                <th className="px-3 py-2 text-left font-medium">Flag</th>
                            </tr>
                        </thead>
                        <tbody className="tabular-nums text-slate-700">
                            {hours.map((h: HourBucket) => (
                                <tr key={h.hour} className="border-t border-slate-100">
                                    <td className="px-3 py-1.5">{shortHour(h.hour)}</td>
                                    <td className="px-3 py-1.5 text-right">{h.read.toLocaleString()}</td>
                                    <td className="px-3 py-1.5 text-right">{h.write.toLocaleString()}</td>
                                    <td className="px-3 py-1.5 text-right">{h.noCache.toLocaleString()}</td>
                                    <td className="px-3 py-1.5 text-right">{h.output.toLocaleString()}</td>
                                    <td className="px-3 py-1.5 text-[#d03b3b]">{h.flagged ? 'automated?' : ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </details>
        </div>
    );
}
