'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, RotateCcw, Search, Tags } from 'lucide-react';
import { DEFAULT_GROUPS, DISPLAY_NAMES } from '@/config/dataNames';

/**
 * What a table, view, tool or column is called in front of a user.
 *
 * The column dictionary says what a column MEANS, to the agent. This says what
 * it is CALLED, to everyone else - and it sits in the same place because they
 * are the same job seen from two ends, and because somebody editing one is
 * usually the person who should be editing the other.
 *
 * Saving is a single field, on blur, like the dictionary beside it. A label
 * returned to its default deletes the stored row rather than saving a copy of
 * the default, so "changed" stays a thing you can see.
 */
export default function DisplayNamesTab() {
    const [overrides, setOverrides] = useState<Record<string, string>>({});
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState<string | null>(null);
    const [saved, setSaved] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        let cancelled = false;
        fetch('/api/display-names')
            .then(res => (res.ok ? res.json() : null))
            .then(data => {
                if (cancelled) return;
                setOverrides(data?.names ?? {});
                setLoading(false);
            })
            .catch(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, []);

    const save = useCallback(async (key: string, label: string) => {
        const current = overrides[key] ?? DISPLAY_NAMES[key];
        if (label.trim() === current.trim()) return;

        setSaving(key);
        try {
            const res = await fetch('/api/admin/display-names', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, label }),
            });
            if (!res.ok) throw new Error(String(res.status));
            const data = await res.json();

            setOverrides(prev => {
                const next = { ...prev };
                // A default is an absence, not a value - see the route.
                if (data.isDefault) delete next[key];
                else next[key] = data.label;
                return next;
            });
            setDrafts(prev => {
                const next = { ...prev };
                delete next[key];
                return next;
            });
            setSaved(key);
            setTimeout(() => setSaved(s => (s === key ? null : s)), 1600);
        } catch (err) {
            console.error('Failed to save display name:', err);
        } finally {
            setSaving(s => (s === key ? null : s));
        }
    }, [overrides]);

    const groups = useMemo(() => {
        const q = search.trim().toLowerCase();
        return DEFAULT_GROUPS.map(group => ({
            ...group,
            rows: Object.entries(group.names).filter(
                ([key, label]) =>
                    !q ||
                    key.toLowerCase().includes(q) ||
                    label.toLowerCase().includes(q) ||
                    (overrides[key] ?? '').toLowerCase().includes(q),
            ),
        })).filter(group => group.rows.length > 0);
    }, [search, overrides]);

    const changed = Object.keys(overrides).length;
    const total = Object.keys(DISPLAY_NAMES).length;

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading names…
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                            <Tags className="w-4 h-4 text-[#307c4c]" />
                            What these are called in front of a user
                        </h3>
                        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
                            The agents name real tables when they explain themselves. These are the
                            words shown instead, in &ldquo;How I got this&rdquo; and in the live
                            progress line. Saving takes effect on the next answer — nothing is
                            re-generated and no figure is touched, the words are swapped as the text
                            is drawn.
                        </p>
                    </div>
                    <div className="text-right shrink-0">
                        <div className="text-2xl font-semibold text-slate-900">
                            {changed}
                            <span className="text-slate-400 text-lg"> / {total}</span>
                        </div>
                        <div className="text-xs text-slate-500">reworded</div>
                    </div>
                </div>

                <div className="relative mt-4 pt-3 border-t border-slate-100">
                    <Search className="w-4 h-4 text-slate-300 absolute left-3 top-1/2 mt-1.5 -translate-y-1/2 pointer-events-none" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Find a table, tool or column…"
                        className="w-full pl-9 pr-3 py-2 rounded-md border border-slate-200 text-sm
                                   text-slate-700 placeholder-slate-300 focus:outline-none focus:border-[#307c4c]/40"
                    />
                </div>
            </div>

            {groups.map(group => (
                <div key={group.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100">
                        <h4 className="text-sm font-semibold text-slate-800">{group.title}</h4>
                        {group.hint && <p className="text-xs text-slate-500 mt-0.5 max-w-3xl">{group.hint}</p>}
                    </div>

                    <table className="w-full text-sm">
                        <tbody>
                            {group.rows.map(([key, fallback]) => {
                                const value = drafts[key] ?? overrides[key] ?? fallback;
                                const edited = key in overrides;
                                return (
                                    <tr key={key} className="border-b border-slate-50 last:border-0">
                                        <td className="px-4 py-2 w-[42%] align-middle">
                                            <code className="text-[12px] text-slate-500">{key}</code>
                                        </td>
                                        <td className="px-2 py-2 align-middle">
                                            <div className="relative">
                                                <input
                                                    value={value}
                                                    onChange={e =>
                                                        setDrafts(prev => ({ ...prev, [key]: e.target.value }))
                                                    }
                                                    onBlur={e => save(key, e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') e.currentTarget.blur();
                                                        if (e.key === 'Escape') {
                                                            setDrafts(prev => {
                                                                const next = { ...prev };
                                                                delete next[key];
                                                                return next;
                                                            });
                                                        }
                                                    }}
                                                    className={`w-full px-2 py-1 rounded border text-sm transition-colors
                                                                focus:outline-none focus:border-[#307c4c]/50 ${
                                                                    edited
                                                                        ? 'border-[#307c4c]/30 bg-[#307c4c]/5 text-slate-800'
                                                                        : 'border-slate-200 text-slate-700'
                                                                }`}
                                                />
                                                {saving === key && (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 absolute right-2 top-1/2 -translate-y-1/2" />
                                                )}
                                                {saved === key && (
                                                    <Check className="w-3.5 h-3.5 text-emerald-500 absolute right-2 top-1/2 -translate-y-1/2" />
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-2 py-2 w-10 align-middle">
                                            {/* Only where there is something to undo. */}
                                            {edited && (
                                                <button
                                                    onClick={() => save(key, fallback)}
                                                    title={`Restore the default: ${fallback}`}
                                                    className="p-1 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100"
                                                >
                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ))}

            {groups.length === 0 && (
                <div className="bg-white rounded-lg border border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                    Nothing matches that.
                </div>
            )}
        </div>
    );
}
