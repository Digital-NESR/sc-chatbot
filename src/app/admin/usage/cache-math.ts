/**
 * The arithmetic behind the Caching tab, kept out of the component so it can be
 * read and corrected without touching any JSX.
 *
 * Everything here runs in the browser on a file the admin picked. Nothing is
 * uploaded and nothing is stored.
 */

/** $ per million tokens, base input and output, per model. */
type Price = { input: number; output: number };

/**
 * Prices are per MTok. Cache write (5m) bills at 1.25x input, cache write (1h)
 * at 2x, and a cache read at 0.1x - those multipliers are the same on every
 * model here, so they live in the maths below rather than in this table.
 *
 * A model missing from this table is NOT priced at zero. It is counted in the
 * token totals, listed in `unpricedModels`, and left out of every money figure,
 * because a silent zero would quietly understate the bill and nobody would
 * notice. Add a row when a new model appears rather than letting it stay out.
 */
export const PRICES: Record<string, Price> = {
    'claude-sonnet-4-5-20250929': { input: 3.0, output: 15.0 },
    'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
    'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
    'claude-haiku-4-5': { input: 1.0, output: 5.0 },
    'claude-haiku-5-5': { input: 0.1, output: 0.5 },
    'claude-sonnet-5-5': { input: 2.0, output: 10.0 },
    'claude-opus-5-5': { input: 4.0, output: 20.0 },
};

export const CACHE_WRITE_5M = 1.25;
export const CACHE_WRITE_1H = 2.0;
export const CACHE_READ = 0.1;

export type Row = {
    hour: string;          // ISO-ish bucket label, as the export gives it
    model: string;
    apiKey: string;
    workspace: string;
    noCache: number;
    write5m: number;
    write1h: number;
    read: number;
    output: number;
};

/** Header aliases, so a column rename in the export does not break the page. */
const FIELDS: Record<keyof Omit<Row, never>, string[]> = {
    hour: ['usage_date_utc', 'date', 'bucket', 'timestamp'],
    model: ['model_version', 'model'],
    apiKey: ['api_key', 'api_key_name', 'key'],
    workspace: ['workspace', 'workspace_name'],
    noCache: ['usage_input_tokens_no_cache', 'input_tokens_no_cache', 'uncached_input_tokens'],
    write5m: ['usage_input_tokens_cache_write_5m', 'cache_creation_input_tokens_5m', 'cache_write_5m'],
    write1h: ['usage_input_tokens_cache_write_1h', 'cache_creation_input_tokens_1h', 'cache_write_1h'],
    read: ['usage_input_tokens_cache_read', 'cache_read_input_tokens', 'cache_read'],
    output: ['usage_output_tokens', 'output_tokens'],
};

export type ParseResult =
    | { ok: true; rows: Row[]; skipped: number }
    | { ok: false; error: string };

const num = (v: string | undefined): number => {
    if (!v) return 0;
    const n = Number(v.replace(/[, ]/g, ''));
    return Number.isFinite(n) ? n : 0;
};

/**
 * Parses the Console export. Accepts tab- or comma-separated, because the
 * export copies out of a spreadsheet as tabs and downloads as commas, and an
 * admin should not have to know which one they have.
 */
export function parseUsage(text: string): ParseResult {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim().length);
    if (lines.length < 2) return { ok: false, error: 'Needs a header row and at least one data row.' };

    const delim = (lines[0].match(/\t/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? '\t' : ',';
    const header = lines[0].split(delim).map((h) => h.trim().toLowerCase().replace(/^﻿/, ''));

    const idx: Partial<Record<keyof Row, number>> = {};
    (Object.keys(FIELDS) as (keyof Row)[]).forEach((field) => {
        const i = header.findIndex((h) => FIELDS[field].includes(h));
        if (i >= 0) idx[field] = i;
    });

    const missing = (['hour', 'model', 'read', 'output'] as (keyof Row)[]).filter((f) => idx[f] === undefined);
    if (missing.length) {
        return {
            ok: false,
            error:
                `Could not find ${missing.join(', ')} in the header. ` +
                `Export the Usage report from the Claude Console with the per-model token columns included.`,
        };
    }

    const rows: Row[] = [];
    let skipped = 0;
    for (const line of lines.slice(1)) {
        const c = line.split(delim);
        const at = (f: keyof Row) => (idx[f] === undefined ? undefined : c[idx[f]!]?.trim());
        const hour = at('hour');
        if (!hour) { skipped++; continue; }
        rows.push({
            hour,
            model: at('model') || 'unknown',
            apiKey: at('apiKey') || 'unknown',
            workspace: at('workspace') || '',
            noCache: num(at('noCache')),
            write5m: num(at('write5m')),
            write1h: num(at('write1h')),
            read: num(at('read')),
            output: num(at('output')),
        });
    }
    if (!rows.length) return { ok: false, error: 'No usable data rows.' };
    return { ok: true, rows, skipped };
}

export type Totals = {
    noCache: number; write5m: number; write1h: number; read: number; output: number;
    totalInput: number;
    hitRate: number;          // cache reads as a share of all input
    actual: number;           // $ as billed
    uncached: number;         // $ if the same prefixes had been sent uncached
    saved: number;
    pricedShare: number;      // share of input tokens we could price
    unpricedModels: string[];
};

const sum = (rows: Row[], f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0);

/**
 * The counterfactual is "no caching at all", not "cache misses". Without a cache
 * every token that is read from one would have been sent as ordinary input, and
 * the writes would not have carried their premium - so both collapse to the base
 * input rate. That is the honest comparison; pricing reads at zero instead would
 * flatter the result.
 */
export function totals(rows: Row[]): Totals {
    const t = {
        noCache: sum(rows, (r) => r.noCache),
        write5m: sum(rows, (r) => r.write5m),
        write1h: sum(rows, (r) => r.write1h),
        read: sum(rows, (r) => r.read),
        output: sum(rows, (r) => r.output),
    };
    const totalInput = t.noCache + t.write5m + t.write1h + t.read;

    let actual = 0;
    let uncached = 0;
    let pricedInput = 0;
    const unpriced = new Set<string>();

    for (const r of rows) {
        const p = PRICES[r.model];
        const rowInput = r.noCache + r.write5m + r.write1h + r.read;
        if (!p) { unpriced.add(r.model); continue; }
        pricedInput += rowInput;
        actual +=
            (r.noCache * p.input +
                r.write5m * p.input * CACHE_WRITE_5M +
                r.write1h * p.input * CACHE_WRITE_1H +
                r.read * p.input * CACHE_READ +
                r.output * p.output) / 1e6;
        uncached += (rowInput * p.input + r.output * p.output) / 1e6;
    }

    return {
        ...t,
        totalInput,
        hitRate: totalInput ? t.read / totalInput : 0,
        actual,
        uncached,
        saved: uncached - actual,
        pricedShare: totalInput ? pricedInput / totalInput : 1,
        unpricedModels: [...unpriced].sort(),
    };
}

export type HourBucket = {
    hour: string;
    read: number; write: number; noCache: number; output: number;
    totalInput: number;
    flagged: boolean;
};

/**
 * Flags stretches that look machine-driven rather than human.
 *
 * The signal is not "high" - a busy afternoon is high. It is high AND flat:
 * real traffic dips for lunch and meetings, so an hourly series that holds its
 * level to within a few percent for hours on end is something running on a
 * timer. The 1 Nov 2026 spike sat at a 3.3% coefficient of variation across
 * nine hours, which is what this threshold is set against.
 *
 * Deliberately a hint, not a verdict: it marks the window for a human to look
 * at, and the table underneath always shows the raw numbers.
 */
export function bucketByHour(
    rows: Row[],
    opts = { window: 5, maxCoV: 0.08, minPeakShare: 0.5 },
): HourBucket[] {
    const map = new Map<string, HourBucket>();
    for (const r of rows) {
        const b = map.get(r.hour) ?? {
            hour: r.hour, read: 0, write: 0, noCache: 0, output: 0, totalInput: 0, flagged: false,
        };
        b.read += r.read;
        b.write += r.write5m + r.write1h;
        b.noCache += r.noCache;
        b.output += r.output;
        b.totalInput = b.read + b.write + b.noCache;
        map.set(r.hour, b);
    }

    const buckets = [...map.values()].sort(
        (a, b) => new Date(a.hour).getTime() - new Date(b.hour).getTime() || a.hour.localeCompare(b.hour),
    );
    if (buckets.length < opts.window) return buckets;

    // Measured against the day's PEAK, not its median.
    //
    // The obvious test - "well above the median" - is the one that does not
    // work, and it fails in exactly the case this is for. On 1 Nov 2026 the
    // flat stretch ran nine of the thirteen hours, so the median sat inside the
    // plateau at 21.4M and no window could ever reach twice it. The run that
    // should have been caught was the run that defeated the threshold.
    //
    // Against the peak it behaves: a plateau is by definition near the day's
    // maximum, while a flat quiet night is a fraction of it and stays unflagged.
    const peak = Math.max(...buckets.map((b) => b.totalInput), 0);

    for (let i = 0; i + opts.window <= buckets.length; i++) {
        const win = buckets.slice(i, i + opts.window);
        const vals = win.map((b) => b.totalInput);
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        if (!mean || mean < peak * opts.minPeakShare) continue;
        const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length);
        if (sd / mean < opts.maxCoV) win.forEach((b) => { b.flagged = true; });
    }
    return buckets;
}

export type KeyBucket = { label: string; model: string; read: number; totalInput: number; cost: number | null };

/**
 * Groups by API key and model. This is as fine as the export goes - it has no
 * column for which workflow or agent made the call, so an account where several
 * bots share one key cannot be split further here. Saying so on the page is
 * better than drawing a chart that implies a precision the data does not have.
 */
export function bucketByKey(rows: Row[]): KeyBucket[] {
    const map = new Map<string, KeyBucket>();
    for (const r of rows) {
        const label = r.apiKey + (r.workspace ? ` · ${r.workspace}` : '');
        const id = `${label}::${r.model}`;
        const b = map.get(id) ?? { label, model: r.model, read: 0, totalInput: 0, cost: 0 };
        const p = PRICES[r.model];
        b.read += r.read;
        b.totalInput += r.noCache + r.write5m + r.write1h + r.read;
        if (!p) b.cost = null;
        else if (b.cost !== null) {
            b.cost +=
                (r.noCache * p.input +
                    r.write5m * p.input * CACHE_WRITE_5M +
                    r.write1h * p.input * CACHE_WRITE_1H +
                    r.read * p.input * CACHE_READ +
                    r.output * p.output) / 1e6;
        }
        map.set(id, b);
    }
    return [...map.values()].sort((a, b) => b.totalInput - a.totalInput);
}
