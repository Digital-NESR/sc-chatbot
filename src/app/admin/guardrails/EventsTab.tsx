'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Loader2, RefreshCw, CircleDot, ShieldCheck, ShieldAlert, Check, Copy, Ban, ThumbsDown,
} from 'lucide-react';
import { siteConfig } from '@/config/site';

/**
 * What the guardrails caught, and what to do about each one.
 *
 * Built on the Failures tab, which already solved this exact shape: a live
 * queue, a cluster panel, a master/detail pane and a triage note. The one new
 * control is "wrong match", because the thing being triaged here is not only
 * the event but the RULE - a match nobody wants is a fact about the rule, and
 * it is the number the Rules tab reads to decide whether enforcing is safe.
 */

const REFRESH_MS = 20_000;

type Item = {
    id: string;
    createdAt: string;
    userEmail: string | null;
    sessionId: string | null;
    botId: string | null;
    surface: 'input' | 'output' | 'sql';
    ruleId: string;
    ruleLabel: string;
    severity: 'low' | 'medium' | 'high';
    verdict: 'flag' | 'block';
    enforced: boolean;
    backfilled: boolean;
    excerpt: string | null;
    question: string | null;
    falsePositive: boolean | null;
    reviewNote: string | null;
    reviewStatus: string | null;
    reviewedAt: string | null;
};

type Group = { ruleId: string; label: string; count: number; falsePositives: number };

const SURFACE_LABEL: Record<Item['surface'], string> = {
    input: 'Question',
    output: 'Answer',
    sql: 'SQL',
};

const SURFACE_STYLE: Record<Item['surface'], string> = {
    input: 'bg-sky-50 text-sky-700 border-sky-200',
    output: 'bg-violet-50 text-violet-700 border-violet-200',
    sql: 'bg-orange-50 text-orange-700 border-orange-200',
};

const SEVERITY_STYLE: Record<Item['severity'], string> = {
    low: 'text-slate-500',
    medium: 'text-amber-600',
    high: 'text-red-600',
};

const agentName = (botId: string | null) =>
    siteConfig.agents.find(a => a.id === botId || a.name === botId)?.name ?? botId ?? 'unknown';

const when = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
    return d.toLocaleDateString();
};

export default function EventsTab() {
    const [items, setItems] = useState<Item[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [counts, setCounts] = useState({ open: 0, blocked: 0, last24h: 0 });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
    const [live, setLive] = useState(true);
    const [rule, setRule] = useState('');
    const [surface, setSurface] = useState<'' | Item['surface']>('');
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
            const res = await fetch('/api/admin/guardrails');
            if (res.ok) {
                const data = await res.json();
                setItems(data.items || []);
                setGroups(data.groups || []);
                setCounts({
                    open: data.open ?? 0,
                    blocked: data.blocked ?? 0,
                    last24h: data.last24h ?? 0,
                });
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

    const filtered = items.filter(i => {
        if (rule && i.ruleId !== rule) return false;
        if (surface && i.surface !== surface) return false;
        if (!showResolved && (i.reviewStatus === 'resolved' || i.falsePositive)) return false;
        return true;
    });

    const selected = filtered.find(i => i.id === selectedId) ?? filtered[0] ?? null;

    const noteFor = useRef<string | null>(null);
    if (selected && noteFor.current !== selected.id) {
        noteFor.current = selected.id;
        if (note !== (selected.reviewNote ?? '')) setNote(selected.reviewNote ?? '');
    }

    const isNew = (i: Item) =>
        new Date(i.createdAt).getTime() > openedAt.current && !seen.current.has(i.id);

    const save = async (patch: {
        reviewNote?: string;
        reviewStatus?: string | null;
        falsePositive?: boolean | null;
    }) => {
        if (!selected) return;
        setSaving(true);
        try {
            const res = await fetch('/api/admin/guardrails', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ eventId: selected.id, ...patch }),
            });
            if (!res.ok) throw new Error(`Save failed: ${res.status}`);
            const saved = await res.json();
            setItems(prev => prev.map(i => (i.id === selected.id ? { ...i, ...saved } : i)));
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    /** Everything needed to judge one match, in one paste. */
    const copyForReview = async () => {
        if (!selected) return;
        const block = [
            `Rule: ${selected.ruleLabel} (${selected.ruleId})`,
            `Surface: ${SURFACE_LABEL[selected.surface]} · severity ${selected.severity}`,
            `Action taken: ${selected.enforced ? 'BLOCKED' : 'logged only (shadow)'}`,
            `User: ${selected.userEmail ?? 'unknown'} · agent ${agentName(selected.botId)}`,
            `When: ${new Date(selected.createdAt).toISOString()}`,
            '',
            'MATCHED:',
            selected.excerpt ?? '(none)',
            '',
            'QUESTION:',
            selected.question ?? '(not recorded)',
        ].join('\n');
        try {
            await navigator.clipboard.writeText(block);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-4 sm:px-6 py-4 flex flex-wrap items-center gap-x-5 gap-y-3">
                <div>
                    <h1 className="text-lg font-semibold text-slate-800">Guardrail activity</h1>
                    <p className="text-sm text-slate-500">
                        {counts.open} to review
                        {' · '}
                        <span className="text-slate-600">{counts.last24h} in the last 24h</span>
                        {' · '}
                        <span className={counts.blocked ? 'text-red-600' : 'text-slate-400'}>
                            {counts.blocked} actually blocked
                        </span>
                    </p>
                </div>

                <select
                    value={surface}
                    onChange={e => setSurface(e.target.value as '' | Item['surface'])}
                    className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg p-2 ml-auto"
                >
                    <option value="">Everywhere</option>
                    <option value="input">In the question</option>
                    <option value="output">In the answer</option>
                    <option value="sql">In the SQL</option>
                </select>

                <select
                    value={rule}
                    onChange={e => setRule(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg p-2"
                >
                    <option value="">All rules</option>
                    {groups.map(g => (
                        <option key={g.ruleId} value={g.ruleId}>{g.label}</option>
                    ))}
                </select>

                <label className="flex items-center gap-2 text-sm text-slate-600 select-none">
                    <input
                        type="checkbox"
                        checked={showResolved}
                        onChange={e => setShowResolved(e.target.checked)}
                        className="accent-[#307c4c]"
                    />
                    Show reviewed
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

            {!!groups.length && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-4 sm:px-6 py-4">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                        Which rules are firing
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {groups.map(g => (
                            <button
                                key={g.ruleId}
                                onClick={() => setRule(rule === g.ruleId ? '' : g.ruleId)}
                                className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                                    rule === g.ruleId
                                        ? 'border-[#307c4c]/30 bg-[#307c4c]/10 text-[#307c4c]'
                                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                {g.label}
                                <span className="ml-1.5 tabular-nums font-semibold">{g.count}</span>
                                {!!g.falsePositives && (
                                    <span className="ml-1.5 text-amber-600">
                                        {g.falsePositives} wrong
                                    </span>
                                )}
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
                        {items.length
                            ? 'Nothing matches those filters.'
                            : 'Nothing has tripped a guardrail yet.'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 items-start">
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
                                        <span className={`mt-0.5 shrink-0 ${SEVERITY_STYLE[i.severity]}`}>
                                            {i.enforced
                                                ? <Ban className="w-3.5 h-3.5" />
                                                : <ShieldAlert className="w-3.5 h-3.5" />}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-0.5">
                                                <span className={`px-1 rounded border ${SURFACE_STYLE[i.surface]}`}>
                                                    {SURFACE_LABEL[i.surface]}
                                                </span>
                                                <span className="truncate">{when(i.createdAt)}</span>
                                                {isNew(i) && (
                                                    <span className="ml-auto shrink-0 px-1.5 rounded-full bg-[#307c4c] text-white text-[9px] font-semibold tracking-wide">
                                                        NEW
                                                    </span>
                                                )}
                                                {i.backfilled && (
                                                    <span
                                                        title="Found by scanning older messages, not caught as it happened"
                                                        className="shrink-0 px-1 rounded bg-slate-100 text-slate-500 text-[9px] font-semibold"
                                                    >
                                                        PAST
                                                    </span>
                                                )}
                                                {i.falsePositive && (
                                                    <span className="ml-auto shrink-0 px-1 rounded bg-amber-50 text-amber-600 text-[9px] font-semibold">
                                                        WRONG
                                                    </span>
                                                )}
                                                {i.reviewStatus === 'resolved' && !i.falsePositive && (
                                                    <Check className="w-3 h-3 text-emerald-500 ml-auto shrink-0" />
                                                )}
                                            </span>
                                            <span className="block text-[13px] font-medium text-slate-800 truncate">
                                                {i.ruleLabel}
                                            </span>
                                            <span className="block text-[11.5px] text-slate-500 line-clamp-2 font-mono mt-0.5">
                                                {i.excerpt}
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {selected && (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col max-h-[70vh]">
                            <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-1 flex-wrap">
                                        <span className={`px-1.5 py-0.5 rounded border ${SURFACE_STYLE[selected.surface]}`}>
                                            {SURFACE_LABEL[selected.surface]}
                                        </span>
                                        <span className={SEVERITY_STYLE[selected.severity]}>
                                            {selected.severity} severity
                                        </span>
                                        <span>·</span>
                                        <span className="font-medium text-slate-700">{agentName(selected.botId)}</span>
                                        <span>·</span>
                                        <span className="truncate">{selected.userEmail ?? 'unknown'}</span>
                                        <span>·</span>
                                        <span>{when(selected.createdAt)}</span>
                                    </div>
                                    <h2 className="font-semibold text-slate-900 text-[15px] leading-snug">
                                        {selected.ruleLabel}
                                    </h2>
                                    <p className={`mt-1 text-[12px] ${selected.enforced ? 'text-red-600' : 'text-slate-500'}`}>
                                        {selected.backfilled
                                            ? 'Found by scanning messages from before the guardrails existed. Nothing was stopped, because nothing was watching at the time.'
                                            : selected.enforced
                                                ? 'This was blocked — the agent never saw it.'
                                                : 'Logged only. The answer went through as normal.'}
                                    </p>
                                </div>
                                <button
                                    onClick={copyForReview}
                                    title="Copy the whole match"
                                    className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
                                >
                                    {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                                    {copied ? 'Copied' : 'Copy'}
                                </button>
                            </div>

                            <div className="overflow-y-auto px-5 py-4 flex-1 flex flex-col gap-4">
                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                                        What matched
                                    </p>
                                    <pre className="text-[12px] bg-amber-50 border border-amber-100 text-slate-800 rounded-lg p-3 whitespace-pre-wrap break-words font-mono">
                                        {selected.excerpt ?? '(nothing recorded)'}
                                    </pre>
                                </div>
                                {selected.question && (
                                    <div>
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                                            What was asked
                                        </p>
                                        <div className="text-[13px] bg-slate-50 border border-slate-100 text-slate-700 rounded-lg p-3 whitespace-pre-wrap break-words">
                                            {selected.question}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="px-5 py-4 border-t border-slate-100 shrink-0 bg-slate-50/60 rounded-b-2xl">
                                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                                    What did you make of it?
                                </label>
                                <textarea
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                    onBlur={() => {
                                        if (note !== (selected.reviewNote ?? '')) save({ reviewNote: note });
                                    }}
                                    rows={2}
                                    placeholder="e.g. a real attempt, or the rule reading a pasted PO list as a flood"
                                    className="w-full text-sm rounded-lg border border-slate-200 bg-white p-2.5 focus:ring-1 focus:ring-[#307c4c] focus:border-[#307c4c] resize-y"
                                />
                                <div className="flex items-center gap-3 mt-2.5 flex-wrap">
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
                                        {selected.reviewStatus === 'resolved' ? 'Reviewed — undo' : 'Mark reviewed'}
                                    </button>

                                    {/* The one that matters. A rule's false-positive count is
                                        what the Rules tab reads to decide whether enforcing it
                                        would refuse real questions. */}
                                    <button
                                        onClick={() => save({ falsePositive: !selected.falsePositive })}
                                        disabled={saving}
                                        aria-pressed={!!selected.falsePositive}
                                        title="This rule should not have matched"
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                                            selected.falsePositive
                                                ? 'border-amber-200 bg-amber-50 text-amber-700'
                                                : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                                        }`}
                                    >
                                        <ThumbsDown size={13} />
                                        {selected.falsePositive ? 'Marked wrong' : 'Wrong match'}
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
