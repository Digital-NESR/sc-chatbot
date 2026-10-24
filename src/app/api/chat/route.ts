import { NextResponse } from 'next/server';
import https from 'https';
import http from 'http';

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

/** Thrown on our own deadline, so the handler can tell it apart from a socket error. */
class UpstreamTimeout extends Error {
    constructor() {
        super(`Agent did not respond within ${Math.round(UPSTREAM_TIMEOUT_MS / 1000)}s`);
        this.name = 'UpstreamTimeout';
    }
}

/**
 * Makes an HTTP/HTTPS POST request using Node's native modules,
 * bypassing the Next.js fetch wrapper which can't use a custom SSL agent.
 * Resolves with the status code alongside the body so the caller can tell a
 * real agent reply apart from an n8n error page.
 *
 * `signal` is the incoming request's. When the browser goes away - tab closed,
 * navigation, a cancelled send - there is no point holding the upstream call
 * open. Propagation is best effort: not every platform tells a serverless
 * function that its client disconnected.
 */
function makeRequest(
    url: string,
    body: string,
    signal?: AbortSignal,
): Promise<{ status: number; body: string }> {
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
            },
            agent: isHttps ? insecureAgent : undefined,
        };

        const req = (isHttps ? https : http).request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                cleanup();
                resolve({ status: res.statusCode ?? 0, body: data });
            });
        });

        // Covers a socket that connects and then goes quiet, which is the shape
        // a stalled workflow takes. The agent needs destroying explicitly:
        // 'timeout' only fires the event, it does not end the request.
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

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { webhookUrl, message, agent, sessionId } = body;

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
            return NextResponse.json(
                { error: 'Agent timed out', detail: error.message },
                { status: 504 }
            );
        }

        console.error('[/api/chat] Proxy Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', detail: String(error) },
            { status: 500 }
        );
    }
}
