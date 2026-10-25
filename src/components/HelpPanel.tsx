'use client';

import { useEffect } from 'react';
import { X, Check, Ban, EyeOff, AlertTriangle } from 'lucide-react';
import { siteConfig } from '@/config/site';

/**
 * One panel, two views: the intro video and the prompting guide.
 *
 * They are separate buttons in the header rather than tabs behind a single
 * Help button, because they answer different questions and someone wanting
 * one rarely wants the other. `firstVisit` is the same video view with the
 * welcome copy and a dismiss button, so the embed is defined once.
 */

type Tone = 'do' | 'dont' | 'cant' | 'check';

const TONE: Record<Tone, { icon: typeof Check; ring: string; text: string; bg: string }> = {
    do:    { icon: Check,         ring: 'border-emerald-200', text: 'text-emerald-700', bg: 'bg-emerald-50/60' },
    dont:  { icon: Ban,           ring: 'border-red-200',     text: 'text-red-700',     bg: 'bg-red-50/60' },
    cant:  { icon: EyeOff,        ring: 'border-slate-200',   text: 'text-slate-700',   bg: 'bg-slate-50' },
    check: { icon: AlertTriangle, ring: 'border-amber-200',   text: 'text-amber-800',   bg: 'bg-amber-50/60' },
};

export default function HelpPanel({
    view,
    onClose,
    firstVisit = false,
}: {
    view: 'video' | 'guide';
    onClose: () => void;
    firstVisit?: boolean;
}) {
    const { help } = siteConfig;

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

    const title = firstVisit ? help.firstVisit.title : view === 'video' ? help.videoTitle : help.guide.title;
    const blurb = firstVisit ? help.firstVisit.body : view === 'video' ? help.videoBlurb : help.guide.intro;

    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-label={title}
        >
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />

            <div className={`relative w-full ${view === 'video' ? 'sm:max-w-3xl' : 'sm:max-w-2xl'}
                            max-h-[90vh] sm:max-h-[86vh] bg-white
                            rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col
                            animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200`}>

                <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
                    <div>
                        <h2 className="font-semibold text-gray-900">{title}</h2>
                        <p className="text-sm text-gray-500 mt-0.5">{blurb}</p>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="p-1.5 -mr-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 shrink-0"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="overflow-y-auto px-5 sm:px-6 py-5">
                    {view === 'video' ? (
                        <div>
                            {/* 16:9 via aspect-ratio, so it scales with the panel rather
                                than the 640x360 the embed code hardcodes. */}
                            <div
                                className="relative w-full rounded-xl overflow-hidden bg-gray-900 shadow-sm"
                                style={{ aspectRatio: '16 / 9' }}
                            >
                                <iframe
                                    src={help.videoUrl}
                                    title={help.videoTitle}
                                    className="absolute inset-0 w-full h-full border-0"
                                    allowFullScreen
                                    scrolling="no"
                                />
                            </div>
                            <p className="text-xs text-gray-400 mt-2">
                                Hosted on NESR SharePoint. If it asks you to sign in, use your NESR account.
                            </p>

                            {firstVisit && (
                                <button
                                    onClick={onClose}
                                    className="mt-5 w-full sm:w-auto px-5 py-2.5 rounded-lg bg-nesr-green text-white
                                               text-sm font-medium hover:opacity-90 transition-opacity"
                                >
                                    {help.firstVisit.dismiss}
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {help.guide.sections.map((sec) => {
                                const t = TONE[sec.tone as Tone] ?? TONE.check;
                                const Icon = t.icon;
                                return (
                                    <div key={sec.title} className={`rounded-lg border ${t.ring} ${t.bg} px-4 py-3`}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <Icon size={14} className={`${t.text} shrink-0`} />
                                            <h3 className={`text-sm font-semibold ${t.text}`}>{sec.title}</h3>
                                        </div>
                                        <ul className="space-y-1.5">
                                            {sec.items.map((it) => (
                                                <li key={it} className="text-sm text-gray-700 flex gap-2">
                                                    <span className="text-gray-300 mt-[3px] shrink-0 text-[10px]">&#9679;</span>
                                                    <span>{it}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                );
                            })}

                            <div className="rounded-lg border border-gray-200 bg-gray-50/70 px-4 py-3">
                                <h3 className="text-sm font-semibold text-gray-600 mb-2">Shortcuts</h3>
                                <ul className="space-y-1.5">
                                    {help.guide.shortcuts.map((s) => (
                                        <li key={s.keys} className="flex items-baseline gap-2.5 text-sm text-gray-700">
                                            <kbd className="shrink-0 rounded border border-gray-300 bg-white px-1.5 py-0.5
                                                            text-[10.5px] font-medium tracking-wide text-gray-500">
                                                {s.keys}
                                            </kbd>
                                            <span>{s.what}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
