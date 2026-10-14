/**
 * Anthropic Usage and Cost Admin API client.
 *
 * Two endpoints, both requiring an Admin key (sk-ant-admin01-...). A
 * workspace key will not work, and the Admin API is unavailable to
 * individual accounts - it needs an organisation.
 *
 * WHAT THESE NUMBERS ARE
 *   cost   - USD actually billed, not an estimate. Returned in CENTS as a
 *            decimal string, so "123.45" means $1.2345.
 *   usage  - exact token counts, better than counting response tokens.
 *
 * WHAT THEY ARE NOT
 *   There is no remaining-balance endpoint. Priority Tier spend is also
 *   excluded from the cost endpoint altogether. See db/credit_ledger.sql.
 *
 * Anthropic asks for at most one poll per minute, so every response here
 * is cached for 60s and shared across requests.
 */

const BASE = 'https://api.anthropic.com/v1/organizations';
const VERSION = '2023-06-01';

/**
 * The five token_type values are the join key between cost and usage:
 * cost_report grouped by description reports USD per (model, token_type),
 * and usage_report grouped by model + api_key_id reports tokens per
 * (model, key, token_type). That lets cost be apportioned to a key by its
 * share of the tokens that were actually billed, rather than guessed at.
 */
export type TokenType =
  | 'uncached_input_tokens'
  | 'cache_read_input_tokens'
  | 'output_tokens'
  | 'cache_creation.ephemeral_1h_input_tokens'
  | 'cache_creation.ephemeral_5m_input_tokens';

export type CostResult = {
  amount: string; // cents, decimal string
  currency: string;
  description: string | null;
  model: string | null;
  cost_type: 'code_execution' | 'session_usage' | 'tokens' | 'web_search' | null;
  token_type: TokenType | null;
  service_tier: 'batch' | 'standard' | null;
  workspace_id: string | null;
};

export type ApiKeyInfo = {
  id: string;
  name: string;
  status: 'active' | 'archived' | 'expired' | 'inactive';
  scope?: { type: 'workspace'; workspace_id: string } | { type: 'organization' };
  workspace_id: string | null;
};

export type WorkspaceInfo = { id: string; name: string };

export type UsageResult = {
  model: string | null;
  api_key_id: string | null;
  workspace_id: string | null;
  service_tier: string | null;
  uncached_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
  cache_creation: { ephemeral_1h_input_tokens: number; ephemeral_5m_input_tokens: number };
  server_tool_use: { web_search_requests: number };
};

type Bucket<T> = { starting_at: string; ending_at: string; results: T[] };
type Page<T> = { data: Bucket<T>[]; has_more: boolean; next_page: string | null };

export class AdminKeyMissing extends Error {}
export class AnthropicError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function adminKey(): string {
  const k = process.env.ANTHROPIC_ADMIN_KEY;
  if (!k) throw new AdminKeyMissing('ANTHROPIC_ADMIN_KEY is not set');
  return k;
}

/** Follows next_page to the end. Both endpoints cap a page at `limit` buckets. */
async function fetchAll<T>(path: string, params: URLSearchParams): Promise<Bucket<T>[]> {
  const key = adminKey();
  const out: Bucket<T>[] = [];
  let page: string | null = null;

  // Bounded rather than while(true): a cursor that never clears would
  // otherwise spin forever against a paid API.
  for (let i = 0; i < 20; i++) {
    const q = new URLSearchParams(params);
    if (page) q.set('page', page);

    const res = await fetch(`${BASE}/${path}?${q.toString()}`, {
      headers: {
        'x-api-key': key,
        'anthropic-version': VERSION,
        'User-Agent': 'NESR-SupplyChainAI/1.0 (admin usage dashboard)',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // The key itself is never echoed back into the message.
      throw new AnthropicError(
        res.status === 401 || res.status === 403
          ? 'Admin key rejected. It must be an Admin key (sk-ant-admin01-...), not a workspace key.'
          : `Anthropic API returned ${res.status}. ${body.slice(0, 300)}`,
        res.status,
      );
    }

    const json = (await res.json()) as Page<T>;
    out.push(...(json.data || []));
    if (!json.has_more || !json.next_page) break;
    page = json.next_page;
  }
  return out;
}

/** Cents-as-decimal-string -> dollars. */
export function centsToUsd(amount: string): number {
  const n = Number.parseFloat(amount);
  return Number.isFinite(n) ? n / 100 : 0;
}

export function dayStart(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

export async function getCost(startingAt: string, endingAt: string) {
  const p = new URLSearchParams({ starting_at: startingAt, ending_at: endingAt, bucket_width: '1d', limit: '31' });
  p.append('group_by[]', 'description');
  return fetchAll<CostResult>('cost_report', p);
}

/**
 * Cost per workspace. A separate call because group_by on cost_report
 * accepts only 'description' and 'workspace_id', and description grouping
 * is what carries model and token_type. This one is REAL cost per
 * workspace, not apportioned.
 */
export async function getCostByWorkspace(startingAt: string, endingAt: string) {
  const p = new URLSearchParams({ starting_at: startingAt, ending_at: endingAt, bucket_width: '1d', limit: '31' });
  p.append('group_by[]', 'workspace_id');
  return fetchAll<CostResult>('cost_report', p);
}

/**
 * Names for the opaque ids the usage report returns. Paginated with
 * after_id rather than the next_page cursor the reporting endpoints use.
 */
async function listAll<T extends { id: string }>(path: string, extra?: Record<string, string>): Promise<T[]> {
  const key = adminKey();
  const out: T[] = [];
  let after: string | null = null;

  for (let i = 0; i < 20; i++) {
    const q = new URLSearchParams({ limit: '1000', ...(extra ?? {}) });
    if (after) q.set('after_id', after);

    const res = await fetch(`${BASE}/${path}?${q.toString()}`, {
      headers: {
        'x-api-key': key,
        'anthropic-version': VERSION,
        'User-Agent': 'NESR-SupplyChainAI/1.0 (admin usage dashboard)',
      },
      cache: 'no-store',
    });
    // A naming lookup must never take the whole dashboard down: on failure
    // the caller falls back to showing raw ids.
    if (!res.ok) return out;

    const json = (await res.json()) as { data: T[]; has_more: boolean; last_id: string | null };
    out.push(...(json.data || []));
    if (!json.has_more || !json.last_id) break;
    after = json.last_id;
  }
  return out;
}

export function getApiKeys() {
  return listAll<ApiKeyInfo>('api_keys');
}

export function getWorkspaces() {
  return listAll<WorkspaceInfo>('workspaces');
}

export async function getUsage(startingAt: string, endingAt: string, bucket: '1d' | '1h') {
  const p = new URLSearchParams({
    starting_at: startingAt,
    ending_at: endingAt,
    bucket_width: bucket,
    limit: bucket === '1d' ? '31' : '168',
  });
  p.append('group_by[]', 'model');
  p.append('group_by[]', 'api_key_id');
  return fetchAll<UsageResult>('usage_report/messages', p);
}

/** 60-second shared cache, matching Anthropic's recommended poll rate. */
const cache = new Map<string, { at: number; value: unknown }>();
const TTL_MS = 60_000;

export async function cached<T>(key: string, fn: () => Promise<T>): Promise<{ value: T; ageMs: number }> {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < TTL_MS) {
    return { value: hit.value as T, ageMs: now - hit.at };
  }
  const value = await fn();
  cache.set(key, { at: now, value });
  return { value, ageMs: 0 };
}
