'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, AlertTriangle, Plus, Trash2, RefreshCw, Info, DollarSign, TrendingDown, Zap,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

type Topup = { id: number; occurred_on: string; amount_usd: number; note: string | null };
type Data = {
  ok: boolean;
  reason?: 'no_key' | 'api';
  message?: string;
  window?: { days: number };
  dataAgeSeconds?: number;
  spendToday?: number; spend7?: number; spendWindow?: number;
  byDay?: { date: string; usd: number }[];
  models?: { model: string; usd: number; inTok: number; outTok: number; cacheReadTok: number }[];
  topKeys?: { key: string; tokens: number }[];
  webSearches?: number;
  balance?: {
    toppedUp: number; spentSince: number; remaining: number | null; perDay: number;
    daysLeft: number | null; firstTopup: string | null; windowCoversTopup: boolean;
  };
  topups?: Topup[];
  ledgerError?: string | null;
};

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n < 10 ? 4 : 2 });
const tok = (n: number) =>
  n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);

export default function UsagePage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ amount: '', on: new Date().toISOString().slice(0, 10), note: '' });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/usage?days=${days}`);
      setData(await res.json());
    } catch {
      setData({ ok: false, reason: 'api', message: 'Could not reach the server' });
    } finally {
      setLoading(false);
    }
  }, [days]);

  // The API caches for 60s, which is also Anthropic's recommended poll rate,
  // so refreshing faster than this would only return the same payload.
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const addTopup = async () => {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount === 0) return;
    setAdding(true);
    try {
      await fetch('/api/admin/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_usd: amount, occurred_on: form.on, note: form.note }),
      });
      setForm({ amount: '', on: new Date().toISOString().slice(0, 10), note: '' });
      await load();
    } finally {
      setAdding(false);
    }
  };

  const removeTopup = async (id: number) => {
    await fetch(`/api/admin/usage?id=${id}`, { method: 'DELETE' });
    await load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading usage…
      </div>
    );
  }

  const b = data?.balance;
  const low = b?.daysLeft != null && b.daysLeft < 7;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Anthropic API Cost</h2>
          <p className="text-sm text-slate-500">
            Billed cost and token usage for the organisation.
            {data?.dataAgeSeconds != null && (
              <span className="ml-2 text-slate-400">
                data {data.dataAgeSeconds === 0 ? 'just refreshed' : `${data.dataAgeSeconds}s old`}, auto-refreshes every 60s
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => { setLoading(true); setDays(d); }}
              className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                days === d ? 'bg-[#307c4c] text-white border-[#307c4c]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {d}d
            </button>
          ))}
          <button onClick={load} className="p-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50" title="Refresh">
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>

      {/* Setup / error states */}
      {data?.reason === 'no_key' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">No Admin API key configured.</p>
              <p className="mt-1">
                Add <code className="px-1 bg-amber-100 rounded">ANTHROPIC_ADMIN_KEY</code> to <code className="px-1 bg-amber-100 rounded">.env.local</code> and restart.
                Create one at Console → Settings → Admin keys. It must be an Admin key
                (<code className="px-1 bg-amber-100 rounded">sk-ant-admin01-…</code>) — a workspace key will not work, and the
                Admin API is unavailable to individual accounts.
              </p>
            </div>
          </div>
        </div>
      )}
      {data?.reason === 'api' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div><p className="font-medium">Anthropic API error</p><p className="mt-1">{data.message}</p></div>
          </div>
        </div>
      )}
      {data?.ledgerError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{data.ledgerError}</div>
      )}

      {/* Spend cards */}
      {data?.ok && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card icon={<DollarSign className="w-4 h-4" />} label="Spend today" value={usd(data.spendToday ?? 0)} />
          <Card icon={<DollarSign className="w-4 h-4" />} label="Last 7 days" value={usd(data.spend7 ?? 0)} />
          <Card icon={<DollarSign className="w-4 h-4" />} label={`Last ${days} days`} value={usd(data.spendWindow ?? 0)} />
          <Card
            icon={<TrendingDown className="w-4 h-4" />}
            label="Burn rate"
            value={b?.perDay ? `${usd(b.perDay)}/day` : '—'}
            sub="mean of active days in the last 7"
          />
        </div>
      )}

      {/* Derived balance */}
      {data?.ok && (
        <div className={`rounded-lg border p-5 ${low ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-800">Estimated remaining credit</h3>
                <span className="text-[11px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  derived, not from Anthropic
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-1 max-w-2xl">
                Anthropic exposes no remaining-balance endpoint, so this is your recorded top-ups minus billed
                cost since the first one. It drifts: Priority Tier spend is excluded from the cost API entirely,
                non-API charges never appear, and cost data lags by about five minutes. The Console is the authority.
              </p>
            </div>
            <div className="text-right">
              <div className={`text-3xl font-semibold tabular-nums ${low ? 'text-red-700' : 'text-slate-800'}`}>
                {b?.remaining != null ? usd(b.remaining) : '—'}
              </div>
              {b?.daysLeft != null && (
                <div className={`text-sm mt-1 ${low ? 'text-red-700 font-medium' : 'text-slate-500'}`}>
                  ≈ {b.daysLeft < 1 ? 'under a day' : `${b.daysLeft.toFixed(1)} days`} at current burn
                </div>
              )}
            </div>
          </div>

          {b && !b.windowCoversTopup && (
            <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
              Your earliest top-up ({b.firstTopup}) is older than the {days}-day window, and the cost API returns at
              most 31 days — so spend before that is not counted and the figure above is too high.
            </p>
          )}
          {b?.remaining == null && (
            <p className="mt-3 text-sm text-slate-500">Record a top-up below to start tracking a balance.</p>
          )}

          {/* Ledger */}
          <div className="mt-5 pt-4 border-t border-slate-200">
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-sm">
                <span className="block text-slate-500 mb-1">Amount added (USD)</span>
                <input
                  type="number" step="0.01" value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="500.00"
                  className="w-36 px-3 py-1.5 border border-slate-200 rounded-md"
                />
              </label>
              <label className="text-sm">
                <span className="block text-slate-500 mb-1">Date</span>
                <input
                  type="date" value={form.on}
                  onChange={(e) => setForm({ ...form, on: e.target.value })}
                  className="px-3 py-1.5 border border-slate-200 rounded-md"
                />
              </label>
              <label className="text-sm flex-1 min-w-[180px]">
                <span className="block text-slate-500 mb-1">Note (optional)</span>
                <input
                  type="text" value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="invoice ref, who topped up…"
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-md"
                />
              </label>
              <button
                onClick={addTopup} disabled={adding || !form.amount}
                className="px-3 py-1.5 rounded-md bg-[#307c4c] text-white text-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Record
              </button>
            </div>

            {!!data.topups?.length && (
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2">Date</th><th>Amount</th><th>Note</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.topups.map((t) => (
                    <tr key={t.id} className="border-t border-slate-100">
                      <td className="py-2 tabular-nums">{t.occurred_on}</td>
                      <td className="tabular-nums">{usd(t.amount_usd)}</td>
                      <td className="text-slate-500">{t.note || '—'}</td>
                      <td className="text-right">
                        <button onClick={() => removeTopup(t.id)} className="p-1 text-slate-400 hover:text-red-600" title="Remove">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Daily spend */}
      {data?.ok && !!data.byDay?.length && (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-800 mb-4">Daily spend</h3>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={data.byDay} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(d) => String(d).slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `$${v}`} width={56} />
                <Tooltip formatter={(v) => usd(Number(v) || 0)} labelFormatter={(l) => `Date ${l}`} />
                <Bar dataKey="usd" fill="#307c4c" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* By model */}
      {data?.ok && !!data.models?.length && (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-800 mb-1">By model</h3>
          <p className="text-sm text-slate-500 mb-3">
            Input includes cache writes. Cache reads are shown separately because they are billed at a lower rate.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2">Model</th><th className="text-right">Cost</th>
                <th className="text-right">Input</th><th className="text-right">Cache read</th><th className="text-right">Output</th>
              </tr>
            </thead>
            <tbody>
              {data.models.map((m) => (
                <tr key={m.model} className="border-t border-slate-100">
                  <td className="py-2 font-medium text-slate-700">{m.model}</td>
                  <td className="text-right tabular-nums">{usd(m.usd)}</td>
                  <td className="text-right tabular-nums text-slate-500">{tok(m.inTok)}</td>
                  <td className="text-right tabular-nums text-slate-500">{tok(m.cacheReadTok)}</td>
                  <td className="text-right tabular-nums text-slate-500">{tok(m.outTok)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!!data.webSearches && (
            <p className="mt-3 text-sm text-slate-500 flex items-center gap-1.5">
              <Zap className="w-4 h-4" /> {data.webSearches.toLocaleString()} web search requests in this window.
            </p>
          )}
        </div>
      )}

      {/* By key */}
      {data?.ok && !!data.topKeys?.length && (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-800 mb-1">By API key</h3>
          <p className="text-sm text-slate-500 mb-3">
            Tokens, not cost — the cost endpoint cannot be grouped by key. Give each workflow its own key to split
            spend per agent.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2">Key</th><th className="text-right">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {data.topKeys.map((k) => (
                <tr key={k.key} className="border-t border-slate-100">
                  <td className="py-2 font-mono text-xs text-slate-600">{k.key}</td>
                  <td className="text-right tabular-nums text-slate-500">{tok(k.tokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.ok && (
        <p className="text-xs text-slate-400 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Cost figures are what Anthropic bills, not an estimate — but Priority Tier spend is excluded from the cost
          API, and cost is daily granularity only. Token counts are exact.
        </p>
      )}
    </div>
  );
}

function Card({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-1.5 text-slate-500 text-sm">{icon}{label}</div>
      <div className="text-2xl font-semibold text-slate-800 mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}
