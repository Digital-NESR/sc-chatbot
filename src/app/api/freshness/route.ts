import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import https from 'https';
import http from 'http';

/**
 * When each SAP source was last loaded.
 *
 * The point of this is the failure it prevents. An agent asked "what is
 * outstanding" against a table that has never loaded answers "there are none",
 * and a clean bill of health is the one answer nobody double-checks. A load
 * time on screen makes that visible before it is believed.
 *
 * The app has no connection to materials_db and should not get one - that
 * would mean a second database credential living in Vercel for the sake of a
 * caption. n8n already holds the credential, so a small read-only workflow
 * serves the table and this route relays it.
 */

// Same reason as the chat route: Next's fetch wrapper cannot be given a custom
// SSL agent, and the internal n8n host needs one.
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

const UPSTREAM_TIMEOUT_MS = 10_000;

/** Anything older than this, on a table that is supposed to reload, is worth saying out loud. */
const STALE_AFTER_DAYS = 2;

export interface FreshnessSource {
    table: string;
    /** 'full', 'incremental' or 'static'. Static tables are reference data and do not age. */
    mode: string;
    rows: number | null;
    loadedAt: string | null;
    neverLoaded: boolean;
    daysSince: number | null;
}

export interface FreshnessReport {
    checkedAt: string;
    sources: FreshnessSource[];
    /** Sources that have never loaded at all. The serious case. */
    neverLoaded: string[];
    /** The weakest link: the oldest source that was supposed to have reloaded. */
    stalest: FreshnessSource | null;
    /** The most recent load, which is what "data as of" usually means to a reader. */
    newest: FreshnessSource | null;
    status: 'ok' | 'stale' | 'missing' | 'unknown';
}

/**
 * One report, shared by everyone, for a few minutes.
 *
 * Load times move a handful of times a day, so asking n8n on every page view
 * would be hundreds of pointless queries. Module scope survives between
 * invocations on a warm instance and simply misses on a cold one, which is the
 * right trade for a caption.
 */
let cached: { at: number; report: FreshnessReport } | null = null;
const CACHE_MS = 5 * 60 * 1000;

function fetchUpstream(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const isHttps = parsed.protocol === 'https:';
        const req = (isHttps ? https : http).request(
            {
                hostname: parsed.hostname,
                port: parsed.port || (isHttps ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: 'GET',
                agent: isHttps ? insecureAgent : undefined,
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () =>
                    res.statusCode && res.statusCode >= 200 && res.statusCode < 300
                        ? resolve(data)
                        : reject(new Error(`Freshness webhook returned ${res.statusCode}`)),
                );
            },
        );
        req.setTimeout(UPSTREAM_TIMEOUT_MS, () => req.destroy(new Error('Freshness webhook timed out')));
        req.on('error', reject);
        req.end();
    });
}

interface RawRow {
    source_table?: unknown;
    load_mode?: unknown;
    rows_last_load?: unknown;
    last_loaded_at?: unknown;
    never_loaded?: unknown;
    days_since_load?: unknown;
}

function toNumber(value: unknown): number | null {
    // Postgres bigints arrive as strings through n8n, so a plain cast is not enough.
    const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
    return Number.isFinite(n) ? n : null;
}

function build(rows: RawRow[]): FreshnessReport {
    const sources: FreshnessSource[] = rows
        .filter((r) => typeof r.source_table === 'string')
        .map((r) => ({
            table: String(r.source_table),
            mode: typeof r.load_mode === 'string' ? r.load_mode : 'unknown',
            rows: toNumber(r.rows_last_load),
            loadedAt: typeof r.last_loaded_at === 'string' ? r.last_loaded_at : null,
            neverLoaded: r.never_loaded === true,
            daysSince: toNumber(r.days_since_load),
        }));

    const neverLoaded = sources.filter((s) => s.neverLoaded).map((s) => s.table);

    // Static tables are reference data - plant lists, account mappings. They are
    // loaded once and are not stale at seventeen days, so counting them would
    // raise a warning on every single answer and teach everyone to ignore it.
    const ageing = sources.filter((s) => !s.neverLoaded && s.mode !== 'static' && s.loadedAt);

    const byAge = [...ageing].sort(
        (a, b) => Date.parse(a.loadedAt ?? '') - Date.parse(b.loadedAt ?? ''),
    );
    const stalest = byAge[0] ?? null;
    const newest = byAge[byAge.length - 1] ?? null;

    const status: FreshnessReport['status'] = neverLoaded.length
        ? 'missing'
        : stalest && (stalest.daysSince ?? 0) >= STALE_AFTER_DAYS
          ? 'stale'
          : ageing.length
            ? 'ok'
            : 'unknown';

    return {
        checkedAt: new Date().toISOString(),
        sources,
        neverLoaded,
        stalest,
        newest,
        status,
    };
}

export async function GET() {
    /* Signed in, like every other route here. This one had no check and is
       excluded from the middleware matcher with the rest of /api, so it was
       serving warehouse table names and load times to anyone who asked. */
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const webhook = process.env.N8N_FRESHNESS_WEBHOOK;
    if (!webhook) {
        // Not configured. The caption simply does not appear - it is not worth
        // an error anyone has to act on.
        return NextResponse.json({ error: 'not configured' }, { status: 501 });
    }

    if (cached && Date.now() - cached.at < CACHE_MS) {
        return NextResponse.json(cached.report);
    }

    try {
        const body = await fetchUpstream(webhook);
        const parsed: unknown = JSON.parse(body);
        if (!Array.isArray(parsed)) throw new Error('Freshness webhook did not return a list');

        const report = build(parsed as RawRow[]);
        cached = { at: Date.now(), report };
        return NextResponse.json(report);
    } catch (error) {
        console.error('[/api/freshness]', error);
        // Serve a stale copy rather than nothing: an hour-old load time is far
        // more useful than no load time, and it is labelled with when it was read.
        if (cached) return NextResponse.json(cached.report);
        return NextResponse.json({ error: 'unavailable' }, { status: 503 });
    }
}
