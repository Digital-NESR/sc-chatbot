import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { isAdmin } from '@/lib/admin';
import { poolFor } from '@/lib/columnSources';
import {
  getCost, getCostByWorkspace, getUsage, getApiKeys, getWorkspaces,
  centsToUsd, cached, dayStart,
  AdminKeyMissing, AnthropicError,
  type CostResult, type UsageResult, type TokenType,
} from '@/lib/anthropicUsage';

export const dynamic = 'force-dynamic';

/**
 * Anthropic spend and token usage for /admin/usage.
 *
 * Cost figures are what Anthropic actually bills. The remaining balance is
 * NOT - there is no balance endpoint, so it is derived from top-ups the
 * admin records here minus reported cost since the first one. The page
 * labels it as derived; see db/credit_ledger.sql for why it drifts.
 */

type DayRow = { date: string; usd: number };
type ModelRow = { model: string; usd: number; inTok: number; outTok: number; cacheReadTok: number };

function ledgerPool() {
  // The ledger lives in materials_db beside ai.column_docs.
  return poolFor('track');
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const days = Math.min(31, Math.max(1, Number(new URL(request.url).searchParams.get('days') ?? 30)));
  const now = new Date();
  const endingAt = dayStart(new Date(now.getTime() + 86_400_000)); // through end of today
  const startingAt = dayStart(new Date(now.getTime() - (days - 1) * 86_400_000));

  // Ledger first: it works even when the Admin key is missing, so the page
  // can still render and explain itself rather than showing nothing.
  let topups: { id: number; occurred_on: string; amount_usd: number; note: string | null }[] = [];
  let ledgerError: string | null = null;
  try {
    const { rows } = await ledgerPool().query(
      `SELECT id, occurred_on::text, amount_usd::float8 AS amount_usd, note
       FROM ai.credit_ledger ORDER BY occurred_on DESC, id DESC`,
    );
    topups = rows;
  } catch (e) {
    ledgerError = e instanceof Error && /relation .* does not exist/.test(e.message)
      ? 'ai.credit_ledger not found - apply db/credit_ledger.sql'
      : 'Could not read the credit ledger';
    console.error('credit_ledger read failed:', e);
  }

  try {
    const [
      { value: costBuckets, ageMs },
      { value: usageBuckets },
      { value: wsCostBuckets },
      { value: apiKeys },
      { value: workspaces },
    ] = await Promise.all([
      cached(`cost:${startingAt}:${endingAt}`, () => getCost(startingAt, endingAt)),
      cached(`usage:${startingAt}:${endingAt}`, () => getUsage(startingAt, endingAt, '1d')),
      cached(`wscost:${startingAt}:${endingAt}`, () => getCostByWorkspace(startingAt, endingAt)),
      // Names change rarely, so these ride the same 60s cache rather than
      // getting their own; two extra calls a minute is well inside the limit.
      cached('apikeys', () => getApiKeys()),
      cached('workspaces', () => getWorkspaces()),
    ]);

    const keyName = new Map(apiKeys.map((k) => [k.id, k.name]));
    const wsName = new Map(workspaces.map((w) => [w.id, w.name]));

    const byDay: DayRow[] = costBuckets.map((b) => ({
      date: b.starting_at.slice(0, 10),
      usd: (b.results as CostResult[]).reduce((a, r) => a + centsToUsd(r.amount), 0),
    }));

    // Cost carries the model name only on token rows; web search and code
    // execution arrive with model null and are grouped under their own label.
    const modelUsd = new Map<string, number>();
    for (const b of costBuckets) {
      for (const r of b.results as CostResult[]) {
        const label = r.model ?? (r.cost_type ? r.cost_type.replace(/_/g, ' ') : 'other');
        modelUsd.set(label, (modelUsd.get(label) ?? 0) + centsToUsd(r.amount));
      }
    }

    const modelTok = new Map<string, { inTok: number; outTok: number; cacheReadTok: number }>();
    const keyTok = new Map<string, number>();
    let webSearches = 0;
    for (const b of usageBuckets) {
      for (const r of b.results as UsageResult[]) {
        const m = r.model ?? 'unknown';
        const t = modelTok.get(m) ?? { inTok: 0, outTok: 0, cacheReadTok: 0 };
        const created = (r.cache_creation?.ephemeral_1h_input_tokens ?? 0)
                      + (r.cache_creation?.ephemeral_5m_input_tokens ?? 0);
        t.inTok += (r.uncached_input_tokens ?? 0) + created;
        t.cacheReadTok += r.cache_read_input_tokens ?? 0;
        t.outTok += r.output_tokens ?? 0;
        modelTok.set(m, t);
        webSearches += r.server_tool_use?.web_search_requests ?? 0;

        const k = r.api_key_id ?? 'console / no key';
        keyTok.set(k, (keyTok.get(k) ?? 0)
          + (r.uncached_input_tokens ?? 0) + created + (r.cache_read_input_tokens ?? 0) + (r.output_tokens ?? 0));
      }
    }

    // ---------------------------------------------------------------
    // Cost per API key.
    //
    // cost_report cannot group by key, so this is apportioned - but not
    // guessed. Cost is known per (model, token_type) and tokens are known
    // per (model, key, token_type), so each billed pool is split by the
    // share of the very tokens that produced it. Exact to rounding for
    // token costs.
    //
    // Non-token costs (web search, code execution) carry no key anywhere
    // and are reported separately rather than smeared across keys.
    // ---------------------------------------------------------------
    const TOKEN_FIELD: Record<TokenType, (r: UsageResult) => number> = {
      'uncached_input_tokens': (r) => r.uncached_input_tokens ?? 0,
      'cache_read_input_tokens': (r) => r.cache_read_input_tokens ?? 0,
      'output_tokens': (r) => r.output_tokens ?? 0,
      'cache_creation.ephemeral_1h_input_tokens': (r) => r.cache_creation?.ephemeral_1h_input_tokens ?? 0,
      'cache_creation.ephemeral_5m_input_tokens': (r) => r.cache_creation?.ephemeral_5m_input_tokens ?? 0,
    };

    // tokens[model][token_type][key]
    const pool = new Map<string, Map<string, number>>();
    for (const b of usageBuckets) {
      for (const r of b.results as UsageResult[]) {
        const m = r.model ?? 'unknown';
        for (const tt of Object.keys(TOKEN_FIELD) as TokenType[]) {
          const n = TOKEN_FIELD[tt](r);
          if (!n) continue;
          const slot = `${m}\u0000${tt}`;
          const inner = pool.get(slot) ?? new Map<string, number>();
          const k = r.api_key_id ?? 'console / no key';
          inner.set(k, (inner.get(k) ?? 0) + n);
          pool.set(slot, inner);
        }
      }
    }

    const keyUsd = new Map<string, number>();
    let unattributedUsd = 0;
    for (const b of costBuckets) {
      for (const r of b.results as CostResult[]) {
        const amount = centsToUsd(r.amount);
        if (!amount) continue;
        if (r.cost_type !== 'tokens' || !r.model || !r.token_type) {
          unattributedUsd += amount;
          continue;
        }
        const inner = pool.get(`${r.model}\u0000${r.token_type}`);
        const total = inner ? [...inner.values()].reduce((a, v) => a + v, 0) : 0;
        if (!inner || total <= 0) {
          // Cost with no matching tokens: keep it in the total rather than
          // dropping it, so the per-key figures never silently undercount.
          unattributedUsd += amount;
          continue;
        }
        for (const [k, n] of inner) {
          keyUsd.set(k, (keyUsd.get(k) ?? 0) + amount * (n / total));
        }
      }
    }

    const models: ModelRow[] = [...new Set([...modelUsd.keys(), ...modelTok.keys()])]
      .map((m) => ({
        model: m,
        usd: modelUsd.get(m) ?? 0,
        inTok: modelTok.get(m)?.inTok ?? 0,
        outTok: modelTok.get(m)?.outTok ?? 0,
        cacheReadTok: modelTok.get(m)?.cacheReadTok ?? 0,
      }))
      .sort((a, b) => b.usd - a.usd || b.inTok - a.inTok);

    const today = new Date().toISOString().slice(0, 10);
    const spendToday = byDay.find((d) => d.date === today)?.usd ?? 0;
    const spendWindow = byDay.reduce((a, d) => a + d.usd, 0);
    const spend7 = byDay.slice(-7).reduce((a, d) => a + d.usd, 0);

    // Derived balance. Only days from the first top-up onward count, and the
    // cost window is capped at 31 days by the API, so a top-up older than
    // that cannot be fully accounted for - flagged rather than silently wrong.
    const firstTopup = topups.length ? topups[topups.length - 1].occurred_on : null;
    const toppedUp = topups.reduce((a, t) => a + t.amount_usd, 0);
    const spentSince = firstTopup
      ? byDay.filter((d) => d.date >= firstTopup).reduce((a, d) => a + d.usd, 0)
      : 0;
    const windowCoversTopup = !firstTopup || firstTopup >= startingAt.slice(0, 10);
    const remaining = topups.length ? toppedUp - spentSince : null;

    // Burn rate from the days that actually have spend, so a run of zeroes
    // before the agents went live does not flatter the projection.
    const active = byDay.slice(-7).filter((d) => d.usd > 0);
    const perDay = active.length ? active.reduce((a, d) => a + d.usd, 0) / active.length : 0;
    const daysLeft = remaining !== null && perDay > 0 ? remaining / perDay : null;

    return NextResponse.json({
      ok: true,
      window: { days, startingAt, endingAt },
      dataAgeSeconds: Math.round(ageMs / 1000),
      spendToday, spend7, spendWindow,
      byDay, models,
      byKey: [...new Set([...keyTok.keys(), ...keyUsd.keys()])]
        .map((id) => ({
          id,
          // An id with no name is usually a key from another org, or one
          // archived since. Shown raw rather than hidden.
          name: keyName.get(id) ?? (id === 'console / no key' ? 'Console / no key' : id),
          named: keyName.has(id),
          tokens: keyTok.get(id) ?? 0,
          usd: keyUsd.get(id) ?? 0,
        }))
        .sort((a, b) => b.usd - a.usd || b.tokens - a.tokens),
      byWorkspace: (() => {
        const m = new Map<string, number>();
        for (const b of wsCostBuckets) {
          for (const r of b.results as CostResult[]) {
            const id = r.workspace_id ?? 'default';
            m.set(id, (m.get(id) ?? 0) + centsToUsd(r.amount));
          }
        }
        return [...m.entries()]
          .map(([id, usd]) => ({
            id,
            name: id === 'default' ? 'Default workspace' : (wsName.get(id) ?? id),
            usd,
          }))
          .sort((a, b) => b.usd - a.usd);
      })(),
      unattributedUsd,
      webSearches,
      balance: {
        toppedUp, spentSince, remaining, perDay,
        daysLeft, firstTopup, windowCoversTopup,
        derived: true,
      },
      topups, ledgerError,
    });
  } catch (e) {
    if (e instanceof AdminKeyMissing) {
      return NextResponse.json({ ok: false, reason: 'no_key', topups, ledgerError }, { status: 200 });
    }
    if (e instanceof AnthropicError) {
      return NextResponse.json({ ok: false, reason: 'api', message: e.message, topups, ledgerError }, { status: 200 });
    }
    console.error('usage fetch failed:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { occurred_on?: string; amount_usd?: number | string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const amount = Number(body.amount_usd);
  const on = String(body.occurred_on || '').slice(0, 10);

  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: 'amount_usd must be a non-zero number' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) {
    return NextResponse.json({ error: 'occurred_on must be YYYY-MM-DD' }, { status: 400 });
  }

  const { rows } = await ledgerPool().query(
    `INSERT INTO ai.credit_ledger (occurred_on, amount_usd, note, created_by)
     VALUES ($1::date, $2, $3, $4)
     RETURNING id, occurred_on::text, amount_usd::float8 AS amount_usd, note`,
    [on, amount, String(body.note || '').slice(0, 200) || null, session?.user?.email || 'unknown'],
  );
  return NextResponse.json({ ok: true, topup: rows[0] });
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }
  await ledgerPool().query(`DELETE FROM ai.credit_ledger WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
