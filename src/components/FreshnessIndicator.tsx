'use client';

import { useEffect, useState } from 'react';
import { Database, AlertTriangle, ChevronDown } from 'lucide-react';
import type { FreshnessReport, FreshnessSource } from '@/app/api/freshness/route';
import { tableDisplayName } from '@/config/dataNames';

/**
 * When the data behind an answer was last loaded.
 *
 * This exists because of a specific way an agent can be wrong without looking
 * wrong. Asked what is outstanding against a table that has not loaded, it
 * answers "there are none" - and a clean bill of health is the one answer
 * nobody goes back and checks. A load time on screen is the cheapest way to
 * make that visible.
 *
 * Quiet when everything is current, and only raises its voice when a source
 * has gone stale or has never loaded at all. A warning that shows on every
 * answer is a warning nobody reads.
 */

/** Tables that are loaded once and do not age - plant lists, account mappings. */
const isStatic = (s: FreshnessSource) => s.mode === 'static';

function formatWhen(iso: string | null): string {
    if (!iso) return 'never';
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) return 'unknown';

    const time = then.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const today = new Date();
    const sameDay = then.toDateString() === today.toDateString();
    if (sameDay) return `today ${time}`;

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (then.toDateString() === yesterday.toDateString()) return `yesterday ${time}`;

    return `${then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${time}`;
}

export default function FreshnessIndicator() {
    const [report, setReport] = useState<FreshnessReport | null>(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                const res = await fetch('/api/freshness');
                if (!res.ok) return;
                const data = (await res.json()) as FreshnessReport;
                if (!cancelled && Array.isArray(data?.sources)) setReport(data);
            } catch {
                // Not knowing the load time is not worth telling anyone about.
            }
        };

        void load();
        // Loads land a handful of times a day; this just stops a tab left open
        // all afternoon from showing this morning's time.
        const timer = setInterval(() => void load(), 5 * 60 * 1000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, []);

    if (!report || !report.sources.length) return null;

    const { status, newest, stalest, neverLoaded } = report;

    const label =
        status === 'missing'
            ? `${neverLoaded.length} source${neverLoaded.length > 1 ? 's have' : ' has'} never loaded`
            : status === 'stale' && stalest
              ? `${tableDisplayName(stalest.table)} last loaded ${stalest.daysSince} days ago`
              : `Data as of ${formatWhen(newest?.loadedAt ?? null)}`;

    const tone =
        status === 'missing'
            ? 'text-red-600 hover:text-red-700'
            : status === 'stale'
              ? 'text-amber-700 hover:text-amber-800'
              : 'text-gray-400 hover:text-gray-600';

    const Icon = status === 'ok' ? Database : AlertTriangle;

    // Oldest first: the thing most likely to be wrong is the thing to read first.
    const ordered = [...report.sources].sort((a, b) => {
        if (a.neverLoaded !== b.neverLoaded) return a.neverLoaded ? -1 : 1;
        if (isStatic(a) !== isStatic(b)) return isStatic(a) ? 1 : -1;
        return Date.parse(a.loadedAt ?? '') - Date.parse(b.loadedAt ?? '');
    });

    return (
        <div className="relative inline-block">
            <button
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                className={`inline-flex items-center gap-1 text-[10px] font-medium tracking-wide transition-colors ${tone}`}
            >
                <Icon size={10} />
                {label}
                <ChevronDown size={9} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <>
                    {/* Click anywhere else to dismiss. */}
                    <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
                    {/* On a phone this spans the screen, because the button sits
                        at the end of a line of small print and anything anchored
                        to it runs off one side or the other. From sm up it
                        becomes an ordinary popover above the button. */}
                    <div className="fixed inset-x-4 bottom-20 z-40
                                    sm:absolute sm:inset-x-auto sm:right-0 sm:bottom-full sm:mb-2 sm:w-[330px]
                                    max-h-[55vh] overflow-y-auto
                                    rounded-xl border border-slate-200 bg-white shadow-xl text-left">
                        <div className="px-3 py-2 border-b border-slate-100">
                            <p className="text-[11px] font-semibold text-slate-700">When each source last loaded</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                                The supply chain extract behind Materials AI and Track My Request. Policy
                                documents and the vendor catalogue load separately and are not listed here.
                            </p>
                        </div>

                        <ul className="divide-y divide-slate-50">
                            {ordered.map(s => (
                                <li key={s.table} className="px-3 py-1.5 flex items-baseline justify-between gap-3">
                                    {/* The readable name, with the real table on hover for
                                        anyone who has to go and look at it. */}
                                    <span className="text-[11px] text-slate-600 truncate" title={s.table}>
                                        {tableDisplayName(s.table)}
                                    </span>
                                    <span
                                        className={`text-[10.5px] shrink-0 ${
                                            s.neverLoaded
                                                ? 'text-red-600 font-semibold'
                                                : isStatic(s)
                                                  ? 'text-slate-400'
                                                  : (s.daysSince ?? 0) >= 2
                                                    ? 'text-amber-700'
                                                    : 'text-slate-500'
                                        }`}
                                    >
                                        {s.neverLoaded ? 'never loaded' : formatWhen(s.loadedAt)}
                                        {isStatic(s) && !s.neverLoaded && (
                                            <span className="text-slate-300"> · reference</span>
                                        )}
                                    </span>
                                </li>
                            ))}
                        </ul>

                        <p className="px-3 py-2 text-[10px] text-slate-400 border-t border-slate-100">
                            Reference tables are loaded once and do not go stale. Read {formatWhen(report.checkedAt)}.
                        </p>
                    </div>
                </>
            )}
        </div>
    );
}
