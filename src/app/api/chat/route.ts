import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import https from 'https';
import http from 'http';
import { authOptions } from '@/lib/authOptions';
import { logAppError } from '@/lib/logError';
import {
    encodeEvent,
    textFromBufferedBody,
    itemFromN8nLine,
    NDJSON_CONTENT_TYPE,
} from '@/lib/chatStream';

// Custom HTTPS agent that skips certificate verification.
// Required for internal n8n servers with self-signed certificates.
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

// The Orchestrator agent calls the specialist agents one after another, so a
// cross-domain question can legitimately take over a minute - two specialists
// measured at 56s. Without this the platform's default serverless timeout cuts
// the request off and the user sees a network error rather than an answer.
export const maxDuration = 300;

// Deliberately under maxDuration. Without a timeout of our own, a hung n8n
// holds the request until the platform kills the function at 300s, and the
// user sees nothing at all for five minutes. Failing at 280 leaves room to
// return a real error instead.
const UPSTREAM_TIMEOUT_MS = 280_000;

// How often to send a keep-alive line while the agent has produced nothing.
// The orchestrator is silent for its first half-minute or more while it asks
// specialists, and an idle connection is something intermediaries are entitled
// to reap.
const HEARTBEAT_MS = 15_000;

// Only used when the upstream turns out not to have streamed at all, to
// recover the answer from the whole body. A streaming reply never accumulates.
const MAX_BUFFERED_FALLBACK = 2_000_000;

/** Thrown on our own deadline, so the handler can tell it apart from a socket error. */
class UpstreamTimeout extends Error {
    constructor() {
        super(`Agent did not respond within ${Math.round(UPSTREAM_TIMEOUT_MS / 1000)}s`);
        this.name = 'UpstreamTimeout';
    }
}

interface Upstream {
    status: number;
    res: http.IncomingMessage;
    /** Tears down the socket. Safe to call more than once. */
    abort: () => void;
}

/**
 * Opens the agent webhook and resolves as soon as the response HEADERS arrive,
 * leaving the body unread for the caller to consume.
 *
 * This is the one structural change streaming needed: resolving on 'response'
 * rather than on 'end'. Everything underneath - Node's http modules rather
 * than fetch, and the certificate-skipping agent - stays as it was, because
 * Next's fetch wrapper still cannot be given a custom SSL agent.
 *
 * `signal` is the incoming request's. When the browser goes away - tab closed,
 * navigation, a cancelled send - there is no point holding the upstream call
 * open. Propagation is best effort: not every platform tells a serverless
 * function that its client disconnected.
 */
function openUpstream(url: string, body: string, signal?: AbortSignal): Promise<Upstream> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const isHttps = parsed.protocol === 'https:';

        const options = {
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                // Asks nginx not to buffer this response. Harmless where it is
                // ignored, and it covers a proxy we have not configured by
                // hand. It is not sufficient on its own - the n8n host needed
                // proxy_buffering off for the webhook path before anything
                // arrived progressively - but it costs nothing to send.
                'X-Accel-Buffering': 'no',
            },
            agent: isHttps ? insecureAgent : undefined,
        };

        const req = (isHttps ? https : http).request(options, (res) => {
            cleanup();
            resolve({
                status: res.statusCode ?? 0,
                res,
                abort: () => req.destroy(),
            });
        });

        // Covers a socket that connects and then goes quiet, which is the shape
        // a stalled workflow takes. Node resets this on every byte received, so
        // on a streaming response it guards silence rather than duration. The
        // agent needs destroying explicitly: 'timeout' only fires the event, it
        // does not end the request.
        req.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
            req.destroy(new UpstreamTimeout());
        });

        const onAbort = () => req.destroy(new DOMException('Client disconnected', 'AbortError'));
        signal?.addEventListener('abort', onAbort);
        const cleanup = () => signal?.removeEventListener('abort', onAbort);

        req.on('error', (err) => {
            cleanup();
            reject(err);
        });
        req.write(body);
        req.end();
    });
}

/**
 * The whole reply as a string. The buffered path, unchanged in behaviour from
 * before streaming existed, and still what the four specialist agents use.
 */
async function makeRequest(
    url: string,
    body: string,
    signal?: AbortSignal,
): Promise<{ status: number; body: string }> {
    const { status, res } = await openUpstream(url, body, signal);
    const text = await new Promise<string>((resolve, reject) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
        res.on('error', reject);
    });
    return { status, body: text };
}

/**
 * Turns the upstream response into our NDJSON event stream.
 *
 * Handles both shapes of upstream on one path, which is the point of the wire
 * format: a converted workflow sends n8n stream chunks and every `item`
 * becomes a delta, while a workflow still using a Respond to Webhook node
 * sends one JSON body, produces no items, and is recovered whole at the end as
 * a single delta. Nothing about the client changes between the two.
 */
function toEventStream(
    upstream: Upstream,
    onFailure: (message: string, detail?: string) => void,
): ReadableStream<Uint8Array> {
    const { res } = upstream;
    const encoder = new TextEncoder();

    let lineBuffer = '';
    let sawItem = false;
    /**
     * The node whose output is the answer.
     *
     * Every node in a streamed workflow emits items, not just the agent. The
     * specialists keep a Respond to Webhook node so the orchestrator can read
     * them as JSON, and that node streams one more item carrying the whole
     * `{"output":"…"}` envelope - the complete answer over again, as raw JSON.
     * Locking onto whichever node speaks first keeps the agent and drops the
     * rest, without this route needing to know any node's name.
     */
    let answerNodeId: string | null = null;
    /** Kept only until the first delta proves the upstream is streaming. */
    let rawBody = '';
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    return new ReadableStream<Uint8Array>({
        start(controller) {
            const send = (text: string) => {
                if (closed) return;
                controller.enqueue(encoder.encode(text));
            };

            const finish = () => {
                if (closed) return;
                closed = true;
                if (heartbeat) clearInterval(heartbeat);
                controller.close();
            };

            heartbeat = setInterval(() => send(encodeEvent({ t: 'ping' })), HEARTBEAT_MS);

            const consumeLine = (line: string) => {
                const trimmed = line.trim();
                if (!trimmed) return;
                const item = itemFromN8nLine(trimmed);
                if (item === null) return;

                // First node to produce an item is the agent. Anything after
                // it is a later node restating the answer.
                if (answerNodeId === null) answerNodeId = item.nodeId;
                else if (item.nodeId !== answerNodeId) return;

                sawItem = true;
                // The answer is arriving in pieces; the accumulated copy is
                // dead weight from here on.
                rawBody = '';
                if (item.text) send(encodeEvent({ t: 'delta', v: item.text }));
            };

            res.on('data', (chunk: Buffer) => {
                const text = chunk.toString('utf8');
                if (!sawItem && rawBody.length < MAX_BUFFERED_FALLBACK) rawBody += text;

                lineBuffer += text;
                let newline: number;
                while ((newline = lineBuffer.indexOf('\n')) !== -1) {
                    const line = lineBuffer.slice(0, newline);
                    lineBuffer = lineBuffer.slice(newline + 1);
                    consumeLine(line);
                }

                // Stop reading from n8n while the browser is behind, rather
                // than growing an unbounded queue in memory for a slow client.
                if (controller.desiredSize !== null && controller.desiredSize <= 0) res.pause();
            });

            res.on('end', () => {
                consumeLine(lineBuffer);
                lineBuffer = '';

                if (!sawItem) {
                    // Never streamed. Recover the answer the old way so a
                    // workflow that has not been converted still works.
                    const text = textFromBufferedBody(rawBody);
                    if (text) send(encodeEvent({ t: 'delta', v: text }));
                }

                send(encodeEvent({ t: 'done' }));
                finish();
            });

            res.on('error', (err: Error) => {
                // Once bytes are on the wire the status is already 200 and
                // cannot be taken back, so a mid-stream failure is reported
                // inside the stream. The client appends it under whatever text
                // it has rather than blanking the answer.
                const message =
                    err.name === 'UpstreamTimeout' ? err.message : 'Connection to the agent was lost';
                onFailure(message, err.stack);
                send(encodeEvent({ t: 'error', message }));
                finish();
            });
        },

        pull() {
            res.resume();
        },

        cancel() {
            // The browser hung up. Nothing is waiting for the rest of this.
            closed = true;
            if (heartbeat) clearInterval(heartbeat);
            upstream.abort();
        },
    });
}

export async function POST(request: Request) {
    // Only ever used to label a failure, so a missing session is not a
    // problem worth failing the request over.
    let userEmail: string | null = null;
    let agentName: string | null = null;
    let conversationId: string | null = null;
    let question: string | null = null;

    try {
        const body = await request.json();
        const { webhookUrl, message, agent, sessionId, stream } = body;

        agentName = agent ?? null;
        conversationId = sessionId ?? null;
        question = typeof message === 'string' ? message : null;
        try {
            userEmail = (await getServerSession(authOptions))?.user?.email ?? null;
        } catch {
            // Never let identifying the user get in the way of answering.
        }

        // Log received URL so we can verify env vars are loaded correctly
        console.log('[/api/chat] webhookUrl received:', webhookUrl);

        if (!webhookUrl || !message) {
            console.error('[/api/chat] Missing fields — webhookUrl:', webhookUrl, '| message:', message);
            return NextResponse.json(
                { error: 'Missing required fields: webhookUrl and message' },
                { status: 400 }
            );
        }

        // Validate the URL is parseable before attempting the request
        try {
            new URL(webhookUrl);
        } catch {
            console.error('[/api/chat] Invalid webhookUrl (could not parse):', webhookUrl);
            return NextResponse.json(
                { error: `Invalid webhook URL: ${webhookUrl}` },
                { status: 400 }
            );
        }

        const requestBody = JSON.stringify({ message, agent, sessionId });

        /* ── Streaming path ───────────────────────────────────────────────
           Chosen by the client per agent. The buffered path below is left
           exactly as it was, so turning the flag off in site.ts puts an agent
           back on proven code without touching anything here. */
        if (stream === true) {
            const upstream = await openUpstream(webhookUrl, requestBody, request.signal);

            // The status is still ours to choose until a byte of body goes
            // out, so an upstream failure is reported the same way as on the
            // buffered path - as a 502 the client already knows how to show.
            if (upstream.status < 200 || upstream.status >= 300) {
                const detail = await new Promise<string>((resolve) => {
                    let data = '';
                    upstream.res.on('data', (chunk) => {
                        if (data.length < 8192) data += chunk;
                    });
                    upstream.res.on('end', () => resolve(data));
                    upstream.res.on('error', () => resolve(data));
                });
                console.error(
                    `[/api/chat] Agent "${agent}" webhook returned ${upstream.status}:`,
                    detail.slice(0, 500)
                );
                await logAppError({
                    stage: 'upstream',
                    status: upstream.status,
                    message: `Agent webhook returned ${upstream.status}`,
                    detail,
                    userEmail, sessionId, botId: agent, question,
                });
                return NextResponse.json(
                    { error: 'Agent request failed', status: upstream.status },
                    { status: 502 }
                );
            }

            const body = toEventStream(upstream, (message, detail) => {
                void logAppError({
                    stage: 'network',
                    status: 200,
                    message,
                    detail,
                    userEmail, sessionId, botId: agent, question,
                });
            });

            return new Response(body, {
                status: 200,
                headers: {
                    'Content-Type': NDJSON_CONTENT_TYPE,
                    'Cache-Control': 'no-cache, no-transform',
                    // For any proxy in front of US, the same way we ask n8n's.
                    'X-Accel-Buffering': 'no',
                    Connection: 'keep-alive',
                },
            });
        }

        /* ── Buffered path (unchanged) ───────────────────────────────────── */
        const { status, body: responseText } = await makeRequest(
            webhookUrl,
            requestBody,
            request.signal,
        );

        // n8n answers with a non-2xx JSON body for its own failures (inactive
        // workflow, unregistered webhook, node error). Without this check those
        // bodies were forwarded as 200 and rendered to the user as if the agent
        // had said them.
        if (status < 200 || status >= 300) {
            console.error(
                `[/api/chat] Agent "${agent}" webhook returned ${status}:`,
                responseText.slice(0, 500)
            );
            // The body is the only thing that says WHICH failure this is - an
            // inactive workflow, an unregistered webhook, a node that threw.
            // It is not shown to the user, so without this it is gone.
            await logAppError({
                stage: 'upstream',
                status,
                message: `Agent webhook returned ${status}`,
                detail: responseText,
                userEmail, sessionId, botId: agent, question,
            });
            return NextResponse.json(
                { error: 'Agent request failed', status },
                { status: 502 }
            );
        }

        let data;
        try {
            data = JSON.parse(responseText);
        } catch {
            data = { output: responseText };
        }

        return NextResponse.json(data);
    } catch (error) {
        // A client that went away is not a failure worth a 500 and a stack
        // trace in the logs; nobody is waiting for the response.
        if (error instanceof Error && error.name === 'AbortError') {
            console.log('[/api/chat] Client disconnected before the agent replied');
            return new NextResponse(null, { status: 499 });
        }

        if (error instanceof UpstreamTimeout) {
            console.error('[/api/chat]', error.message);
            await logAppError({
                stage: 'timeout',
                status: 504,
                message: error.message,
                userEmail, sessionId: conversationId, botId: agentName, question,
            });
            return NextResponse.json(
                { error: 'Agent timed out', detail: error.message },
                { status: 504 }
            );
        }

        console.error('[/api/chat] Proxy Error:', error);
        await logAppError({
            stage: 'network',
            status: 500,
            message: error instanceof Error ? error.message : String(error),
            detail: error instanceof Error ? error.stack : String(error),
            userEmail, sessionId: conversationId, botId: agentName, question,
        });
        return NextResponse.json(
            { error: 'Internal Server Error', detail: String(error) },
            { status: 500 }
        );
    }
}
