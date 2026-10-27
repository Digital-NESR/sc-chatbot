'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert, SlidersHorizontal } from 'lucide-react';
import EventsTab from './EventsTab';
import RulesTab from './RulesTab';

/**
 * Where the guardrails are watched and set.
 *
 * Two halves of one question - what fired, and what should fire - kept behind
 * one nav item because they are read together. Deciding whether a rule is
 * ready to enforce means looking at what it caught, and the page is laid out
 * so that is one click rather than two screens.
 */
export default function GuardrailsPage() {
    const [tab, setTab] = useState<'events' | 'rules'>('events');
    const [open, setOpen] = useState<number | null>(null);

    // Just the badge, so a run of matches is visible from the Rules tab.
    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch('/api/admin/guardrails');
                if (res.ok) setOpen((await res.json()).open ?? 0);
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
                    onClick={() => setTab('events')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        tab === 'events' ? 'bg-white shadow-sm text-[#307c4c]' : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <ShieldAlert size={14} />
                    What fired
                    {!!open && (
                        <span className="px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-semibold tabular-nums">
                            {open}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setTab('rules')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        tab === 'rules' ? 'bg-white shadow-sm text-[#307c4c]' : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <SlidersHorizontal size={14} />
                    Rules
                </button>
            </div>

            {tab === 'events' ? <EventsTab /> : <RulesTab />}
        </div>
    );
}
