'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2, Search, Check, AlertCircle, Database, Table2 } from 'lucide-react';

type Column = { name: string; type: string; description: string };
type TableInfo = { name: string; loadMode: string; columns: Column[] };

// Markers the agent is told to act on, so they are worth surfacing here too.
function marker(description: string): 'unused' | 'unverified' | null {
    if (/^UNUSED:/.test(description)) return 'unused';
    if (/UNVERIFIED/.test(description)) return 'unverified';
    return null;
}

export default function ColumnDictionary() {
    const [tables, setTables] = useState<TableInfo[]>([]);
    const [total, setTotal] = useState(0);
    const [described, setDescribed] = useState(0);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<string>('');
    const [search, setSearch] = useState('');
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [status, setStatus] = useState<Record<string, 'saving' | 'saved' | 'error' | undefined>>({});

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/admin/columns');
                const data = await res.json();
                if (data.tables) {
                    setTables(data.tables);
                    setTotal(data.total);
                    setDescribed(data.described);
                    setSelected(data.tables[0]?.name || '');
                }
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const table = useMemo(() => tables.find((t) => t.name === selected), [tables, selected]);

    const visible = useMemo(() => {
        if (!table) return [];
        const q = search.trim().toLowerCase();
        if (!q) return table.columns;
        return table.columns.filter(
            (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
        );
    }, [table, search]);

    const key = (col: string) => `${selected}.${col}`;

    const save = useCallback(
        async (column: string, description: string) => {
            // Built inline rather than via the key() helper: that helper is
            // recreated every render, so depending on it would rebuild this
            // callback on every keystroke.
            const k = `${selected}.${column}`;
            setStatus((s) => ({ ...s, [k]: 'saving' }));
            try {
                const res = await fetch('/api/admin/columns', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ table: selected, column, description }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Save failed');

                // Trust the value read back from the database, not the draft.
                setTables((prev) =>
                    prev.map((t) =>
                        t.name !== selected
                            ? t
                            : {
                                  ...t,
                                  columns: t.columns.map((c) =>
                                      c.name === column ? { ...c, description: data.description } : c,
                                  ),
                              },
                    ),
                );
                setDrafts((d) => {
                    const next = { ...d };
                    delete next[k];
                    return next;
                });
                setDescribed((n) => {
                    const was = table?.columns.find((c) => c.name === column)?.description;
                    if (!was && data.description) return n + 1;
                    if (was && !data.description) return n - 1;
                    return n;
                });
                setStatus((s) => ({ ...s, [k]: 'saved' }));
                setTimeout(() => setStatus((s) => ({ ...s, [k]: undefined })), 2000);
            } catch {
                setStatus((s) => ({ ...s, [k]: 'error' }));
            }
        },
        [selected, table],
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading column dictionary…
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                            <Database className="w-5 h-5 text-[#307c4c]" />
                            Column Dictionary
                        </h2>
                        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
                            What each column means, as the Materials AI agent reads it. Saving takes
                            effect immediately — the agent looks these up on its next query, and they
                            are replayed automatically after every daily reload.
                        </p>
                    </div>
                    <div className="text-right shrink-0">
                        <div className="text-2xl font-semibold text-slate-900">
                            {described}
                            <span className="text-slate-400 text-lg"> / {total}</span>
                        </div>
                        <div className="text-xs text-slate-500">columns described</div>
                    </div>
                </div>
            </div>

            <div className="flex gap-4 items-start">
                {/* Tables */}
                <nav className="w-64 shrink-0 bg-white rounded-lg border border-slate-200 overflow-hidden">
                    {tables.map((t) => {
                        const n = t.columns.filter((c) => c.description).length;
                        const active = t.name === selected;
                        return (
                            <button
                                key={t.name}
                                onClick={() => {
                                    setSelected(t.name);
                                    setSearch('');
                                }}
                                className={`w-full text-left px-3 py-2.5 border-b border-slate-100 last:border-0 transition-colors ${
                                    active ? 'bg-[#307c4c]/10 border-l-2 border-l-[#307c4c]' : 'hover:bg-slate-50'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <Table2 className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-[#307c4c]' : 'text-slate-400'}`} />
                                    <span className={`text-sm truncate ${active ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                                        {t.name}
                                    </span>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5 pl-5.5">
                                    {n}/{t.columns.length} described
                                    {t.loadMode === 'incremental' && (
                                        <span className="ml-1.5 text-amber-600">· incremental</span>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </nav>

                {/* Columns */}
                <section className="flex-1 bg-white rounded-lg border border-slate-200 min-w-0">
                    <div className="p-3 border-b border-slate-200 flex items-center gap-2">
                        <Search className="w-4 h-4 text-slate-400 shrink-0" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={`Filter ${table?.columns.length || 0} columns…`}
                            className="flex-1 text-sm outline-none placeholder:text-slate-400"
                        />
                        <span className="text-xs text-slate-400 shrink-0">{visible.length} shown</span>
                    </div>

                    <div className="divide-y divide-slate-100 max-h-[calc(100vh-18rem)] overflow-y-auto">
                        {visible.map((c) => {
                            const k = key(c.name);
                            const draft = drafts[k];
                            const value = draft !== undefined ? draft : c.description;
                            const dirty = draft !== undefined && draft !== c.description;
                            const st = status[k];
                            const m = marker(c.description);

                            return (
                                <div key={c.name} className="p-3 hover:bg-slate-50/50">
                                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                        <code className="text-sm font-semibold text-slate-900">{c.name}</code>
                                        <span className="text-[11px] text-slate-500 px-1.5 py-0.5 bg-slate-100 rounded">
                                            {c.type}
                                        </span>
                                        {m === 'unused' && (
                                            <span className="text-[11px] text-slate-600 px-1.5 py-0.5 bg-slate-200 rounded">
                                                unused
                                            </span>
                                        )}
                                        {m === 'unverified' && (
                                            <span className="text-[11px] text-amber-700 px-1.5 py-0.5 bg-amber-100 rounded">
                                                unverified
                                            </span>
                                        )}
                                        {!c.description && (
                                            <span className="text-[11px] text-red-600 px-1.5 py-0.5 bg-red-50 rounded">
                                                no description
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex gap-2 items-start">
                                        <textarea
                                            value={value}
                                            onChange={(e) => setDrafts((d) => ({ ...d, [k]: e.target.value }))}
                                            onKeyDown={(e) => {
                                                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && dirty) {
                                                    save(c.name, value);
                                                }
                                            }}
                                            rows={2}
                                            placeholder="Describe what this column holds…"
                                            className="flex-1 text-sm border border-slate-200 rounded px-2 py-1.5 resize-y
                                                       focus:outline-none focus:ring-1 focus:ring-[#307c4c] focus:border-[#307c4c]
                                                       placeholder:text-slate-400"
                                        />
                                        <div className="w-20 shrink-0 flex flex-col items-end gap-1">
                                            <button
                                                onClick={() => save(c.name, value)}
                                                disabled={!dirty || st === 'saving'}
                                                className="text-xs px-2.5 py-1.5 rounded bg-[#307c4c] text-white
                                                           disabled:bg-slate-200 disabled:text-slate-400 transition-colors
                                                           hover:bg-[#276340] disabled:cursor-not-allowed w-full"
                                            >
                                                {st === 'saving' ? '…' : 'Save'}
                                            </button>
                                            {st === 'saved' && (
                                                <span className="text-[11px] text-green-600 flex items-center gap-0.5">
                                                    <Check className="w-3 h-3" /> live
                                                </span>
                                            )}
                                            {st === 'error' && (
                                                <span className="text-[11px] text-red-600 flex items-center gap-0.5">
                                                    <AlertCircle className="w-3 h-3" /> failed
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {visible.length === 0 && (
                            <div className="p-8 text-center text-sm text-slate-500">No columns match that filter.</div>
                        )}
                    </div>
                </section>
            </div>

            <p className="text-xs text-slate-500 px-1">
                Prefix a description with <code className="bg-slate-100 px-1 rounded">UNUSED:</code> when a
                column is empty or constant, so the agent avoids filtering on it. Include the word{' '}
                <code className="bg-slate-100 px-1 rounded">UNVERIFIED</code> when the meaning is inferred
                rather than confirmed, and the agent will caveat anything it concludes from it.
                Ctrl/Cmd+Enter saves.
            </p>
        </div>
    );
}
