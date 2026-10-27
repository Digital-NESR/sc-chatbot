'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Loader2, RefreshCw, Check, Copy, CircleDot, ShieldCheck, AlertTriangle,
} from 'lucide-react';
import { siteConfig } from '@/config/site';

/**
 * What actually went wrong behind "the chatbot is busy".
 *
 * The user is shown one line whatever breaks, which is the right thing to show
 * and the wrong thing to keep. This is the kept half: the upstream status, the
 * body n8n returned, the question that triggered it.
 *
 * The summary at the top groups by stage and message, because one dead webhook
 * makes fifty identical rows and fifty rows of one problem reads as fifty
 * problems.
 */

const REFRESH_MS = 20_000;

type Item = {
    id: string;
    createdAt: string;
    userEmail: string | null;
    sessionId: string | null;
    botId: string | null;
    stage: string;
    status: number | null;
    message: string;
    detail: string | null;
    question: string | null;
    reviewNote: string | null;
    reviewStatus: string | null;
    reviewedAt: string | null;
};

type Group = { stage: string; message: string; count: number; last: string; botIds: string[] };

const STAGE_LABEL: Record<string, string> = {
    upstream: 'Agent failed',
    timeout: 'Timed out',
    network: 'Never replied',
    malformed: 'Unusable reply',
    session: 'No conversation',
};

const STAGE_STYLE: Record<string, string> = {
    upstream: 'bg-red-50 text-red-700 border-red-200',
    timeout: 'bg-amber-50 text-amber-800 border-amber-200',
    network: 'bg-orange-50 text-orange-700 border-orange-200',
    malformed: 'bg-violet-50 text-violet-700 border-violet-200',
    session: 'bg-slate-100 text-slate-700 border-slate-200',
};

const agentName = (botId: string | null) =>
    (botId && siteConfig.agents.find(a => a.id === botId)?.name) || botId || 'unknown';

const when = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
    return d.toLocaleDateString();
};

function StageTag({ stage }: { stage: string }) {
    return (
        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium uppercase tracking-wide ${STAGE_STYLE[stage] ?? STAGE_STYLE.session}`}>
            {STAGE_LABEL[stage] ?? stage}
        </span>
    );
}

export default function ErrorsTab() {
    const [items, setItems] = useState<Item[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [last24h, setLast24h] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
    const [live, setLive] = useState(true);
    const [stage, setStage] = useState('');
    const [agent, setAgent] = useState('');
    const [showResolved, setShowResolved] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    const openedAt = useRef<number>(Date.now());
    const seen = useRef<Set<string>>(new Set());

    const load = useCallback(async (quiet = false) => {
        if (!quiet) setLoading(true);
        setRefreshing(true);
        try {
            const res = await fetch('/api/admin/errors');
            if (res.ok) {
                const data = await res.json();
                setItems(data.items || []);
                setGroups(data.groups || []);
                setLast24h(data.last24h ?? 0);
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
                if (stage && i.stage !== stage) return false;
                if (agent && i.botId !== agent) return false;
                if (!showResolved && i.reviewStatus === 'resolved') return false;
                return true;
            }),
        [items, stage, agent, showResolved],
    );

    const selected = filtered.find(i => i.id === selectedId) ?? filtered[0] ?? null;

    const noteFor = useRef<string | null>(null);
    if (selected && noteFor.current !== selected.id) {
        noteFor.current = selected.id;
        if (note !== (selected.reviewNote ?? '')) setNote(selected.reviewNote ?? '');
    }

    const isNew = (i: Item) =>
        new Date(i.createdAt).getTime() > openedAt.current && !seen.current.has(i.id);

    const save = async (patch: { reviewNote?: string; reviewStatus?: string | null }) => {
        if (!selected) return;
        setSaving(true);
        try {
            const res = await fetch('/api/admin/errors', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ errorId: selected.id, ...patch }),
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

    const copyForReview = async () => {
        if (!selected) return;
        const block = [
            `Stage: ${STAGE_LABEL[selected.stage] ?? selected.stage}${selected.status ? ` (HTTP ${selected.status})` : ''}`,
            `Agent: ${agentName(selected.botId)}`,
            `When: ${new Date(selected.createdAt).toISOString()}`,
            selected.userEmail ? `User: ${selected.userEmail}` : null,
            selected.sessionId ? `Session: ${selected.sessionId}` : null,
            selected.reviewNote ? `Note: ${selected.reviewNote}` : null,
            '',
            'ERROR:',
            selected.message,
            '',
            'QUESTION:',
            selected.question ?? '(not captured)',
            '',
            'DETAIL:',
            selected.detail ?? '(none)',
        ].filter(v => v !== null).join('\n');
        try {
            await navigator.clipboard.writeText(block);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Copy failed', err);
        }
    };

    const open = items.filter(i => i.reviewStatus !== 'resolved').length;

    return (
        <div className="flex flex-col gap-4">
            {/* Controls */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-4 sm:px-6 py-4 flex flex-wrap items-center gap-x-5 gap-y-3">
                <div>
                    <h1 className="text-lg font-semibold text-slate-800">Failures</h1>
                    <p className="text-sm text-slate-500">
                        {open} still to review · {last24h} in the last 24 hours
                    </p>
                </div>

                <select
                    value={stage}
                    onChange={e => setStage(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg p-2 ml-auto"
                >
                    <option value="">All kinds</option>
                    {Object.entries(STAGE_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                    ))}
                </select>

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

            {/* What is actually going wrong, counted */}
            {groups.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-4 sm:px-6 py-4">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
                        Most common
                    </p>
                    <div className="flex flex-col gap-2">
                        {groups.map(g => (
                            <button
                                key={`${g.stage}::${g.message}`}
                                onClick={() => setStage(g.stage)}
                                className="flex items-center gap-3 text-left hover:bg-slate-50 -mx-2 px-2 py-1 rounded-lg"
                            >
                                <span className="w-10 text-right text-sm font-semibold text-slate-800 tabular-nums shrink-0">
                                    {g.count}
                                </span>
                                <StageTag stage={g.stage} />
                                <span className="text-sm text-slate-700 truncate flex-1">{g.message}</span>
                                <span className="text-xs text-slate-400 shrink-0">{when(g.last)}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {loading ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-[#307c4c]" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center py-20 text-slate-400">
                    <ShieldCheck className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm">
                        {items.length === 0 ? 'Nothing has failed. Failures appear here as they happen.' : 'Nothing matches those filters.'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 items-start">
                    {/* The queue */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-100">
                            {filtered.map(i => {
                                const on = selected?.id === i.id;
                                return (
                                    <button
                                        key={i.id}
                                        onClick={() => { seen.current.add(i.id); setSelectedId(i.id); }}
                                        className={`w-full text-left px-4 py-3 transition-colors ${
                                            on ? 'bg-[#307c4c]/8' : 'hover:bg-slate-50'
                                        }`}
                                    >
                                        <span className="flex items-center gap-1.5 mb-1">
                                            <StageTag stage={i.stage} />
                                            {i.status != null && (
                                                <span className="text-[10px] text-slate-400 tabular-nums">{i.status}</span>
                                            )}
                                            <span className="text-[11px] text-slate-500 truncate">{agentName(i.botId)}</span>
                                            <span className="text-[11px] text-slate-400 ml-auto shrink-0">{when(i.createdAt)}</span>
                                            {isNew(i) && (
                                                <span className="shrink-0 px-1.5 rounded-full bg-red-500 text-white text-[9px] font-semibold tracking-wide">
                                                    NEW
                                                </span>
                                            )}
                                            {i.reviewStatus === 'resolved' && (
                                                <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                                            )}
                                        </span>
                                        <span className="text-[13px] text-slate-800 line-clamp-2">{i.message}</span>
                                        {i.question && (
                                            <span className="block text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                                                asked: {i.question}
                                            </span>
                                        )}
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
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1.5">
                                        <StageTag stage={selected.stage} />
                                        {selected.status != null && (
                                            <span className="tabular-nums">HTTP {selected.status}</span>
                                        )}
                                        <span>·</span>
                                        <span className="font-medium text-slate-700">{agentName(selected.botId)}</span>
                                        {selected.userEmail && (<><span>·</span><span className="truncate">{selected.userEmail}</span></>)}
                                        <span>·</span>
                                        <span>{new Date(selected.createdAt).toLocaleString()}</span>
                                    </div>
                                    <h2 className="font-semibold text-slate-900 text-[15px] leading-snug break-words">
                                        {selected.message}
                                    </h2>
                                </div>
                                <button
                                    onClick={copyForReview}
                                    title="Copy the whole failure"
                                    className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
                                >
                                    {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                                    {copied ? 'Copied' : 'Copy'}
                                </button>
                            </div>

                            <div className="overflow-y-auto px-5 py-4 flex-1 space-y-4">
                                {selected.question && (
                                    <div>
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                                            What was asked
                                        </p>
                                        <p className="text-sm text-slate-800 whitespace-pre-wrap bg-slate-50 rounded-lg p-3 border border-slate-100">
                                            {selected.question}
                                        </p>
                                    </div>
                                )}

                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                                        What came back
                                    </p>
                                    {selected.detail ? (
                                        <pre className="text-[11.5px] leading-relaxed text-slate-700 bg-slate-900/[0.03] rounded-lg p-3 border border-slate-200 overflow-x-auto whitespace-pre-wrap break-words font-mono">
                                            {selected.detail}
                                        </pre>
                                    ) : (
                                        <p className="text-sm text-slate-400 italic">
                                            Nothing beyond the message above. The request did not get far enough to produce a body.
                                        </p>
                                    )}
                                </div>

                                {selected.sessionId && (
                                    <p className="text-[11px] text-slate-400">
                                        Session {selected.sessionId}
                                    </p>
                                )}
                            </div>

                            <div className="px-5 py-4 border-t border-slate-100 shrink-0 bg-slate-50/60 rounded-b-2xl">
                                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                                    What caused it, and what was done
                                </label>
                                <textarea
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                    onBlur={() => {
                                        if (note !== (selected.reviewNote ?? '')) save({ reviewNote: note });
                                    }}
                                    rows={2}
                                    placeholder="e.g. workflow was deactivated after an edit, reactivated"
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
                                    <span className="flex items-center gap-1.5 text-xs text-slate-400">
                                        <AlertTriangle size={11} />
                                        The user saw the standard busy message, not this.
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
