'use client';

import { useEffect, useState } from 'react';
import { ThumbsDown, AlertTriangle } from 'lucide-react';
import RatingsTab from './RatingsTab';
import ErrorsTab from './ErrorsTab';

/**
 * Where answers are judged.
 *
 * Two halves of the same question - was the answer good, and did an answer
 * arrive at all - so they live behind one nav item rather than two. A thumbs
 * down and a dead webhook are both "the product did not work", and the second
 * one used to leave no trace at all.
 */
export default function FeedbackPage() {
    const [tab, setTab] = useState<'ratings' | 'errors'>('ratings');
    const [openErrors, setOpenErrors] = useState<number | null>(null);

    // Just the badge, so a run of failures is visible without switching tabs.
    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch('/api/admin/errors');
                if (res.ok) setOpenErrors((await res.json()).open ?? 0);
            } catch (err) {
                console.error(err);
            }
        };
        load();
        const t = setInterval(load, 60_000);
        return () => clearInterval(t);
    }, []);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-0.5 rounded-xl bg-slate-200/70 p-1 w-fit">
                <button
                    onClick={() => setTab('ratings')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        tab === 'ratings' ? 'bg-white shadow-sm text-[#307c4c]' : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <ThumbsDown size={14} />
                    Ratings
                </button>
                <button
                    onClick={() => setTab('errors')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        tab === 'errors' ? 'bg-white shadow-sm text-[#307c4c]' : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <AlertTriangle size={14} />
                    Failures
                    {!!openErrors && (
                        <span className="px-1.5 rounded-full bg-red-500 text-white text-[10px] font-semibold tabular-nums">
                            {openErrors}
                        </span>
                    )}
                </button>
            </div>

            {tab === 'ratings' ? <RatingsTab /> : <ErrorsTab />}
        </div>
    );
}
