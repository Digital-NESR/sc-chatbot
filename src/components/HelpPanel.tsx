'use client';

import { useEffect, useState } from 'react';
import { X, PlayCircle, BookOpen, Check, Ban, EyeOff, AlertTriangle } from 'lucide-react';
import { siteConfig } from '@/config/site';

/**
 * Help panel: the intro video and the prompting guide.
 *
 * Also used for the first-visit welcome, where `videoOnly` opens it straight
 * on the video with a dismiss button instead of tabs. Same component so the
 * video is defined and styled once.
 */

type Tone = 'do' | 'dont' | 'cant' | 'check';

const TONE: Record<Tone, { icon: typeof Check; ring: string; text: string; bg: string }> = {
    do:    { icon: Check,         ring: 'border-emerald-200', text: 'text-emerald-700', bg: 'bg-emerald-50/60' },
    dont:  { icon: Ban,           ring: 'border-red-200',     text: 'text-red-700',     bg: 'bg-red-50/60' },
    cant:  { icon: EyeOff,        ring: 'border-slate-200',   text: 'text-slate-700',   bg: 'bg-slate-50' },
    check: { icon: AlertTriangle, ring: 'border-amber-200',   text: 'text-amber-800',   bg: 'bg-amber-50/60' },
};

export default function HelpPanel({
    onClose,
    videoOnly = false,
}: {
    onClose: () => void;
    videoOnly?: boolean;
}) {
    const [tab, setTab] = useState<'video' | 'guide'>('video');
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

    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-label={videoOnly ? help.firstVisit.title : 'Help'}
        >
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />

            <div className="relative w-full sm:max-w-3xl max-h-[90vh] sm:max-h-[86vh] bg-white
                            rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col
                            animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">

                <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
                    <div>
                        <h2 className="font-semibold text-gray-900">
                            {videoOnly ? help.firstVisit.title : 'Help'}
                        </h2>
                        {videoOnly && (
                            <p className="text-sm text-gray-500 mt-0.5">{help.firstVisit.body}</p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="p-1.5 -mr-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 shrink-0"
                    >
                        <X size={18} />
                    </button>
                </div>

                {!videoOnly && (
                    <div className="flex gap-1 px-5 sm:px-6 pt-3 border-b border-gray-100 shrink-0">
                        {([['video', 'Intro video', PlayCircle], ['guide', 'Getting good answers', BookOpen]] as const).map(
                            ([id, label, Icon]) => (
                                <button
                                    key={id}
                                    onClick={() => setTab(id)}
                                    className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-t-lg border-b-2 -mb-px transition-colors ${
                                        tab === id
                                            ? 'border-nesr-green text-nesr-green font-medium'
                                            : 'border-transparent text-gray-500 hover:text-gray-800'
                                    }`}
                                >
                                    <Icon size={15} />
                                    {label}
                                </button>
                            ),
                        )}
                    </div>
                )}

                <div className="overflow-y-auto px-5 sm:px-6 py-5">
                    {(videoOnly || tab === 'video') && (
                        <div>
                            {/* 16:9 via aspect-ratio so it scales with the panel rather
                                than the 640x360 the embed code hardcodes. */}
                            <div className="relative w-full rounded-xl overflow-hidden bg-gray-900 shadow-sm"
                                 style={{ aspectRatio: '16 / 9' }}>
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

                            {videoOnly && (
                                <button
                                    onClick={onClose}
                                    className="mt-5 w-full sm:w-auto px-5 py-2.5 rounded-lg bg-nesr-green text-white
                                               text-sm font-medium hover:opacity-90 transition-opacity"
                                >
                                    {help.firstVisit.dismiss}
                                </button>
                            )}
                        </div>
                    )}

                    {!videoOnly && tab === 'guide' && (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-600">{help.guide.intro}</p>

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
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
