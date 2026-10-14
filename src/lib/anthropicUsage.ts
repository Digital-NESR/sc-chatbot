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

export type CostResult = {
  amount: string; // cents, decimal string
  currency: string;
  description: string | null;
  model: string | null;
  cost_type: 'code_execution' | 'session_usage' | 'tokens' | 'web_search' | null;
  service_tier: 'batch' | 'standard' | null;
  workspace_id: string | null;
};

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
