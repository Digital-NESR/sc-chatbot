'use client';

import { useEffect } from 'react';
import { X, Sparkles, ArrowRight, Ban } from 'lucide-react';
import { siteConfig } from '@/config/site';

/**
 * "What can I do?" panel.
 *
 * Content comes from siteConfig.capabilities, which is each agent's own answer
 * to that question, trimmed. Examples are clickable: a capability list that
 * only tells you what is possible leaves the user to compose a question, which
 * is the step they were stuck on. Clicking one sends it.
 */

type Group = { title: string; note?: string; items: readonly string[] };
type Caps = {
    summary: string;
    groups: readonly Group[];
    examples: readonly string[];
    notFor?: { title: string; items: readonly string[] };
};

export default function CapabilitiesPanel({
    agentId,
    agentName,
    onClose,
    onPickExample,
}: {
    agentId: string;
    agentName: string;
    onClose: () => void;
    onPickExample: (q: string) => void;
}) {
    // Escape closes, and the body does not scroll behind the panel.
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

    const caps = (siteConfig.capabilities as Record<string, Caps | undefined>)[agentId];
    if (!caps) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-label={`What ${agentName} can do`}
        >
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />

            <div
                className="relative w-full sm:max-w-2xl max-h-[85vh] sm:max-h-[80vh] bg-white
                           rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col
                           animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
            >
                {/* Header stays put while the body scrolls */}
                <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 p-2 rounded-lg bg-nesr-green/10 shrink-0">
                            <Sparkles size={16} className="text-nesr-green" />
                        </div>
                        <div>
                            <h2 className="font-semibold text-gray-900">What {agentName} can do</h2>
                            <p className="text-sm text-gray-500 mt-0.5">{caps.summary}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="p-1.5 -mr-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 shrink-0"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
                    <div className="grid sm:grid-cols-2 gap-x-6 gap-y-5">
                        {caps.groups.map((g) => (
                            <div key={g.title}>
                                <div className="flex items-baseline gap-2 mb-1.5">
                                    <h3 className="text-sm font-semibold text-gray-900">{g.title}</h3>
                                    {g.note && (
                                        <span className="text-[11px] text-gray-400 truncate">{g.note}</span>
                                    )}
                                </div>
                                <ul className="space-y-1">
                                    {g.items.map((it) => (
                                        <li key={it} className="text-sm text-gray-600 flex gap-2">
                                            <span className="text-nesr-green mt-[3px] shrink-0 text-[10px]">&#9679;</span>
                                            <span>{it}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>

                    {caps.notFor && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3">
                            <div className="flex items-center gap-2 mb-1.5">
                                <Ban size={13} className="text-amber-600 shrink-0" />
                                <h3 className="text-sm font-semibold text-amber-900">{caps.notFor.title}</h3>
                            </div>
                            <ul className="space-y-1 ml-[21px]">
                                {caps.notFor.items.map((it) => (
                                    <li key={it} className="text-sm text-amber-800 list-disc list-outside ml-3">{it}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Clickable, so the panel ends in an action rather than a reading task. */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-2">Try one of these</h3>
                        <div className="space-y-1.5">
                            {caps.examples.map((q) => (
                                <button
                                    key={q}
                                    onClick={() => { onPickExample(q); onClose(); }}
                                    className="w-full text-left text-sm text-gray-700 px-3 py-2 rounded-lg border
                                               border-gray-200 hover:border-nesr-green/40 hover:bg-nesr-green/5
                                               transition-colors flex items-center justify-between gap-3 group"
                                >
                                    <span>{q}</span>
                                    <ArrowRight
                                        size={14}
                                        className="text-gray-300 group-hover:text-nesr-green shrink-0"
                                    />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
