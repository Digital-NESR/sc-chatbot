'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    ThumbsUp, ThumbsDown, Loader2, RefreshCw, Check, Copy, CircleDot, Inbox, Trash2,
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
    // Either can be null: a user rates from the chat, an admin from /admin,
    // and an answer is in this list if it carries at least one of the two.
    feedback: 'up' | 'down' | null;
    feedbackAt: string | null;
    feedbackReason: string | null;
    feedbackNote: string | null;
    adminFeedback: 'up' | 'down' | null;
    adminFeedbackBy: string | null;
    adminFeedbackAt: string | null;
    adminFeedbackReason: string | null;
    adminFeedbackNote: string | null;
    answeredAt: string;
    question: string | null;
    content: string;
    reviewNote: string | null;
    reviewStatus: string | null;
    reviewedAt: string | null;
};

const agentName = (botId: string) =>
    siteConfig.agents.find(a => a.id === botId)?.name ?? botId;

/**
 * The thumb to show on an answer carrying two of them.
 *
 * A down wins over an up, whoever gave it, because the list exists to surface
 * what needs looking at. Where the two disagree the row says so rather than
 * quietly picking a side.
 */
const effective = (i: Item): 'up' | 'down' | null =>
    i.feedback === 'down' || i.adminFeedback === 'down' ? 'down'
        : i.feedback === 'up' || i.adminFeedback === 'up' ? 'up'
            : null;

const disagrees = (i: Item) =>
    !!i.feedback && !!i.adminFeedback && i.feedback !== i.adminFeedback;

/** The label the user actually clicked, from the id that was stored. */
const reasonLabel = (id: string | null) =>
    id ? siteConfig.text.feedback.reasons.find(r => r.id === id)?.label ?? id : null;

/** The same reason ids, worded for somebody reviewing another person's chat. */
const adminReasonLabel = (id: string | null) =>
    id ? siteConfig.text.feedback.reasons.find(r => r.id === id)?.adminLabel ?? id : null;

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
    const [source, setSource] = useState<'all' | 'user' | 'admin'>('all');
    const [agent, setAgent] = useState('');
    const [showResolved, setShowResolved] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    // The id waiting on a confirmation, and the one being deleted. Held apart
    // so the dialog cannot be answered for a row that has since scrolled away.
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteFailed, setDeleteFailed] = useState(false);

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
                // Whose thumb the rating filter reads depends on the source
                // filter: picking "From admins" and "Thumbs down" should mean
                // what an admin marked down, not an answer a user disliked
                // that an admin happened to also look at.
                const thumb = source === 'user' ? i.feedback
                    : source === 'admin' ? i.adminFeedback
                        : effective(i);
                if (!thumb) return false;
                if (rating !== 'all' && thumb !== rating) return false;
                if (agent && i.botId !== agent) return false;
                if (!showResolved && i.reviewStatus === 'resolved') return false;
                return true;
            }),
        [items, rating, source, agent, showResolved],
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

    const isNew = (i: Item) => {
        const at = i.feedbackAt ?? i.adminFeedbackAt;
        return !!at && new Date(at).getTime() > openedAt.current && !seen.current.has(i.id);
    };

    const save = async (patch: {
        reviewNote?: string; reviewStatus?: string | null; adminFeedback?: 'up' | 'down' | null;
        adminFeedbackReason?: string | null; adminFeedbackNote?: string | null;
    }) => {
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
                        ? {
                              ...i,
                              reviewNote: saved.reviewNote,
                              reviewStatus: saved.reviewStatus,
                              reviewedAt: saved.reviewedAt,
                              adminFeedback: saved.adminFeedback,
                              adminFeedbackBy: saved.adminFeedbackBy,
                              adminFeedbackAt: saved.adminFeedbackAt,
                              adminFeedbackReason: saved.adminFeedbackReason,
                              adminFeedbackNote: saved.adminFeedbackNote,
                          }
                        : i,
                ),
            );
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    /**
     * Clear everything recorded about one answer, after the dialog says yes.
     *
     * The answer itself stays. What goes is the feedback on it, including
     * somebody else's words, so the row only leaves the list once the server
     * has confirmed - no optimistic removal to undo.
     */
    const remove = async (id: string) => {
        setDeleting(true);
        setDeleteFailed(false);
        try {
            const res = await fetch('/api/admin/feedback', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messageId: id }),
            });
            if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
            setItems(prev => prev.filter(i => i.id !== id));
            if (selectedId === id) setSelectedId(null);
            setConfirmId(null);
        } catch (err) {
            console.error(err);
            setDeleteFailed(true);
        } finally {
            setDeleting(false);
        }
    };

    const confirmItem = items.find(i => i.id === confirmId) ?? null;

    useEffect(() => {
        if (!confirmId) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !deleting) setConfirmId(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [confirmId, deleting]);

    /** Everything needed to act on this one, in one clipboard paste. */
    const copyForReview = async () => {
        if (!selected) return;
        const block = [
            `Agent: ${agentName(selected.botId)}`,
            selected.feedback
                ? `Rated: thumbs ${selected.feedback} by ${selected.userEmail}`
                : `Asked by: ${selected.userEmail} (not rated by them)`,
            selected.adminFeedback
                ? `Admin rating: thumbs ${selected.adminFeedback} by ${selected.adminFeedbackBy ?? 'an admin'}`
                  + (selected.adminFeedbackReason ? ` — ${adminReasonLabel(selected.adminFeedbackReason)}` : '')
                  + (selected.adminFeedbackNote ? ` (${selected.adminFeedbackNote})` : '')
                : null,
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
        openDown: items.filter(i => effective(i) === 'down' && i.reviewStatus !== 'resolved').length,
        down: items.filter(i => effective(i) === 'down').length,
        up: items.filter(i => effective(i) === 'up').length,
        disagree: items.filter(disagrees).length,
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
                        {!!counts.disagree && (
                            <>
                                {' · '}
                                <span className="text-amber-600">{counts.disagree} where you and the user disagree</span>
                            </>
                        )}
                    </p>
                </div>

                <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 ml-auto">
                    {(['all', 'user', 'admin'] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setSource(s)}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                source === s ? 'bg-white shadow-sm text-[#307c4c]' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            {s === 'all' ? 'Everyone' : s === 'user' ? 'From users' : 'From admins'}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
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
                    <p className="text-sm">Nothing here. Ratings appear as users give them, or as you rate answers yourself.</p>
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
                                        <span className={`mt-0.5 shrink-0 ${effective(i) === 'down' ? 'text-red-400' : 'text-emerald-500'}`}>
                                            {effective(i) === 'down'
                                                ? <ThumbsDown className="w-3.5 h-3.5" fill="currentColor" />
                                                : <ThumbsUp className="w-3.5 h-3.5" fill="currentColor" />}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-0.5">
                                                <span className="font-medium text-slate-700 truncate">{agentName(i.botId)}</span>
                                                <span>·</span>
                                                <span className="shrink-0">{when(i.feedbackAt ?? i.adminFeedbackAt)}</span>
                                                {!i.feedback && i.adminFeedback && (
                                                    <span className="shrink-0 px-1 rounded bg-slate-100 text-slate-500 text-[9px] font-semibold tracking-wide">
                                                        ADMIN
                                                    </span>
                                                )}
                                                {disagrees(i) && (
                                                    <span className="shrink-0 px-1 rounded bg-amber-50 text-amber-600 text-[9px] font-semibold tracking-wide">
                                                        SPLIT
                                                    </span>
                                                )}
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
                                            {(i.feedbackReason || i.adminFeedbackReason) && (
                                                <span className="inline-block mt-1 px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 text-[9.5px] font-medium">
                                                    {i.feedbackReason
                                                        ? reasonLabel(i.feedbackReason)
                                                        : adminReasonLabel(i.adminFeedbackReason)}
                                                </span>
                                            )}
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
                                        {selected.feedback && (
                                            <>
                                                <span className={selected.feedback === 'down' ? 'text-red-500' : 'text-emerald-600'}>
                                                    {selected.feedback === 'down' ? 'Thumbs down' : 'Thumbs up'} from the user
                                                </span>
                                                <span>·</span>
                                            </>
                                        )}
                                        {selected.adminFeedback && (
                                            <>
                                                <span className={selected.adminFeedback === 'down' ? 'text-red-500' : 'text-emerald-600'}>
                                                    {selected.adminFeedback === 'down' ? 'Thumbs down' : 'Thumbs up'} from{' '}
                                                    {selected.adminFeedbackBy ?? 'an admin'}
                                                </span>
                                                <span>·</span>
                                            </>
                                        )}
                                        <span className="font-medium text-slate-700">{agentName(selected.botId)}</span>
                                        <span>·</span>
                                        <span className="truncate">{selected.userEmail}</span>
                                        <span>·</span>
                                        <span>{when(selected.feedbackAt ?? selected.adminFeedbackAt)}</span>
                                    </div>
                                    <h2 className="font-semibold text-slate-900 text-[15px] leading-snug">
                                        {selected.question ?? '(question not found)'}
                                    </h2>
                                    {selected.feedbackReason && (
                                        <p className="mt-1.5 text-[12px] text-slate-600">
                                            <span className="text-slate-400 mr-1.5">User:</span>
                                            <span className="px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 text-[10.5px] font-medium">
                                                {reasonLabel(selected.feedbackReason)}
                                            </span>
                                            {selected.feedbackNote && (
                                                <span className="ml-2 italic">{selected.feedbackNote}</span>
                                            )}
                                        </p>
                                    )}
                                    {(selected.adminFeedbackReason || selected.adminFeedbackNote) && (
                                        <p className="mt-1.5 text-[12px] text-slate-600">
                                            <span className="text-slate-400 mr-1.5">Admin:</span>
                                            {selected.adminFeedbackReason && (
                                                <span className="px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 text-[10.5px] font-medium">
                                                    {adminReasonLabel(selected.adminFeedbackReason)}
                                                </span>
                                            )}
                                            {selected.adminFeedbackNote && (
                                                <span className="ml-2 italic">{selected.adminFeedbackNote}</span>
                                            )}
                                        </p>
                                    )}
                                </div>
                                <div className="shrink-0 flex items-center gap-1.5">
                                    <button
                                        onClick={copyForReview}
                                        title="Copy the question and answer"
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
                                    >
                                        {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                                        {copied ? 'Copied' : 'Copy'}
                                    </button>
                                    <button
                                        onClick={() => { setDeleteFailed(false); setConfirmId(selected.id); }}
                                        title="Delete this feedback"
                                        aria-label="Delete this feedback"
                                        className="p-1.5 rounded-lg border border-slate-200 text-slate-400
                                                   hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
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
                                    {/* Your own verdict, kept apart from the user's. Useful
                                        here as well as on the transcript: this is where you
                                        are already reading the answer closely. */}
                                    <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
                                        <span className="text-xs text-slate-400">Your rating</span>
                                        {(['up', 'down'] as const).map(v => {
                                            const on = selected.adminFeedback === v;
                                            const Icon = v === 'up' ? ThumbsUp : ThumbsDown;
                                            return (
                                                <button
                                                    key={v}
                                                    onClick={() => save({ adminFeedback: on ? null : v })}
                                                    disabled={saving}
                                                    aria-pressed={on}
                                                    title={v === 'up' ? 'Mark this answer good' : 'Flag this answer'}
                                                    className={`p-1.5 rounded-md border transition-colors disabled:opacity-50 ${
                                                        on
                                                            ? v === 'up'
                                                                ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                                                                : 'border-red-200 bg-red-50 text-red-600'
                                                            : 'border-transparent text-slate-400 hover:text-slate-700 hover:bg-slate-200/60'
                                                    }`}
                                                >
                                                    <Icon size={13} fill={on ? 'currentColor' : 'none'} />
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <span className="text-xs text-slate-400">
                                        Notes save when you click away.
                                    </span>
                                </div>

                                {/* Why you marked it down, in the same words the
                                    transcript offers. Separate from the note above,
                                    which is the conclusion after looking into it. */}
                                {selected.adminFeedback === 'down' && (
                                    <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2.5 border-t border-slate-200">
                                        <span className="text-[10.5px] text-slate-400 mr-auto">
                                            {siteConfig.text.feedback.prompt}{' '}
                                            <span className="text-slate-300">({siteConfig.text.feedback.optional})</span>
                                        </span>
                                        {siteConfig.text.feedback.reasons.map(r => {
                                            const on = selected.adminFeedbackReason === r.id;
                                            return (
                                                <button
                                                    key={r.id}
                                                    onClick={() => save({ adminFeedbackReason: on ? null : r.id })}
                                                    disabled={saving}
                                                    aria-pressed={on}
                                                    className={`px-2 py-0.5 rounded-full border text-[10.5px] transition-colors disabled:opacity-50 ${
                                                        on
                                                            ? 'border-red-200 bg-red-50 text-red-500'
                                                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
                                                    }`}
                                                >
                                                    {r.adminLabel}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Confirmation. It names what actually goes, because "delete
                feedback" reads like undoing your own thumb and this also
                throws away whatever the user wrote. */}
            {confirmItem && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
                    onClick={() => !deleting && setConfirmId(null)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="delete-feedback-title"
                        onClick={e => e.stopPropagation()}
                        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-5"
                    >
                        <h3 id="delete-feedback-title" className="font-semibold text-slate-900">
                            Delete this feedback?
                        </h3>
                        <p className="mt-2 text-sm text-slate-600">
                            The answer and the conversation stay. What goes is everything recorded about it:
                        </p>
                        <ul className="mt-2 space-y-1 text-sm text-slate-600 list-disc list-inside">
                            {confirmItem.feedback && (
                                <li>
                                    the user&apos;s thumbs {confirmItem.feedback}
                                    {confirmItem.feedbackReason && ` — ${reasonLabel(confirmItem.feedbackReason)}`}
                                    {confirmItem.feedbackNote && ` — “${confirmItem.feedbackNote}”`}
                                </li>
                            )}
                            {confirmItem.adminFeedback && (
                                <li>
                                    the admin thumbs {confirmItem.adminFeedback}
                                    {confirmItem.adminFeedbackBy && ` from ${confirmItem.adminFeedbackBy}`}
                                    {confirmItem.adminFeedbackReason && ` — ${adminReasonLabel(confirmItem.adminFeedbackReason)}`}
                                </li>
                            )}
                            {confirmItem.reviewNote && <li>the review note</li>}
                        </ul>
                        <p className="mt-3 text-xs text-slate-400">
                            This cannot be undone. To take back only your own rating, click your thumb again instead.
                        </p>
                        {deleteFailed && (
                            <p className="mt-2 text-sm text-red-600">Could not delete it. Nothing was changed.</p>
                        )}
                        <div className="mt-4 flex items-center justify-end gap-2">
                            <button
                                onClick={() => setConfirmId(null)}
                                disabled={deleting}
                                className="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                            >
                                Keep it
                            </button>
                            <button
                                onClick={() => remove(confirmItem.id)}
                                disabled={deleting}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                                           bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                            >
                                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                Delete feedback
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
