'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RotateCcw, ShieldCheck, Check } from 'lucide-react';

/**
 * What each rule does, and the evidence for changing it.
 *
 * Built on the display-names editor: defaults live in code, only changes are
 * stored, and setting a rule back to its default deletes the row rather than
 * storing the default value - so a later change to a default reaches everyone
 * who never touched it.
 *
 * The counts beside each control are the point of the page. Enforcing a rule
 * because its description sounds right is guesswork; enforcing it because it
 * fired forty times last week and none of them were wrong is not.
 */

type Action = 'off' | 'shadow' | 'enforce';

type Rule = {
    id: string;
    label: string;
    hint: string;
    group: string;
    surface: 'input' | 'output';
    severity: 'low' | 'medium' | 'high';
    defaultAction: Action;
    action: Action;
    isDefault: boolean;
    updatedBy: string | null;
    hits: number;
    falsePositives: number;
    unreviewed: number;
};

const ACTIONS: { value: Action; label: string; hint: string }[] = [
    { value: 'off', label: 'Off', hint: 'Not checked at all.' },
    { value: 'shadow', label: 'Watch', hint: 'Recorded, nothing is stopped.' },
    { value: 'enforce', label: 'Block', hint: 'The question is refused.' },
];

const SEVERITY_STYLE: Record<Rule['severity'], string> = {
    low: 'bg-slate-100 text-slate-600',
    medium: 'bg-amber-50 text-amber-700',
    high: 'bg-red-50 text-red-700',
};

export default function RulesTab() {
    const [rules, setRules] = useState<Rule[]>([]);
    const [windowDays, setWindowDays] = useState(7);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [saved, setSaved] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/guardrails/rules');
            if (res.ok) {
                const data = await res.json();
                setRules(data.items || []);
                setWindowDays(data.windowDays ?? 7);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const setAction = async (id: string, action: Action) => {
        const before = rules;
        // Optimistic: the control is the whole interaction, and waiting on a
        // round trip to move a radio button reads as broken.
        setRules(prev => prev.map(r => (r.id === id ? { ...r, action } : r)));
        setSaving(id);
        try {
            const res = await fetch('/api/admin/guardrails/rules', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, action }),
            });
            if (!res.ok) throw new Error(`Save failed: ${res.status}`);
            const data = await res.json();
            setRules(prev =>
                prev.map(r => (r.id === id ? { ...r, action: data.action, isDefault: data.isDefault } : r)),
            );
            setSaved(id);
            setTimeout(() => setSaved(s => (s === id ? null : s)), 1600);
        } catch (err) {
            console.error(err);
            setRules(before);
        } finally {
            setSaving(s => (s === id ? null : s));
        }
    };

    const groups = [...new Set(rules.map(r => r.group))];
    const changed = rules.filter(r => !r.isDefault).length;
    const enforcing = rules.filter(r => r.action === 'enforce').length;

    if (loading) {
        return (
            <div className="bg-white rounded-lg border border-slate-200 flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-[#307c4c]" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="bg-white rounded-lg border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-6">
                    <div>
                        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
                            <ShieldCheck className="w-5 h-5 text-[#307c4c]" />
                            Rules
                        </h2>
                        <p className="mt-1.5 text-sm text-slate-500 max-w-2xl">
                            Every rule ships on <strong>Watch</strong>: it records what it would have
                            caught and stops nothing. Move one to <strong>Block</strong> once its
                            wrong-match count says it is safe — a guardrail that refuses a real
                            question costs more than the one it catches. A change takes effect on the
                            next question; nothing already answered is revisited.
                        </p>
                    </div>
                    <div className="text-right shrink-0">
                        <p className="text-2xl font-semibold text-slate-800 tabular-nums">
                            {enforcing}<span className="text-slate-300"> / {rules.length}</span>
                        </p>
                        <p className="text-xs text-slate-400">blocking</p>
                        {!!changed && (
                            <p className="text-xs text-slate-400 mt-1">{changed} changed</p>
                        )}
                    </div>
                </div>
            </div>

            {groups.map(group => (
                <div key={group} className="bg-white rounded-lg border border-slate-200 p-5">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">{group}</h3>
                    <div className="divide-y divide-slate-100">
                        {rules.filter(r => r.group === group).map(r => (
                            <div key={r.id} className="py-3 flex items-start gap-4">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[13.5px] font-medium text-slate-800">{r.label}</span>
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SEVERITY_STYLE[r.severity]}`}>
                                            {r.severity}
                                        </span>
                                        <code className="text-[11px] text-slate-400">{r.id}</code>
                                    </div>
                                    <p className="text-[12px] text-slate-500 mt-0.5 leading-snug">{r.hint}</p>
                                    <p className="text-[11.5px] mt-1 tabular-nums">
                                        {r.hits === 0 ? (
                                            <span className="text-slate-400">
                                                nothing in {windowDays} days
                                            </span>
                                        ) : (
                                            <>
                                                <span className="text-slate-600">
                                                    {r.hits} in {windowDays} days
                                                </span>
                                                {r.falsePositives > 0 && (
                                                    <span className="text-amber-600">
                                                        {' · '}{r.falsePositives} wrong
                                                    </span>
                                                )}
                                                {/* Unjudged is not the same as right, and
                                                    conflating them is how a rule gets
                                                    enforced on evidence nobody looked at. */}
                                                {r.unreviewed > 0 ? (
                                                    <span className="text-slate-400">
                                                        {' · '}{r.unreviewed} not yet looked at
                                                    </span>
                                                ) : (
                                                    <span className="text-emerald-600">
                                                        {' · '}all reviewed
                                                    </span>
                                                )}
                                            </>
                                        )}
                                        {r.updatedBy && (
                                            <span className="text-slate-300"> · set by {r.updatedBy}</span>
                                        )}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
                                        {ACTIONS.map(a => (
                                            <button
                                                key={a.value}
                                                onClick={() => setAction(r.id, a.value)}
                                                disabled={saving === r.id}
                                                title={a.hint}
                                                aria-pressed={r.action === a.value}
                                                className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors disabled:opacity-50 ${
                                                    r.action === a.value
                                                        ? a.value === 'enforce'
                                                            ? 'bg-white shadow-sm text-red-600'
                                                            : 'bg-white shadow-sm text-[#307c4c]'
                                                        : 'text-slate-500 hover:text-slate-800'
                                                }`}
                                            >
                                                {a.label}
                                            </button>
                                        ))}
                                    </div>
                                    <span className="w-5 flex justify-center">
                                        {saving === r.id && <Loader2 size={13} className="animate-spin text-slate-400" />}
                                        {saved === r.id && <Check size={13} className="text-emerald-500" />}
                                        {saving !== r.id && saved !== r.id && !r.isDefault && (
                                            <button
                                                onClick={() => setAction(r.id, r.defaultAction)}
                                                title={`Restore the default: ${r.defaultAction}`}
                                                className="text-slate-300 hover:text-slate-600 transition-colors"
                                            >
                                                <RotateCcw size={13} />
                                            </button>
                                        )}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
