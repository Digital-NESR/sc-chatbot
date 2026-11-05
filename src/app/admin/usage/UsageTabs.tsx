'use client';

import { useState } from 'react';
import { BarChart3, Database } from 'lucide-react';
import PowerBiTab from './PowerBiTab';
import CachingTab from './CachingTab';

/**
 * Two readings of the same bill.
 *
 * Power BI answers "what did we spend", for whoever owns the budget, and stays
 * the system of record - the custom Admin API dashboard was retired in its
 * favour on purpose. Caching answers "is the architecture working, and does
 * this hour look like people", which is an engineering question, needs no
 * licence, and would be an odd fit for a finance report.
 *
 * The caching side reads a Console export in the browser rather than calling
 * the Admin API, so it reintroduces no key: the one in the environment was left
 * behind by the old dashboard and no longer authenticates.
 */
export default function UsageTabs() {
    const [tab, setTab] = useState<'cost' | 'cache'>('cost');

    const btn = (id: 'cost' | 'cache', icon: React.ReactNode, label: string) => (
        <button
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === id ? 'bg-white text-[#307c4c] shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
        >
            {icon}
            {label}
        </button>
    );

    return (
        <div className="flex flex-col gap-4">
            <div className="flex w-fit items-center gap-0.5 rounded-xl bg-slate-200/70 p-1">
                {btn('cost', <BarChart3 size={14} />, 'Spend')}
                {btn('cache', <Database size={14} />, 'Caching')}
            </div>

            {tab === 'cost' ? <PowerBiTab /> : <CachingTab />}
        </div>
    );
}
