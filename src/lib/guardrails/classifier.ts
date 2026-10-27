/**
 * The second opinion, when the patterns alone are not enough.
 *
 * Regexes catch the phrasings people type; they do not catch someone who
 * rephrases, and they fire on ordinary questions that happen to contain the
 * word "ignore". A model reads the message and says which it is.
 *
 * It runs on a message ANOTHER rule has already flagged, and only while the
 * `classifier` rule is not Off. That is what keeps it affordable: on the
 * traffic measured so far it would run on about one message in two thousand,
 * at roughly a tenth of a cent each.
 *
 * Fails open, loudly. If the webhook is unset, slow, unreachable or answers
 * with something unparseable, this returns null and the heuristic verdict
 * stands on its own. A classifier that can refuse a question by failing would
 * be a new way for the product to break, which is the opposite of the point.
 */

import https from 'https';
import http from 'http';

/** Same reason as the chat route: the internal n8n host has a self-signed cert. */
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

/** Short on purpose. This sits in front of an answer, so it may not dawdle. */
const TIMEOUT_MS = 8_000;

/** Enough for the JSON it is asked for, and not enough to be worth streaming. */
const MAX_BODY = 8_000;

export interface Classification {
    verdict: 'benign' | 'suspicious' | 'attack';
    category: string;
    confidence: number;
    reason: string;
}

function post(url: string, body: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const isHttps = parsed.protocol === 'https:';
        const lib = isHttps ? https : http;

        const req = lib.request(
            {
                hostname: parsed.hostname,
                port: parsed.port || (isHttps ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                    ...(process.env.N8N_SHARED_SECRET
                        ? { 'X-SCAI-Secret': process.env.N8N_SHARED_SECRET }
                        : {}),
                },
                agent: isHttps ? insecureAgent : undefined,
            },
            res => {
                let data = '';
                res.on('data', (c: Buffer) => {
                    if (data.length < MAX_BODY) data += c.toString('utf8');
                });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(`classifier returned ${res.statusCode}`));
                    } else {
                        resolve(data);
                    }
                });
            },
        );

        req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('classifier timed out')));
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

/** The model is asked for bare JSON and mostly obliges. This handles the rest. */
function parse(raw: string): Classification | null {
    let text = raw.trim();

    // n8n wraps the agent's reply; the shape depends on the responding node.
    try {
        const outer = JSON.parse(text) as unknown;
        if (outer && typeof outer === 'object') {
            const o = outer as Record<string, unknown>;
            if (typeof o.verdict === 'string') return normalise(o);
            for (const key of ['output', 'text', 'response', 'message']) {
                if (typeof o[key] === 'string') {
                    text = o[key] as string;
                    break;
                }
            }
        }
    } catch {
        // Not JSON at the top level. Fall through to the fence stripping below.
    }

    // A code fence around the JSON, which the prompt forbids and models add anyway.
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) text = fenced[1].trim();

    // Or prose with the object somewhere inside it.
    if (!text.startsWith('{')) {
        const brace = text.match(/\{[\s\S]*\}/);
        if (brace) text = brace[0];
    }

    try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        return typeof parsed.verdict === 'string' ? normalise(parsed) : null;
    } catch {
        return null;
    }
}

function normalise(o: Record<string, unknown>): Classification | null {
    const verdict = String(o.verdict);
    if (verdict !== 'benign' && verdict !== 'suspicious' && verdict !== 'attack') return null;
    const confidence = Number(o.confidence);
    return {
        verdict,
        category: typeof o.category === 'string' ? o.category.slice(0, 40) : 'none',
        confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
        reason: typeof o.reason === 'string' ? o.reason.slice(0, 300) : '',
    };
}

export async function classify(message: string): Promise<Classification | null> {
    const webhook = process.env.N8N_GUARDRAIL_WEBHOOK;
    if (!webhook) {
        console.warn('[guardrails] classifier is on but N8N_GUARDRAIL_WEBHOOK is unset');
        return null;
    }

    try {
        const raw = await post(webhook, JSON.stringify({ message }));
        const result = parse(raw);
        if (!result) {
            console.error('[guardrails] could not read the classifier reply:', raw.slice(0, 300));
        }
        return result;
    } catch (error) {
        console.error('[guardrails] classifier unavailable, heuristics stand alone:', error);
        return null;
    }
}
