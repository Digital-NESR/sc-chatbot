'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    ThumbsUp, ThumbsDown, Loader2, RefreshCw, Check, Copy, CircleDot, Inbox,
} from 'lucide-react';
import { siteConfig } from '@/config/site';

/**
 * Live feedback review.
 *
 * Built to be left open. Somebody rates an answer in the chat and it shows up
 * here within the refresh interval, marked as new, with the question that
 * produced it and the full answer rather than a two-line preview - a thumbs
 * down with no context is not something anyone can act on.
 *
 * The note is the part that matters. The thumb says someone was unhappy; by
 * the time anyone looks, the conversation is cold and only a written note
 * still says why.
 */

const REFRESH_MS = 20_000;

type Item = {
    id: string;
    sessionId: string;
    botId: string;
    sessionTitle: string;
    userEmail: string;
    feedback: 'up' | 'down';
    feedbackAt: string | null;
    answeredAt: string;
    question: string | null;
    content: string;
    reviewNote: string | null;
    reviewStatus: string | null;
    reviewedAt: string | null;
};

const agentName = (botId: string) =>
    siteConfig.agents.find(a => a.id === botId)?.name ?? botId;

const when = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
    return d.toLocaleDateString();
};

export default function RatingsTab() {
    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
    const [live, setLive] = useState(true);
    const [rating, setRating] = useState<'down' | 'up' | 'all'>('down');
    const [agent, setAgent] = useState('');
    const [showResolved, setShowResolved] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    // Anything rated after the page opened is new to whoever is watching. Kept
    // in a ref so a refresh does not move the goalposts mid-session.
    const openedAt = useRef<number>(Date.now());
    const seen = useRef<Set<string>>(new Set());

    const load = useCallback(async (quiet = false) => {
        if (!quiet) setLoading(true);
        setRefreshing(true);
        try {
            const res = await fetch('/api/admin/feedback');
            if (res.ok) {
                const data = await res.json();
                setItems(data.items || []);
                setFetchedAt(new Date());
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!live) return;
        const t = setInterval(() => load(true), REFRESH_MS);
        return () => clearInterval(t);
    }, [live, load]);

    const filtered = useMemo(
        () =>
            items.filter(i => {
                if (rating !== 'all' && i.feedback !== rating) return false;
                if (agent && i.botId !== agent) return false;
                if (!showResolved && i.reviewStatus === 'resolved') return false;
                return true;
            }),
        [items, rating, agent, showResolved],
    );

    const selected = filtered.find(i => i.id === selectedId) ?? filtered[0] ?? null;

    // Load the stored note when the selection changes, without an effect that
    // writes state on every render: the id the note belongs to is tracked
    // alongside it and only re-read when it actually moves.
    const noteFor = useRef<string | null>(null);
    if (selected && noteFor.current !== selected.id) {
        noteFor.current = selected.id;
        if (note !== (selected.reviewNote ?? '')) setNote(selected.reviewNote ?? '');
    }

    const isNew = (i: Item) =>
        !!i.feedbackAt && new Date(i.feedbackAt).getTime() > openedAt.current && !seen.current.has(i.id);

    const save = async (patch: { reviewNote?: string; reviewStatus?: string | null }) => {
        if (!selected) return;
        setSaving(true);
        try {
            const res = await fetch('/api/admin/feedback', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messageId: selected.id, ...patch }),
            });
            if (!res.ok) throw new Error(`Save failed: ${res.status}`);
            const saved = await res.json();
            setItems(prev =>
                prev.map(i =>
                    i.id === selected.id
                        ? { ...i, reviewNote: saved.reviewNote, reviewStatus: saved.reviewStatus, reviewedAt: saved.reviewedAt }
                        : i,
                ),
            );
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    /** Everything needed to act on this one, in one clipboard paste. */
    const copyForReview = async () => {
        if (!selected) return;
        const block = [
            `Agent: ${agentName(selected.botId)}`,
            `Rated: ${selected.feedback === 'down' ? 'thumbs down' : 'thumbs up'} by ${selected.userEmail}`,
            `Message id: ${selected.id}`,
            selected.reviewNote ? `Note: ${selected.reviewNote}` : null,
            '',
            `QUESTION:`,
            selected.question ?? '(not found)',
            '',
            `ANSWER:`,
            selected.content,
        ].filter(v => v !== null).join('\n');
        try {
            await navigator.clipboard.writeText(block);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Copy failed', err);
        }
    };

    const counts = useMemo(() => ({
        openDown: items.filter(i => i.feedback === 'down' && i.reviewStatus !== 'resolved').length,
        down: items.filter(i => i.feedback === 'down').length,
        up: items.filter(i => i.feedback === 'up').length,
    }), [items]);

    return (
        <div className="flex flex-col gap-4">
            {/* Controls */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-4 sm:px-6 py-4 flex flex-wrap items-center gap-x-5 gap-y-3">
                <div>
                    <h1 className="text-lg font-semibold text-slate-800">Answer Feedback</h1>
                    <p className="text-sm text-slate-500">
                        {counts.openDown} still to review
                        {' · '}
                        <span className="text-red-500">{counts.down} down</span>
                        {' · '}
                        <span className="text-emerald-600">{counts.up} up</span>
                    </p>
                </div>

                <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 ml-auto">
                    {(['down', 'up', 'all'] as const).map(r => (
                        <button
                            key={r}
                            onClick={() => setRating(r)}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                rating === r ? 'bg-white shadow-sm text-[#307c4c]' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            {r === 'down' ? 'Thumbs down' : r === 'up' ? 'Thumbs up' : 'All'}
                        </button>
                    ))}
                </div>

                <select
                    value={agent}
                    onChange={e => setAgent(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg p-2"
                >
                    <option value="">All agents</option>
                    {siteConfig.agents.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>

                <label className="flex items-center gap-2 text-sm text-slate-600 select-none">
                    <input
                        type="checkbox"
                        checked={showResolved}
                        onChange={e => setShowResolved(e.target.checked)}
                        className="accent-[#307c4c]"
                    />
                    Show resolved
                </label>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setLive(v => !v)}
                        title={live ? `Refreshing every ${REFRESH_MS / 1000}s` : 'Auto refresh is off'}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                            live
                                ? 'border-[#307c4c]/30 bg-[#307c4c]/10 text-[#307c4c]'
                                : 'border-slate-200 text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <CircleDot size={13} className={live ? 'animate-pulse' : ''} />
                        {live ? 'Live' : 'Paused'}
                    </button>
                    <button
                        onClick={() => load(true)}
                        title="Refresh now"
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    >
                        <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
                    </button>
                    {fetchedAt && (
                        <span className="text-xs text-slate-400 tabular-nums">
                            {fetchedAt.toLocaleTimeString()}
                        </span>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-[#307c4c]" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center py-20 text-slate-400">
                    <Inbox className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm">Nothing here. Ratings appear as users give them.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-start">
                    {/* The queue */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-100">
                            {filtered.map(i => {
                                const on = selected?.id === i.id;
                                return (
                                    <button
                                        key={i.id}
                                        onClick={() => { seen.current.add(i.id); setSelectedId(i.id); }}
                                        className={`w-full text-left px-4 py-3 flex gap-3 transition-colors ${
                                            on ? 'bg-[#307c4c]/8' : 'hover:bg-slate-50'
                                        }`}
                                    >
                                        <span className={`mt-0.5 shrink-0 ${i.feedback === 'down' ? 'text-red-400' : 'text-emerald-500'}`}>
                                            {i.feedback === 'down'
                                                ? <ThumbsDown className="w-3.5 h-3.5" fill="currentColor" />
                                                : <ThumbsUp className="w-3.5 h-3.5" fill="currentColor" />}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-0.5">
                                                <span className="font-medium text-slate-700 truncate">{agentName(i.botId)}</span>
                                                <span>·</span>
                                                <span className="shrink-0">{when(i.feedbackAt)}</span>
                                                {isNew(i) && (
                                                    <span className="ml-auto shrink-0 px-1.5 rounded-full bg-[#307c4c] text-white text-[9px] font-semibold tracking-wide">
                                                        NEW
                                                    </span>
                                                )}
                                                {i.reviewStatus === 'resolved' && (
                                                    <Check className="w-3 h-3 text-emerald-500 ml-auto shrink-0" />
                                                )}
                                            </span>
                                            <span className="block text-[13px] text-slate-800 line-clamp-2">
                                                {i.question ?? '(question not found)'}
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* The one being reviewed */}
                    {selected && (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col max-h-[70vh]">
                            <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                                        <span className={selected.feedback === 'down' ? 'text-red-500' : 'text-emerald-600'}>
                                            {selected.feedback === 'down' ? 'Thumbs down' : 'Thumbs up'}
                                        </span>
                                        <span>·</span>
                                        <span className="font-medium text-slate-700">{agentName(selected.botId)}</span>
                                        <span>·</span>
                                        <span className="truncate">{selected.userEmail}</span>
                                        <span>·</span>
                                        <span>{when(selected.feedbackAt)}</span>
                                    </div>
                                    <h2 className="font-semibold text-slate-900 text-[15px] leading-snug">
                                        {selected.question ?? '(question not found)'}
                                    </h2>
                                </div>
                                <button
                                    onClick={copyForReview}
                                    title="Copy the question and answer"
                                    className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
                                >
                                    {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                                    {copied ? 'Copied' : 'Copy'}
                                </button>
                            </div>

                            <div className="overflow-y-auto px-5 py-4 flex-1">
                                <div className="text-sm leading-relaxed markdown-admin-view text-slate-800">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            p: ({ children }) => <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>,
                                            table: ({ children }) => (
                                                <div className="w-full overflow-x-auto my-3">
                                                    <table className="w-full text-xs text-left border-collapse border border-slate-300 rounded-lg">{children}</table>
                                                </div>
                                            ),
                                            thead: ({ children }) => <thead className="text-[11px] uppercase text-slate-500 bg-slate-100/60">{children}</thead>,
                                            th: ({ children }) => <th className="px-3 py-1.5 font-semibold whitespace-nowrap border-b border-slate-300">{children}</th>,
                                            td: ({ children }) => <td className="px-3 py-1.5 border-b border-slate-200 last:border-0 whitespace-nowrap">{children}</td>,
                                            ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1 pl-1">{children}</ul>,
                                            ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1 pl-1">{children}</ol>,
                                        }}
                                    >
                                        {selected.content}
                                    </ReactMarkdown>
                                </div>
                            </div>

                            <div className="px-5 py-4 border-t border-slate-100 shrink-0 bg-slate-50/60 rounded-b-2xl">
                                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                                    What was wrong with it?
                                </label>
                                <textarea
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                    onBlur={() => {
                                        if (note !== (selected.reviewNote ?? '')) save({ reviewNote: note });
                                    }}
                                    rows={2}
                                    placeholder="e.g. counted deleted lines, or missed the supplier name"
                                    className="w-full text-sm rounded-lg border border-slate-200 bg-white p-2.5 focus:ring-1 focus:ring-[#307c4c] focus:border-[#307c4c] resize-y"
                                />
                                <div className="flex items-center gap-3 mt-2.5">
                                    <button
                                        onClick={() =>
                                            save({
                                                reviewNote: note,
                                                reviewStatus: selected.reviewStatus === 'resolved' ? null : 'resolved',
                                            })
                                        }
                                        disabled={saving}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                                            selected.reviewStatus === 'resolved'
                                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                : 'bg-[#307c4c] text-white hover:opacity-90'
                                        }`}
                                    >
                                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                        {selected.reviewStatus === 'resolved' ? 'Resolved — undo' : 'Mark resolved'}
                                    </button>
                                    <span className="text-xs text-slate-400">
                                        Notes save when you click away.
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
